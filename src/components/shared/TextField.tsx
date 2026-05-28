import { InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
}

export default function TextField({ label, value, onChange, error, hint, required, ...rest }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition ${
          error
            ? 'border-red-400 focus:ring-red-300'
            : 'border-gray-300 focus:ring-brand-300 focus:border-brand-400'
        }`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
