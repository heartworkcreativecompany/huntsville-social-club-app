/** Shared chip-select helpers so legacy saved values stay visible without becoming new choices. */

export function canonicalChipKey(value: string): string {
  return value.trim().toLowerCase()
}

export function logicalChipCount(selected: readonly string[]): number {
  const seen = new Set<string>()
  for (const value of selected) {
    const key = canonicalChipKey(value)
    if (!key) continue
    seen.add(key)
  }
  return seen.size
}

export function isChipSelected(
  selected: readonly string[],
  option: string
): boolean {
  const key = canonicalChipKey(option)
  if (!key) return false
  return selected.some((value) => canonicalChipKey(value) === key)
}

export function chipOptionsWithLegacySelected(
  options: readonly string[],
  selected: readonly string[]
): string[] {
  const optionKeys = new Set<string>()
  for (const option of options) {
    const key = canonicalChipKey(option)
    if (key) optionKeys.add(key)
  }

  const extras: string[] = []
  const extraSeen = new Set<string>()

  for (const value of selected) {
    const key = canonicalChipKey(value)
    if (!key || optionKeys.has(key) || extraSeen.has(key)) continue
    extraSeen.add(key)
    extras.push(value)
  }

  return extras.length === 0 ? [...options] : [...options, ...extras]
}

export function toggleChipSelection(
  selected: readonly string[],
  option: string,
  max?: number
): string[] {
  const key = canonicalChipKey(option)
  if (!key) return [...selected]

  if (selected.some((value) => canonicalChipKey(value) === key)) {
    return selected.filter((item) => canonicalChipKey(item) !== key)
  }
  if (max !== undefined && logicalChipCount(selected) >= max) {
    return [...selected]
  }
  return [...selected, option]
}
