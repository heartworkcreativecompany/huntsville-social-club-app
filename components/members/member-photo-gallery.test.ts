import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ApplicationPhoto } from '@/lib/application'
import { MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS } from '@/lib/member-photos'
import MemberDiscoveryCard from '@/components/members/member-discovery-card'
import type { DirectoryMember } from '@/lib/members-discovery'
import { MemberPhotoFrame } from '@/components/members/member-photo-display'
import {
  MemberProfileGalleryBlock,
  MemberProfilePrimaryPhoto,
  PROFILE_PRIMARY_IMAGE_CLASS,
  ProfileThumbnailStrip,
} from '@/components/members/member-photo-gallery'

/** Generated placeholder, not a member photo. Face sits near the top of a tall canvas. */
const TALL_PORTRAIT_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="90" viewBox="0 0 40 90"><rect width="40" height="90" fill="#d8d4cc"/><circle cx="20" cy="8" r="6" fill="#c45c5c"/></svg>'
  )

function photo(
  id: string,
  patch: Partial<ApplicationPhoto> = {}
): ApplicationPhoto {
  return {
    id,
    storagePath: `member_abc/${id}.svg`,
    isPrimary: false,
    facePhotoConfirmed: true,
    ...patch,
  }
}

const primary = photo('primary-portrait', { isPrimary: true })
const second = photo('second-landscape')
const third = photo('third-square')

const directoryMember: DirectoryMember = {
  id: 'member_abc',
  contactEmail: null,
  full_name: 'Alex Rivera',
  role: 'member',
  created_at: null,
  membership_intent: 'Looking to meet people at mixers.',
  verified_at: null,
  membership_status: 'approved',
  photos: [primary],
  location_area: 'Huntsville',
  discovery_intent: null,
  location_city: 'Huntsville',
  location_zip: null,
  birth_year: null,
  discovery_interests: [],
  discovery_industry: null,
  public_intents: [],
  verification_state: {},
  membership_tier: 'member',
  vendor_reviewed_badge: false,
}

function buttonClasses(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map(
    (match) => match[1]
  )
}

describe('profile gallery photo frame', () => {
  it('reuses the directory card portrait ratio for the large gallery image', () => {
    const cardHtml = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, { member: directoryMember })
    )
    const galleryHtml = renderToStaticMarkup(
      createElement(MemberProfilePrimaryPhoto, {
        memberId: 'member_abc',
        photo: primary,
      })
    )

    expect(MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS).toBe('aspect-[4/5]')
    expect(cardHtml).toContain(
      'relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-elevated'
    )
    expect(cardHtml).toContain(
      '!aspect-auto h-full min-h-0 w-full rounded-none border-0'
    )
    expect(cardHtml).not.toContain('object-contain')

    expect(galleryHtml).toContain('aspect-[4/5]')
    expect(galleryHtml).toContain('bg-surface-elevated')
    expect(galleryHtml).toContain('rounded-lg')
    expect(galleryHtml).toContain('overflow-hidden')
    expect(galleryHtml).toContain(PROFILE_PRIMARY_IMAGE_CLASS)
    expect(galleryHtml).toContain('max-w-[18rem]')
    expect(galleryHtml).toContain('sm:max-w-[19rem]')
    expect(galleryHtml).toContain('lg:max-w-[17rem]')
    expect(galleryHtml).not.toContain('aspect-square')
  })

  it('contains the full selected photo inside the portrait frame', () => {
    const html = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'primary',
        className: PROFILE_PRIMARY_IMAGE_CLASS,
        state: 'ready',
        url: TALL_PORTRAIT_PLACEHOLDER,
        showPrimaryBadge: true,
        isPrimary: true,
        alt: '',
      })
    )

    expect(html).toContain('aspect-[4/5]')
    expect(html).toContain('bg-surface-elevated')
    expect(html).toContain('rounded-lg')
    expect(html).toContain('overflow-hidden')
    expect(html).toMatch(
      /<img src="[^"]+" alt="" class="h-full w-full object-contain"/
    )
    expect(html).not.toContain('object-cover')
    expect(html).not.toContain('aspect-square')
    expect(html).not.toMatch(/<img\b[^>]*\bstyle=/)
    expect(html).toContain('>Primary<')
  })

  it('omits the primary badge when the selected photo is not primary', () => {
    const html = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'primary',
        className: PROFILE_PRIMARY_IMAGE_CLASS,
        state: 'ready',
        url: TALL_PORTRAIT_PLACEHOLDER,
        showPrimaryBadge: true,
        isPrimary: false,
        alt: '',
      })
    )

    expect(html).toContain('object-contain')
    expect(html).not.toContain('>Primary<')
  })

  it('keeps selector thumbnails square, compact, and free of the primary badge', () => {
    const html = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'thumb',
        className: 'pointer-events-none',
        state: 'ready',
        url: TALL_PORTRAIT_PLACEHOLDER,
        showPrimaryBadge: false,
        isPrimary: true,
        alt: '',
      })
    )

    expect(html).toContain('aspect-square w-full')
    expect(html).toContain('object-cover')
    expect(html).not.toContain('object-contain')
    expect(html).not.toContain('aspect-[4/5]')
    expect(html).not.toContain('>Primary<')
    expect(html).toContain('alt=""')
  })

  it('leaves upload and admin large previews on the square cover frame', () => {
    const html = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'large',
        state: 'ready',
        url: TALL_PORTRAIT_PLACEHOLDER,
        alt: '',
      })
    )

    expect(html).toContain('aspect-square w-full')
    expect(html).toContain('object-cover')
    expect(html).not.toContain('object-contain')
  })

  it('renders thumbnail selection, order, and keyboard buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileThumbnailStrip, {
        memberId: 'member_abc',
        photos: [primary, second, third],
        selectedId: second.id,
        onSelect: () => undefined,
      })
    )
    const classes = buttonClasses(html)

    expect(classes).toHaveLength(3)
    expect(classes[0]).toContain('ring-transparent')
    expect(classes[0]).not.toContain('ring-accent')
    expect(classes[1]).toContain('ring-accent')
    expect(classes[2]).toContain('ring-transparent')
    expect(html).toContain('w-14 shrink-0 sm:w-16')
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="View photo"')
    expect(html).not.toContain('tabindex="-1"')
    expect(html).not.toContain('>Primary<')
    expect(html).toContain('aspect-square')
    expect(html).not.toContain('aspect-[4/5]')
    expect(html.indexOf('ring-transparent')).toBeLessThan(
      html.indexOf('ring-accent')
    )
  })

  it('shows loading and error states without replacing the portrait frame', () => {
    const loading = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'primary',
        className: PROFILE_PRIMARY_IMAGE_CLASS,
        state: 'loading',
        url: null,
        alt: '',
      })
    )
    const error = renderToStaticMarkup(
      createElement(MemberPhotoFrame, {
        size: 'primary',
        className: PROFILE_PRIMARY_IMAGE_CLASS,
        state: 'error',
        url: null,
        errorMessage: 'Photo unavailable',
        alt: '',
      })
    )

    expect(loading).toContain('aspect-[4/5]')
    expect(loading).toContain('Loading…')
    expect(loading).not.toContain('<img')
    expect(error).toContain('aspect-[4/5]')
    expect(error).toContain('Photo unavailable')
    expect(error).toContain('>Retry<')
    expect(error).toContain('type="button"')
  })

  it('uses the portrait frame for an empty gallery and keeps profile text beside it', () => {
    const empty = renderToStaticMarkup(
      createElement(MemberProfileGalleryBlock, {
        memberId: 'member_abc',
        photos: [],
        selected: null,
        selectedId: null,
        onSelect: () => undefined,
      })
    )
    const filled = renderToStaticMarkup(
      createElement(MemberProfileGalleryBlock, {
        memberId: 'member_abc',
        photos: [primary, second],
        selected: second,
        selectedId: second.id,
        onSelect: () => undefined,
      })
    )

    expect(empty).toContain('aspect-[4/5]')
    expect(empty).toContain('bg-surface-elevated')
    expect(empty).toContain('No profile photos yet.')
    expect(empty).not.toContain('aspect-square')
    expect(filled).toContain('min-w-0')
    expect(filled).toContain('max-w-[19rem]')
    expect(filled).toContain('lg:max-w-none')
    expect(filled).toContain('overflow-x-auto')
    expect(buttonClasses(filled)[1]).toContain('ring-accent')
  })
})
