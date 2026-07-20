'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import {
  memberDisplayName,
  type DirectoryMember,
} from '@/lib/members-discovery'
import { memberPublicIntentBadgeVariant, memberPublicIntentLabel } from '@/lib/member-public-intent'
import { MemberCardBadges } from '@/components/members/member-badge-row'
import { primaryMemberPhoto } from '@/lib/member-photos'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import { requestMemberIntro } from '@/app/(club)/members/intro-actions'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'
import { inputClassName } from '@/lib/event-labels'

export default function MemberDiscoveryCard({
  member,
  limited,
}: {
  member: DirectoryMember
  limited: boolean
}) {
  const [introBody, setIntroBody] = useState('')
  const [introMessage, setIntroMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const displayName = memberDisplayName(member)
  const primaryPhoto = primaryMemberPhoto(member.photos)

  const handleIntro = (event: React.FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIntroMessage('')
    const validationError = validateMemberMessageBody(introBody)
    if (validationError) {
      setIntroMessage(validationError)
      return
    }

    startTransition(async () => {
      const result = await requestMemberIntro(member.id, introBody)
      if (result.error) {
        setIntroMessage(result.error)
        return
      }
      setIntroBody('')
      setIntroMessage('Message request sent.')
    })
  }

  const bodyValidationError = introBody.trim()
    ? validateMemberMessageBody(introBody)
    : null

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
        </div>

        <div className="mt-4">
          <p className="text-display text-lg font-semibold">{displayName}</p>
          {member.location_area ? (
            <p className="mt-1 text-sm text-muted-foreground">{member.location_area}</p>
          ) : null}
          <div className="mt-3">
            <MemberCardBadges member={member} />
          </div>
          {member.public_intents.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {member.public_intents.map((intent) => (
                <Badge key={intent} variant={memberPublicIntentBadgeVariant()}>
                  {memberPublicIntentLabel(intent)}
                </Badge>
              ))}
            </div>
          ) : null}
          {member.membership_intent ? (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {member.membership_intent}
            </p>
          ) : null}
        </div>
      </Link>

      <div className="mt-4 border-t border-border pt-4">
        <form onSubmit={handleIntro} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Opening message</span>
            <textarea
              value={introBody}
              onChange={(event) =>
                setIntroBody(
                  event.target.value.slice(0, MAX_MEMBER_MESSAGE_LENGTH)
                )
              }
              rows={3}
              maxLength={MAX_MEMBER_MESSAGE_LENGTH}
              className={`${inputClassName} min-h-[5rem]`}
              placeholder={`Say hello to ${displayName}…`}
              disabled={isPending || limited}
              onClick={(event) => event.stopPropagation()}
            />
          </label>
          <button
            type="submit"
            disabled={
              isPending ||
              limited ||
              !introBody.trim() ||
              Boolean(bodyValidationError)
            }
            className={`${buttonSecondaryClassName} w-full`}
          >
            {isPending ? 'Sending…' : 'Send message request'}
          </button>
        </form>
        {introMessage ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {introMessage}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
