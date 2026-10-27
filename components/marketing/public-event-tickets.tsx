'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import PublicGuestRsvpForm from '@/components/marketing/public-guest-rsvp-form'
import {
  marketingButtonPrimaryClassName,
  marketingButtonSecondaryClassName,
} from '@/lib/event-labels'
import { scrollPublicContent } from '@/lib/public-content-scroll'
import type { GuestRsvpOffer } from '@/lib/public-guest-rsvp'

export default function PublicEventTickets({
  eventId,
  memberHref,
  offer,
  rsvpQuestion,
  rsvpQuestionRequired,
}: {
  eventId: string
  memberHref: string
  offer: GuestRsvpOffer
  rsvpQuestion: string | null
  rsvpQuestionRequired: boolean
}) {
  const purchasable = offer.kind === 'open'
  const [formOpen, setFormOpen] = useState(false)
  const [obstructed, setObstructed] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!formOpen) return
    const target = formRef.current ?? sectionRef.current
    if (target) scrollPublicContent(target)
  }, [formOpen])

  useEffect(() => {
    const section = sectionRef.current
    if (!section || !purchasable) return

    const scroller = section.closest('[data-public-content-scroll]')
    let frame = 0
    const update = () => {
      const rootRect =
        scroller instanceof HTMLElement
          ? scroller.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight }
      const footer =
        scroller instanceof Element ? scroller.querySelector('footer') : null
      const overlaps = (rect: DOMRect) =>
        rect.bottom > rootRect.top && rect.top < rootRect.bottom
      const next =
        overlaps(section.getBoundingClientRect()) ||
        (footer ? overlaps(footer.getBoundingClientRect()) : false)
      setObstructed((current) => (current === next ? current : next))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    update()
    scroller?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      scroller?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [purchasable, formOpen])

  function revealTickets() {
    const target = formRef.current ?? sectionRef.current
    if (formOpen) {
      if (target) scrollPublicContent(target)
      return
    }
    setFormOpen(true)
  }

  return (
    <section
      ref={sectionRef}
      id="public-event-tickets"
      aria-label="Tickets"
      className="mt-8"
    >
      <a href={memberHref} className={marketingButtonSecondaryClassName}>
        Members: sign in to RSVP
      </a>

      {offer.kind === 'sold_out' ? (
        <p className="mt-6 text-sm font-medium text-foreground">Sold out</p>
      ) : null}

      {offer.kind === 'open' ? (
        <div ref={formRef} id="guest-ticket-purchase" className="scroll-mt-4">
          <PublicGuestRsvpForm
            eventId={eventId}
            priceLabel={offer.priceLabel}
            rsvpQuestion={rsvpQuestion}
            rsvpQuestionRequired={rsvpQuestionRequired}
            spotsLeft={offer.spotsLeft}
            open={formOpen}
            onOpenChange={setFormOpen}
          />
        </div>
      ) : null}

      <p className="mt-8">
        <Link
          href="/events"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4"
        >
          See All Events
          <span aria-hidden="true"> →</span>
        </Link>
      </p>

      {purchasable && !obstructed ? (
        <button
          type="button"
          className={`${marketingButtonPrimaryClassName} fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-md sm:right-8 sm:bottom-8`}
          aria-controls="guest-ticket-purchase"
          onClick={revealTickets}
        >
          Get Tickets
        </button>
      ) : null}
    </section>
  )
}
