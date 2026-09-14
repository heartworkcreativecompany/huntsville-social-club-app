/**
 * Native HTML video helper for the public social-intro placeholder.
 * No third-party players, trackers, or remote media hosts.
 */

export type SocialIntroCaptionTrack = {
  src: string
  srcLang: string
  label: string
  kind?: 'captions' | 'subtitles' | 'descriptions' | 'chapters' | 'metadata'
  default?: boolean
}

/** Future asset guidance for the social intro video. */
export const SOCIAL_INTRO_VIDEO_GUIDANCE = {
  preferredAspectRatio: '9:16',
  desktopFrame: 'Constrained vertical frame (about 20rem wide, max-height ~32rem)',
  sources: ['video/mp4 (H.264)', 'video/webm (VP9 or AV1)'] as const,
  resolution: '1080×1920 (or 720×1280 for a lighter file)',
  captions: 'WebVTT (.vtt) via <track>',
  poster: 'Local JPG or WebP matching 9:16, stored under public/brand/',
  autoplay:
    'Never with sound. Muted autoplay only, and not when prefers-reduced-motion is set.',
} as const

export function shouldAutoplayMutedVideo(input: {
  hasSrc: boolean
  autoPlayMuted: boolean
  prefersReducedMotion: boolean
}): boolean {
  return input.hasSrc && input.autoPlayMuted && !input.prefersReducedMotion
}
