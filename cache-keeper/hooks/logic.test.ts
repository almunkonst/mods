import { test, expect } from 'claude-code/testing'
import { withIgnore, cyrillicShare, needsHandoff, parseNext, stamp, warmMinutes } from './logic'

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
})
