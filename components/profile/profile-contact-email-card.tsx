'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import { updateMemberContactEmail } from '@/app/(club)/members/contact-email-actions'
import { revealProfileSection } from '@/components/profile/profile-section'

type ProfileContactEmailCardProps = {
  contactEmail: string
  showContactEmail: boolean
}

export default function ProfileContactEmailCard({
  contactEmail,
  showContactEmail,
}: ProfileContactEmailCardProps) {
  const router = useRouter()
  const [email, setEmail] = useState(contactEmail)
  const [visible, setVisible] = useState(showContactEmail)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const messageRef = useRef<HTMLParagraphElement>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!message) return
    revealProfileSection('contact-email', messageRef.current)
  }, [message, messageIsError])

  const handleSave = () => {
    setMessage('')
    setMessageIsError(false)
    startTransition(async () => {
      const result = await updateMemberContactEmail({
        contactEmail: email,
        showContactEmail: visible,
      })

      if (result.error) {
        setMessageIsError(true)
        setMessage(result.error)
        return
      }

      setMessageIsError(false)

      setMessage('Contact email settings saved.')
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="profile-section-title text-display text-lg font-semibold">
        Contact email
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional. This is separate from your account login email and is hidden
        from other members unless you turn visibility on.
      </p>

      <div className="mt-4 grid max-w-lg gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Contact email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="e.g. hello@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
            disabled={isPending}
          />
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
            disabled={isPending || !email.trim()}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-foreground">
              Show contact email on my member profile
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Visible to signed-in members when they view your profile. Not shown
              on public pages outside the club.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={handleSave}
          className={buttonPrimaryClassName}
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save contact settings'}
        </button>

        {message ? (
          <p
            ref={messageRef}
            role={messageIsError ? 'alert' : 'status'}
            className={`text-sm ${
              messageIsError ? 'text-danger' : 'text-muted-foreground'
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
