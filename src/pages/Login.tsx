import { useState, FormEvent } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, accessDenied } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Recuperar contraseña
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch {
      setError('Correo o contraseña incorrectos.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      setResetSent(true)
    } catch {
      setResetError('No se encontró una cuenta con ese correo.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo / Título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
            <svg className="w-8 h-8 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Panel SST</h1>
          <p className="text-sm text-gray-500 mt-1">NEG Ingeniería</p>
        </div>

        {/* ── Modo recuperar contraseña ── */}
        {resetMode ? (
          resetSent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-700">
                Se envió un enlace de restablecimiento a <span className="font-semibold">{resetEmail}</span>.
                Revisa tu bandeja de entrada (y carpeta de spam).
              </p>
              <button
                onClick={() => { setResetMode(false); setResetSent(false); setResetEmail('') }}
                className="text-sm text-blue-600 hover:underline"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="usuario@negingenieria.com"
                />
              </div>

              {resetError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {resetError}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition"
              >
                {resetLoading ? 'Enviando...' : 'Enviar enlace'}
              </button>

              <button
                type="button"
                onClick={() => { setResetMode(false); setResetError('') }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          )
        ) : (
          /* ── Modo login normal ── */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="usuario@neg.cl"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setResetEmail(email); setError('') }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {accessDenied && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <p className="font-semibold">Acceso denegado</p>
                <p className="mt-0.5 text-red-600">Tu cuenta ha sido desactivada. Contacta al administrador.</p>
              </div>
            )}

            {error && !accessDenied && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
