import type { Metadata } from 'next'
import LegalPageShell from '@/components/legal/legal-page-shell'
import {
  DATA_DELETION_DESCRIPTION,
  DATA_DELETION_INCLUDE_ITEMS,
  DATA_DELETION_INCLUDE_LABEL,
  DATA_DELETION_INSTAGRAM_AUTHORIZATION,
  DATA_DELETION_INTRO,
  DATA_DELETION_QUESTIONS_BODY,
  DATA_DELETION_QUESTIONS_HEADING,
  DATA_DELETION_REQUEST_BODY,
  DATA_DELETION_REQUEST_HEADING,
  DATA_DELETION_SCOPE_HEADING,
  DATA_DELETION_SCOPE_INTRO,
  DATA_DELETION_SCOPE_ITEMS,
  DATA_DELETION_SUBJECT,
  DATA_DELETION_SUBJECT_LABEL,
  DATA_DELETION_TIMING_BODY,
  DATA_DELETION_TIMING_HEADING,
  DATA_DELETION_TITLE,
  DATA_DELETION_VERIFY,
} from '@/lib/data-deletion'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: DATA_DELETION_TITLE,
  description: DATA_DELETION_DESCRIPTION,
}

export default function DataDeletionPage() {
  return (
    <LegalPageShell title={DATA_DELETION_TITLE}>
      <p>{DATA_DELETION_INTRO}</p>

      <h2 className="text-display text-lg font-semibold">
        {DATA_DELETION_REQUEST_HEADING}
      </h2>
      <p>
        {DATA_DELETION_REQUEST_BODY}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <p>{DATA_DELETION_SUBJECT_LABEL}</p>
      <p>{DATA_DELETION_SUBJECT}</p>
      <p>{DATA_DELETION_INCLUDE_LABEL}</p>
      <ul className="list-disc space-y-2 pl-5">
        {DATA_DELETION_INCLUDE_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{DATA_DELETION_VERIFY}</p>

      <h2 className="text-display text-lg font-semibold">
        {DATA_DELETION_SCOPE_HEADING}
      </h2>
      <p>{DATA_DELETION_SCOPE_INTRO}</p>
      <ul className="list-disc space-y-2 pl-5">
        {DATA_DELETION_SCOPE_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{DATA_DELETION_INSTAGRAM_AUTHORIZATION}</p>

      <h2 className="text-display text-lg font-semibold">
        {DATA_DELETION_TIMING_HEADING}
      </h2>
      <p>{DATA_DELETION_TIMING_BODY}</p>

      <h2 className="text-display text-lg font-semibold">
        {DATA_DELETION_QUESTIONS_HEADING}
      </h2>
      <p>
        {DATA_DELETION_QUESTIONS_BODY}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </LegalPageShell>
  )
}
