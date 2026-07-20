export type CuratedBatchGenerationSource =
  | 'scheduled'
  | 'manual_all'
  | 'manual_member'
  | 'dev_seed'
  | 'auto_questionnaire'
  | 'auto_dating'
  | 'auto_entitlement'
  | 'auto_approval'

export type CuratedBatchNotificationStatus =
  | 'sent'
  | 'skipped_no_email'
  | 'skipped_empty'
  | 'skipped_manual'
  | 'failed'

export const CURATED_BATCH_GENERATION_SOURCES: CuratedBatchGenerationSource[] = [
  'scheduled',
  'manual_all',
  'manual_member',
  'dev_seed',
  'auto_questionnaire',
  'auto_dating',
  'auto_entitlement',
  'auto_approval',
]

export function curatedBatchGenerationSourceLabel(
  source: string | null
): string {
  switch (source) {
    case 'scheduled':
      return 'Scheduled delivery'
    case 'manual_all':
      return 'Manual (all eligible)'
    case 'manual_member':
      return 'Manual (single member)'
    case 'dev_seed':
      return 'Dev seed'
    case 'auto_questionnaire':
      return 'Auto (questionnaire completed)'
    case 'auto_dating':
      return 'Auto (Dating enabled)'
    case 'auto_entitlement':
      return 'Auto (messaging restored)'
    case 'auto_approval':
      return 'Auto (membership approved)'
    default:
      return source ?? 'Unknown'
  }
}

export function curatedBatchNotificationStatusLabel(
  status: string | null
): string {
  switch (status) {
    case 'sent':
      return 'Email sent'
    case 'skipped_no_email':
      return 'No email on file'
    case 'skipped_empty':
      return 'Skipped (empty batch)'
    case 'skipped_manual':
      return 'Skipped (manual run)'
    case 'failed':
      return 'Email failed'
    default:
      return '—'
  }
}

export function curatedBatchStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'processing':
      return 'Processing'
    case 'delivered':
      return 'Delivered'
    case 'empty':
      return 'Empty'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}
