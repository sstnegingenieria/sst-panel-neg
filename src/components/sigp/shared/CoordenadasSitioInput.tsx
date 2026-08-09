import { useState, useEffect, useRef } from 'react'
import TextField from '../../shared/TextField'
import { esCoordenadaValida, parseCoordenadasPegadas, urlVerificarEnMaps } from '../../../utils/geo'
import type { CoordenadasSitio } from '../../../utils/geo'

interface CoordenadasSitioInputProps {
  value?: CoordenadasSitio | null
  onChange: (c: CoordenadasSitio | null) => void
  direccionSugerida?: string
  disabled?: boolean
}

type EstadoBusqueda = 'idle' | 'buscando' | 'error'

interface Sugerencia {
  lat: number
  lng: number
  nombre: string
}

const truncar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

/** Número desde texto con punto o coma decimal; null si vacío o no numérico. */
const parseNum = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Captura de `coordenadas_sitio` (par lat/lng) con paste-aware desde Google Maps
 *  y búsqueda best-effort por dirección (Nominatim/OpenStreetMap). Usa los
 *  helpers canónicos de `utils/geo.ts` — no reimplementa validación ni parseo. */
export default function CoordenadasSitioInput({ value, onChange, direccionSugerida, disabled }: CoordenadasSitioInputProps) {
  const [latTexto, setLatTexto] = useState('')
  const [lngTexto, setLngTexto] = useState('')
  // Huella del último valor que ESTE componente emitió/aplicó — evita que un
  // re-render del padre con el mismo par pise lo que el usuario está tecleando.
  const huellaEmitida = useRef<string>('')

  useEffect(() => {
    const huella = value && esCoordenadaValida(value) ? `${value.latitud},${value.longitud}` : ''
    if (huella === huellaEmitida.current) return
    huellaEmitida.current = huella
    setLatTexto(value && esCoordenadaValida(value) ? String(value.latitud) : '')
    setLngTexto(value && esCoordenadaValida(value) ? String(value.longitud) : '')
  }, [value])

  const [busqueda, setBusqueda] = useState<EstadoBusqueda>('idle')
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const latNum = parseNum(latTexto)
  const lngNum = parseNum(lngTexto)
  const latOk = latNum !== null && latNum >= -90 && latNum <= 90
  const lngOk = lngNum !== null && lngNum >= -180 && lngNum <= 180
  const parValido = latOk && lngOk

  const errorLat =
    latTexto.trim() !== '' && !latOk ? 'Latitud inválida (-90 a 90)'
    : latTexto.trim() === '' && lngTexto.trim() !== '' ? 'Falta la latitud'
    : undefined
  const errorLng =
    lngTexto.trim() !== '' && !lngOk ? 'Longitud inválida (-180 a 180)'
    : lngTexto.trim() === '' && latTexto.trim() !== '' ? 'Falta la longitud'
    : undefined

  const emitir = (lat: string, lng: string) => {
    const candidato = { latitud: parseNum(lat) ?? NaN, longitud: parseNum(lng) ?? NaN }
    if (lat.trim() !== '' && lng.trim() !== '' && esCoordenadaValida(candidato)) {
      huellaEmitida.current = `${candidato.latitud},${candidato.longitud}`
      onChange(candidato)
    } else {
      onChange(null)
    }
  }

  const manejarCambio = (campo: 'lat' | 'lng', texto: string) => {
    // Paste-aware: un PAR completo (tecleado o pegado) autocompleta ambos campos.
    // Precedencia: si el texto es UN número (p. ej. "4,6" con coma decimal),
    // gana la lectura individual — el par solo aplica a textos no-numéricos.
    const par = parseNum(texto) === null ? parseCoordenadasPegadas(texto) : null
    if (par) {
      setLatTexto(String(par.latitud))
      setLngTexto(String(par.longitud))
      huellaEmitida.current = `${par.latitud},${par.longitud}`
      onChange(par)
      return
    }
    if (campo === 'lat') { setLatTexto(texto); emitir(texto, lngTexto) }
    else { setLngTexto(texto); emitir(latTexto, texto) }
  }

  const buscarDireccion = async () => {
    if (disabled || !direccionSugerida || !direccionSugerida.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 6000)
    setSugerencia(null)
    setBusqueda('buscando')
    try {
      const q = encodeURIComponent(`${direccionSugerida.trim()}, Colombia`)
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=${q}`,
        { signal: controller.signal },
      )
      if (!resp.ok) throw new Error('http')
      const data = (await resp.json()) as Array<{ lat: string; lon: string; display_name: string }>
      const primero = data[0]
      const lat = primero ? Number(primero.lat) : NaN
      const lng = primero ? Number(primero.lon) : NaN
      if (!primero || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setBusqueda('error')
        return
      }
      setSugerencia({ lat, lng, nombre: primero.display_name })
      setBusqueda('idle')
    } catch {
      setBusqueda('error')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const usarSugerencia = () => {
    if (!sugerencia) return
    const par = { latitud: sugerencia.lat, longitud: sugerencia.lng }
    setLatTexto(String(par.latitud))
    setLngTexto(String(par.longitud))
    huellaEmitida.current = `${par.latitud},${par.longitud}`
    onChange(par)
    setSugerencia(null)
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-700">
          Coordenadas del sitio <span className="text-gray-400 font-normal">(opcional)</span>
        </p>
        <p className="text-xs text-gray-400">
          Pega el par desde Google Maps o busca por dirección — alimentan el control geográfico SST
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Latitud"
          value={latTexto}
          onChange={t => manejarCambio('lat', t)}
          error={errorLat}
          placeholder="4.60971"
          disabled={disabled}
          inputMode="decimal"
        />
        <TextField
          label="Longitud"
          value={lngTexto}
          onChange={t => manejarCambio('lng', t)}
          error={errorLng}
          placeholder="-74.08175"
          disabled={disabled}
          inputMode="decimal"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        {parValido && (
          <a
            href={urlVerificarEnMaps({ latitud: latNum as number, longitud: lngNum as number })}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline font-medium"
          >
            Verificar en Maps ↗
          </a>
        )}
        {!disabled && direccionSugerida && direccionSugerida.trim() && (
          <button
            type="button"
            onClick={buscarDireccion}
            disabled={busqueda === 'buscando'}
            className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-60"
          >
            {busqueda === 'buscando' ? 'Buscando…' : '📍 Buscar por dirección'}
          </button>
        )}
        {busqueda === 'error' && (
          <span className="text-gray-400">No se encontró — ingrésalas manualmente</span>
        )}
      </div>

      {sugerencia && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/40 px-3 py-2 text-xs text-gray-700 flex items-center gap-2 flex-wrap">
          <span>
            ≈ {sugerencia.lat.toFixed(6)}, {sugerencia.lng.toFixed(6)} — {truncar(sugerencia.nombre, 70)}
          </span>
          <button type="button" onClick={usarSugerencia} className="ml-auto text-brand-700 font-semibold hover:underline">
            Usar
          </button>
          <button type="button" onClick={() => setSugerencia(null)} className="text-gray-400 hover:underline">
            Descartar
          </button>
        </div>
      )}
    </div>
  )
}
