import type { ReactNode } from 'react';

type AeroFieldProps = {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

export function AeroField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: AeroFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold uppercase tracking-wide text-[#0a2f5c]"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs font-semibold text-[#2b4c73]">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-[#c21414]">
          {error}
        </p>
      )}
    </div>
  );
}
