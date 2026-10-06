import { test, expect } from 'claude-code/testing'
import { HANDOFF_PROMPT, NEXT_LABEL_MAX, bandNote, clip, gitSection, staleHandoffs, handoffPrompt, levelColor, levelOf, recallAt, rememberAt, withGit, withIgnore, cyrillicShare, needsHandoff, parseNext, stamp, warmMinutes } from './logic'

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

test('parseNext: русский заголовок «С чего продолжить»', () => {
  const note = '## Где начали\nтекст\n- пункт про другое\n## Открытые вопросы\n- вопрос\n## С чего продолжить\n1. Проверить корзину\n2. Выложить правки'
  expect(parseNext(note)).toEqual(['Проверить корзину', 'Выложить правки'])
  expect(parseNext('## с чего продолжить\n- один')).toEqual(['один']) // регистр не важен
})

test('handoffPrompt', () => {
  expect(handoffPrompt(0)).toBe(HANDOFF_PROMPT)
  expect(handoffPrompt(49)).toBe(HANDOFF_PROMPT)
  const ru = handoffPrompt(50)
  expect(ru.startsWith(HANDOFF_PROMPT)).toBe(true)
  expect(ru).toContain('Russian')
  expect(ru).toContain('"С чего продолжить"') // по этому заголовку parseNext находит шаги для кнопок
  expect(ru).toContain('"Где начали"')
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

test('rememberAt / recallAt: тепло кэша по сессиям', () => {
  expect(recallAt(undefined, 'a')).toBe(0)
  expect(recallAt({ a: 5 }, 'a')).toBe(5)
  expect(recallAt({ a: 'x' }, 'a')).toBe(0)
  const m1 = rememberAt(undefined, 'a', 100)
  expect(m1).toEqual({ a: 100 })
  const m2 = rememberAt(m1, 'b', 200)
  expect(recallAt(m2, 'a')).toBe(100)
  expect(recallAt(m2, 'b')).toBe(200)
  expect(rememberAt(m2, 'a', 300).a).toBe(300) // обновилась запись той же сессии
  expect(Object.keys(rememberAt({ a: 1, b: 2, c: 3 }, 'd', 4, 2)).sort()).toEqual(['c', 'd']) // остаются самые свежие
  expect(rememberAt({ bad: 'x', ok: 7 }, 'n', 8)).toEqual({ ok: 7, n: 8 }) // мусор в хранилище выбрасывается
})

test('gitSection', () => {
  const status = '## main...origin/main [ahead 1]\n M app/a.ts\n?? new.txt\n'
  const s = gitSection(status, 'abc1234 Fix thing\n')!
  expect(s).toContain('## Repo state (auto, from git)')
  expect(s).toContain('- Branch: main...origin/main [ahead 1]')
  expect(s).toContain('- Last commit: abc1234 Fix thing')
  expect(s).toContain('- Uncommitted: 2 files')
  expect(s).toContain(' M app/a.ts')
  expect(gitSection('## main\n', '')!).toContain('- Working tree clean')
  expect(gitSection('## main\n', '')!).not.toContain('Last commit')
  expect(gitSection('fatal: not a git repository', '')).toBeNull()
  const many = '## main\n' + Array.from({ length: 35 }, (_, i) => ` M f${i}.ts`).join('\n')
  expect(gitSection(many, '')!).toContain('… and 5 more')
  expect(gitSection('## main\n M one.ts\n', '')!).toContain('- Uncommitted: 1 file\n')
})

test('gitSection: BOM в сообщении коммита не выводится', () => {
  const s = gitSection('## main\n', '1706f99 ﻿Корзина: правка\n')!
  expect(s).toContain('- Last commit: 1706f99 Корзина: правка')
  expect(s.includes('﻿')).toBe(false)
})

test('clip', () => {
  expect(clip('коротко')).toBe('коротко')
  expect(clip('x'.repeat(NEXT_LABEL_MAX))).toBe('x'.repeat(NEXT_LABEL_MAX)) // ровно по границе — не режем
  const long = clip('слово '.repeat(30))
  expect(long.length).toBeLessThanOrEqual(NEXT_LABEL_MAX)
  expect(long.endsWith('…')).toBe(true)
  expect(long.endsWith(' …')).toBe(false) // пробел перед многоточием убирается
})

test('staleHandoffs: старые записки к удалению', () => {
  const files = [
    { name: '2026-10-06-15-46.md', kind: 'file' },
    { name: '2026-10-05-09-10.md', kind: 'file' },
    { name: '2026-10-06-20-30.md', kind: 'file' },
    { name: 'notes.md', kind: 'file' }, // чужой файл — не трогаем
    { name: '2026-10-01-00-00.md', kind: 'dir' }, // не файл — не трогаем
  ]
  expect(staleHandoffs(files)).toEqual(['2026-10-06-15-46.md', '2026-10-05-09-10.md'])
  expect(staleHandoffs(files, 2)).toEqual(['2026-10-05-09-10.md'])
  expect(staleHandoffs(files, 0)).toEqual(['2026-10-06-15-46.md', '2026-10-05-09-10.md']) // меньше одной не оставляем
  expect(staleHandoffs(files, 5)).toEqual([])
  expect(staleHandoffs([])).toEqual([])
})

test('withGit', () => {
  expect(withGit('note\n\n', '## X')).toBe('note\n\n## X\n')
  expect(withGit('note', null)).toBe('note')
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
