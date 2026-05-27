# Registros por Obra — Diseño

**Fecha:** 2026-05-27
**Estado:** Aprobado para implementación
**Autor:** Brainstorming session con el usuario

---

## Resumen

Convertir la pantalla `Registros` del panel SST en una vista **hub-and-spoke**: la entrada principal muestra cards de obras con métricas, y se hace drill-down clickeando una obra para ver sus registros. El objetivo es que el panel escale a decenas o cientos de obras sin que la vista se sienta amontonada, y que la organización refleje el modelo mental real del SST ("primero pienso en la obra, después en los registros").

## Problema

Hoy `Registros` muestra una **tabla plana ordenada por fecha** que mezcla todos los registros de todas las obras. Cuando la app pase a producción y los técnicos generen decenas de formularios diarios distribuidos en muchas obras, la tabla se va a volver inmanejable: el SST tendrá que filtrar por obra cada vez que abra el panel y perderá el contexto de "qué pasó en cada obra esta semana".

## Solución propuesta

### Navegación

- El ítem **Registros** del sidebar pasa a apuntar al **Hub de Obras** (cards).
- Click en una obra navega a `/registros/:obraId` (drill-down).
- El breadcrumb dentro del drill-down permite volver al hub.
- **Reportes** (sidebar) **no se toca** — sigue siendo la vista plana con export Excel/CSV.

### Pantalla 1 · Hub de Obras (`/registros`)

Layout:
- Header: título "Registros por Obra" + subtítulo con métricas globales ("12 obras activas · 145 registros · 23 pendientes").
- **Toolbar** con: buscador prominente · sort dropdown · filter chips · density toggle (⊞ grid / ≡ lista).
  - Filter chips de **estado** (mutuamente excluyentes): `Activas` (default) / `Inactivas` / `Todas`.
  - Filter chip **aditivo** (toggle independiente): `Con pendientes` (cuando está activo, oculta obras con 0 pendientes).
  - Sort dropdown con opciones: `Más recientes` (default) / `Con más pendientes` / `Alfabético`.
- **Secciones automáticas**:
  - "🟢 Actividad reciente · esta semana" — obras con registros en los últimos 7 días, ordenadas por timestamp del último registro descendente.
  - "⚪ Otras obras activas (N)" — obras activas sin actividad reciente.
  - (Las inactivas se muestran sólo si se activa el chip "Inactivas".)
- **Grid responsive**: 4 columnas en desktop (~xl), 3 en lg, 2 en md, 1 en sm.

Card de obra (`ObraCard`):
- Nombre de la obra (truncado si excede 1 línea).
- Código + cliente o referencia (mono, gris).
- Mini-stats: total de registros + badge "X pend" (sólo si hay pendientes).
- Última actividad: "hace 2h · Juan Carlos" o "hace 3 días · Diego" (relativo).
- Indicador puntual: punto naranja arriba a la derecha si hay pendientes (escaneo rápido).
- Hover: borde más oscuro + leve `translate-y` + sombra.
- Click: navega a `/registros/:obraId`.

### Pantalla 2 · Drill-down de Obra (`/registros/:obraId`)

Layout:
- Breadcrumb: `← Registros / [Nombre de obra]`.
- **Banner de obra**: degradado oscuro con nombre + código + 2 stat-boxes (Registros / Pendientes).
- **Toolbar interno**: buscador + filter chips (Todos / Pendientes / Aprobados / Rechazados) + **view toggle (≡ Lista / ⊞ Kanban)**.
- **Cuerpo según view**:
  - **Lista (default)**: tarjetas `RegistroCard` apiladas. Cada card muestra `[tipo+código]` · `[título+descripción]` · `[técnico con avatar+fecha]` · `[estado pill]`.
  - **Kanban**: 3 columnas (Pendientes / Aprobados / Rechazados). Cada registro como card chiquita: `[tipo]` · `[código]` · `[técnico]` · `[fecha]`.

Click en una card → abre el modal de detalle existente (`RegistroDetalleModal`) — esa parte no cambia.

## Arquitectura técnica

### Routing (cambios en `App.tsx`)

```
/                        → Dashboard (sin cambios)
/registros               → ObrasHub (NUEVO, reemplaza el actual Registros)
/registros/:obraId       → ObraRegistros (NUEVO, drill-down)
/reportes                → Reportes (sin cambios)
/obras, /contratistas, /usuarios → sin cambios
```

### Componentes nuevos

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| `ObrasHub` | `src/pages/ObrasHub.tsx` | Pantalla 1: agrupa formularios por obra, calcula stats, renderiza grid |
| `ObraRegistros` | `src/pages/ObraRegistros.tsx` | Pantalla 2: filtra formularios por obraId, gestiona view toggle |
| `ObraCard` | `src/components/ObraCard.tsx` | Una card en el grid del hub |
| `RegistroCard` | `src/components/RegistroCard.tsx` | Una card en la vista Lista |
| `RegistroKanban` | `src/components/RegistroKanban.tsx` | Tablero kanban con 3 columnas |

### Componentes reutilizados

- `RegistroDetalleModal` — modal de detalle (sin cambios).
- `normalizarDoc` y tipos `Formulario` desde `RegistrosTable.tsx` — los tipos se mueven a `src/types/formulario.ts` para evitar acoplar las cards a un componente de tabla.
- `RegistrosTable` — **no se borra**, sigue siendo usado por `Reportes`.

### Data fetching

- `ObrasHub` lee dos colecciones en paralelo: `obras` (todas, sin filtro — el filtro de estado se aplica client-side para soportar el chip `Todas`) y `formularios` (todas).
- **Agrupa los formularios por `obra_id`** (no por `obra_nombre`, ya que las obras pueden ser renombradas). Esto requiere **actualizar `normalizarDoc`** en `RegistrosTable.tsx` para que el `Formulario` exponga `obra_id: (raw.obra_id as string) ?? ''` además del `proyecto` (nombre).
- Calcula stats por obra: total, pendientes, último registro.
- **Estrategia inicial**: cargar todo y agrupar client-side (consistente con el patrón actual del panel — evitamos índices compuestos en Firestore). Cuando el volumen exceda los ~1000 docs, evaluar `aggregation queries` de Firestore.
- `ObraRegistros` lee `formularios where obra_id == :obraId` para tener solo los relevantes.

### State management

- Filtros y view toggle: state local en cada página (`useState`).
- Datos: hook propio `useObrasConRegistros()` que retorna `{ obras, formulariosPorObra, loading, error }`.
- No usar Redux/Zustand — alcanza con el patrón actual del panel.

### Mobile responsive

- Hub: grid colapsa a 2 columnas en `md` y 1 en `sm`.
- Drill-down: el banner stack vertical en mobile (stats abajo del nombre). Toolbar wrap si no entra.
- Lista de registros: las cards se vuelven más altas (info se reorganiza vertical).
- Kanban: en mobile se vuelve horizontal scroll (cada columna ocupa ~80% del viewport).

## Edge cases y empty states

| Caso | Comportamiento |
|---|---|
| No hay ninguna obra creada | Hub muestra mensaje: "No hay obras todavía. Creá una desde Obras →" |
| Hay obras pero ninguna tiene registros | Hub lista las obras igual, todas mostrando "Sin actividad" en lugar de stats |
| Obra inactiva con registros históricos | Aparece solo si el chip "Inactivas" o "Todas" está activo. Card opacada. |
| `obraId` en URL no existe | Pantalla 404 con botón "← Volver al hub" |
| Drill-down con 0 registros | Banner igual, pero cuerpo: "Esta obra no tiene registros todavía" |

## Migración

- Usuarios que tengan `/registros` en favoritos → redirige al nuevo hub (URL no cambia).
- Usuarios SST acostumbrados a la tabla plana → siguen pudiendo verla en `Reportes` (idéntica funcionalidad de hoy).
- El badge de "pendientes" en el sidebar **sigue contando todos los pendientes globales**, no cambia.
- Notificaciones — sin cambios.

## Performance

- Hub carga todas las obras + todos los formularios en paralelo, agrupa en memoria. Costo: O(N) por agrupación, N = total de formularios. Con N=1000 es instantáneo.
- Drill-down carga solo los formularios de una obra. Más liviano que el hub.
- **No paginar el hub en v1** — incluso con 100 obras, una grid con search es manejable. Si crece más, agregar virtualización (`react-window`).

## Out of scope (v1)

- Tabla densa estilo Excel dentro de una obra (Lista + Kanban es suficiente).
- Reordenar manualmente las obras (drag & drop para "pinned").
- Estadísticas avanzadas por obra (gráficos individuales) — eso vive en Dashboard.
- Operaciones en bulk (aprobar/rechazar varios a la vez desde Kanban).
- Server-side aggregation con Cloud Functions.
- Filtrar por contratista dentro de una obra (puede venir en v1.1 si se pide).

## Posibles iteraciones futuras

- Vista "Pinned obras" en el hub (favoritos del usuario actual).
- Filtros adicionales: por técnico, por contratista, por rango de fechas.
- Drag & drop en Kanban para aprobar/rechazar visualmente.
- Métricas de tiempo de respuesta del SST por obra ("tiempo promedio de revisión").

---

## Resumen visual de la decisión

| Tema | Decisión |
|---|---|
| Enfoque | Hub-and-spoke (drill-down) — opción A |
| Pantalla 1 | Cards de obras con secciones automáticas, búsqueda prominente, sort inteligente |
| Pantalla 2 default | Lista de cards estilo Linear |
| Pantalla 2 toggle | Kanban por estado |
| Navegación | `Registros` (sidebar) apunta al nuevo hub. `Reportes` no cambia. |
| Routing | `/registros` y `/registros/:obraId` |
| Mobile | Responsive en ambas pantallas, Kanban con scroll horizontal en sm |
