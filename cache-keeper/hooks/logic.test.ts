import { test, expect } from 'claude-code/testing'
import { HANDOFF_PROMPT, bandNote, handoffPrompt, levelColor, levelOf, withIgnore, cyrillicShare, needsHandoff, parseNext, stamp, warmMinutes } from './logic'

test('warmMinutes', () => {
  expect(warmMinutes(0, 1000, 60)).toBe(null)
  expect(warmMinutes(0 + 1, 1 + 10 * 60000, 60)).toBe(50)
  expect(warmMinutes(1, 1 + 90 * 60000, 60)).toBe(0)
})

test('needsHandoff', () => {
  expect(needsHandoff(50, 0, 60, 80)).toBe(false)
  expect(needsHandoff(65, 30, 60, 80)).toBe(false)
  expect(needsHandoff(65, 0, 60, 80)).toBe(true)
  expect(needsHandoff(85, 30, 60, 80)).toBe(true)
  expect(needsHandoff(65, null, 60, 80)).toBe(false)
  expect(needsHandoff(85, null, 60, 80)).toBe(true)
})

test('parseNext', () => {
  const note = '## Where\nx\n## Pick up here\n1. First\n2) Second\n- Third\n4. Fourth'
  expect(parseNext(note)).toEqual(['First', 'Second', 'Third'])
  expect(parseNext('no section')).toEqual([])
})

test('parseNext: русские шаги под английским заголовком', () => {
  const note = '## Where it started\nтекст\n## Pick up here\n1. Проверить корзину\n2. Выложить правки'
  expect(parseNext(note)).toEqual(['Проверить корзину', 'Выложить правки'])
})

test('handoffPrompt', () => {
  expect(handoffPrompt(0)).toBe(HANDOFF_PROMPT)
  expect(handoffPrompt(49)).toBe(HANDOFF_PROMPT)
  const ru = handoffPrompt(50)
  expect(ru.startsWith(HANDOFF_PROMPT)).toBe(true)
  expect(ru).toContain('Russian')
  expect(ru).toContain('in English') // заголовки остаются английскими: по ним parseNext находит «Pick up here»
})

test('levelOf / levelColor', () => {
  expect(levelOf(59, 60, 80)).toBe('ok')
  expect(levelOf(60, 60, 80)).toBe('warn')
  expect(levelOf(80, 60, 80)).toBe('bad')
  expect(levelColor('ok')).toBeUndefined()
  expect(levelColor('warn')).toBe('warning')
  expect(levelColor('bad')).toBe('error')
})

const base = { warm: 30, tokens: 470000, percent: 47, soon: 10, hint: false, urgentPercent: 80, hasHandoff: false }

test('bandNote: тёплый кэш и запас — ничего не пишем', () => {
  expect(bandNote(base)).toBeNull()
})

test('bandNote: кэш скоро остынет — предложить записку, пока он тёплый', () => {
  const n = bandNote({ ...base, warm: 8 })!
  expect(n.level).toBe('warn')
  expect(n.text).toContain('cools in 8m')
  expect(bandNote({ ...base, warm: 11 })).toBeNull() // ещё рано
  expect(bandNote({ ...base, warm: 8, tokens: 5000 })).toBeNull() // мелкий контекст — не стоит беспокоить
})

test('bandNote: кэш холодный — цена пересчёта', () => {
  const n = bandNote({ ...base, warm: 0 })!
  expect(n.level).toBe('ok')
  expect(n.text).toContain('re-writes ~470k tokens')
  expect(bandNote({ ...base, warm: 0, tokens: 5000 })).toBeNull()
  expect(bandNote({ ...base, warm: null })).toBeNull() // неизвестно, был ли кэш
})

test('bandNote: тяжёлый контекст', () => {
  const cold = bandNote({ ...base, warm: 0, percent: 65, hint: true })!
  expect(cold.level).toBe('warn')
  expect(cold.text).toContain('re-writes ~470k tokens')
  expect(cold.text).toContain('Press H')
  const urgent = bandNote({ ...base, warm: 30, percent: 85, hint: true })!
  expect(urgent.level).toBe('bad')
  expect(urgent.text).toContain('context is heavy')
})

test('bandNote: записка уже есть — молчим', () => {
  expect(bandNote({ ...base, warm: 0, percent: 90, hint: true, hasHandoff: true })).toBeNull()
})

test('stamp', () => {
  expect(stamp(Date.UTC(2026, 9, 6, 15, 46))).toBe('2026-10-06-15-46')
})

test('cyrillicShare', () => {
  expect(cyrillicShare('hello')).toBe(0)
  expect(cyrillicShare('привет')).toBe(100)
  expect(cyrillicShare('привет hi')).toBe(75)
  expect(cyrillicShare('123')).toBe(0)
})

test('withIgnore', () => {
  expect(withIgnore('')).toBe('.cache-keeper/\n')
  expect(withIgnore('node_modules/\n')).toBe('node_modules/\n.cache-keeper/\n')
  expect(withIgnore('node_modules/')).toBe('node_modules/\n.cache-keeper/\n')
  expect(withIgnore('a\n.cache-keeper/\n')).toBeNull()
  expect(withIgnore('a\r\n.cache-keeper\r\n')).toBeNull()
  // .git/info/exclude начинается с комментариев — дописываем в конец
  expect(withIgnore('# git ls-files --others --exclude-from=.git/info/exclude\n')).toBe('# git ls-files --others --exclude-from=.git/info/exclude\n.cache-keeper/\n')
})
