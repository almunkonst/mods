export const HANDOFF_PROMPT = [
  'Write a session handoff note in Markdown so a fresh session can continue this work.',
  'Sections: "Where it started", "Decisions locked + what shipped", "Open questions",',
  'and "Pick up here" with up to 3 numbered next steps, one line each.',
  'Reply with the note only.',
].join(' ')

export const warmMinutes = (lastAt: number, now: number, ttl: number): number =>
  lastAt === 0 ? 0 : Math.max(0, Math.round(ttl - (now - lastAt) / 60000))

export const needsHandoff = (
  percent: number,
  warm: number,
  warnPercent: number,
  urgentPercent: number,
): boolean => percent >= urgentPercent || (warm === 0 && percent >= warnPercent)

export const parseNext = (note: string): string[] => {
  const at = note.search(/pick up here/i)
  const tail = at === -1 ? '' : note.slice(at)
  return [...tail.matchAll(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/gm)]
    .map(m => m[1]!.trim())
    .slice(0, 3)
}

export const stamp = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 16).replace(/[:T]/g, '-')

export const k = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
