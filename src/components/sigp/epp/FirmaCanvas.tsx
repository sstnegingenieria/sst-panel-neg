// Lienzo de firma sin librería: <canvas> nativo + Pointer Events (ratón, táctil y lápiz
// con el mismo código) y `touch-action: none` para que el dedo dibuje en vez de hacer
// scroll. Solo captura los trazos y dibuja; la validez (trazosSuficientes) y el PNG
// final salen de aquí hacia el padre, que es quien decide si se puede guardar.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FIRMA_ALTO, FIRMA_ANCHO, trazosSuficientes, type Trazo } from '../../../utils/sigp/eppFirma'

interface Props {
  /** PNG (data URL) cuando hay una firma suficiente; null si está vacía o es insuficiente. */
  onChange: (png: string | null) => void
  disabled?: boolean
}

export default function FirmaCanvas({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)
  const [hayTrazos, setHayTrazos] = useState(false)
  const [insuficiente, setInsuficiente] = useState(false)

  const pintarFondo = useCallback(() => {
    const ctx = canvasRef.current?.getContext?.('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, FIRMA_ANCHO, FIRMA_ALTO)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => { pintarFondo() }, [pintarFondo])

  /** Coordenadas del puntero en el espacio lógico del lienzo (480×160). */
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * FIRMA_ANCHO,
      y: ((e.clientY - r.top) / r.height) * FIRMA_ALTO,
    }
  }

  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dibujando.current = true
    const p = punto(e)
    trazos.current.push([p])
    const ctx = canvasRef.current?.getContext?.('2d')
    if (ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.01, p.y + 0.01); ctx.stroke() }
  }

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current || disabled) return
    const p = punto(e)
    const actual = trazos.current[trazos.current.length - 1]
    const prev = actual[actual.length - 1]
    actual.push(p)
    const ctx = canvasRef.current?.getContext?.('2d')
    if (ctx) { ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke() }
  }

  const fin = () => {
    if (!dibujando.current) return
    dibujando.current = false
    setHayTrazos(true)
    const ok = trazosSuficientes(trazos.current)
    setInsuficiente(!ok)
    onChange(ok ? (canvasRef.current?.toDataURL('image/png') ?? null) : null)
  }

  const limpiar = () => {
    trazos.current = []
    dibujando.current = false
    setHayTrazos(false)
    setInsuficiente(false)
    pintarFondo()
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={FIRMA_ANCHO}
        height={FIRMA_ALTO}
        aria-label="Espacio para la firma del colaborador"
        data-testid="firma-canvas"
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fin}
        onPointerCancel={fin}
        style={{ touchAction: 'none', aspectRatio: `${FIRMA_ANCHO} / ${FIRMA_ALTO}` }}
        className={`w-full max-w-xl border-2 border-dashed rounded-lg bg-white ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair border-gray-300'}`}
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={limpiar} disabled={disabled || !hayTrazos}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium disabled:opacity-40">
          Limpiar
        </button>
        {insuficiente && (
          <span className="text-xs text-amber-700">La firma es muy corta: firma de nuevo con el trazo completo.</span>
        )}
        {!hayTrazos && <span className="text-xs text-gray-400">El colaborador firma aquí con el dedo, el lápiz o el ratón.</span>}
      </div>
    </div>
  )
}
