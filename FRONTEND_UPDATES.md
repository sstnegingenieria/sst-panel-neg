# Actualización del Frontend - Uso de Custom Claims

## 🎯 Resumen
El frontend ahora puede usar `custom claims` del token JWT para tomar decisiones sobre UI sin hacer consultas adicionales a Firestore.

---

## 1. Hook Personalizado para Obtener Rol del Usuario

Crea `src/hooks/useUserRole.ts`:

```typescript
import { useEffect, useState } from 'react'
import { auth } from '../firebase/config'
import { IdTokenResult } from 'firebase/auth'

export function useUserRole() {
  const [rol, setRol] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const idTokenResult: IdTokenResult = await user.getIdTokenResult()
          const userRole = idTokenResult.claims.rol as string
          setRol(userRole)
        } catch (error) {
          console.error('Error obteniendo rol:', error)
          setRol(null)
        }
      } else {
        setRol(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { rol, loading }
}
```

**Uso en componentes**:
```typescript
function Dashboard() {
  const { rol, loading } = useUserRole()

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      {rol === 'admin' && <AdminPanel />}
      {rol === 'sst' && <SSTPanel />}
      {rol === 'tecnico' && <TecnicoPanel />}
    </div>
  )
}
```

---

## 2. Hook para Verificar Permisos

Crea `src/hooks/usePermission.ts`:

```typescript
import { useUserRole } from './useUserRole'

export function usePermission() {
  const { rol, loading } = useUserRole()

  const hasPermission = (requiredRoles: string[]): boolean => {
    return rol !== null && requiredRoles.includes(rol)
  }

  const isSST = (): boolean => hasPermission(['sst', 'admin'])
  const isAdmin = (): boolean => hasPermission(['admin'])
  const isTecnico = (): boolean => hasPermission(['tecnico'])

  return { isSST, isAdmin, isTecnico, rol, loading }
}
```

**Uso**:
```typescript
function Users() {
  const { isSST, loading } = usePermission()

  if (loading) return <Spinner />

  if (!isSST()) {
    return <ErrorMessage>No tienes permiso para acceder a esta página</ErrorMessage>
  }

  return <UsuariosPendientes />
}
```

---

## 3. Actualizar Componentes Existentes

### Proteger rutas por rol

En `src/App.tsx` o donde tengas el router:

```typescript
import { usePermission } from './hooks/usePermission'

function ProtectedRoute({ component: Component, requiredRol }: Props) {
  const { rol, loading } = usePermission()

  if (loading) return <LoadingSpinner />
  
  if (!requiredRol.includes(rol)) {
    return <Navigate to="/unauthorized" />
  }

  return <Component />
}

// Uso:
<Routes>
  <Route path="/usuarios" element={
    <ProtectedRoute component={Usuarios} requiredRol={['sst', 'admin']} />
  } />
  <Route path="/dashboard" element={
    <ProtectedRoute component={Dashboard} requiredRol={['tecnico', 'sst', 'admin']} />
  } />
</Routes>
```

### Mostrar/Ocultar botones por permiso

```typescript
export default function Usuarios() {
  const { isSST, loading } = usePermission()

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      <h1>Técnicos</h1>
      
      {isSST() && (
        <button onClick={handleAprobar}>
          Aprobar
        </button>
      )}
      
      {/* El componente de tabla se mostrará solo si tiene permisos */}
      {isSST() ? (
        <UsuariosPendientes {...props} />
      ) : (
        <div>No tienes permiso para ver esta sección</div>
      )}
    </div>
  )
}
```

---

## 4. Ventajas Sobre el Método Anterior

| Aspecto | Antes | Ahora |
|--------|-------|-------|
| **Consultas a BD** | Cada componente que verifica rol: ~2 reads | 0 reads (token JWT) |
| **Velocidad** | Lenta (espera respuesta BD) | Instantánea (JWT ya está) |
| **Caché** | No hay | Automático en token (1 hora) |
| **Sincronización** | Requiere refresh manual | Se actualiza en next login |

---

## 5. Migración de Componentes Existentes

### Antes (lectura de Firestore):
```typescript
const [rol, setRol] = useState('')

useEffect(() => {
  // ❌ MALO: Esto hace 2 consultas cada vez
  const userDoc = await getDoc(doc(db, 'users', user.uid))
  setRol(userDoc.data().rol)
}, [user])
```

### Después (custom claims):
```typescript
const { rol } = useUserRole()
// ✅ BUENO: Instantáneo, sin consultas
```

---

## 6. Testing Local con Emulador

Si quieres probar antes de deployar:

```bash
# En una terminal
firebase emulators:start --only auth,firestore,functions

# En otra terminal
npm run dev
```

Las Cloud Functions se ejecutarán localmente automáticamente.

---

## 7. Manejo de Re-login

Después de cambiar el rol de un usuario, los custom claims se actualizan automáticamente en el siguiente login.

Para forzar update inmediato (opcional):

```typescript
async function forceTokenRefresh() {
  const user = auth.currentUser
  if (user) {
    await user.getIdToken(true) // true = force refresh
    // Recargar la aplicación o llamar a los hooks nuevamente
  }
}
```

---

## 8. Verificación en Consola del Navegador

Después del login, verifica que los claims estén presentes:

```javascript
const user = firebase.auth().currentUser
user.getIdTokenResult().then(result => {
  console.log('Custom Claims:', result.claims)
  // Output:
  // {
  //   rol: 'sst',
  //   iat: 1234567890,
  //   exp: 1234571490,
  //   ...
  // }
})
```

Si no ves `rol`, el usuario necesita:
1. Hacer logout
2. Hacer login nuevamente

---

## 9. Backward Compatibility

Si hay componentes que aún leen de Firestore directamente, seguirán funcionando. Los custom claims son un PLUS, no un reemplazo.

Pero para optimizar:
1. Migra nuevos componentes a `useUserRole`
2. Refactoriza gradualmente los antiguos
3. Elimina consultas redundantes a `/users/{uid}`

---

## 10. Casos de Uso Comunes

### Mostrar panel diferente por rol
```typescript
function Dashboard() {
  const { rol } = useUserRole()

  const panels = {
    admin: <AdminPanel />,
    sst: <SSTPanel />,
    tecnico: <TecnicoPanel />
  }

  return <div>{panels[rol] || <UnauthorizedView />}</div>
}
```

### Deshabilitar botón si no es SST
```typescript
<button 
  disabled={!isSST()} 
  title={isSST() ? '' : 'Solo SST puede hacer esto'}
>
  Aprobar Técnico
</button>
```

### Hacer bypass de componente protegido
```typescript
function SecretData() {
  const { isAdmin } = usePermission()

  if (!isAdmin()) return <div>No autorizado</div>

  return <SensitiveData />
}
```

---

## ✅ Checklist de Integración

- [ ] Crear `useUserRole.ts`
- [ ] Crear `usePermission.ts`
- [ ] Actualizar componentes principales para usar nuevos hooks
- [ ] Proteger rutas por rol
- [ ] Probar en el emulador
- [ ] Verificar custom claims en consola
- [ ] Eliminar consultas redundantes de Firestore
- [ ] Testing de permisos para cada rol

---

**Nota**: Estos cambios son opcionales si tu app funciona bien. Son optimizaciones para mejor rendimiento y ahorro de costos.
