import { test, expect } from 'claude-code/testing'
import { cyrillicShare } from './register'

test('cyrillic share', () => {
  expect(cyrillicShare('hello')).toBe(0)
  expect(cyrillicShare('привет')).toBe(100)
  expect(cyrillicShare('привет hi')).toBe(75)
  expect(cyrillicShare('123')).toBe(0)
})
