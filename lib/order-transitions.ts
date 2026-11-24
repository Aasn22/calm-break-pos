const transitions: Record<string, string[]> = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed'],
}
export function canAdvanceOrder(role: string, current: string, target: string) {
  const allowed = transitions[current] ?? []
  return (
    allowed.includes(target) &&
    (!['chef', 'barista', 'kitchen'].includes(role) ||
      ['preparing', 'ready'].includes(target))
  )
}
