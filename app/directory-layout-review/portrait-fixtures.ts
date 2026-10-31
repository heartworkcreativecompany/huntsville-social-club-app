/**
 * Synthetic portraits for local layout review. These are drawn shapes,
 * not photographs of members.
 * A magenta dot marks the face center so a crop check can see it.
 */

const FACE = '#ff00aa'

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function portrait({
  width,
  height,
  faceX,
  faceY,
  faceRadius,
  background,
}: {
  width: number
  height: number
  faceX: number
  faceY: number
  faceRadius: number
  background: string
}): string {
  const shoulderY = Math.min(height - 20, faceY + faceRadius * 2.4)
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <ellipse cx="${faceX}" cy="${shoulderY}" rx="${faceRadius * 2.1}" ry="${faceRadius * 1.3}" fill="#314155"/>
  <circle cx="${faceX}" cy="${faceY}" r="${faceRadius}" fill="#e7c4a8"/>
  <circle cx="${faceX - faceRadius * 0.28}" cy="${faceY - faceRadius * 0.12}" r="${faceRadius * 0.08}" fill="#2b241f"/>
  <circle cx="${faceX + faceRadius * 0.28}" cy="${faceY - faceRadius * 0.12}" r="${faceRadius * 0.08}" fill="#2b241f"/>
  <circle cx="${faceX}" cy="${faceY}" r="5" fill="${FACE}"/>
</svg>`)
}

/** Tall 3:4 head-and-shoulders, face in the upper middle. */
export const TALL_PORTRAIT_SRC = portrait({
  width: 600,
  height: 800,
  faceX: 300,
  faceY: 280,
  faceRadius: 92,
  background: '#c8bfb2',
})

/** Square frame, face centered. */
export const SQUARE_PORTRAIT_SRC = portrait({
  width: 800,
  height: 800,
  faceX: 400,
  faceY: 340,
  faceRadius: 110,
  background: '#b7c4c0',
})

/** Wide 3:2 frame, face centered. Cover should crop the sides. */
export const WIDE_PORTRAIT_SRC = portrait({
  width: 900,
  height: 600,
  faceX: 450,
  faceY: 250,
  faceRadius: 100,
  background: '#d5c7b4',
})

export const PORTRAIT_FACE_COLOR = FACE
