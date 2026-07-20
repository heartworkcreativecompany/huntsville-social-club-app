/** Most recent curated match review timestamp (empty or delivered). */
export function lastMatchReviewAnchor(input: {
  lastMatchReviewAt?: string | null
  lastMatchGenerationAt?: string | null
}): string | null {
  const review = input.lastMatchReviewAt
  const delivery = input.lastMatchGenerationAt

  if (!review && !delivery) {
    return null
  }

  if (!review) {
    return delivery ?? null
  }

  if (!delivery) {
    return review
  }

  const reviewTime = new Date(review).getTime()
  const deliveryTime = new Date(delivery).getTime()

  if (Number.isNaN(reviewTime)) {
    return delivery
  }

  if (Number.isNaN(deliveryTime)) {
    return review
  }

  return reviewTime >= deliveryTime ? review : delivery
}
