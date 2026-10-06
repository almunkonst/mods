import type { Register } from 'claude-code'

const CYRILLIC = /[Ѐ-ӿ]/g
const LETTER = /\p{L}/gu

export const cyrillicShare = (text: string): number => {
  const letters = text.match(LETTER)?.length ?? 0
  return letters === 0 ? 0 : Math.round(((text.match(CYRILLIC)?.length ?? 0) / letters) * 100)
}

const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export const register: Register = on => {
  let share = 0
  let input = 0
  let output = 0
  let cached = 0

  on('prompt.submit', ($, e, next) => {
    share = cyrillicShare(e.text)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u && e.agentId === undefined) {
      const fresh = u.input_tokens + u.cache_creation_input_tokens
      input += fresh
      output += u.output_tokens
      cached += u.cache_read_input_tokens
      $.ui.status(
        `turn: in ${k(fresh)} out ${k(u.output_tokens)} cached ${k(u.cache_read_input_tokens)}` +
          ` | session: in ${k(input)} out ${k(output)} cached ${k(cached)}` +
          ` | RU ${share}%`,
      )
    }
    return next(e)
  })
}
