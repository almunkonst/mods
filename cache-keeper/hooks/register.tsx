import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Snap } from '../types'
import type { Level } from './logic'
import { LIMIT_BAD, LIMIT_WARN, bandNote, cyrillicShare, handoffPrompt, k, levelColor, levelOf, needsHandoff, parseNext, stamp, withIgnore, warmMinutes } from './logic'

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

// Записки не должны попасть в коммиты, но и лишней правки в коммитах быть не должно: пишем в локальный
// .git/info/exclude, который в репозиторий не входит. Если туда писать нельзя (worktree, где .git — файл,
// или запись не разрешена), откатываемся на .gitignore.
async function ignoreIn($: Engine, file: string) {
  const current = (await $.fs.exists(file)) ? await $.fs.read(file) : ''
  const next = withIgnore(current)
  if (next !== null) await $.fs.write(file, next)
}

async function ignoreInGit($: Engine) {
  if (!(await $.fs.exists('.git'))) return
  if (await $.fs.exists('.git/info')) {
    try {
      await ignoreIn($, '.git/info/exclude')
      return
    } catch {
      /* запись в .git не разрешена — ниже обычный .gitignore */
    }
  }
  await ignoreIn($, '.gitignore')
}

async function ask($: Engine, setWaiting: () => void) {
  const { share } = await read($, snap)
  setWaiting()
  void $.prompt.submit({ text: handoffPrompt(share) })
}


export const register: Register = (on, options) => {
  const ttl = Number(options?.ttlMinutes ?? 60)
  const warnPercent = Number(options?.warnPercent ?? 60)
  const urgentPercent = Number(options?.urgentPercent ?? 80)
  const soonMinutes = Number(options?.soonMinutes ?? 10)
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
        await ignoreInGit($)
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
    const tokens = usage.context.tokens ?? 0
    const hint = needsHandoff(percent, warm, warnPercent, urgentPercent)
    const note = bandNote({ warm, tokens, percent, soon: soonMinutes, hint, urgentPercent, hasHandoff: !!s.handoff })

    // Полоса — один абзац из кусочков: цвет у каждого свой, а переносится она как единый текст
    // (отдельные Text в одной строке Box сжимались и переносились поодиночке).
    const parts: { t: string; level: Level; color?: string }[] = [
      { t: warm === null ? 'cache ?' : warm > 0 ? `warm ${warm}m` : 'cache cold', level: 'ok', color: warm !== null && warm > 0 ? 'green' : undefined },
      { t: ' | ctx ', level: 'ok' },
      { t: `${k(tokens)} ${Math.round(percent)}%`, level: levelOf(percent, warnPercent, urgentPercent) },
    ]
    usage.rateLimits.forEach((r, i) => {
      const name = r.kind === 'five_hour' ? '5h' : r.kind === 'seven_day' ? 'week' : r.kind
      parts.push({ t: i === 0 ? ' | ' : ' · ', level: 'ok' }, { t: `${name} ${Math.round(r.percentUsed)}%`, level: levelOf(r.percentUsed, LIMIT_WARN, LIMIT_BAD) })
    })
    if (usage.cost) parts.push({ t: ` | ≈$${usage.cost.usd.toFixed(2)}`, level: 'ok' })
    if (s.last) parts.push({ t: ` | in ${k(s.last.input)} out ${k(s.last.output)} cached ${k(s.last.cached)}`, level: 'ok' })
    if (s.share > 0) parts.push({ t: ` | RU ${s.share}%`, level: 'ok' })
    parts.push({ t: ' ', level: 'ok' })

    return (
      <Box flexDirection="column">
        <Box>
          <Text>
            {parts.map((p, i) => (
              <Text key={`p${i}`} color={p.color ?? levelColor(p.level)} dimColor={!p.color && p.level === 'ok'}>
                {p.t}
              </Text>
            ))}
          </Text>
          <Button key="handoff" hotkey="h" label="handoff" onPress={() => ask($, () => { isWaiting = true })} />
          {s.handoff && (
            <Button key="clear" hotkey="c" label="clear and continue" onPress={() => resume($)} />
          )}
        </Box>
        {note && (
          <Text color={levelColor(note.level)} dimColor={note.level === 'ok'}>{note.text}</Text>
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
