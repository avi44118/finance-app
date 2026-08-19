export function centsToDisplay(cents: number, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0
  const abs = Math.abs(cents) / 100
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (negative) return `-$${formatted}`
  return opts.sign ? `+$${formatted}` : `$${formatted}`
}
