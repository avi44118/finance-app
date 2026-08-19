import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// Every mutating tool except log_cash_transaction and correct_transaction_category
// carries `confirm` — see api/_lib/tools/executors.ts's proposeOrApply for the
// shared propose-then-apply mechanics. import_transactions_commit is a
// confirm tool too, but its own "propose" step already recomputes the parse
// + dedupe fresh each call, so it's safe to call it again with confirm:true
// once she's said yes.
const confirmProp = {
  confirm: {
    type: 'boolean',
    description:
      'Set to true only when she has already confirmed this specific action (either by replying yes to your proposal, or because she tapped Apply on the confirmation card). Default false — propose first, apply second.',
  },
} as const

export const tools: Tool[] = [
  {
    name: 'import_transactions_commit',
    description:
      "Import transactions she pasted from the Chase app/website directly into chat (not a CSV upload — that goes through the Upload button). Extract each transaction from the pasted text as accurately as you can: date, description, and a signed amount (negative for a purchase/charge, positive for a payment/deposit). Always propose first (confirm:false) so she can see the count and total before it's saved, exactly like the CSV upload flow does.",
    input_schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
              description: { type: 'string' },
              amount_cents: { type: 'number', description: 'Signed: negative for a purchase, positive for income/a payment' },
              account_type: { type: 'string', enum: ['checking', 'credit', 'cash'], description: 'Defaults to cash if not stated' },
            },
            required: ['date', 'description', 'amount_cents'],
          },
        },
        ...confirmProp,
      },
      required: ['transactions'],
    },
  },
  {
    name: 'log_cash_transaction',
    description:
      'Log a cash or off-Chase expense/income she mentions in conversation (e.g. "paid the babysitter $200 cash today"). No confirmation needed — log it immediately, this is explicitly a no-forms, no-ceremony action.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'e.g. "babysitter", "cash tip"' },
        amount_cents: { type: 'number', description: 'Signed: negative for an expense, positive for income received in cash' },
        date: { type: 'string', description: 'ISO date, defaults to today if omitted' },
        category_id: { type: 'string', description: 'One of the known category ids, if obvious from context — otherwise omit and it will be auto-categorized' },
      },
      required: ['description', 'amount_cents'],
    },
  },
  {
    name: 'correct_transaction_category',
    description:
      "Fix a transaction's category based on what she tells you (e.g. \"that Walmart charge was actually kids, not misc\"). No confirmation needed — this is a direct correction. Also teaches the categorizer for that merchant going forward. If other transactions from the same merchant this month share the old (wrong) category, mention them in your reply and offer bulk_apply_category as a separate confirmed follow-up rather than changing them silently.",
    input_schema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string' },
        category_id: { type: 'string' },
      },
      required: ['transaction_id', 'category_id'],
    },
  },
  {
    name: 'bulk_apply_category',
    description: 'Applies a category to several transactions at once — only after correct_transaction_category revealed other same-merchant transactions and she confirmed she wants them all changed too.',
    input_schema: {
      type: 'object',
      properties: {
        transaction_ids: { type: 'array', items: { type: 'string' } },
        category_id: { type: 'string' },
        ...confirmProp,
      },
      required: ['transaction_ids', 'category_id'],
    },
  },
  {
    name: 'create_category',
    description:
      "Create a new spending category beyond the default 7, only when you've noticed a real, repeated pattern that doesn't fit any existing one. Always propose first — explain what pattern you noticed and which transactions would move into it.",
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'e.g. "Gifts", "Subscriptions"' },
        reason_summary: { type: 'string', description: 'The pattern you noticed, in one sentence' },
        ...confirmProp,
      },
      required: ['label', 'reason_summary'],
    },
  },
  {
    name: 'flag_transaction_unusual',
    description:
      "Flag a transaction as one-time/unusual so it's excluded from average and pattern calculations (it still counts toward the real free-money-remaining total — flagging never hides real money that left the account). If she told you directly it's one-time, call with confirm:true immediately — she already said so. If you noticed it yourself, propose first with confirm:false.",
    input_schema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string' },
        note: { type: 'string', description: 'Why it\'s unusual, e.g. "one-time back-to-school purchase"' },
        ...confirmProp,
      },
      required: ['transaction_id'],
    },
  },
  {
    name: 'unflag_transaction',
    description: 'Removes the one-time/unusual flag from a transaction, folding it back into normal averages.',
    input_schema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string' },
        ...confirmProp,
      },
      required: ['transaction_id'],
    },
  },
  {
    name: 'set_recurring_bill',
    description:
      "Add or update a fixed recurring bill in Settings — ONLY for spend that does not reliably show up in the Chase CSV (cash rent, a babysitter). Never add a bill that already appears in Chase (autopay utilities etc.) — it's already counted as ordinary spending and this would double-subtract it. Always propose first.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount_cents: { type: 'number' },
        due_day: { type: 'number', description: 'Day of month it\'s due, 1-31, optional' },
        ...confirmProp,
      },
      required: ['name', 'amount_cents'],
    },
  },
  {
    name: 'remove_recurring_bill',
    description: 'Removes a recurring bill by name. Always propose first.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        ...confirmProp,
      },
      required: ['name'],
    },
  },
  {
    name: 'set_rough_monthly_income',
    description: 'Sets the rough monthly income figure in Settings — a manual fallback estimate only, never the real computed number (which always comes from actual logged transactions). Always propose first.',
    input_schema: {
      type: 'object',
      properties: {
        amount_cents: { type: 'number' },
        ...confirmProp,
      },
      required: ['amount_cents'],
    },
  },
  {
    name: 'get_financial_context',
    description:
      "Pull real data to answer a financial question accurately instead of guessing — recent transactions, a specific month's totals/category breakdown, or older monthly summaries for comparison. Use this whenever she asks something that needs real numbers you don't already have in front of you (e.g. \"how does this month compare to last,\" \"how much have I spent on food\").",
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['recent_transactions', 'month_detail', 'category_totals', 'monthly_summaries_history'],
        },
        month: { type: 'string', description: 'YYYY-MM, required for month_detail and category_totals, defaults to current month' },
        category_id: { type: 'string', description: 'Filter for category_totals' },
        limit: { type: 'number', description: 'For recent_transactions or monthly_summaries_history, defaults to a sensible amount' },
      },
      required: ['scope'],
    },
  },
]
