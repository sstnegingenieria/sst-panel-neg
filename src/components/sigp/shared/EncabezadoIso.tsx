import type { ControlDocumentalIso } from '../../../utils/sigp/isoControl'

/**
 * Cuadro de control documental ISO del SGI, en pantalla: réplica en HTML del
 * cuadro de tres columnas que los generadores PDF dibujan en la página 1
 * (izquierda: área/código/versión/modificado · centro: razón social, área y
 * nombre del formato · derecha: logo). Todo en negro, sin acentos de color.
 * Los PDF NO usan este componente — siguen dibujando con pdf-lib.
 */
export default function EncabezadoIso({ control }: { control: ControlDocumentalIso }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[150px_1fr_150px] border border-black text-black bg-white"
      role="group"
      aria-label={`Control documental ${control.codigo}`}
    >
      <dl className="p-3 text-[11px] leading-5 border-b sm:border-b-0 sm:border-r border-black">
        <div><dt className="inline font-semibold">Proceso: </dt><dd className="inline">{control.area}</dd></div>
        <div><dt className="inline font-semibold">Código: </dt><dd className="inline">{control.codigo}</dd></div>
        <div><dt className="inline font-semibold">Versión: </dt><dd className="inline">{control.version}</dd></div>
        <div><dt className="inline font-semibold">Modificado: </dt><dd className="inline">{control.modificado}</dd></div>
      </dl>
      <div className="p-3 text-center flex flex-col items-center justify-center gap-0.5 border-b sm:border-b-0 sm:border-r border-black">
        <p className="text-xs font-bold">NEG INGENIERÍA S.A.S., BIC</p>
        <p className="text-[11px]">NIT. 900.975.870-1</p>
        <p className="text-[11px] font-semibold">{control.area}</p>
        <p className="text-sm font-bold">{control.nombre}</p>
      </div>
      <div className="p-3 flex items-center justify-center">
        <img src="/logo-neg-full.png" alt="NEG Ingeniería" className="max-h-16 object-contain" />
      </div>
    </div>
  )
}
