# Registros por Obra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/registros` del panel SST en una vista hub-and-spoke. Una pantalla principal con cards de obras y un drill-down por obra con toggle Lista/Kanban. Spec: `docs/superpowers/specs/2026-05-27-registros-por-obra-design.md`.

**Architecture:** Dos páginas nuevas (`ObrasHub`, `ObraRegistros`) más 4 componentes (`ObraCard`, `RegistroCard`, `RegistroKanban`, hook `useObrasConRegistros`). Routing en React Router v6 con parámetro de URL. Tipos compartidos extraídos a `src/types/formulario.ts`. Data fetching client-side (consistente con el patrón del proyecto que evita índices compuestos Firestore).

**Tech Stack:** React 18 + TypeScript 5 + Vite + React Router v6 + Firebase 10 + Tailwind 3.

---

## Verification convention (no test framework en este proyecto)

Este proyecto NO usa Jest/Vitest. La verificación de cada task es:

1. **Type-check:** `npx tsc --noEmit` — debe pasar sin errores.
2. **Smoke test manual:** `npm run dev`, abrir http://localhost:5173 con usuario admin, hacer click en lo relevante.
3. **Commit:** mensaje convencional (`feat:`, `refactor:`, `chore:`).

Cada task termina con type-check + commit. Smoke test al final de cada bloque grande (después de Task 5, después de Task 9, al final).

---

## File structure

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `src/types/formulario.ts` | Create | Tipos compartidos `Formulario`, `RevisionSST`, `TIPO_LABELS`, `TIPO_COLOR`, `normalizarDoc`, `formatDate` |
| `src/components/RegistrosTable.tsx` | Modify | Re-exporta los tipos desde `formulario.ts` (no rompe Reportes) |
| `src/pages/Dashboard.tsx` | Modify | Importa desde nuevo path |
| `src/pages/Reportes.tsx` | Modify | Importa desde nuevo path |
| `src/pages/Registros.tsx` | Delete (sustituido por ObrasHub) | — |
| `src/pages/ObrasHub.tsx` | Create | Pantalla 1 — hub de obras con cards |
| `src/pages/ObraRegistros.tsx` | Create | Pantalla 2 — drill-down por obra |
| `src/components/ObraCard.tsx` | Create | Card de una obra en el hub |
| `src/components/RegistroCard.tsx` | Create | Card de un registro en vista lista |
| `src/components/RegistroKanban.tsx` | Create | Tablero Kanban con 3 columnas |
| `src/hooks/useObrasConRegistros.ts` | Create | Hook que carga obras + formularios y los agrupa |
| `src/App.tsx` | Modify | Routing: `/registros` → ObrasHub, `/registros/:obraId` → ObraRegistros |

---

## Task 1: Extraer tipos compartidos a `src/types/formulario.ts`

**Why:** Hoy los tipos `Formulario`, `TIPO_LABELS`, etc. viven en `RegistrosTable.tsx`. ObrasHub y ObraRegistros los necesitan, pero importarlos desde un componente de tabla acopla el código. Mover a un módulo de tipos. Aprovechar para **agregar `obraId`** al normalizador.

**Files:**
- Create: `src/types/formulario.ts`
- Modify: `src/components/RegistrosTable.tsx` (re-exporta los tipos desde el nuevo path)

- [ ] **Step 1: Crear `src/types/formulario.ts` con todo el contenido**

```typescript
// src/types/formulario.ts

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface RevisionSST {
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  observacion?: string
  revisado_por?: string
  fecha_revision?: string
}

export interface Formulario {
  id: string
  tipo: string
  uid_creador: string
  obraId: string            // NUEVO — id de la obra (raw.obra_id)
  proyecto: string          // nombre de la obra (raw.obra_nombre)
  fecha: string
  responsable: string
  ciudad?: string
  direccion?: string
  codigo_formato: string
  version?: string
  fecha_modificacion?: string
  timestamp_creacion: string
  campos_dinamicos: Record<string, unknown>
  fotos_urls?: string[]
  firmas_urls?: Record<string, string>
  pdf_url?: string
  estado_sync?: string
  revision_sst?: RevisionSST
  descargado_sst?: boolean
  fecha_descarga?: string
}

// ── Normalizador ─────────────────────────────────────────────────────────────

type FirestoreTimestamp = { toDate: () => Date }

export function normalizarDoc(id: string, raw: Record<string, unknown>): Formulario {
  const fechaRaw = raw.fecha_creacion as FirestoreTimestamp | string | null | undefined
  const timestamp_creacion: string = fechaRaw
    ? (typeof fechaRaw === 'string'
        ? fechaRaw
        : (fechaRaw.toDate?.()?.toISOString() ?? ''))
    : ''

  const data = (raw.data as Record<string, unknown>) ?? {}

  return {
    id,
    tipo:               (raw.tipo              as string) ?? '',
    uid_creador:        (raw.user_id           as string) ?? '',
    obraId:             (raw.obra_id           as string) ?? '',
    proyecto:           (raw.obra_nombre       as string) ?? '',
    fecha:              timestamp_creacion,
    responsable:        (data.responsable      as string) ?? (raw.user_nombre as string) ?? '',
    ciudad:             (data.ciudad           as string) ?? '',
    direccion:          (data.direccion        as string) ?? '',
    codigo_formato:     (data.numero_formulario as string) ?? '',
    version:            '',
    fecha_modificacion: '',
    timestamp_creacion,
    campos_dinamicos:   data,
    fotos_urls:         [],
    firmas_urls:        {},
    pdf_url:            (raw.pdf_url           as string) ?? undefined,
    estado_sync:        '',
    revision_sst:       raw.revision_sst       as RevisionSST | undefined,
    descargado_sst:     (raw.descargado_sst    as boolean)  ?? false,
    fecha_descarga:     (raw.fecha_descarga    as string)   ?? undefined,
  }
}

// ── Labels y colores por tipo ────────────────────────────────────────────────

export const TIPO_LABELS: Record<string, string> = {
  preoperacional:          'Preoperacional',
  ats:                     'ATS',
  charla:                  'Charla 5 min',
  permiso_alturas:         'Permiso Alturas',
  permiso_caliente:        'Permiso Caliente',
  inspeccion_herramientas: 'Insp. Herramientas',
  inspeccion_epp:          'Insp. EPP',
  inspeccion_escaleras:    'Insp. Escaleras',
  inspeccion_arnes:        'Insp. Arnés',
  inspeccion_tieoff:       'Insp. Tie-Off',
  inspeccion_instalaciones:'Insp. Instalaciones',
  inspeccion_hseq:         'Insp. HSEQ',
  reporte_actos:           'Reporte Actos',
  emergencia:              'Emergencia',
}

export const TIPO_COLOR: Record<string, string> = {
  preoperacional:          'bg-blue-100 text-blue-800',
  ats:                     'bg-violet-100 text-violet-800',
  charla:                  'bg-purple-100 text-purple-800',
  permiso_alturas:         'bg-orange-100 text-orange-800',
  permiso_caliente:        'bg-red-100 text-red-800',
  inspeccion_herramientas: 'bg-cyan-100 text-cyan-800',
  inspeccion_epp:          'bg-teal-100 text-teal-800',
  inspeccion_escaleras:    'bg-sky-100 text-sky-800',
  inspeccion_arnes:        'bg-indigo-100 text-indigo-800',
  inspeccion_tieoff:       'bg-blue-100 text-blue-800',
  inspeccion_instalaciones:'bg-emerald-100 text-emerald-800',
  inspeccion_hseq:         'bg-lime-100 text-lime-800',
  reporte_actos:           'bg-amber-100 text-amber-800',
  emergencia:              'bg-rose-100 text-rose-800',
}

export const REVISION_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobado:  'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatRelativeDate(iso: string): string {
  if (!iso) return 'sin actividad'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} día${days !== 1 ? 's' : ''}`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem`
  return formatDate(iso)
}
```

- [ ] **Step 2: Reescribir `src/components/RegistrosTable.tsx` para que re-exporte desde el nuevo módulo**

Reemplazar las líneas 1-126 del archivo (todo arriba del componente `RegistrosTable`) con:

```typescript
// src/components/RegistrosTable.tsx
import { useState } from 'react'

// Re-export de tipos y helpers para mantener compatibilidad con código existente
// (Reportes.tsx, Dashboard.tsx, Registros.tsx que aún importan desde acá).
export type { RevisionSST, Formulario } from '../types/formulario'
export {
  TIPO_LABELS,
  normalizarDoc,
} from '../types/formulario'
import { TIPO_LABELS, TIPO_COLOR, REVISION_BADGE, formatDate, type Formulario } from '../types/formulario'

// (el resto del archivo — el componente RegistrosTable — queda igual desde aquí hasta el final)
```

Eliminar las definiciones duplicadas que estaban en el archivo (la interfaz `RevisionSST`, la interfaz `Formulario`, la función `normalizarDoc`, las constantes `TIPO_LABELS`, `TIPO_COLOR`, `REVISION_BADGE`, la función `formatDate`). Mantener el componente `RegistrosTable` por defecto, su prop `PAGE_SIZE`, y todo lo demás.

- [ ] **Step 3: Type-check**

```bash
cd "C:/apps/APLICACION SST/sst-panel-web"
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/formulario.ts src/components/RegistrosTable.tsx
git commit -m "refactor(types): extraer tipos de Formulario a src/types/formulario.ts

- Tipos Formulario, RevisionSST y helpers (normalizarDoc, TIPO_LABELS, TIPO_COLOR,
  REVISION_BADGE, formatDate) ahora viven en src/types/formulario.ts
- Agrega campo Formulario.obraId (mapea raw.obra_id desde Firestore)
- Nuevo helper formatRelativeDate('hace 2h', 'ayer', etc.) para timestamps relativos
- RegistrosTable re-exporta los símbolos para no romper Reportes/Dashboard"
```

---

## Task 2: Crear hook `useObrasConRegistros`

**Why:** Concentrar el fetching+agrupación en un solo hook reutilizable evita duplicar lógica entre el hub y el drill-down.

**Files:**
- Create: `src/hooks/useObrasConRegistros.ts`

- [ ] **Step 1: Crear el archivo del hook**

```typescript
// src/hooks/useObrasConRegistros.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { normalizarDoc, type Formulario } from '../types/formulario'
import type { Obra } from '../components/ObrasTable'

export interface ObraConStats extends Obra {
  totalRegistros: number
  pendientes: number
  ultimoTimestamp: string
  ultimoResponsable: string
}

interface State {
  obras: Obra[]
  formularios: Formulario[]
  loading: boolean
  error: string | null
}

export function useObrasConRegistros() {
  const [state, setState] = useState<State>({
    obras: [],
    formularios: [],
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const [obrasSnap, formsSnap] = await Promise.all([
        getDocs(collection(db, 'obras')),
        getDocs(query(collection(db, 'formularios'), orderBy('fecha_creacion', 'desc'))),
      ])
      const obras = obrasSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Obra[]
      const formularios = formsSnap.docs.map(d =>
        normalizarDoc(d.id, d.data() as Record<string, unknown>)
      )
      setState({ obras, formularios, loading: false, error: null })
    } catch (e) {
      console.error('useObrasConRegistros load error:', e)
      setState(s => ({ ...s, loading: false, error: 'No se pudieron cargar los datos.' }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Agrupa formularios por obra y calcula stats
  const obrasConStats = useMemo<ObraConStats[]>(() => {
    return state.obras.map(obra => {
      const formsDeObra = state.formularios.filter(
        f => f.obraId === obra.id || f.proyecto === obra.nombre_sitio
      )
      const pendientes = formsDeObra.filter(
        f => !f.revision_sst || f.revision_sst.estado === 'pendiente'
      ).length
      const ultimo = formsDeObra[0] // ya viene ordenado desc
      return {
        ...obra,
        totalRegistros: formsDeObra.length,
        pendientes,
        ultimoTimestamp: ultimo?.timestamp_creacion ?? '',
        ultimoResponsable: ultimo?.responsable ?? '',
      }
    })
  }, [state.obras, state.formularios])

  const formulariosByObra = useCallback(
    (obraId: string): Formulario[] => {
      const obra = state.obras.find(o => o.id === obraId)
      return state.formularios.filter(
        f => f.obraId === obraId || (obra && f.proyecto === obra.nombre_sitio)
      )
    },
    [state.obras, state.formularios]
  )

  return {
    obras: state.obras,
    formularios: state.formularios,
    obrasConStats,
    formulariosByObra,
    loading: state.loading,
    error: state.error,
    reload: load,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useObrasConRegistros.ts
git commit -m "feat(hooks): hook useObrasConRegistros para hub-and-spoke

Lee obras + formularios en paralelo y los agrupa. Retorna:
- obras (raw)
- formularios (raw, normalizados)
- obrasConStats: cada obra con totalRegistros, pendientes, último timestamp
- formulariosByObra(obraId): filtra por obra
- loading, error, reload

Tolerante al modelo legacy: si formulario.obraId está vacío, hace fallback
match por nombre (obra.nombre_sitio === formulario.proyecto)."
```

---

## Task 3: Crear `ObraCard` (card de obra en el hub)

**Files:**
- Create: `src/components/ObraCard.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// src/components/ObraCard.tsx
import { Link } from 'react-router-dom'
import type { ObraConStats } from '../hooks/useObrasConRegistros'
import { formatRelativeDate } from '../types/formulario'

interface Props {
  obra: ObraConStats
}

export default function ObraCard({ obra }: Props) {
  const tienePendientes = obra.pendientes > 0
  const inactiva = obra.estado === 'inactiva'

  return (
    <Link
      to={`/registros/${obra.id}`}
      className={`group block bg-white border rounded-lg p-3 transition-all relative ${
        inactiva
          ? 'border-gray-200 opacity-50 hover:opacity-75'
          : 'border-gray-200 hover:border-blue-700 hover:-translate-y-px hover:shadow-md'
      }`}
    >
      {/* Indicador de pendientes (esquina superior derecha) */}
      {tienePendientes && (
        <span
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500"
          style={{ boxShadow: '0 0 0 4px rgba(245,158,11,0.18)' }}
          aria-label={`${obra.pendientes} pendientes`}
        />
      )}

      {/* Título + código */}
      <div className="text-sm font-semibold text-gray-900 truncate" title={obra.nombre_sitio}>
        {obra.nombre_sitio}
      </div>
      <div className="font-mono text-[10px] text-gray-400 mb-2 truncate">
        {obra.codigo}
        {obra.cliente && <span className="text-gray-500"> · {obra.cliente}</span>}
      </div>

      {/* Stats grandes */}
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xl font-bold text-gray-900 leading-none">
          {obra.totalRegistros}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-gray-400">
          {obra.totalRegistros === 1 ? 'registro' : 'registros'}
        </span>
        {tienePendientes && (
          <span className="ml-auto bg-amber-100 text-amber-800 rounded text-[9px] font-bold px-1.5 py-0.5">
            {obra.pendientes} pend
          </span>
        )}
      </div>

      {/* Última actividad */}
      <div className="text-[9px] text-gray-400 border-t border-gray-100 pt-1">
        {obra.ultimoTimestamp
          ? `${formatRelativeDate(obra.ultimoTimestamp)} · ${obra.ultimoResponsable || '—'}`
          : 'Sin actividad'}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ObraCard.tsx
git commit -m "feat(components): ObraCard para el hub de registros

Card clickable que linkea a /registros/:obraId. Muestra nombre + código,
total de registros, badge de pendientes (si hay), última actividad relativa,
y punto naranja arriba a la derecha si hay pendientes. Obras inactivas se ven
más opacas pero siguen siendo navegables."
```

---

## Task 4: Crear página `ObrasHub` (Pantalla 1)

**Files:**
- Create: `src/pages/ObrasHub.tsx`

- [ ] **Step 1: Crear el archivo de la página**

```typescript
// src/pages/ObrasHub.tsx
import { useState, useMemo } from 'react'
import { useObrasConRegistros, type ObraConStats } from '../hooks/useObrasConRegistros'
import ObraCard from '../components/ObraCard'

type EstadoFilter = 'activas' | 'inactivas' | 'todas'
type SortBy = 'recientes' | 'pendientes' | 'alfabetico'

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

export default function ObrasHub() {
  const { obrasConStats, loading, error, reload } = useObrasConRegistros()

  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('activas')
  const [conPendientes, setConPendientes] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('recientes')

  // ── Filtros + sort ─────────────────────────────────────────────────────────

  const filtradas = useMemo<ObraConStats[]>(() => {
    let result = obrasConStats

    if (estadoFilter === 'activas') result = result.filter(o => o.estado === 'activa')
    else if (estadoFilter === 'inactivas') result = result.filter(o => o.estado === 'inactiva')

    if (conPendientes) result = result.filter(o => o.pendientes > 0)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.nombre_sitio.toLowerCase().includes(q) ||
        o.codigo.toLowerCase().includes(q) ||
        (o.cliente ?? '').toLowerCase().includes(q)
      )
    }

    const sorted = [...result]
    if (sortBy === 'recientes') {
      sorted.sort((a, b) => b.ultimoTimestamp.localeCompare(a.ultimoTimestamp))
    } else if (sortBy === 'pendientes') {
      sorted.sort((a, b) => b.pendientes - a.pendientes)
    } else {
      sorted.sort((a, b) => a.nombre_sitio.localeCompare(b.nombre_sitio))
    }
    return sorted
  }, [obrasConStats, estadoFilter, conPendientes, search, sortBy])

  // ── Auto-secciones (recientes vs otras) ────────────────────────────────────

  const { recientes, otras } = useMemo(() => {
    const cutoff = Date.now() - SIETE_DIAS_MS
    const recientes: ObraConStats[] = []
    const otras: ObraConStats[] = []
    for (const o of filtradas) {
      const ts = o.ultimoTimestamp ? new Date(o.ultimoTimestamp).getTime() : 0
      if (ts >= cutoff) recientes.push(o)
      else otras.push(o)
    }
    return { recientes, otras }
  }, [filtradas])

  // ── Métricas globales ──────────────────────────────────────────────────────

  const totales = useMemo(() => {
    const activas = obrasConStats.filter(o => o.estado === 'activa').length
    const registros = obrasConStats.reduce((sum, o) => sum + o.totalRegistros, 0)
    const pendientes = obrasConStats.reduce((sum, o) => sum + o.pendientes, 0)
    return { activas, registros, pendientes }
  }, [obrasConStats])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registros por Obra</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Cargando…'
              : `${totales.activas} obras activas · ${totales.registros} registros · ${totales.pendientes} pendientes`}
          </p>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código o cliente…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="recientes">↓ Más recientes</option>
          <option value="pendientes">↓ Con más pendientes</option>
          <option value="alfabetico">↓ Alfabético</option>
        </select>

        {/* Estado chips (mutuamente excluyentes) */}
        {(['activas', 'inactivas', 'todas'] as EstadoFilter[]).map(opt => (
          <button
            key={opt}
            onClick={() => setEstadoFilter(opt)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              estadoFilter === opt
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt === 'activas' ? 'Activas' : opt === 'inactivas' ? 'Inactivas' : 'Todas'}
          </button>
        ))}

        {/* Toggle Con pendientes */}
        <button
          onClick={() => setConPendientes(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            conPendientes
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          Con pendientes
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Vacío */}
      {!loading && filtradas.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
          <p className="text-gray-500 text-sm">
            {obrasConStats.length === 0
              ? 'No hay obras todavía. Creá una desde el menú Obras.'
              : 'Ninguna obra coincide con los filtros.'}
          </p>
        </div>
      )}

      {/* Sección 1: Actividad reciente */}
      {!loading && recientes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              Actividad reciente · esta semana
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {recientes.map(o => <ObraCard key={o.id} obra={o} />)}
          </div>
        </section>
      )}

      {/* Sección 2: Otras obras */}
      {!loading && otras.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
              {recientes.length > 0
                ? `Otras obras (${otras.length})`
                : `Obras (${otras.length})`}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {otras.map(o => <ObraCard key={o.id} obra={o} />)}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ObrasHub.tsx
git commit -m "feat(pages): ObrasHub — hub de obras con cards (Pantalla 1)

Reemplaza la entrada principal de /registros con una vista de cards
agrupadas por obra:
- Toolbar: search, sort (recientes/pendientes/alfabético), chips de estado
  (Activas/Inactivas/Todas) y toggle 'Con pendientes'
- Secciones automáticas: 'Actividad reciente · esta semana' y 'Otras obras'
- Grid responsive: 4 cols en xl, 3 en md, 2 en sm
- Loading skeleton, error state, empty state
- Refresh manual con botón Actualizar"
```

---

## Task 5: Conectar `ObrasHub` al routing y verificar smoke test

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/Registros.tsx` (será reemplazado por ObraRegistros en Task 9; por ahora la ruta `/registros` apunta a ObrasHub)

- [ ] **Step 1: Modificar `src/App.tsx` para usar ObrasHub en `/registros`**

Reemplazar la línea 10:
```typescript
import Registros from './pages/Registros'
```
Por:
```typescript
import ObrasHub from './pages/ObrasHub'
```

Reemplazar la línea 71:
```typescript
        <Route path="/registros" element={<Registros />} />
```
Por:
```typescript
        <Route path="/registros" element={<ObrasHub />} />
```

- [ ] **Step 2: NO borrar `Registros.tsx` todavía**

Lo mantenemos como respaldo hasta que ObraRegistros esté listo. Se elimina en Task 9.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores. Puede haber warning "Registros.tsx is unused" — eso es esperado.

- [ ] **Step 4: Smoke test manual**

```bash
npm run dev
```

Abrir http://localhost:5173. Login con admin. Click en **Registros** (sidebar).

Verificar:
- Header dice "Registros por Obra" con métricas.
- Aparecen cards de obras (al menos las que tienen registros: PISO SHUT DE BASURAS, Datacenter Megacenter).
- Cards muestran nombre, código, total de registros, badge de pendientes, fecha relativa.
- Punto naranja arriba a la derecha en las que tienen pendientes.
- Chips "Activas / Inactivas / Todas" funcionan.
- Search filtra al tipear.
- Sort cambia el orden.
- Hacer click en una card NO hace nada todavía (URL cambia a `/registros/:obraId` pero la ruta no existe).

Esto último es esperado — la fixeamos en Task 9. Si todo lo demás funciona, seguir.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(routing): /registros ahora muestra ObrasHub

Reemplaza la antigua tabla plana de Registros por la nueva vista
hub de obras. La ruta /registros/:obraId (drill-down) viene en una
tarea siguiente."
```

---

## Task 6: Crear `RegistroCard` (vista Lista dentro de obra)

**Files:**
- Create: `src/components/RegistroCard.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// src/components/RegistroCard.tsx
import {
  TIPO_LABELS,
  TIPO_COLOR,
  REVISION_BADGE,
  type Formulario,
} from '../types/formulario'

interface Props {
  formulario: Formulario
  onClick: () => void
}

const ICON_TIPO_LABELS = TIPO_LABELS

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function RegistroCard({ formulario: f, onClick }: Props) {
  const revEstado = f.revision_sst?.estado ?? 'pendiente'
  const tipoLabel = ICON_TIPO_LABELS[f.tipo] ?? f.tipo
  const tipoColor = TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[80px_1fr_140px_90px] gap-3 items-center bg-white border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer hover:border-gray-900 transition-colors"
    >
      {/* Tipo + código */}
      <div className="text-center">
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${tipoColor}`}>
          {tipoLabel}
        </span>
        {f.codigo_formato && (
          <div className="font-mono text-[9px] text-gray-400 mt-1 truncate">
            {f.codigo_formato}
          </div>
        )}
      </div>

      {/* Descripción */}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{tipoLabel}</div>
        <div className="text-[11px] text-gray-500 truncate">
          {(f.campos_dinamicos['tema'] as string) ??
            (f.campos_dinamicos['actividad'] as string) ??
            (f.campos_dinamicos['descripcion'] as string) ??
            f.proyecto}
        </div>
      </div>

      {/* Técnico */}
      <div className="text-center">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[9px] font-bold flex items-center justify-center mx-auto mb-0.5">
          {avatarInitials(f.responsable)}
        </div>
        <div className="text-[10px] text-gray-600 truncate">{f.responsable || '—'}</div>
        <div className="text-[9px] text-gray-400">{formatDateTime(f.timestamp_creacion)}</div>
      </div>

      {/* Estado */}
      <div className="text-center">
        <span className={`inline-block text-[10px] font-medium px-2.5 py-0.5 rounded-full capitalize ${REVISION_BADGE[revEstado]}`}>
          {revEstado}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/RegistroCard.tsx
git commit -m "feat(components): RegistroCard estilo Linear para vista lista

Cada registro como card horizontal con grid de 4 columnas:
- Tipo badge + código
- Título + descripción contextual (tema/actividad/proyecto)
- Avatar del técnico con iniciales + fecha
- Pill de estado de revisión

Hover: borde negro. Click: dispara onClick (lo conectamos al modal
de detalle en ObraRegistros)."
```

---

## Task 7: Crear `RegistroKanban` (vista Kanban dentro de obra)

**Files:**
- Create: `src/components/RegistroKanban.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// src/components/RegistroKanban.tsx
import {
  TIPO_LABELS,
  TIPO_COLOR,
  type Formulario,
} from '../types/formulario'

interface Props {
  formularios: Formulario[]
  onCardClick: (f: Formulario) => void
}

type Estado = 'pendiente' | 'aprobado' | 'rechazado'

const COLUMN_STYLES: Record<Estado, { titulo: string; tituloColor: string; bg: string }> = {
  pendiente:  { titulo: 'Pendientes',  tituloColor: 'text-amber-700',   bg: 'bg-amber-50/50' },
  aprobado:   { titulo: 'Aprobados',   tituloColor: 'text-emerald-700', bg: 'bg-emerald-50/50' },
  rechazado:  { titulo: 'Rechazados',  tituloColor: 'text-red-700',     bg: 'bg-red-50/50' },
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function KanbanCard({ f, onClick }: { f: Formulario; onClick: () => void }) {
  const tipoLabel = TIPO_LABELS[f.tipo] ?? f.tipo
  const tipoColor = TIPO_COLOR[f.tipo] ?? 'bg-gray-100 text-gray-700'
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-md px-2.5 py-2 mb-1.5 cursor-pointer hover:border-gray-900 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tipoColor}`}>
          {tipoLabel}
        </span>
        {f.codigo_formato && (
          <span className="font-mono text-[8px] text-gray-400 truncate ml-2">
            {f.codigo_formato}
          </span>
        )}
      </div>
      <div className="text-[10px] text-gray-800 font-medium truncate">
        {f.responsable || '—'}
      </div>
      <div className="text-[9px] text-gray-400 mt-0.5">
        {formatShortDate(f.timestamp_creacion)}
      </div>
    </div>
  )
}

export default function RegistroKanban({ formularios, onCardClick }: Props) {
  const grouped: Record<Estado, Formulario[]> = { pendiente: [], aprobado: [], rechazado: [] }
  for (const f of formularios) {
    const estado: Estado = (f.revision_sst?.estado as Estado) ?? 'pendiente'
    grouped[estado].push(f)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 overflow-x-auto">
      {(['pendiente', 'aprobado', 'rechazado'] as Estado[]).map(estado => {
        const cfg = COLUMN_STYLES[estado]
        const items = grouped[estado]
        return (
          <div key={estado} className={`rounded-lg p-2.5 min-h-[300px] ${cfg.bg} min-w-[260px]`}>
            <div className={`flex items-center justify-between mb-2 text-[10px] font-bold uppercase tracking-wide ${cfg.tituloColor}`}>
              <span>{cfg.titulo}</span>
              <span className="bg-black/5 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <div className="text-center text-[10px] text-gray-400 py-6">
                — sin registros —
              </div>
            ) : (
              items.map(f => <KanbanCard key={f.id} f={f} onClick={() => onCardClick(f)} />)
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/RegistroKanban.tsx
git commit -m "feat(components): RegistroKanban con 3 columnas por estado

Tablero kanban: Pendientes / Aprobados / Rechazados. Cards compactas
con tipo + código + técnico + fecha. En mobile colapsa a una columna
por fila (overflow-x scroll en horizontal si se desea estilo carrusel
en breakpoints intermedios)."
```

---

## Task 8: Crear página `ObraRegistros` (drill-down, Pantalla 2)

**Files:**
- Create: `src/pages/ObraRegistros.tsx`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/pages/ObraRegistros.tsx
import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { toast } from '../components/shared/Toast'
import { useObrasConRegistros } from '../hooks/useObrasConRegistros'
import RegistroCard from '../components/RegistroCard'
import RegistroKanban from '../components/RegistroKanban'
import RegistroDetalleModal from '../components/RegistroDetalleModal'
import { TIPO_LABELS, type Formulario } from '../types/formulario'

type ViewMode = 'lista' | 'kanban'
type EstadoFilter = 'todos' | 'pendiente' | 'aprobado' | 'rechazado'

export default function ObraRegistros() {
  const { obraId = '' } = useParams<{ obraId: string }>()
  const navigate = useNavigate()
  const { obras, formulariosByObra, loading, reload } = useObrasConRegistros()

  const obra = useMemo(() => obras.find(o => o.id === obraId), [obras, obraId])
  const formularios = useMemo(() => formulariosByObra(obraId), [formulariosByObra, obraId])

  const [view, setView] = useState<ViewMode>('lista')
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('todos')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Formulario | null>(null)

  const filtrados = useMemo(() => {
    let result = formularios
    if (estadoFilter !== 'todos') {
      result = result.filter(f => (f.revision_sst?.estado ?? 'pendiente') === estadoFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(f =>
        f.responsable.toLowerCase().includes(q) ||
        f.codigo_formato.toLowerCase().includes(q)
      )
    }
    return result
  }, [formularios, estadoFilter, search])

  const counts = useMemo(() => {
    const c = { todos: formularios.length, pendiente: 0, aprobado: 0, rechazado: 0 }
    for (const f of formularios) {
      const e = f.revision_sst?.estado ?? 'pendiente'
      if (e === 'pendiente') c.pendiente++
      else if (e === 'aprobado') c.aprobado++
      else if (e === 'rechazado') c.rechazado++
    }
    return c
  }, [formularios])

  // ── Acciones (visto bueno, marcar descargado) — reutilizadas del Registros original ──

  const handleVistobueno = async (
    id: string,
    estado: 'aprobado' | 'rechazado',
    observacion: string,
    revisadoPor: string,
  ) => {
    const revision = {
      estado,
      observacion,
      revisado_por: revisadoPor,
      fecha_revision: new Date().toISOString(),
    }
    await updateDoc(doc(db, 'formularios', id), {
      revision_sst: revision,
      fecha_actualizacion: Timestamp.now(),
    })

    const formulario = formularios.find(f => f.id === id)
    if (formulario?.uid_creador) {
      const tipoLabel = TIPO_LABELS[formulario.tipo] ?? formulario.tipo
      await addDoc(collection(db, 'notificaciones'), {
        user_id:        formulario.uid_creador,
        formulario_id:  id,
        formulario_tipo: formulario.tipo,
        tipo:           estado,
        titulo:         estado === 'aprobado' ? '✅ Formulario aprobado' : '❌ Formulario rechazado',
        mensaje:        estado === 'aprobado'
          ? `Tu ${tipoLabel} fue aprobado por ${revisadoPor}.`
          : `Tu ${tipoLabel} fue rechazado por ${revisadoPor}.${observacion ? ` Motivo: ${observacion}` : ''}`,
        leido:          false,
        fecha:          Timestamp.now(),
      })
    }

    setSelected(prev => prev?.id === id ? { ...prev, revision_sst: revision } : prev)
    await reload()
    toast(`Formulario ${estado} correctamente`)
  }

  const handlePdfDescargado = async (id: string) => {
    try {
      await updateDoc(doc(db, 'formularios', id), {
        descargado_sst: true,
        fecha_descarga: new Date().toISOString(),
      })
    } catch {
      // No crítico
    }
  }

  // ── 404 si obraId no existe ────────────────────────────────────────────────

  if (!loading && !obra) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900">Obra no encontrada</h1>
        <p className="text-gray-500 text-sm mt-2">El ID no coincide con ninguna obra.</p>
        <button
          onClick={() => navigate('/registros')}
          className="mt-6 text-sm text-blue-700 hover:underline"
        >
          ← Volver al hub
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* Breadcrumb */}
      <div className="text-xs text-gray-500">
        <Link to="/registros" className="text-blue-700 hover:underline">← Registros</Link>
        {obra && <span className="text-gray-400"> / {obra.nombre_sitio}</span>}
      </div>

      {/* Banner de obra */}
      {obra && (
        <div className="rounded-lg p-4 text-white flex flex-wrap items-center justify-between gap-3"
             style={{ background: 'linear-gradient(to right, #0f172a, #1e293b)' }}>
          <div>
            <h2 className="text-lg font-bold leading-tight">{obra.nombre_sitio}</h2>
            <div className="font-mono text-[11px] opacity-70 mt-0.5">
              {obra.codigo}
              {obra.cliente && <span> · {obra.cliente}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="bg-white/10 rounded-md px-3 py-1.5 text-center">
              <span className="block text-lg font-bold leading-tight">{counts.todos}</span>
              <span className="text-[9px] uppercase opacity-70 tracking-wide">Registros</span>
            </div>
            <div className="rounded-md px-3 py-1.5 text-center" style={{ background: 'rgba(245,158,11,0.22)' }}>
              <span className="block text-lg font-bold leading-tight">{counts.pendiente}</span>
              <span className="text-[9px] uppercase opacity-70 tracking-wide">Pendientes</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar interno */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar técnico, código…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Estado filter chips */}
        {([
          { v: 'todos',     l: 'Todos' },
          { v: 'pendiente', l: `Pendientes (${counts.pendiente})` },
          { v: 'aprobado',  l: `Aprobados (${counts.aprobado})` },
          { v: 'rechazado', l: `Rechazados (${counts.rechazado})` },
        ] as { v: EstadoFilter; l: string }[]).map(opt => (
          <button
            key={opt.v}
            onClick={() => setEstadoFilter(opt.v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              estadoFilter === opt.v
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt.l}
          </button>
        ))}

        {/* View toggle */}
        <div className="bg-gray-100 rounded-md p-0.5 flex gap-0.5">
          <button
            onClick={() => setView('lista')}
            className={`text-[11px] px-2.5 py-1 rounded ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'}`}
          >
            ≡ Lista
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`text-[11px] px-2.5 py-1 rounded ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'}`}
          >
            ⊞ Kanban
          </button>
        </div>
      </div>

      {/* Loading / Empty */}
      {loading && (
        <div className="grid gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
          <p className="text-gray-500 text-sm">
            {formularios.length === 0
              ? 'Esta obra no tiene registros todavía.'
              : 'Ningún registro coincide con los filtros.'}
          </p>
        </div>
      )}

      {/* Body según view */}
      {!loading && filtrados.length > 0 && view === 'lista' && (
        <div className="space-y-1.5">
          {filtrados.map(f => (
            <RegistroCard key={f.id} formulario={f} onClick={() => setSelected(f)} />
          ))}
        </div>
      )}

      {!loading && filtrados.length > 0 && view === 'kanban' && (
        <RegistroKanban formularios={filtrados} onCardClick={setSelected} />
      )}

      {/* Modal de detalle */}
      {selected && (
        <RegistroDetalleModal
          formulario={selected}
          onClose={() => setSelected(null)}
          onVistobueno={handleVistobueno}
          onPdfDescargado={handlePdfDescargado}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ObraRegistros.tsx
git commit -m "feat(pages): ObraRegistros — drill-down con toggle Lista/Kanban

Pantalla 2 del hub-and-spoke:
- Breadcrumb '← Registros / <obra>'
- Banner de obra con gradient oscuro + stats (Registros / Pendientes)
- Toolbar: search + chips (Todos/Pendientes/Aprobados/Rechazados con count)
- View toggle: ≡ Lista (default) / ⊞ Kanban
- Lista usa RegistroCard, Kanban usa RegistroKanban
- Click en card abre RegistroDetalleModal existente
- Visto bueno escribe notificación a Firestore (mismo flujo que el viejo Registros)
- 404 amigable si obraId no existe
- Empty state si la obra no tiene registros"
```

---

## Task 9: Conectar `ObraRegistros` al routing y eliminar `Registros.tsx` viejo

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/Registros.tsx`

- [ ] **Step 1: Modificar `src/App.tsx` para agregar la ruta del drill-down**

En el bloque de imports, agregar:
```typescript
import ObraRegistros from './pages/ObraRegistros'
```

En el bloque de rutas, debajo de la ruta `/registros`, agregar:
```typescript
        <Route path="/registros/:obraId" element={<ObraRegistros />} />
```

- [ ] **Step 2: Eliminar `src/pages/Registros.tsx`**

```bash
rm "src/pages/Registros.tsx"
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Smoke test manual**

```bash
npm run dev
```

Abrir http://localhost:5173. Login como admin.

Verificar **flujo completo**:
1. Click en **Registros** (sidebar) → ves cards de obras (Pantalla 1).
2. Click en una card de obra → entrás al drill-down (Pantalla 2).
3. Breadcrumb arriba muestra `← Registros / <obra>`.
4. Banner oscuro de la obra con stats.
5. Toggle entre **Lista** y **Kanban** funciona.
6. Filtros internos (Todos/Pendientes/Aprobados/Rechazados) filtran correctamente.
7. Búsqueda interna funciona.
8. Click en una card de registro → abre el `RegistroDetalleModal` (modal de siempre).
9. Aprobar/rechazar un formulario funciona y se actualiza visualmente.
10. Click en `← Registros` del breadcrumb → vuelve al hub.
11. Navegar a `/registros/no-existe-este-id` muestra "Obra no encontrada".

Si algo falla, debuggear y commitear correcciones separadas antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git rm src/pages/Registros.tsx
git commit -m "feat(routing): /registros/:obraId → ObraRegistros + remueve viejo Registros

- Nueva ruta /registros/:obraId monta ObraRegistros (drill-down).
- src/pages/Registros.tsx (la tabla plana legacy) ya no se usa: la lógica
  se distribuye entre ObrasHub (entrada) y ObraRegistros (drill-down).
- Reportes.tsx sigue usando RegistrosTable para la vista plana con export."
```

---

## Task 10: Build, deploy y verificación en producción

**Files:** ninguno (verificación end-to-end)

- [ ] **Step 1: Build local**

```bash
npm run build
```

Expected: build exitoso. `dist/` regenerado.

- [ ] **Step 2: Preview local de la build**

```bash
npm run preview
```

Abrir http://localhost:4173. Repetir smoke test del Task 9.

- [ ] **Step 3: Push a `main` (deploy automático Vercel)**

```bash
git push
```

Esperar ~20 segundos. Verificar que el último deploy de Vercel sea **Ready · Current** y use el commit `feat(routing)` del Task 9.

- [ ] **Step 4: Smoke test en producción**

Abrir https://sst-panel-neg.vercel.app/registros. Login admin. Verificar:
- Hub muestra cards de obras.
- Drill-down funciona.
- Toggle Lista/Kanban funciona.
- Modal de detalle se abre y permite aprobar/rechazar.

- [ ] **Step 5: Sin commit final** (este task no agrega código, solo deploy y verificación)

---

## Self-review

### Cobertura del spec

| Sección del spec | Task que lo implementa |
|---|---|
| Navegación: `/registros` → hub, `/registros/:obraId` → drill-down | Task 5, Task 9 |
| Pantalla 1: header + métricas globales | Task 4 |
| Pantalla 1: toolbar (search + sort + chips + density toggle) | Task 4 (density toggle NO incluido; YAGNI v1) |
| Pantalla 1: secciones automáticas (recientes/otras) | Task 4 |
| Pantalla 1: ObraCard | Task 3 |
| Pantalla 2: breadcrumb | Task 8 |
| Pantalla 2: banner de obra | Task 8 |
| Pantalla 2: toolbar (search + chips + view toggle) | Task 8 |
| Pantalla 2: RegistroCard (lista) | Task 6 |
| Pantalla 2: RegistroKanban | Task 7 |
| Pantalla 2: click → RegistroDetalleModal | Task 8 |
| `normalizarDoc` agrega `obraId` | Task 1 |
| Mobile responsive (grid cols, kanban scroll) | Task 4 (grid), Task 7 (kanban min-w + overflow) |
| Edge case: obraId inválido (404) | Task 8 |
| Edge case: empty state hub | Task 4 |
| Edge case: empty state drill-down | Task 8 |
| Reportes sin tocar | Task 1 mantiene RegistrosTable como re-export |

### Decisiones intencionales (alejándose del spec)

- **Density toggle ⊞/≡ en hub NO se implementa en v1.** El spec lo menciona; en práctica el grid responsive + búsqueda + sort cubren la usabilidad sin la complejidad extra. Se puede agregar después.
- **Pinned obras** (futuro mencionado en spec): out of scope v1.

### Type consistency

Verificado: `Formulario.obraId` se agrega en Task 1, se usa en `useObrasConRegistros` (Task 2). `ObraConStats` se define en Task 2 y se consume en Tasks 3, 4. `Formulario` se usa con el mismo shape en Tasks 6, 7, 8.

### Placeholder scan

Verificado: ningún "TBD", "TODO", "implement later". Cada paso incluye el código completo.
