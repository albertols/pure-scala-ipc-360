/**
 * Leaf module (imports nothing from `ETLOperational.tsx`/`AvailabilityCalendar.tsx`) so both can
 * depend on it without a cycle. Moved out of `ETLOperational.tsx` in Task 16's review round —
 * mirrors the same ruling that put `CardDensity` in `types.ts` rather than have a state module
 * import a component module: `export function` being hoisted made the original
 * `ETLOperational.tsx` <-> `AvailabilityCalendar.tsx` cycle benign today, but that safety rested on
 * nothing the compiler enforces (an `export const` rewrite would silently turn it into a
 * temporal-dead-zone bug).
 */
function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/**
 * Client-side mirror of the backend's nearest-available-date rule
 * (`OperationalService#nearestAvailable`): smallest day-distance to `target`.
 * Ties favor the earlier date — falls out naturally here because `avail` is
 * ascending (as served by `/api/operational/dates`) and we only replace
 * `best` on a STRICTLY smaller distance, so the first (earliest) date at the
 * minimum distance wins, same as the backend's `isBefore` tie-break.
 */
export function nearestAvailableDate(target: string, avail: string[]): string {
  if (avail.length === 0) return target
  let best = avail[0]!
  let bestDist = daysBetween(target, best)
  for (const iso of avail) {
    const dist = daysBetween(target, iso)
    if (dist < bestDist) {
      bestDist = dist
      best = iso
    }
  }
  return best
}
