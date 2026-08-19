import { createHash } from 'node:crypto'

// 'cash' never comes out of a Chase CSV parse — it's here because
// NormalizedRow is shared infrastructure with the paste-into-chat/manual
// ingestion path (see ingestion.ts), which can produce cash-bucket rows.
export type AccountType = 'checking' | 'credit' | 'cash'

export interface NormalizedRow {
  account_type: AccountType
  posted_date: string // YYYY-MM-DD
  description: string
  amount_cents: number // signed: negative = outflow, positive = inflow
  chase_category: string | null // credit CSV only
  chase_type: string | null // checking: ACCT_XFER/DEBIT_CARD/DEPOSIT/... — credit: Sale/Payment/Return — used by internalTransfer.ts
}

/** Minimal RFC4180-ish CSV line splitter — handles quoted fields containing commas/quotes, which Chase descriptions occasionally do. */
export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && raw[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((f) => f.trim() !== '')) rows.push(row)
  }
  return rows
}

function parseAmountToCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) throw new Error(`Could not parse amount: "${raw}"`)
  return Math.round(value * 100)
}

function parseMdyToIso(raw: string): string {
  const [m, d, y] = raw.trim().split('/')
  if (!m || !d || !y) throw new Error(`Could not parse date: "${raw}"`)
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function headerIndex(header: string[], name: string): number {
  const idx = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  if (idx === -1) throw new Error(`Expected a "${name}" column — this file doesn't look like a Chase export in the format this app expects. Column headers found: ${header.join(', ')}`)
  return idx
}

/**
 * Chase checking/savings export: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
 * Amount is already signed the way we want it (negative = debit, positive = credit) — no flip needed.
 */
export function parseChaseCheckingCsv(raw: string): NormalizedRow[] {
  const rows = parseCsvRows(raw)
  if (rows.length === 0) return []
  const header = rows[0]
  const dateIdx = headerIndex(header, 'Posting Date')
  const descIdx = headerIndex(header, 'Description')
  const amountIdx = headerIndex(header, 'Amount')
  const typeIdx = header.findIndex((h) => h.trim().toLowerCase() === 'type')

  return rows.slice(1).map((r) => ({
    account_type: 'checking' as const,
    posted_date: parseMdyToIso(r[dateIdx]),
    description: r[descIdx].trim(),
    amount_cents: parseAmountToCents(r[amountIdx]),
    chase_category: null,
    chase_type: typeIdx >= 0 ? (r[typeIdx]?.trim() || null) : null,
  }))
}

/**
 * Chase credit card export: Transaction Date,Post Date,Description,Category,Type,Amount
 * Uses Post Date (the final, settled date) not Transaction Date. ASSUMPTION,
 * unverified against a real file: Amount is signed the same way as the
 * checking export (negative = a purchase, positive = a payment/return/
 * credit) with no Type-based flip needed. If your real Chase credit export
 * turns out to use the opposite convention (positive for purchases), that's
 * a one-line fix here — negate amount_cents when row.Type === 'Sale'.
 */
export function parseChaseCreditCsv(raw: string): NormalizedRow[] {
  const rows = parseCsvRows(raw)
  if (rows.length === 0) return []
  const header = rows[0]
  const dateIdx = headerIndex(header, 'Post Date')
  const descIdx = headerIndex(header, 'Description')
  const categoryIdx = header.findIndex((h) => h.trim().toLowerCase() === 'category')
  const amountIdx = headerIndex(header, 'Amount')
  const typeIdx = header.findIndex((h) => h.trim().toLowerCase() === 'type')

  return rows.slice(1).map((r) => ({
    account_type: 'credit' as const,
    posted_date: parseMdyToIso(r[dateIdx]),
    description: r[descIdx].trim(),
    amount_cents: parseAmountToCents(r[amountIdx]),
    chase_category: categoryIdx >= 0 ? (r[categoryIdx]?.trim() || null) : null,
    chase_type: typeIdx >= 0 ? (r[typeIdx]?.trim() || null) : null,
  }))
}

export function parseChaseCsv(source: 'csv_checking' | 'csv_credit', raw: string): NormalizedRow[] {
  return source === 'csv_checking' ? parseChaseCheckingCsv(raw) : parseChaseCreditCsv(raw)
}

/** Uppercase, collapse whitespace, strip trailing store#/ref#/date fragments Chase tends to append. */
export function normalizeMerchant(description: string): string {
  return description
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/#\d+/g, '')
    .replace(/\b\d{2}\/\d{2}\b/g, '')
    .replace(/\b(REF|TRACE|CONF)[#:]?\s*\w+/gi, '')
    .trim()
}

export interface FingerprintedRow extends NormalizedRow {
  merchant_normalized: string
  fingerprint: string
}

/** Content-hash fingerprint — the whole duplicate-detection mechanism, see 0002_transactions.sql. */
export function fingerprintRow(row: NormalizedRow): FingerprintedRow {
  const merchant_normalized = normalizeMerchant(row.description)
  const raw = `${row.account_type}|${row.posted_date}|${row.amount_cents}|${merchant_normalized}`
  const fingerprint = createHash('sha256').update(raw).digest('hex')
  return { ...row, merchant_normalized, fingerprint }
}

export function fingerprintRows(rows: NormalizedRow[]): FingerprintedRow[] {
  return rows.map(fingerprintRow)
}
