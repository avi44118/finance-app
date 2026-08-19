import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withAuth } from './_lib/handler.js'
import { getProfileId } from './_lib/supabase.js'
import { parseChaseCsv } from './_lib/csvParser.js'
import { prepareRows, computeDedupeDelta, insertTransactions, summarizeImport } from './_lib/ingestion.js'
import { createImportBatch, getImportBatch, markImportBatch } from './_lib/repositories/importBatches.js'

// CSV upload flow only — paste-into-chat ingestion goes through the AI's
// import_transactions_commit tool instead (api/_lib/tools), since there the
// model does the row extraction from free text rather than this file's
// strict column parser. Both funnel into the same prepareRows/
// computeDedupeDelta/insertTransactions pipeline in _lib/ingestion.ts.
async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined
  const profileId = await getProfileId()

  if (action === 'stage') {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'method not allowed' })
    const { source, raw } = (req.body ?? {}) as { source?: 'csv_checking' | 'csv_credit'; raw?: string }
    if (source !== 'csv_checking' && source !== 'csv_credit') return void res.status(400).json({ error: 'source must be csv_checking or csv_credit' })
    if (!raw || typeof raw !== 'string') return void res.status(400).json({ error: 'raw CSV text is required' })

    let normalizedRows
    try {
      normalizedRows = parseChaseCsv(source, raw)
    } catch (err) {
      return void res.status(400).json({ error: err instanceof Error ? err.message : 'Could not parse this CSV' })
    }
    if (normalizedRows.length === 0) return void res.status(400).json({ error: 'No transaction rows found in this file' })

    const prepared = await prepareRows(profileId, normalizedRows)
    const { toInsert, duplicateCount } = await computeDedupeDelta(profileId, prepared)
    const totalAmountCents = toInsert.reduce((sum, r) => sum + r.amount_cents, 0)
    const summary = summarizeImport(source === 'csv_checking' ? 'your checking export' : 'your credit card export', toInsert, duplicateCount)

    const batch = await createImportBatch({
      profileId,
      source,
      rawInput: raw,
      parsedCount: toInsert.length,
      totalAmountCents,
      summary,
    })

    res.status(200).json({
      import_batch_id: batch.id,
      summary,
      preview: toInsert.slice(0, 20).map((r) => ({
        posted_date: r.posted_date,
        description: r.description,
        amount_cents: r.amount_cents,
        category_id: r.category_id,
        needs_review: r.needs_review,
      })),
    })
    return
  }

  if (action === 'commit') {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'method not allowed' })
    const { import_batch_id } = (req.body ?? {}) as { import_batch_id?: string }
    if (!import_batch_id) return void res.status(400).json({ error: 'import_batch_id is required' })

    const batch = await getImportBatch(profileId, import_batch_id)
    if (!batch) return void res.status(404).json({ error: 'Import batch not found' })
    if (batch.status !== 'pending_confirmation') return void res.status(409).json({ error: `This import was already ${batch.status}` })

    const normalizedRows = parseChaseCsv(batch.source as 'csv_checking' | 'csv_credit', batch.raw_input)
    const prepared = await prepareRows(profileId, normalizedRows)
    const { toInsert } = await computeDedupeDelta(profileId, prepared)
    const insertedCount = await insertTransactions(profileId, toInsert, 'csv', batch.id)
    await markImportBatch(profileId, batch.id, 'committed')

    res.status(200).json({ inserted_count: insertedCount })
    return
  }

  if (action === 'discard') {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'method not allowed' })
    const { import_batch_id } = (req.body ?? {}) as { import_batch_id?: string }
    if (!import_batch_id) return void res.status(400).json({ error: 'import_batch_id is required' })
    const batch = await getImportBatch(profileId, import_batch_id)
    if (!batch) return void res.status(404).json({ error: 'Import batch not found' })
    await markImportBatch(profileId, batch.id, 'discarded')
    res.status(200).json({ ok: true })
    return
  }

  res.status(400).json({ error: 'unknown action' })
}

export default withAuth(handler)
