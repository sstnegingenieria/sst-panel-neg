import { useState, FormEvent } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { firebaseConfig, db } from '../firebase/config'
import Modal from './shared/Modal'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreado: () => void
}

export default function InvitarUsuarioModal({ isOpen, onClose, onCreado }: Props) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail]   = useState('')
  const [rol, setRol]       = useState<'sst' | 'admin'>('sst')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const reset = () => {
    setNombre(''); setEmail(''); setRol('sst'); setError('')
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // App secundaria: crea el usuario sin tocar la sesión del admin
    const secondaryApp = initializeApp(firebaseConfig, `invite-${Date.now()}`)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      // Contraseña temporal segura (el usuario la reemplazará)
      const tempPass = `Tmp${Math.random().toString(36).slice(-8)}!`
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPass)
      const uid  = cred.user.uid

      // Documento en Firestore
      await setDoc(doc(db, 'users', uid), {
        nombre:          nombre.trim(),
        email:           email.trim().toLowerCase(),
        rol,
        estado:          'activo',
        obras_asignadas: [],
        fecha_creacion:  Timestamp.now(),
      })

      // Email para que el usuario establezca su propia contraseña
      await sendPasswordResetEmail(secondaryAuth, email)

      onCreado()
      handleClose()
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code
      if (msg === 'auth/email-already-in-use') {
        setError('Ya existe una cuenta con ese correo.')
      } else if (msg === 'auth/invalid-email') {
        setError('El correo no es válido.')
      } else {
        setError('Error al crear el usuario. Intenta de nuevo.')
      }
    } finally {
      // Siempre cerrar sesión y eliminar la app secundaria
      await secondaryAuth.signOut().catch(() => null)
      await deleteApp(secondaryApp).catch(() => null)
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invitar usuario al panel">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">

        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Giovanny Montes"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Correo electrónico <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="usuario@neg-ingenieria.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Rol */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
          <div className="grid grid-cols-2 gap-3">
            {(['sst', 'admin'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRol(r)}
                className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition text-left ${
                  rol === r
                    ? r === 'admin'
                      ? 'border-purple-500 bg-purple-50 text-purple-800'
                      : 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">{r === 'admin' ? 'Admin' : 'SST'}</div>
                <div className="text-xs mt-0.5 font-normal opacity-75">
                  {r === 'admin' ? 'Acceso total al panel' : 'Ver registros y técnicos'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700">
          Se enviará un correo a <strong>{email || 'la dirección indicada'}</strong> para que el usuario
          establezca su contraseña y pueda ingresar al panel.
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !nombre.trim() || !email.trim()}
            className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition"
          >
            {loading ? 'Creando cuenta…' : 'Invitar usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
