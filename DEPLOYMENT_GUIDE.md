# Guía de Deployment - Mejoras de Seguridad y Optimización

## 📋 Resumen de Cambios Implementados

### 1. Custom Claims en JWT (50% reducción de costos)
- **Problema anterior**: Cada operación hacía 2 consultas a Firestore para verificar el rol
- **Solución**: El rol se incluye directamente en el token JWT como custom claim
- **Cloud Functions**:
  - `setCustomClaimsOnUserCreate`: Asigna rol al crear usuario
  - `updateCustomClaimsOnRoleChange`: Actualiza rol cuando cambia
  - `removeCustomClaimsOnUserDelete`: Limpia claims al eliminar usuario

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
