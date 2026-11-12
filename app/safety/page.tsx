import type { Metadata } from 'next'
import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Safety',
  description:
    'How to meet members safely, avoid scams, block or report a concern, and get help in an emergency.',
}

export default function SafetyPage() {
  return (
    <LegalPageShell title="Safety">
      <p>
        Meeting new people should feel considered. Use these steps when you
        plan to meet another member.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Meet safely
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Meet in a public place the first time, and stay in public if you are
          unsure.
        </li>
        <li>
          Tell a friend where you are going, who you are meeting, and when you
          plan to be home.
        </li>
        <li>
          Arrange your own transportation, and keep a way to leave on your own.
        </li>
        <li>
          Keep your home address, workplace, and daily routine private until
          you know the person.
        </li>
        <li>Leave if you feel uncomfortable. You can end a plan at any time.</li>
      </ul>

      <h2 className="text-display text-lg font-semibold">
        Never send money
      </h2>
      <p>
        Never send money or financial information to another member. That
        includes gift cards, bank details, card numbers, and login codes.
        Huntsville Social Club will not ask you to pay another member.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Spot a scam
      </h2>
      <p>Be cautious when someone:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Asks for money, a loan, a gift card, cryptocurrency, or an investment
        </li>
        <li>Pressures you to act quickly or to keep the request secret</li>
        <li>
          Avoids meeting in person, or tells a story that keeps changing
        </li>
        <li>
          Asks for financial information, a verification code, or a copy of
          your ID
        </li>
        <li>
          Claims to be from Huntsville Social Club and asks you to pay them
          directly
        </li>
      </ul>

      <h2 className="text-display text-lg font-semibold">
        Block and report
      </h2>
      <p>
        Use the Report option in any conversation, use the Block option, or
        email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        . The Block option stops that member from messaging you. We review
        reports within 2 business days. We review safety threats right away.
      </p>

      <h2 className="text-display text-lg font-semibold">
        In an emergency
      </h2>
      <p>If you are in danger or need immediate help, call 911.</p>

      <p className="text-xs">Last updated: November 11, 2026</p>
    </LegalPageShell>
  )
}
