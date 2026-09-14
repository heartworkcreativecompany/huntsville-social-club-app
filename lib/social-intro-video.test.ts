import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SOCIAL_INTRO_VIDEO_GUIDANCE,
  shouldAutoplayMutedVideo,
} from '@/lib/social-intro-video'

const repoRoot = join(__dirname, '..')

describe('shouldAutoplayMutedVideo', () => {
  it('never autoplays without a source, unmuted, or when motion is reduced', () => {
    expect(
      shouldAutoplayMutedVideo({
        hasSrc: false,
        autoPlayMuted: true,
        prefersReducedMotion: false,
      })
    ).toBe(false)
    expect(
      shouldAutoplayMutedVideo({
        hasSrc: true,
        autoPlayMuted: false,
        prefersReducedMotion: false,
      })
    ).toBe(false)
    expect(
      shouldAutoplayMutedVideo({
        hasSrc: true,
        autoPlayMuted: true,
        prefersReducedMotion: true,
      })
    ).toBe(false)
    expect(
      shouldAutoplayMutedVideo({
        hasSrc: true,
        autoPlayMuted: true,
        prefersReducedMotion: false,
      })
    ).toBe(true)
  })
})

describe('SocialIntroVideo source', () => {
  const source = readFileSync(
    join(repoRoot, 'components/marketing/social-intro-video.tsx'),
    'utf8'
  )

  it('reserves a vertical frame and supports captions without third-party players', () => {
    expect(source).toContain("aspectRatio: '9 / 16'")
    expect(source).toContain('<track')
    expect(source).toContain('Intro video coming soon')
    expect(source).not.toMatch(/youtube|vimeo|mux|cloudinary/i)
    expect(source).not.toMatch(/\sautoPlay[\s=]/)
    expect(SOCIAL_INTRO_VIDEO_GUIDANCE.preferredAspectRatio).toBe('9:16')
    expect(SOCIAL_INTRO_VIDEO_GUIDANCE.captions).toContain('WebVTT')
  })
})
