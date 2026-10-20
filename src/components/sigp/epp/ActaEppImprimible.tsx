// Vista del acta de entrega de EPP lista para imprimir (window.print + @media print vía
// las variantes `print:` de Tailwind): encabezado oficial SST-FT-AEP-18, datos del
// colaborador, tabla de EPP, cláusulas y firmas. Es la MISMA vista en pantalla y en papel.
import EncabezadoIso from '../shared/EncabezadoIso'
import { ACTA_ENTREGA_EPP } from '../../../utils/sigp/isoControl'
import { CLAUSULAS_EPP, CLAUSULAS_PENDIENTES, ENCABEZADO_CLAUSULAS_EPP, INTRO_EPP } from '../../../utils/sigp/eppClausulas'
import type { ActaEpp } from '../../../types/sigp/epp'

const fFecha = (ts: { toDate?: () => Date } | undefined | null) =>
  ts && typeof ts.toDate === 'function'
    ? ts.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

export default function ActaEppImprimible({ acta }: { acta: ActaEpp }) {
  const c = acta.colaborador
  const anulada = acta.estado === 'anulada'
  return (
    <article className="bg-white border border-gray-300 p-6 text-black print:border-0 print:p-0 flex flex-col gap-4" data-testid="acta-epp">
      <EncabezadoIso control={ACTA_ENTREGA_EPP} />

      {anulada && acta.anulacion && (
        <div className="border-2 border-gray-500 text-gray-700 p-3 text-sm">
          <p className="font-bold">ACTA ANULADA · {fFecha(acta.anulacion.fecha)}</p>
          <p className="whitespace-pre-wrap">{acta.anulacion.motivo}</p>
          <p className="text-xs">Por {acta.anulacion.por_nombre ?? acta.anulacion.por}. El contenido firmado se conserva como evidencia; la corrección es un acta nueva.</p>
        </div>
      )}

      {CLAUSULAS_PENDIENTES && (
        <p className="print:hidden text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          El texto legal de la introducción y de las cláusulas aún no está cargado: esta vista muestra marcadores provisionales y no se puede firmar.
        </p>
      )}

      <p className="text-sm text-justify whitespace-pre-wrap">{INTRO_EPP}</p>

      <table className="w-full text-sm border border-black border-collapse">
        <tbody>
          <tr>
            <th className="border border-black px-2 py-1 text-left w-1/5 bg-gray-50 print:bg-transparent">Nombre</th>
            <td className="border border-black px-2 py-1">{c.nombre}</td>
            <th className="border border-black px-2 py-1 text-left w-1/6 bg-gray-50 print:bg-transparent">Cédula</th>
            <td className="border border-black px-2 py-1">{c.cedula}</td>
          </tr>
          <tr>
            <th className="border border-black px-2 py-1 text-left bg-gray-50 print:bg-transparent">Cargo</th>
            <td className="border border-black px-2 py-1">{c.cargo || '—'}</td>
            <th className="border border-black px-2 py-1 text-left bg-gray-50 print:bg-transparent">Fecha de entrega</th>
            <td className="border border-black px-2 py-1">{fFecha(acta.fecha)}</td>
          </tr>
          {c.fuente === 'contratista' && (
            <tr>
              <th className="border border-black px-2 py-1 text-left bg-gray-50 print:bg-transparent">Empresa contratista</th>
              <td className="border border-black px-2 py-1" colSpan={3}>{c.contratista_nombre ?? '—'}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="w-full text-sm border border-black border-collapse">
        <thead>
          <tr className="bg-gray-50 print:bg-transparent">
            <th className="border border-black px-2 py-1 text-left">Elemento</th>
            <th className="border border-black px-2 py-1 w-20">Cantidad</th>
            <th className="border border-black px-2 py-1 w-24">Unidad</th>
            <th className="border border-black px-2 py-1 text-left">Especificación</th>
          </tr>
        </thead>
        <tbody>
          {acta.items.map((it, i) => (
            <tr key={i}>
              <td className="border border-black px-2 py-1">{it.nombre}</td>
              <td className="border border-black px-2 py-1 text-center">{it.cantidad}</td>
              <td className="border border-black px-2 py-1 text-center">{it.unidad}</td>
              <td className="border border-black px-2 py-1">{it.especificacion}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-sm font-semibold">{ENCABEZADO_CLAUSULAS_EPP}</p>
      <ol className="list-decimal pl-5 text-sm text-justify flex flex-col gap-2 -mt-2">
        {CLAUSULAS_EPP.map((cl, i) => <li key={i} className="whitespace-pre-wrap">{cl}</li>)}
      </ol>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 text-sm" style={{ breakInside: 'avoid' }}>
        {acta.firmantes_empresa.map((f, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-16 w-full border-b border-black" />
            <p className="font-semibold mt-1 text-center">{f.nombre}</p>
            <p className="text-xs text-center">{f.cargo}</p>
          </div>
        ))}
        <div className="flex flex-col items-center">
          <div className="h-16 w-full border-b border-black flex items-end justify-center">
            {acta.firma_colaborador && (
              <img src={acta.firma_colaborador} alt={`Firma de ${c.nombre}`} className="max-h-16 object-contain" />
            )}
          </div>
          <p className="font-semibold mt-1 text-center">{c.nombre}</p>
          <p className="text-xs text-center">C.C. {c.cedula} · Recibe</p>
        </div>
      </div>

      {acta.firma_hash && (
        <p className="text-[10px] text-gray-500 break-all">
          Firmada el {fFecha(acta.fecha_firma)} · integridad SHA-256: {acta.firma_hash}
        </p>
      )}
    </article>
  )
}
