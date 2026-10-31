import { MEMBER_MESSAGING_UPGRADE_PATH } from '@/lib/member-profile-messaging'

export type CuratedIntroEmailAudience = 'requester' | 'target'

export type CuratedIntroEmailContent = {
  subject: string
  title: string
  bodyHtml: string
  text: string
  cta: { label: string; href: string }
  opensConversation: boolean
}

export function conversationPath(conversationId: string): string {
  return `/messages/${conversationId}`
}

/**
 * Each recipient is evaluated on their own paid messaging entitlement.
 * Unentitled members get a membership email with no conversation link.
 */
export function buildCuratedIntroApprovedEmail(input: {
  entitled: boolean
  audience: CuratedIntroEmailAudience
  otherMemberName: string
  conversationId: string
  origin: string
}): CuratedIntroEmailContent {
  const name = input.otherMemberName
  if (input.entitled) {
    const href = `${input.origin}${conversationPath(input.conversationId)}`
    const title =
      input.audience === 'requester'
        ? 'Your curated intro was approved'
        : 'You have a new curated intro'
    const bodyHtml =
      input.audience === 'requester'
        ? `<p>Great news — we approved your intro to <strong>${name}</strong>.</p>
     <p>The conversation is available in Messages.</p>`
        : `<p><strong>${name}</strong> requested an intro through our curated matches program, and we approved the connection.</p>
     <p>The conversation is available in Messages.</p>`
    return {
      subject:
        input.audience === 'requester'
          ? 'Curated intro approved'
          : 'New curated intro in your inbox',
      title,
      bodyHtml,
      text: `${title}\n\nThe conversation with ${name} is available in Messages.\n\nOpen conversation: ${href}`,
      cta: { label: 'Open conversation', href },
      opensConversation: true,
    }
  }

  const href = `${input.origin}${MEMBER_MESSAGING_UPGRADE_PATH}`
  const title = 'Curated intro approved'
  const bodyHtml = `<p>We approved a curated intro with <strong>${name}</strong>.</p>
     <p>Messaging requires an approved membership and verified identity. This approval does not grant messaging.</p>`
  return {
    subject: 'Curated intro approved',
    title,
    bodyHtml,
    text: `${title}\n\nWe approved a curated intro with ${name}. Messaging requires an approved membership and verified identity.\n\nView memberships: ${href}`,
    cta: { label: 'View memberships', href },
    opensConversation: false,
  }
}
