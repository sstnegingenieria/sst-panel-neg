/**
 * Helpers para tests funcionales contra la Firebase Emulator Suite.
 *
 * Reutilizan el `auth` real de firebase/config.ts, que en modo test/DEV ya está
 * conectado a los emuladores en 127.0.0.1 con los puertos de firebase.json.
 * Solo se usan desde tests bajo src/hooks/sigp/__tests__/, que se excluyen del
 * `npm test` por defecto y se corren con `npm run test:emulator`.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../firebase/config'

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-neg'
const FIRESTORE_HOST = '127.0.0.1:8080'
const AUTH_HOST = '127.0.0.1:9099'

/** Borra TODO Firestore del proyecto emulado (incluye la colección `consecutivos`). */
export async function clearFirestore(): Promise<void> {
  const url = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`No se pudo limpiar Firestore (status ${res.status})`)
  }
}

/**
 * Lee `consecutivos/{prefijo}_{year}.ultimo` vía la API REST del emulador de
 * Firestore con acceso owner (`Authorization: Bearer owner`), que bypassa las
 * reglas de seguridad.
 *
 * Necesario porque `consecutivos` es una colección solo-función: las reglas de
 * producción (correctamente) deniegan lecturas desde el cliente, así que un
 * `getDoc` del SDK cliente sería rechazado. Devuelve `undefined` si el documento
 * aún no existe.
 */
export async function leerUltimoConsecutivo(
  prefijo: string,
  year: number,
): Promise<number | undefined> {
  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/consecutivos/${prefijo}_${year}`
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } })
  if (res.status === 404) return undefined
  if (!res.ok) {
    throw new Error(`No se pudo leer el consecutivo (status ${res.status})`)
  }
  const data = (await res.json()) as {
    fields?: { ultimo?: { integerValue?: string } }
  }
  const raw = data.fields?.ultimo?.integerValue
  return raw === undefined ? undefined : Number(raw)
}

/** Borra todos los usuarios del Auth Emulator. */
export async function clearAuthUsers(): Promise<void> {
  const url = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  })
  if (!res.ok) {
    throw new Error(`No se pudo limpiar Auth (status ${res.status})`)
  }
}

/**
 * Crea (o inicia sesión con) un usuario de prueba en el Auth Emulator y deja la
 * sesión activa. El callable de Functions adjuntará su ID token automáticamente,
 * de modo que la Cloud Function reciba `request.auth`.
 */
export async function signInTestUser(
  email = 'tester@demo-neg.test',
  password = 'password123',
): Promise<User> {
  try {
    await createUserWithEmailAndPassword(auth, email, password)
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-in-use') {
      await signInWithEmailAndPassword(auth, email, password)
    } else {
      throw err
    }
  }
  if (!auth.currentUser) {
    throw new Error('No se pudo iniciar sesión con el usuario de prueba')
  }
  return auth.currentUser
}

/** Cierra la sesión actual (para el caso de prueba "sin autenticación"). */
export async function signOutTestUser(): Promise<void> {
  await signOut(auth)
}

/**
 * Espera a que el emulador de Firestore responda. `firebase emulators:exec` ya
 * garantiza que los emuladores están arriba antes de correr los tests; esto añade
 * un margen por si el arranque tarda un instante en aceptar conexiones.
 */
export async function waitForEmulators(timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  const url = `http://${FIRESTORE_HOST}/`
  let lastError: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 200) return
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Emuladores no respondieron en ${timeoutMs}ms: ${String(lastError)}`)
}
