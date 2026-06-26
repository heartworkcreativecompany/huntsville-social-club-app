'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import {
  discoveryIntentLabel,
  memberDisplayName,
  type DirectoryMember,
} from '@/lib/members-discovery'
import { MemberCardBadges } from '@/components/members/member-badge-row'
import { primaryMemberPhoto } from '@/lib/member-photos'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import { requestMemberIntro } from '@/app/(club)/members/intro-actions'

export default function MemberDiscoveryCard({
  member,
  limited,
}: {
  member: DirectoryMember
  limited: boolean
}) {
  const [introMessage, setIntroMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const displayName = memberDisplayName(member)
  const primaryPhoto = primaryMemberPhoto(member.photos)
  const intentLabel = member.discovery_intent
    ? discoveryIntentLabel(member.discovery_intent)
    : null

  const handleIntro = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIntroMessage('')
    startTransition(async () => {
      const result = await requestMemberIntro(member.id)
      if (result.error) {
        setIntroMessage(result.error)
        return
      }
      setIntroMessage('Intro request sent.')
    })
  }

  return (
    <Card className="flex h-full flex-col transition hover:border-accent/25 hover:shadow-md">
      <Link href={`/members/${member.id}`} className="block flex-1 no-underline text-inherit">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-elevated">
          {primaryPhoto ? (
            <MemberPhotoDisplay
              memberId={member.id}
              photo={primaryPhoto}
              size="thumb"
              className="!aspect-auto h-full min-h-0 w-full rounded-none border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No photo yet
            </div>
          )}
          {intentLabel ? (
            <div className="absolute top-3 left-3">
              <Badge variant="premium">{intentLabel}</Badge>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="text-display text-lg font-semibold">{displayName}</p>
          {member.location_area ? (
            <p className="mt-1 text-sm text-muted-foreground">{member.location_area}</p>
          ) : null}
          {member.membership_intent ? (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {member.membership_intent}
            </p>
          ) : null}
          <div className="mt-3">
            <MemberCardBadges member={member} />
          </div>
        </div>
      </Link>

      <div className="mt-4 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleIntro}
          disabled={isPending || limited}
          className={`${buttonSecondaryClassName} w-full`}
        >
          {isPending ? 'Requesting…' : 'Request intro'}
        </button>
        {introMessage ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{introMessage}</p>
        ) : null}
      </div>
    </Card>
  )
}
