/**
 * Local layout review only. A production build never renders fixture
 * members, even when DIRECTORY_LAYOUT_REVIEW is set.
 */
export function directoryLayoutReviewEnabled(
  env: {
    NODE_ENV?: string
    VERCEL_ENV?: string
    DIRECTORY_LAYOUT_REVIEW?: string
  } = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    DIRECTORY_LAYOUT_REVIEW: process.env.DIRECTORY_LAYOUT_REVIEW,
  }
): boolean {
  if (env.NODE_ENV === 'production') return false
  if (env.VERCEL_ENV === 'production') return false
  return env.DIRECTORY_LAYOUT_REVIEW === '1'
}
