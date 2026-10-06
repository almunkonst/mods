export const HANDOFF_PROMPT = [
  'Write a session handoff note in Markdown so a fresh session can continue this work.',
  'Sections: "Where it started", "Decisions locked + what shipped", "Open questions",',
  'and "Pick up here" with up to 3 numbered next steps, one line each.',
  'Reply with the note only.',
].join(' ')

// Если человек пишет по-русски, записка тоже по-русски, и заголовки тоже. Раздел с шагами для кнопок 1–3
// parseNext находит по любому из двух заголовков: «Pick up here» или «С чего продолжить».
export const RU_THRESHOLD = 50

export const RU_TITLES = ['Где начали', 'Решения и что сделано', 'Открытые вопросы', 'С чего продолжить'] as const

export const handoffPrompt = (ruShare: number): string =>
  ruShare >= RU_THRESHOLD
    ? `${HANDOFF_PROMPT} Write the note in Russian and use exactly these four section titles instead of the English ones, in this order: ${RU_TITLES.map(t => `"${t}"`).join(', ')}.`
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
  const at = note.search(/pick up here|с чего продолжить/i)
  const tail = at === -1 ? '' : note.slice(at)
  return [...tail.matchAll(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/gm)]
    .map(m => m[1]!.trim())
    .slice(0, 3)
}

export const stamp = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 16).replace(/[:T]/g, '-')

export const k = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// Длинный шаг из записки на кнопке обрезается, а полный текст показывает карточка по наведению.
export const NEXT_LABEL_MAX = 70

export const clip = (text: string, max = NEXT_LABEL_MAX): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

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

// ---- тепло кэша между сессиями -------------------------------------------------------------------
// Кэш промпта живёт на стороне Anthropic и не зависит от того, закрыли ли вы Claude Code. Поэтому время последнего
// ответа по каждой сессии лежит в $.store (переживает сессии); после --resume полоса берёт его оттуда, а не пишет «cache ?».
export const KEEP_SESSIONS = 20

export const rememberAt = (map: unknown, id: string, at: number, keep = KEEP_SESSIONS): Record<string, number> => {
  const old = typeof map === 'object' && map !== null ? Object.entries(map as Record<string, unknown>) : []
  const known = old.filter((p): p is [string, number] => typeof p[1] === 'number' && p[0] !== id)
  return Object.fromEntries([...known, [id, at] as [string, number]].sort((a, b) => b[1] - a[1]).slice(0, keep))
}

export const recallAt = (map: unknown, id: string): number => {
  const v = typeof map === 'object' && map !== null ? (map as Record<string, unknown>)[id] : undefined
  return typeof v === 'number' ? v : 0
}

// ---- факты из git в записке ----------------------------------------------------------------------
// Записку пишет модель по памяти; ветку, незакоммиченные файлы и последний коммит мод берёт из git сам.
export const GIT_MAX_LINES = 30

/** statusOut — вывод `git status --short --branch`, lastOut — `git log -1 --pretty=%h %s`. Не репозиторий — null. */
export const gitSection = (statusOut: string, lastOut: string): string | null => {
  const lines = statusOut.split(/\r?\n/).filter(l => l.trim() !== '')
  const head = lines.find(l => l.startsWith('## '))
  if (!head) return null
  const files = lines.filter(l => !l.startsWith('## '))
  const shown = files.slice(0, GIT_MAX_LINES)
  const more = files.length - shown.length
  const out = ['## Repo state (auto, from git)', `- Branch: ${head.slice(3)}`]
  // невидимая метка начала файла (BOM) в сообщении коммита выводилась бы как «�»
  const last = lastOut.replace(/﻿/g, '').trim()
  if (last) out.push(`- Last commit: ${last}`)
  out.push(files.length ? `- Uncommitted: ${files.length} file${files.length === 1 ? '' : 's'}` : '- Working tree clean')
  if (files.length) out.push('```', ...shown, ...(more > 0 ? [`… and ${more} more`] : []), '```')
  return out.join('\n')
}

/** Записка модели + блок из git (если он есть). */
export const withGit = (note: string, section: string | null): string =>
  section ? `${note.trimEnd()}\n\n${section}\n` : note

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
