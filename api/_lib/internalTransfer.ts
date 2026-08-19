// Detects a transaction that's really money moving between the user's own
// checking and credit accounts (a credit card payment, an account
// transfer) rather than real income or spending. This is the single
// highest-leverage thing to get right in the whole app: miss one and
// free-money-remaining silently double-counts it — once as a checking
// outflow, once as a credit-side payment — every month. Kept as its own
// small, isolated function specifically so it's easy to unit-test and to
// correct in one place (transactions also carry an is_internal_transfer
// override settable via chat, for the cases this heuristic misses).
const PATTERNS: RegExp[] = [
  /PAYMENT TO CHASE CARD/i,
  /CHASE CREDIT CRD AUTOPAY/i,
  /AUTOPAY/i,
  /ONLINE PAYMENT\s*[-,]?\s*THANK YOU/i,
  /CARD PAYMENT/i,
  /TRANSFER (TO|FROM) .*CHASE/i,
  /ACCT[_ ]XFER/i,
]

export function detectInternalTransfer(description: string, chaseType?: string | null): boolean {
  if (chaseType && /^payment$/i.test(chaseType.trim())) return true
  return PATTERNS.some((re) => re.test(description))
}
