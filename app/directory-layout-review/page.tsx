import { notFound } from 'next/navigation'
import { directoryLayoutReviewEnabled } from '@/lib/directory-layout-review'
import {
  SQUARE_PORTRAIT_SRC,
  TALL_PORTRAIT_SRC,
  WIDE_PORTRAIT_SRC,
} from './portrait-fixtures'
import { DirectoryScrollRestore } from '@/components/members/directory-profile-link'
import MemberDiscoveryCard from '@/components/members/member-discovery-card'
import { MEMBER_DIRECTORY_GRID_CLASS } from '@/components/members/member-directory-section'
import SiteFooter from '@/components/shell/site-footer'
import VisualViewportFrame from '@/components/shell/visual-viewport-frame'
import { directoryQueryString, parseDirectoryQuery } from '@/lib/member-directory-query'
import type { MemberDirectorySearchParams } from '@/lib/member-directory-query'
import type { DirectoryMember } from '@/lib/members-discovery'

export const dynamic = 'force-dynamic'

function fixtureMember(
  id: string,
  name: string,
  area: string,
  about: string | null
): DirectoryMember {
  return {
    id,
    contactEmail: null,
    full_name: name,
    role: 'member',
    created_at: null,
    membership_intent: about,
    verified_at: null,
    membership_status: 'approved',
    photos: [],
    location_area: area,
    discovery_intent: null,
    location_city: 'Private City',
    location_zip: '35801',
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: [],
    verification_state: {},
    membership_tier: 'inner_circle',
    vendor_reviewed_badge: false,
    recognitionBadges: [
      { slug: 'founding_member', publicLabel: 'Founding Member' },
      { slug: 'premium_sponsor', publicLabel: 'Premium Sponsor' },
    ],
  }
}

const FIXTURE_MEMBERS = [
  fixtureMember('fixture-ada', 'Ada Lovelace', 'Downtown Huntsville', 'Short bio.'),
  fixtureMember(
    'fixture-long',
    'Alexandria Montgomery-Worthington',
    'A very long public area name that should wrap inside the card',
    'This biography is only for the desktop card and should stay off the compact phone card.'
  ),
  fixtureMember('fixture-blank', 'No Photo Member', '', null),
  ...Array.from({ length: 15 }, (_, index) =>
    fixtureMember(
      `fixture-${index + 4}`,
      `Member ${index + 4}`,
      'South Huntsville',
      'Directory fixture bio.'
    )
  ),
]

export default async function DirectoryLayoutReviewPage({
  searchParams,
}: {
  searchParams: Promise<MemberDirectorySearchParams>
}) {
  if (!directoryLayoutReviewEnabled()) notFound()

  const directory = parseDirectoryQuery(await searchParams)

  return (
    <VisualViewportFrame>
      <header className="relative z-50 shrink-0 border-b border-border bg-surface px-5 py-4">
        <p className="font-brand text-sm tracking-wide">Directory layout review</p>
      </header>
      <div
        data-club-content-scroll
        className="min-h-0 flex-1 overflow-x-clip overflow-y-auto"
      >
        <DirectoryScrollRestore />
        <main className="mx-auto w-full min-w-0 max-w-6xl px-5 py-6 sm:px-8 sm:py-10">
          <h1 className="font-brand text-3xl font-semibold">Member directory</h1>
          <p data-directory-state={directoryQueryString(directory) || 'default'}>
            Fixture directory
          </p>
          <ul className={MEMBER_DIRECTORY_GRID_CLASS}>
            {FIXTURE_MEMBERS.map((member, index) => (
              <li key={member.id} className="min-w-0">
                <MemberDiscoveryCard
                  member={member}
                  directory={directory}
                  profileHref={`/directory-layout-review/${member.id}${directoryQueryString(directory)}`}
                  photoSrc={
                    member.id === 'fixture-ada'
                      ? TALL_PORTRAIT_SRC
                      : member.id === 'fixture-long'
                        ? SQUARE_PORTRAIT_SRC
                        : member.id === 'fixture-4'
                          ? WIDE_PORTRAIT_SRC
                          : null
                  }
                />
              </li>
            ))}
          </ul>
        </main>
        <SiteFooter />
      </div>
    </VisualViewportFrame>
  )
}
