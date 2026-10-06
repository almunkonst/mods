import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Snap } from '../types'
import { HANDOFF_PROMPT, cyrillicShare, k, needsHandoff, parseNext, stamp, warmMinutes } from './logic'

const snap = atom({ plugin: 'cache-keeper', key: 'snap' } as const, {
  lastAt: 0,
  now: 0,
  handoff: null,
  last: null,
  share: 0,
} as Snap)

async function resume($: Engine, choice?: string) {
  const { handoff } = await read($, snap)
  if (!handoff) {
    $.ui.toast('cache-keeper: no handoff yet, press H first.')
    return
  }
  await $.command.run({ command: 'clear' })
  await update($, snap, (s: Snap) => ({ ...s, lastAt: 0 }))
  const start = choice ? `\n\nStart with: ${choice}` : ''
  void $.prompt.submit({
    text: `Continue from this handoff note:\n\n${handoff.text}${start}`,
    asUser: true,
  })
}

async function ask($: Engine, setWaiting: () => void) {
  setWaiting()
  void $.prompt.submit({ text: HANDOFF_PROMPT })
}


export const register: Register = (on, options) => {
  const ttl = Number(options?.ttlMinutes ?? 60)
  const warnPercent = Number(options?.warnPercent ?? 60)
  const urgentPercent = Number(options?.urgentPercent ?? 80)
  let isWaiting = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'handoff', description: 'Save a session note; "/handoff continue" clears and resumes from it' })
    $.clock.every(30000, async () => {
      const now = await $.clock.now()
      await update($, snap, s => ({ ...s, now }))
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      const share = cyrillicShare(e.text)
      await update($, snap, s => ({ ...s, share }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'handoff' }, async ($, e) => {
    if (e.args.trim() === 'continue') {
      await resume($)
      return { text: 'Cleared; continuing from the handoff.' }
    }
    await ask($, () => { isWaiting = true })
    return { text: 'Handoff requested.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer') {
      const now = await $.clock.now()
      if (isWaiting) {
        isWaiting = false
        const path = `.cache-keeper/handoffs/${stamp(now)}.md`
        await $.fs.write(path, e.answer)
        await update($, snap, s => ({
          ...s,
          lastAt: now,
          now,
          handoff: { path, text: e.answer, next: parseNext(e.answer) },
        }))
        $.ui.toast(`cache-keeper: handoff saved to ${path}. Press C or type /handoff continue.`)
      } else {
        const u = e.usage
        await update($, snap, s => ({
          ...s,
          lastAt: now,
          now,
          last: u
            ? {
                input: u.input_tokens + u.cache_creation_input_tokens,
                output: u.output_tokens,
                cached: u.cache_read_input_tokens,
              }
            : s.last,
        }))
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, snap)
    const usage = await $.session.usage()
    const { Box, Button, Text } = $.ui.resolve(e)
    const warm = warmMinutes(s.lastAt, s.now || s.lastAt, ttl)
    const percent = usage.context.percent ?? 0
    const limits = usage.rateLimits
      .map(r => `${r.kind === 'five_hour' ? '5h' : r.kind === 'seven_day' ? 'week' : r.kind} ${Math.round(r.percentUsed)}%`)
      .join(' · ')
    const hint = needsHandoff(percent, warm, warnPercent, urgentPercent)

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={warm > 0 ? 'green' : undefined} dimColor={warm === 0}>
            {warm > 0 ? `cache warm ${warm}m` : 'cache cold'}
          </Text>
          <Text dimColor>
            {` | ctx ${k(usage.context.tokens ?? 0)} (${Math.round(percent)}%)`}
            {limits ? ` | ${limits}` : ''}
            {usage.cost ? ` | session $${usage.cost.usd.toFixed(2)}` : ''}
            {s.last ? ` | last in ${k(s.last.input)} out ${k(s.last.output)} cached ${k(s.last.cached)}` : ''}
            {s.share > 0 ? ` | RU ${s.share}%` : ''}{' '}
          </Text>
          <Button key="handoff" hotkey="h" label="handoff" onPress={() => ask($, () => { isWaiting = true })} />
          {s.handoff && (
            <Button key="clear" hotkey="c" label="clear and continue" onPress={() => resume($)} />
          )}
        </Box>
        {hint && !s.handoff && (
          <Text color="yellow">context is heavy: press H for a handoff, then C to clear and continue</Text>
        )}
        {s.handoff && s.handoff.next.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>next:</Text>
            {s.handoff.next.map((line, i) => (
              <Button key={`n${i}`} hotkey={String(i + 1)} label={line} onPress={() => resume($, line)} />
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
