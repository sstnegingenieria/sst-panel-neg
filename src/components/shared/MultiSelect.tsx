interface Option {
  value: string
  label: string
}

interface MultiSelectProps {
  label: string
  value: string[]
  options: Option[]
  onChange: (value: string[]) => void
  error?: string
}

export default function MultiSelect({ label, value, options, onChange, error }: MultiSelectProps) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className={`border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 ${
        error ? 'border-red-400' : 'border-gray-300'
      }`}>
        {options.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">No hay opciones disponibles</p>
        )}
        {options.map(opt => (
          <label
            key={opt.value}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={value.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900 select-none">
              {opt.label}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {value.length > 0 && (
        <p className="text-xs text-gray-400">{value.length} seleccionada{value.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}
