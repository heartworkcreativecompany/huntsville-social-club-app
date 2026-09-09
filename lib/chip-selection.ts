/** Shared chip-select helpers so legacy saved values stay visible without becoming new choices. */

export function chipOptionsWithLegacySelected(
  options: readonly string[],
  selected: readonly string[]
): string[] {
  const optionSet = new Set(options)
  const extras: string[] = []
  const extraSeen = new Set<string>()

  for (const value of selected) {
    if (!value || optionSet.has(value) || extraSeen.has(value)) continue
    extraSeen.add(value)
    extras.push(value)
  }

  return extras.length === 0 ? [...options] : [...options, ...extras]
}

export function toggleChipSelection(
  selected: readonly string[],
  option: string,
  max?: number
): string[] {
  if (selected.includes(option)) {
    return selected.filter((item) => item !== option)
  }
  if (max !== undefined && selected.length >= max) {
    return [...selected]
  }
  return [...selected, option]
}
