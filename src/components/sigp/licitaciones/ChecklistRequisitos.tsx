/**
 * El CHECKLIST DE REQUISITOS del pliego (A.2b).
 *
 * Esta pantalla es la que vuelve OPERATIVO el gate de presentación: hasta el
 * A.2a `LicitacionDetalle` pasaba una lista vacía y presentar quedaba
 * bloqueado con `SIN_REQUISITOS` — un botón muerto deliberado. Acá se
 * capturan los requisitos de verdad.
 *
 * ── TRES ESTADOS, Y EL DEL MEDIO ES EL QUE IMPORTA ──────────────────────────
 *
 *  1. SIN PLANTILLA · con permiso de cargarla   → botón que la escribe.
 *  2. SIN PLANTILLA · sin permiso                → aviso que dice QUIÉN la
 *     carga, y el checklist sigue usable a mano.
 *  3. CON requisitos                             → la lista, y el gate se
 *     libera cuando no quedan pendientes ni incumplidos.
 *
 * El estado 2 existe porque `editaPlantillaRequisitos()` es un SUBCONJUNTO
 * ESTRICTO de `gestionaLicitaciones()`: Karen (`operacion_comercial`) y
 * `gerencia_administrativa` trabajan el pliego pero NO definen la plantilla —
 * quien trabaja contra una lista no la define. Ofrecerles el botón sería un
 * 403 garantizado, es decir otro botón muerto en el sub-bloque que vino a
 * quitar el anterior. La plantilla es un ATAJO, no un requisito: el checklist
 * se puede capturar a mano completo.
 */
import { useMemo, useState } from 'react'
import type { RequisitoConId } from '../../../hooks/sigp/useRequisitos'
import { useRequisitos } from '../../../hooks/sigp/useRequisitos'
import {
  CATEGORIAS_REQUISITO, TIPOS_EVIDENCIA, CATEGORIA_REQUISITO_LABEL,
  ESTADO_REQUISITO_LABEL, REF_PERSONA_TIPOS, REF_PERSONA_TIPO_LABEL,
  puedeMarcarseRequisito,
} from '../../../types/sigp/requisito'
import type {
  CategoriaRequisito, TipoEvidencia, EstadoRequisito, DatosVeredicto,
} from '../../../types/sigp/requisito'
import { resumenCumplimiento, bloqueoPresentacion } from '../../../utils/sigp/cumplimiento'
import { conteoPorCapitulo, itemsPlantillaVigente } from '../../../types/sigp/plantillaRequisitos'
import { editaPlantillaLicitacionesUI } from '../../../types/sigp/permisos'

const COLOR_ESTADO: Record<EstadoRequisito, string> = {
  pendiente: 'bg-amber-100 text-amber-900 border-amber-300',
  cumple: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  no_cumple: 'bg-red-100 text-red-900 border-red-300',
  no_aplica: 'bg-gray-100 text-gray-700 border-gray-300',
}

interface Props {
  rol: string | undefined
  /** `false` en licitaciones cerradas: la lista se ve, no se toca. */
  puedeGestionar: boolean
  /**
   * El hook YA RESUELTO, inyectado por la página.
   *
   * ⚠ NO se llama `useRequisitos` acá dentro. En la primera versión sí, y el
   * E2E destapó la consecuencia: la página tenía su instancia para el gate y
   * este componente otra, así que al marcar el último requisito el checklist
   * decía «completo» mientras la sección de acciones seguía mostrando el
   * bloqueo. Dos instancias del mismo hook son dos fuentes de verdad para el
   * mismo dato — exactamente lo que el comentario del gate promete que no
   * puede pasar. Una sola instancia, arriba, y baja por props.
   */
  api: ReturnType<typeof useRequisitos>
}

export default function ChecklistRequisitos({ rol, puedeGestionar, api }: Props) {
  const {
    requisitos, plantilla, cargando, error,
    crear, cargarDesdePlantilla, sembrarPlantilla, marcar, setActivo,
  } = api

  const [verInactivos, setVerInactivos] = useState(false)
  const [abrirAlta, setAbrirAlta] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const activos = useMemo(() => requisitos.filter(r => r.activo), [requisitos])
  const inactivos = useMemo(() => requisitos.filter(r => !r.activo), [requisitos])
  const resumen = useMemo(() => resumenCumplimiento(activos), [activos])
  const bloqueo = useMemo(() => bloqueoPresentacion(activos), [activos])

  const puedeSembrar = editaPlantillaLicitacionesUI(rol)
  const itemsPlantilla = plantilla ? itemsPlantillaVigente(plantilla) : []

  const conAviso = async (fn: () => Promise<unknown>, msg?: string) => {
    setTrabajando(true)
    setAviso(null)
    try {
      await fn()
      if (msg) setAviso(msg)
    } catch {
      setAviso('No se pudo guardar. Revisa tu conexión o tus permisos.')
    } finally {
      setTrabajando(false)
    }
  }

  if (cargando && requisitos.length === 0) {
    return <p className="text-sm text-gray-500">Cargando el checklist…</p>
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4" data-test="checklist-requisitos">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-gray-900">Checklist del pliego</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Lo que la entidad exige, y si lo tenemos. El veredicto de cada renglón
            queda firmado por quien lo verifica.
          </p>
        </div>
        {activos.length > 0 && (
          <div className="text-xs text-gray-700" data-test="resumen-checklist">
            <span className="font-semibold">{resumen.total}</span> requisitos ·{' '}
            <span className="text-amber-800">{resumen.pendientes} sin verificar</span> ·{' '}
            <span className="text-emerald-800">{resumen.cumplen} cumplen</span>
            {resumen.no_cumplen > 0 && (
              <> · <span className="text-red-800">{resumen.no_cumplen} no cumplen</span></>
            )}
            {resumen.no_aplican > 0 && <> · {resumen.no_aplican} no aplican</>}
          </div>
        )}
      </header>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {aviso && <p className="mt-3 text-sm text-gray-700" data-test="aviso-checklist">{aviso}</p>}

      {/* ── El gate, dicho acá también ── */}
      {activos.length > 0 && (
        <div
          className={`mt-3 rounded border px-3 py-2 text-xs ${
            bloqueo
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
          data-test="gate-checklist"
        >
          {bloqueo
            ? <>Presentar sigue bloqueado: {bloqueo.mensaje}.</>
            : <>Checklist completo — presentar ya no está bloqueado por requisitos.</>}
        </div>
      )}

      {/* ══ ESTADO 1 y 2: sin plantilla cargada ══ */}
      {!plantilla && (
        <div
          className="mt-4 rounded border border-gray-300 bg-gray-50 px-3 py-3 text-xs text-gray-700"
          data-test={puedeSembrar ? 'sin-plantilla-con-boton' : 'sin-plantilla-sin-boton'}
        >
          <p className="font-semibold text-gray-900">
            La plantilla del pliego típico no está cargada todavía.
          </p>
          {puedeSembrar ? (
            <>
              <p className="mt-1">
                Es la lista de los requisitos que aparecen en la mayoría de los procesos
                (22 renglones: jurídicos, técnicos y financieros). Cargarla la deja
                disponible para todas las licitaciones y queda registrada a tu nombre.
                No trae veredictos: es una lista de preguntas.
              </p>
              <button
                type="button"
                disabled={trabajando || !puedeGestionar}
                onClick={() => conAviso(sembrarPlantilla, 'Plantilla cargada.')}
                className="mt-2 px-3 py-1.5 rounded bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
                data-test="btn-cargar-plantilla"
              >
                Cargar plantilla del pliego típico
              </button>
            </>
          ) : (
            <p className="mt-1" data-test="texto-sin-permiso-plantilla">
              La carga Gerencia General o la Dirección de Proyectos. Mientras tanto
              puedes capturar los requisitos de este pliego a mano: el checklist no
              depende de la plantilla — la plantilla solo evita empezar de cero.
            </p>
          )}
        </div>
      )}

      {/* ── Atajo: traer la plantilla a ESTA licitación ── */}
      {plantilla && activos.length === 0 && (
        <div className="mt-4 rounded border border-brand-200 bg-brand-50/50 px-3 py-3 text-xs text-gray-800">
          <p className="font-semibold text-gray-900">
            Este pliego todavía no tiene requisitos capturados.
          </p>
          <p className="mt-1">
            Puedes traer los {itemsPlantilla.length} renglones de la plantilla
            ({Object.entries(conteoPorCapitulo(itemsPlantilla))
              .map(([c, n]) => `${n} ${c}`).join(' · ')}) y ajustar lo que este
            proceso pida distinto. Todos entran <strong>sin verificar</strong>.
          </p>
          <div className="mt-2 flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={trabajando || !puedeGestionar}
              onClick={() => conAviso(
                async () => { const n = await cargarDesdePlantilla(); setAviso(`${n} requisitos capturados.`) })}
              className="px-3 py-1.5 rounded bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
              data-test="btn-traer-plantilla"
            >
              Traer los {itemsPlantilla.length} renglones
            </button>
            <button
              type="button"
              disabled={trabajando || !puedeGestionar}
              onClick={() => setAbrirAlta(true)}
              className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-xs hover:bg-white disabled:opacity-50"
            >
              ＋ Capturar a mano
            </button>
          </div>
        </div>
      )}

      {/* ══ ESTADO 3: la lista ══ */}
      {activos.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100" data-test="lista-requisitos">
          {activos.map(r => (
            <FilaRequisito
              key={r.id}
              r={r}
              puedeGestionar={puedeGestionar && !trabajando}
              onMarcar={(destino, datos) => conAviso(async () => {
                const ok = await marcar(r, destino, datos)
                if (!ok) setAviso('Ese movimiento no cumple las condiciones del requisito.')
              })}
              onDesactivar={() => conAviso(
                () => setActivo(r, false), 'Requisito marcado como mal creado.')}
            />
          ))}
        </ul>
      )}

      {/* La vía de captura a mano está SIEMPRE que se pueda gestionar.
          Antes estaba condicionada a tener plantilla o requisitos, y el E2E
          destapó la consecuencia: a Karen —que no puede cargar la plantilla—
          el aviso le decía «puedes capturar los requisitos a mano» y no había
          ningún botón para hacerlo. Un texto que promete lo que la pantalla no
          ofrece es peor que no decir nada. */}
      {puedeGestionar && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setAbrirAlta(v => !v)}
            className="text-xs text-brand-700 hover:underline"
            data-test="btn-abrir-alta"
          >
            {abrirAlta ? 'Cancelar' : '＋ Agregar un requisito de este pliego'}
          </button>
          {inactivos.length > 0 && (
            <button
              type="button"
              onClick={() => setVerInactivos(v => !v)}
              className="text-xs text-gray-500 hover:underline"
              data-test="btn-ver-inactivos"
            >
              {verInactivos ? 'Ocultar' : `Ver ${inactivos.length} mal creado(s)`}
            </button>
          )}
        </div>
      )}

      {abrirAlta && puedeGestionar && (
        <FormAlta
          trabajando={trabajando}
          onCancelar={() => setAbrirAlta(false)}
          onCrear={async d => {
            await conAviso(async () => {
              const ok = await crear(d)
              if (ok) { setAbrirAlta(false); setAviso('Requisito agregado, sin verificar.') }
              else setAviso('Faltan datos: la descripción es obligatoria, y un indicador necesita operador y valor exigido.')
            })
          }}
        />
      )}

      {verInactivos && inactivos.length > 0 && (
        <div className="mt-4 rounded border border-dashed border-gray-300 p-3" data-test="lista-inactivos">
          <p className="text-xs text-gray-500">
            Requisitos marcados como <strong>mal creados</strong>. No cuentan para el
            gate. No se borran: queda el registro de que estuvieron.
          </p>
          <ul className="mt-2 divide-y divide-gray-100">
            {inactivos.map(r => (
              <li key={r.id} className="py-2 flex items-start justify-between gap-3">
                <span className="text-xs text-gray-500 line-through">{r.descripcion}</span>
                {puedeGestionar && (
                  <button
                    type="button"
                    disabled={trabajando}
                    onClick={() => conAviso(() => setActivo(r, true), 'Requisito restituido.')}
                    className="text-xs text-brand-700 hover:underline disabled:opacity-50"
                  >
                    Restituir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function FilaRequisito({ r, puedeGestionar, onMarcar, onDesactivar }: {
  r: RequisitoConId
  puedeGestionar: boolean
  onMarcar: (destino: EstadoRequisito, datos?: DatosVeredicto) => void
  onDesactivar: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState(r.persona?.nombre ?? '')
  const [cargo, setCargo] = useState(r.persona?.cargo ?? '')
  const [refTipo, setRefTipo] = useState(r.persona?.ref_tipo ?? 'adjunto_licitacion')
  const [refId, setRefId] = useState(r.persona?.ref_id ?? '')
  const [valorNeg, setValorNeg] = useState(r.valor_neg === null ? '' : String(r.valor_neg))
  const [observacion, setObservacion] = useState(r.observacion)

  const exigePersona = r.categoria === 'personal'
  const exigeIndicador = r.tipo_evidencia === 'indicador'

  const datos = (): DatosVeredicto => ({
    ...(exigePersona
      ? { persona: { nombre, cargo, ref_tipo: refTipo, ref_id: refId } }
      : {}),
    ...(exigeIndicador
      ? { valor_neg: valorNeg.trim() === '' ? null : Number(valorNeg.replace(',', '.')) }
      : {}),
    observacion,
  })

  const puedeCumplir = puedeMarcarseRequisito(r, 'cumple', datos())

  return (
    <li className="py-3" data-test="fila-requisito">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-900">{r.descripcion}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {CATEGORIA_REQUISITO_LABEL[r.categoria]}
            {r.fuente_pliego && <> · numeral {r.fuente_pliego}</>}
            {r.verificado_por && <> · verificado por {r.verificado_por}</>}
          </p>

          {/* El cabo honesto de A.1b: los requisitos de documento de empresa
              no tienen a qué apuntar todavía. Se dice, no se disimula. */}
          {r.tipo_evidencia === 'documento_empresa' && (
            <p className="text-xs text-gray-500 mt-1 italic" data-test="nota-documento-empresa">
              El registro de documentos de la empresa lo lleva otro frente y todavía
              no está publicado, así que por ahora esto se verifica contra el archivo
              que se adjunte a esta licitación. Es transitorio y está previsto.
            </p>
          )}
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded border ${COLOR_ESTADO[r.estado]}`}>
          {ESTADO_REQUISITO_LABEL[r.estado]}
        </span>
      </div>

      {puedeGestionar && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAbierto(v => !v)}
            className="text-xs text-brand-700 hover:underline"
            data-test="btn-verificar"
          >
            {abierto ? 'Cerrar' : 'Verificar'}
          </button>
        </div>
      )}

      {abierto && puedeGestionar && (
        <div className="mt-2 rounded bg-gray-50 border border-gray-200 p-3 space-y-2">
          {exigePersona && (
            <div className="grid gap-2 sm:grid-cols-2" data-test="campos-persona">
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la persona"
                className="rounded border border-gray-300 px-2 py-1 text-xs" />
              <input value={cargo} onChange={e => setCargo(e.target.value)}
                placeholder="Cargo propuesto"
                className="rounded border border-gray-300 px-2 py-1 text-xs" />
              <select value={refTipo} onChange={e => setRefTipo(e.target.value as typeof refTipo)}
                className="rounded border border-gray-300 px-2 py-1 text-xs">
                {REF_PERSONA_TIPOS.map(t => (
                  <option key={t} value={t}>{REF_PERSONA_TIPO_LABEL[t]}</option>
                ))}
              </select>
              <input value={refId} onChange={e => setRefId(e.target.value)}
                placeholder="Id del registro al que apunta"
                className="rounded border border-gray-300 px-2 py-1 text-xs" />
              <p className="sm:col-span-2 text-xs text-gray-500">
                Se guarda la referencia al registro que ya custodia los datos de la
                persona, no una copia de ellos.
              </p>
            </div>
          )}

          {exigeIndicador && (
            <div data-test="campo-indicador">
              <input value={valorNeg} onChange={e => setValorNeg(e.target.value)}
                placeholder={`Valor de NEG para ${r.indicador ?? 'el indicador'}`}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
              <p className="text-xs text-gray-500 mt-1">
                El número sale del RUP. Sin él no se puede dar por cumplido.
              </p>
            </div>
          )}

          <textarea value={observacion} onChange={e => setObservacion(e.target.value)}
            rows={2} placeholder="Observación (opcional)"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />

          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={!puedeCumplir}
              onClick={() => onMarcar('cumple', datos())}
              title={puedeCumplir ? undefined
                : exigePersona
                  ? 'Un requisito de personal necesita nombre y la referencia al registro de la persona.'
                  : 'Un indicador necesita el valor de NEG para poder evaluarse.'}
              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"
              data-test="btn-cumple">
              Cumple
            </button>
            <button type="button" onClick={() => onMarcar('no_cumple', datos())}
              className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
              data-test="btn-no-cumple">
              No cumple
            </button>
            <button type="button" onClick={() => onMarcar('no_aplica', datos())}
              title="Es un requisito real del pliego, pero no nos aplica. Cuenta como resuelto y queda firmado."
              className="px-2.5 py-1 rounded border border-gray-400 text-gray-700 text-xs hover:bg-white"
              data-test="btn-no-aplica">
              No aplica
            </button>
            {r.estado !== 'pendiente' && (
              <button type="button" onClick={() => onMarcar('pendiente')}
                className="px-2.5 py-1 rounded border border-gray-300 text-gray-500 text-xs hover:bg-white"
                data-test="btn-pendiente">
                Volver a sin verificar
              </button>
            )}
            <button type="button" onClick={onDesactivar}
              title="El requisito estaba mal creado (duplicado, typo, del pliego equivocado). No es lo mismo que «no aplica»."
              className="ml-auto px-2.5 py-1 rounded border border-gray-300 text-gray-500 text-xs hover:bg-white"
              data-test="btn-mal-creado">
              Estaba mal creado
            </button>
          </div>
          {!puedeCumplir && (
            <p className="text-xs text-amber-800" data-test="motivo-no-cumple-posible">
              {exigePersona
                ? 'Para dar por cumplido este requisito hace falta el nombre y la referencia al registro de la persona.'
                : 'Para dar por cumplido este requisito hace falta el valor de NEG del indicador.'}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function FormAlta({ trabajando, onCancelar, onCrear }: {
  trabajando: boolean
  onCancelar: () => void
  onCrear: (d: {
    categoria: CategoriaRequisito; descripcion: string; tipo_evidencia: TipoEvidencia
    fuente_pliego?: string | null
  }) => void
}) {
  const [categoria, setCategoria] = useState<CategoriaRequisito>('juridico')
  const [tipo, setTipo] = useState<TipoEvidencia>('documento_empresa')
  const [descripcion, setDescripcion] = useState('')
  const [fuente, setFuente] = useState('')

  return (
    <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 space-y-2" data-test="form-alta-requisito">
      <textarea
        value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
        placeholder="Texto del requisito, como lo dice el pliego"
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        data-test="input-descripcion"
      />
      <p className="text-xs text-gray-500">
        Conviene copiarlo literal: lo que se discute con la entidad es su texto, no
        nuestro resumen.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaRequisito)}
          className="rounded border border-gray-300 px-2 py-1 text-xs" data-test="select-categoria">
          {CATEGORIAS_REQUISITO.map(c => (
            <option key={c} value={c}>{CATEGORIA_REQUISITO_LABEL[c]}</option>
          ))}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value as TipoEvidencia)}
          className="rounded border border-gray-300 px-2 py-1 text-xs" data-test="select-tipo">
          {TIPOS_EVIDENCIA.filter(t => t !== 'indicador').map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input value={fuente} onChange={e => setFuente(e.target.value)}
          placeholder="Numeral del pliego"
          className="rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={trabajando}
          onClick={() => onCrear({
            categoria, descripcion, tipo_evidencia: tipo,
            fuente_pliego: fuente.trim() === '' ? null : fuente.trim(),
          })}
          className="px-3 py-1.5 rounded bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
          data-test="btn-guardar-requisito">
          Agregar
        </button>
        <button type="button" onClick={onCancelar}
          className="px-3 py-1.5 rounded border border-gray-400 text-gray-700 text-xs hover:bg-white">
          Cancelar
        </button>
      </div>
    </div>
  )
}
