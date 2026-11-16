import type { Metadata } from 'next'
import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Law Enforcement and Legal Requests',
  description:
    'How Huntsville Social Club reports suspected illegal activity and how law enforcement can send a legal request.',
}

export default function LawEnforcementPage() {
  return (
    <LegalPageShell title="Law Enforcement and Legal Requests">
      <p>
        We cooperate with law enforcement and report suspected illegal
        activity.
      </p>

      <h2 className="text-display text-lg font-semibold">
        What we report and to whom
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Child sexual exploitation is reported to the NCMEC CyberTipline.
        </li>
        <li>
          Suspected human or sex trafficking is reported to the National Human
          Trafficking Hotline and the FBI.
        </li>
        <li>
          Threats of violence and other crimes are reported to local police
          (Huntsville Police Department, or 911 in an emergency).
        </li>
        <li>
          Fraud is reported to the FBI Internet Crime Complaint Center (IC3).
        </li>
      </ul>

      <h2 className="text-display text-lg font-semibold">
        Records
      </h2>
      <p>
        We preserve relevant account records when we find or receive a report
        of suspected illegal activity.
      </p>

      <h2 className="text-display text-lg font-semibold">
        How law enforcement can contact us
      </h2>
      <p>
        Legal requests (subpoenas, court orders, emergency disclosure requests)
        go to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        with the subject &quot;Law Enforcement Request&quot;. We respond to
        valid legal process, and review emergency requests involving risk of
        death or serious injury right away.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Members in danger
      </h2>
      <p>Members in danger should call 911.</p>

      <p className="text-xs">Last updated: November 16, 2026</p>
    </LegalPageShell>
  )
}
