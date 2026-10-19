// src/components/ObjetoObra.tsx
// Objeto/alcance de la obra en letra pequeña bajo su nombre. Cuando varios
// proyectos del mismo cliente comparten sitio con distinto alcance, el nombre
// solo no los distingue. Mismo criterio en el hub de registros (ObraCard) y en
// Verificación SST: texto tenue de ~11px, máx. 2 líneas con elipsis y el texto
// completo en el tooltip. Sin alcance (vacío o solo espacios) no renderiza nada
// — sin placeholder.

/** Alcance normalizado (espacios recortados y colapsados) o null si no hay. */
export function objetoDeObra(alcance: unknown): string | null {
  if (typeof alcance !== 'string') return null
  const t = alcance.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

export default function ObjetoObra({ alcance, className = '' }: { alcance?: unknown; className?: string }) {
  const texto = objetoDeObra(alcance)
  if (!texto) return null
  return (
    <p className={`text-[11px] leading-snug text-gray-500 line-clamp-2 ${className}`} title={texto}>
      {texto}
    </p>
  )
}
