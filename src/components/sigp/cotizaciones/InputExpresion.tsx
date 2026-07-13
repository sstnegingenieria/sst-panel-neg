import { useState, useEffect } from 'react'
import { evaluarExpresion, numeroATexto } from '../../../utils/sigp/expresion'

interface InputExpresionProps {
  valor: number | undefined
  onValor: (n: number) => void
  /** Si se define, confirmar el campo VACÍO limpia el valor (en vez de
   *  restaurar el anterior) — p. ej. quitar el costo interno de un ítem. */
  onVacio?: () => void
  className?: string
  placeholder?: string
  titulo?: string
}

/**
 * Input numérico con expresiones (F1.5 punto 1): acepta "20.23*5", "1/54",
 * "(15+3)*2" y las evalúa al confirmar (blur o Enter).
 * - Válida → guarda el número con precisión completa (el display de 2 decimales
 *   es del punto 4, en solo-lectura).
 * - Inválida → borde rojo con el motivo en el title, NO persiste, conserva el
 *   texto para corregir.
 * - Vacía → sin cambio (restaura el valor previo).
 * En reposo muestra el valor con precisión completa (coma decimal, sin miles)
 * para que confirmar sin editar jamás recorte el dato.
 */
export default function InputExpresion({ valor, onValor, onVacio, className = '', placeholder, titulo }: InputExpresionProps) {
  const [texto, setTexto] = useState(() => numeroATexto(valor))
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cambios externos (goal-seek, recargas) se reflejan si no se está editando.
  useEffect(() => {
    if (!editando) setTexto(numeroATexto(valor))
  }, [valor, editando])

  const confirmar = () => {
    const r = evaluarExpresion(texto)
    if (r === null) {                 // vacío → sin cambio (o limpiar, si onVacio existe)
      setError(null)
      setEditando(false)
      if (onVacio) { setTexto(''); onVacio() }
      else setTexto(numeroATexto(valor))
      return
    }
    if ('error' in r) {               // inválida → no persistir, conservar texto
      setError(r.error)
      return
    }
    setError(null)
    setEditando(false)
    setTexto(numeroATexto(r.valor))
    onValor(r.valor)
  }

  return (
    <input
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      title={error ?? titulo ?? 'Acepta expresiones: 20.23*5 · 1/54 · (15+3)*2'}
      onFocus={() => setEditando(true)}
      onChange={e => { setTexto(e.target.value); if (error) setError(null) }}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`${className} ${error ? 'border-red-400 bg-red-50' : ''}`}
    />
  )
}
