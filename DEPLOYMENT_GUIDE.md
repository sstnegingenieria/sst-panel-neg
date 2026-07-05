# Guía de Deployment - Mejoras de Seguridad y Optimización

## 📋 Resumen de Cambios Implementados

### 1. Cloud Functions activas

**Cloud Functions activas**: `generarConsecutivo` (SIGP · consecutivos transaccionales, 2ª gen). No hay otras Cloud Functions desplegadas.

Nota histórica: en julio 2026 se limpiaron 5 funciones legacy que estaban en el código pero nunca operaron en producción. Ver commit correspondiente a la Iteración 0.3.c-bis.

El rol del usuario se lee directamente de `users/{uid}.rol` en Firestore en cada verificación (patrón "role-in-Firestore"). No se usan Firebase Auth custom claims.

> ⚠️ El resto de esta guía conserva secciones del plan original de *custom claims* (Migración de Usuarios, Test 1, Troubleshooting, etc.) que describen ese sistema nunca desplegado. Son referencia histórica; el mecanismo real es el role-in-Firestore descrito arriba.

### 2. Acceso a Contratistas Restringido
- **Antes**: Lectura pública (cualquier autenticado)
- **Ahora**: Solo SST/Admin pueden leer y escribir
- **Razón**: Protege información comercial sensible (contactos, precios)

### 3. Validación de Esquema en Reglas
- **Obras**: Requiere `nombre_sitio` y `ubicacion`
- **Contratistas**: Requiere `nombre`, `email`, `telefono`
- **Registros**: Valida campos requeridos y limita tamaño de descripciones

### 4. Registros Inmutables
- **Lectura**: Solo SST/Admin
- **Creación**: Usuarios autenticados (solo propio registro)
- **Actualización/Eliminación**: NUNCA (auditoría limpia)

---

## 🧩 SIGP — Fase 0: Dependencias del panel

### `pdf-lib` disponible para generación de PDFs (Iteración 0.1.1)

A partir de F0, el panel web incluye **`pdf-lib` (`^1.17.1`)** como dependencia de producción. Habilita la **generación de PDFs desde el panel** (cotizaciones, actas, informes) sin depender de la app Flutter.

- **Contexto**: hasta ahora los PDFs del panel provenían de la app Flutter (`pdf_url`); el panel solo los mostraba. `pdf-lib` prepara el terreno para que el SIGP genere sus propios documentos (ver Tarea 1.4.5 del plan F1).
- **Impacto en el bundle**: **ninguno todavía.** Como aún no se importa en ningún archivo, el tree-shaking de Vite la excluye del bundle. Verificado con `npm run build`: el bundle JS quedó idéntico antes y después de instalarla (`1,412.49 kB` / gzip `398.03 kB`, mismo hash de chunk). El peso solo se sumará cuando algún módulo del SIGP la importe.
- **Sin acción de deployment requerida**: es una dependencia npm estándar; Vercel la instala en el build. No toca Firebase, reglas ni Cloud Functions.

### Desarrollo local con emuladores (Iteración 0.1.3 / 0.1.4)

El panel se conecta **automáticamente a la Firebase Emulator Suite cuando corre en modo dev** (`import.meta.env.DEV`). En producción (`npm run build`) ese bloque se elimina del bundle, así que **no afecta a los usuarios ni a `auth`/`db`/`storage`/`functions` reales**.

`firebase-tools` está instalado como devDependency, así que se invoca con `npx firebase`. Requiere **Java (JDK 11+)** en el PATH para los emuladores de Firestore y Storage.

**Flujo de trabajo local (dos terminales):**

1. **Terminal 1 — levantar los emuladores:**
   ```bash
   npx firebase emulators:start
   ```
   Levanta Auth (9099), Firestore (8080), Storage (9199), Functions (5001) y la UI (http://127.0.0.1:4000). El primer arranque descarga los binarios de los emuladores (es normal).

2. **Terminal 2 — levantar el panel:**
   ```bash
   npm run dev
   ```

3. El panel en dev **conecta solo a los emuladores** (`127.0.0.1`); no toca datos de producción. Puertos definidos en `firebase.json` → sección `emulators`.

> ⚠️ `storage.rules` en la raíz es un **placeholder solo para el emulador** (`allow read, write: if request.auth != null`). **No** son reglas de producción y **no se despliegan**.

### Ejecutar tests contra emuladores (SIGP) (Iteración 0.3.c)

Hay **dos comandos de test** con propósitos distintos:

| Comando | Qué corre | Dependencias |
|---|---|---|
| `npm test` | Tests rápidos de UI/lógica (smoke). **Default de CI y desarrollo.** | Ninguna externa |
| `npm run test:emulator` | Tests funcionales contra Cloud Functions + Firestore. | **Java (JDK 11+)** + Firebase Emulator Suite |

Los tests que dependen de Cloud Functions y Firestore (p. ej. `useConsecutivo`) corren contra el Firebase Emulator Suite y viven en `src/hooks/sigp/__tests__/`. Están **excluidos del `npm test` por defecto** (ver `vitest.config.ts`) para que un desarrollador nuevo no se tope con un test que exige Java sin avisar.

```bash
# Requiere Java en el PATH. Levanta emuladores, corre los tests y los apaga solo.
npm run test:emulator
```

Internamente:
```
firebase emulators:exec --project demo-neg --only functions,firestore,auth \
  "vitest run --config vitest.emulator.config.ts"
```

- Usa el proyecto **`demo-neg`** (solo-emulador; nunca contacta servicios reales).
- Credenciales dummy vía `.env.test`; `firebase/config.ts` conecta a `127.0.0.1` en modo test.
- La verificación del estado de `consecutivos` se hace por la API REST del emulador con `Authorization: Bearer owner` (bypass de reglas), porque `consecutivos` es una colección **solo-función** y las reglas deniegan la lectura desde el cliente.

---

## 🚀 Pasos de Deployment

### Paso 1: Instalar Firebase CLI (si aún no está)
```bash
npm install -g firebase-tools
```

### Paso 2: Autenticarse con Firebase
```bash
firebase login
```

### Paso 3: Configurar proyecto
```bash
firebase init
# Seleccionar:
# - Firestore
# - Cloud Functions
# - Hosting
# - Usar la configuración de firebase.json existente
```

### Paso 4: Instalar dependencias de funciones
```bash
cd functions
npm install
cd ..
```

### Paso 5: Validar reglas (ANTES DE DEPLOYAR)
```bash
firebase deploy --only firestore:rules --dry-run
firebase deploy --only functions --dry-run
```

### Paso 6: Deploy a producción
```bash
firebase deploy
```

Este comando:
1. ✅ Despliega las nuevas Cloud Functions
2. ✅ Actualiza las reglas de Firestore
3. ✅ Configura índices automáticos si es necesario

---

## ⚠️ Importante: Migración de Usuarios Existentes

### El problema
Los usuarios que ya existen en Firebase Auth NO tienen custom claims asignados.

### Soluciones

#### Opción A: Forzar re-login (Recomendado)
Los custom claims se asignan automáticamente cuando el usuario hace login nuevamente.
- Simplista
- Requiere que todos hagan logout/login
- Automático después de eso

#### Opción B: Script de migración (Completo)
Ejecutar una Cloud Function que asigne claims a todos los usuarios existentes:

```bash
# Crear archivo migrar-claims.js
cat > migrar-claims.js << 'EOF'
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function migrar() {
  const usersSnapshot = await admin.firestore().collection('users').get();
  
  for (const doc of usersSnapshot.docs) {
    const { rol = 'tecnico' } = doc.data();
    try {
      await admin.auth().setCustomUserClaims(doc.id, { rol });
      console.log(`✓ ${doc.id} -> rol=${rol}`);
    } catch (error) {
      console.error(`✗ Error en ${doc.id}:`, error.message);
    }
  }
  
  console.log('Migración completada');
  process.exit(0);
}

migrar();
EOF

# Ejecutar
node migrar-claims.js
```

#### Opción C: Usar el emulador para testing
```bash
firebase emulators:start --only firestore,functions,auth
# Probar localmente antes de producción
```

---

## 📊 Cambios en las Reglas Firestore

### Comparación: Antes vs Después

| Aspecto | Antes | Después |
|--------|-------|---------|
| **Función isSST()** | 2 reads a BD | 0 reads (JWT token) |
| **Acceso Contratistas** | Público (autenticado) | Solo SST/Admin |
| **Validación Datos** | No | Sí (estructura + tipos) |
| **Registros** | Mutables | Inmutables ✓ |
| **Costo estimado** | 100% | ~50% |

### Referencia de Funciones Disponibles

```javascript
isSST()      // true si rol es 'sst' o 'admin'
isAdmin()    // true si rol es 'admin'
isTecnico()  // true si rol es 'tecnico'
```

---

## 🔍 Testing Post-Deployment

### Test 1: Verificar Custom Claims
```javascript
// En la consola del navegador (en tu app)
const user = firebase.auth().currentUser;
user.getIdTokenResult().then(idTokenResult => {
  console.log(idTokenResult.claims.rol); // debe mostrar: 'sst', 'admin', o 'tecnico'
});
```

### Test 2: Verificar Acceso a Contratistas
```javascript
// Esto DEBE fallar ahora para usuarios sin rol SST
const snapshot = await firebase.firestore().collection('contratistas').get();
// Error esperado: "Missing or insufficient permissions"
```

### Test 3: Verificar Registros Inmutables
```javascript
// Intentar actualizar registro existente
const ref = firebase.firestore().collection('registros').doc(id);
await ref.update({ descripcion: 'nuevo valor' }); // DEBE fallar
```

### Test 4: Crear Registro Validado
```javascript
// CORRECTO: campos requeridos
const ref = firebase.firestore().collection('registros');
await ref.add({
  user_id: firebase.auth().currentUser.uid,
  descripcion: 'Trabajo completado sin problemas',
  tipo: 'completado'
});

// INCORRECTO: falta descripcion
await ref.add({
  user_id: firebase.auth().currentUser.uid
}); // Error: "Missing required fields"
```

---

## 🐛 Troubleshooting

### Error: "Custom token creation failed"
**Causa**: Las Cloud Functions no tienen permisos sobre Auth
**Solución**: 
```bash
firebase projects:list
# Asegurar que es el proyecto correcto
firebase use <project-id>
```

### Error: "Rules validation failed"
**Causa**: Syntax error en firestore.rules
**Solución**:
```bash
firebase validate
# Mostrará exactamente dónde está el error
```

### Error: "Cannot read property 'rol' of undefined"
**Causa**: Usuario no tiene custom claims (usuarios viejos)
**Solución**: Ejecutar script de migración (Opción B arriba)

### Los cambios no se ven inmediatamente
**Causa**: Caché del navegador o token viejo
**Solución**: 
```javascript
// Forzar nuevo token
const user = firebase.auth().currentUser;
await user.getIdToken(true);
```

---

## 📈 Monitoreo Post-Deploy

### Verificar uso de lectura/escritura
1. Ir a Firebase Console → Firestore → Stats
2. Comparar antes/después (debe bajar ~50% en reads)

### Ver logs de Cloud Functions
```bash
firebase functions:log
```

### Monitor de Firestore
```bash
firebase deploy --only firestore:rules
# Monitorear en: https://console.firebase.google.com/u/0/project/{project}/firestore/usage
```

---

## ✅ Checklist Pre-Production

- [ ] Instalar Firebase CLI
- [ ] Ejecutar `firebase deploy --dry-run` (sin errores)
- [ ] Crear backup de datos (Export en Firestore)
- [ ] Notificar al equipo sobre logout requerido
- [ ] Ejecutar migración de claims (Opción B)
- [ ] Test 1: Verificar custom claims
- [ ] Test 2: Acceso restringido a contratistas
- [ ] Test 3: Registros inmutables
- [ ] Test 4: Validación de esquema
- [ ] Monitorear logs primeras 24 horas
- [ ] Comparar costos (antes vs después)

---

## 📚 Archivos Relacionados

- `firestore.rules`: Reglas de seguridad (optimizadas)
- `functions/index.js`: Cloud Functions
- `functions/package.json`: Dependencias de funciones
- `firebase.json`: Configuración del proyecto

---

## 🆘 Soporte

Si tienes problemas:
1. Revisa `firestore.rules` - síntaxis correcta
2. Ejecuta `firebase validate`
3. Verifica logs: `firebase functions:log`
4. Revisa console del navegador: `getIdTokenResult()` debe tener `.claims.rol`

---

**Última actualización**: 2026-04-18  
**Versión**: 1.0.0 (Production Ready)
