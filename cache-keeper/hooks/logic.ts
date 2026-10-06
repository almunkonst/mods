export const HANDOFF_PROMPT = [
  'Write a session handoff note in Markdown so a fresh session can continue this work.',
  'Sections: "Where it started", "Decisions locked + what shipped", "Open questions",',
  'and "Pick up here" with up to 3 numbered next steps, one line each.',
  'Reply with the note only.',
].join(' ')

// Если человек пишет по-русски, записка тоже по-русски. Заголовки разделов остаются английскими:
// по «Pick up here» parseNext находит шаги для кнопок 1–3.
export const RU_THRESHOLD = 50

export const handoffPrompt = (ruShare: number): string =>
  ruShare >= RU_THRESHOLD
    ? `${HANDOFF_PROMPT} Keep the four section titles exactly as written above, in English; write everything under them in Russian.`
    : HANDOFF_PROMPT

export const warmMinutes = (lastAt: number, now: number, ttl: number): number | null =>
  lastAt === 0 ? null : Math.max(0, Math.round(ttl - (now - lastAt) / 60000))

export const needsHandoff = (
  percent: number,
  warm: number | null,
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

export type Level = 'ok' | 'warn' | 'bad'

/** Уровень значения: от warnAt — предупреждение, от badAt — тревога. */
export const levelOf = (value: number, warnAt: number, badAt: number): Level =>
  value >= badAt ? 'bad' : value >= warnAt ? 'warn' : 'ok'

/** Цвет Text по уровню (ключи темы); ok — без цвета, серым. */
export const levelColor = (level: Level): string | undefined =>
  level === 'bad' ? 'error' : level === 'warn' ? 'warning' : undefined

// Лимиты подписки (5h, week): жёлтым от 70%, красным от 90%.
export const LIMIT_WARN = 70
export const LIMIT_BAD = 90

// Ниже этого размера контекста пересчёт кэша копеечный — подсказки не нужны.
export const MIN_NOTE_TOKENS = 20000

/**
 * Одна строка под полосой: что сейчас важно знать про кэш. Нет записки — ничего.
 *  - тяжёлый контекст (hint) — призыв сделать записку; при холодном кэше с ценой пересчёта;
 *  - кэш холодный — «следующее сообщение пересоберёт ~N токенов»;
 *  - кэш остынет в ближайшие `soon` минут — «жми H, пока он тёплый и это дёшево».
 */
export const bandNote = (a: {
  warm: number | null
  tokens: number
  percent: number
  soon: number
  hint: boolean
  urgentPercent: number
  hasHandoff: boolean
}): { text: string; level: Level } | null => {
  if (a.hasHandoff) return null
  const big = a.tokens >= MIN_NOTE_TOKENS
  const cold = a.warm === 0
  const cost = `your next message re-writes ~${k(a.tokens)} tokens`
  if (a.hint) {
    const level: Level = a.percent >= a.urgentPercent ? 'bad' : 'warn'
    return cold && big
      ? { text: `cache is cold: ${cost}. Press H for a handoff, then C to clear and continue`, level }
      : { text: 'context is heavy: press H for a handoff, then C to clear and continue', level }
  }
  if (cold && big) return { text: `cache is cold: ${cost}`, level: 'ok' }
  if (a.warm !== null && a.warm > 0 && a.warm <= a.soon && big) {
    return { text: `cache cools in ${a.warm}m: press H now to save a handoff while it is warm`, level: 'warn' }
  }
  return null
}

const CYRILLIC = /[Ѐ-ӿ]/g
const LETTER = /\p{L}/gu

export const cyrillicShare = (text: string): number => {
  const letters = text.match(LETTER)?.length ?? 0
  return letters === 0 ? 0 : Math.round(((text.match(CYRILLIC)?.length ?? 0) / letters) * 100)
}

export const IGNORE_LINE = '.cache-keeper/'

export const withIgnore = (content: string): string | null => {
  const lines = content.split(/\r?\n/).map(x => x.trim())
  if (lines.includes(IGNORE_LINE) || lines.includes('.cache-keeper')) return null
  const sep = content === '' || content.endsWith('\n') ? '' : '\n'
  return `${content}${sep}${IGNORE_LINE}\n`
}
