interface Option {
  value: string
  label: string
}

interface SelectFieldProps {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
}

export default function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  required,
  disabled,
  placeholder,
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition bg-white ${
          error
            ? 'border-red-400 focus:ring-red-300'
            : 'border-gray-300 focus:ring-blue-300 focus:border-blue-400'
        } ${disabled ? 'bg-gray-50 text-gray-500' : ''}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
