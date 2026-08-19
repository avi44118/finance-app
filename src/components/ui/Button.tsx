import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gold-500 text-black hover:bg-gold-600 active:bg-gold-700 shadow-card disabled:bg-gold-200 disabled:text-gold-500/60',
  secondary:
    'bg-surface-raised text-ink border border-border hover:bg-surface-sunken disabled:text-ink-faint',
  ghost: 'text-gold-500 hover:bg-gold-50 disabled:text-ink-faint',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900 disabled:text-red-400',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-full',
  md: 'px-5 py-2.5 text-sm rounded-full',
  lg: 'px-6 py-3.5 text-base rounded-full',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
