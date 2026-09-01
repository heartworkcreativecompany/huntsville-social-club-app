import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(__dirname, '../../..')

function dashboardPageSource() {
  return readFileSync(join(repoRoot, 'app/(club)/dashboard/page.tsx'), 'utf8')
}

describe('approved member dashboard page', () => {
  it('uses the approved Discovery / Dashboard header copy', () => {
    const source = dashboardPageSource()
    expect(source).toContain('eyebrow="Discovery"')
    expect(source).toContain('title="Dashboard"')
    expect(source).toContain(
      'Your latest updates and next steps for curated intros, member discovery, and recent conversations.'
    )
  })

  it('renders the modules moved off the Members directory', () => {
    const source = dashboardPageSource()
    expect(source).toContain('RecentMessagesPreview')
    expect(source).toContain('CuratedIntroCard')
    expect(source).toContain('loadRecentMessagePreviews')
    expect(source).not.toContain('MemberDirectorySection')
    expect(source).not.toContain('loadDirectoryProfiles')
  })

  it('requires an approved member and redirects everyone else', () => {
    const source = dashboardPageSource()
    expect(source).toContain("redirect('/login')")
    expect(source).toContain('if (!viewer.canAccessApp)')
    expect(source).toContain("redirect('/application')")
  })

  it('is the approved-member landing destination', () => {
    const home = readFileSync(
      join(repoRoot, 'app/(club)/home/page.tsx'),
      'utf8'
    )
    const application = readFileSync(
      join(repoRoot, 'lib/application.ts'),
      'utf8'
    )

    expect(home).toContain("redirect('/dashboard')")
    expect(home).not.toContain("redirect('/members')")
    expect(application).toContain("href: '/dashboard'")
    expect(application).not.toContain("href: '/home'")
  })
})
