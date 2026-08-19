import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAICoach } from '@/hooks/useAICoach'

const TOOL_LABELS: Record<string, string> = {
  import_transactions_commit: 'Save these transactions?',
  bulk_apply_category: 'Apply this category to all of them?',
  create_category: 'Create this category?',
  flag_transaction_unusual: 'Flag this as one-time?',
  unflag_transaction: 'Remove the one-time flag?',
  set_recurring_bill: 'Save this bill?',
  remove_recurring_bill: 'Remove this bill?',
  set_rough_monthly_income: 'Update your rough income?',
}

export function ConfirmationCard() {
  const { pendingAction, confirmPendingAction, cancelPendingAction } = useAICoach()

  return (
    <Modal open={!!pendingAction} onClose={cancelPendingAction}>
      {pendingAction && (
        <Card className="shadow-raised">
          <p className="mb-1 text-sm font-semibold text-ink-muted">{TOOL_LABELS[pendingAction.toolName] ?? 'Confirm this?'}</p>
          <p className="mb-5 text-ink">{pendingAction.summary}</p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={confirmPendingAction} className="flex-1">
              Apply
            </Button>
            <Button variant="secondary" onClick={cancelPendingAction} className="flex-1">
              Dismiss
            </Button>
          </div>
        </Card>
      )}
    </Modal>
  )
}
