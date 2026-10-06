import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Snap } from '../types'
import type { Level } from './logic'
import { LIMIT_BAD, LIMIT_WARN, NEXT_LABEL_MAX, bandNote, clip, cyrillicShare, gitSection, handoffPrompt, k, levelColor, levelOf, needsHandoff, parseNext, recallAt, rememberAt, stamp, withGit, withIgnore, warmMinutes } from './logic'

const snap = atom({ plugin: 'cache-keeper', key: 'snap' } as const, {
  lastAt: 0,
  now: 0,
  handoff: null,
  last: null,
  share: 0,
} as Snap)

// Ветка, незакоммиченное и последний коммит — из git, а не из памяти модели. Не репозиторий или git не отвечает — без блока.
async function gitFacts($: Engine): Promise<string | null> {
  try {
    const status = await $.process.run(['git', '-c', 'core.quotepath=off', 'status', '--short', '--branch'])
    if (status.exitCode !== 0) return null
    const last = await $.process.run(['git', 'log', '-1', '--pretty=%h %s'])
    return gitSection(status.stdout, last.exitCode === 0 ? last.stdout : '')
  } catch {
    return null
  }
}

// Время последнего ответа переживает сессии: после --resume кэш по часам ещё может быть тёплым.
async function remember($: Engine, at: number) {
  try {
    const id = await $.session.id()
    await $.store.set('warm', rememberAt(await $.store.get('warm'), id, at))
  } catch {
    /* хранилище недоступно — полоса просто не вспомнит тепло после перезапуска */
  }
}

async function resume($: Engine, choice?: string) {
  const { handoff } = await read($, snap)
  if (!handoff) {
    $.ui.toast('cache-keeper: no handoff yet, press H first.')
    return
  }
  const note = withGit(handoff.text, await gitFacts($)) // состояние репозитория на момент продолжения
  await $.command.run({ command: 'clear' })
  await update($, snap, (s: Snap) => ({ ...s, lastAt: 0 }))
  const start = choice ? `\n\nStart with: ${choice}` : ''
  void $.prompt.submit({
    text: `Continue from this handoff note:\n\n${note}${start}`,
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
    // продолжили сессию (--resume): вспоминаем, когда был последний ответ, — кэш по часам может быть ещё тёплым
    try {
      if ((await read($, snap)).lastAt === 0) {
        const at = recallAt(await $.store.get('warm'), await $.session.id())
        if (at > 0) {
          const now = await $.clock.now()
          await update($, snap, s => ({ ...s, lastAt: at, now }))
        }
      }
    } catch {
      /* нет сохранённого — остаётся «cache ?» до первого ответа */
    }
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
        await $.fs.write(path, withGit(e.answer, await gitFacts($))) // в файле — записка модели + факты из git
        await ignoreInGit($)
        await update($, snap, s => ({
          ...s,
          lastAt: now,
          now,
          handoff: { path, text: e.answer, next: parseNext(e.answer) },
        }))
        await remember($, now)
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
        await remember($, now)
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

    // Кнопки — отдельной строкой над текстом полосы: справа от длинной строки им не хватало места, и текст переносился.
    // Длинный шаг из записки обрезан на кнопке; по наведению над ним всплывает карточка с полным текстом
    // (скрытый Box position=absolute с hover display=flex внутри Box с key; светлый текст на тёмном фоне — читается в любой теме).
    return (
      <Box flexDirection="column">
        <Box>
          <Box marginRight={1}>
            <Button key="handoff" hotkey="h" label="handoff" onPress={() => ask($, () => { isWaiting = true })} />
          </Box>
          {s.handoff && (
            <Button key="clear" hotkey="c" label="clear and continue" onPress={() => resume($)} />
          )}
        </Box>
        <Text>
          {parts.map((p, i) => (
            <Text key={`p${i}`} color={p.color ?? levelColor(p.level)} dimColor={!p.color && p.level === 'ok'}>
              {p.t}
            </Text>
          ))}
        </Text>
        {note && (
          <Text color={levelColor(note.level)} dimColor={note.level === 'ok'}>{note.text}</Text>
        )}
        {s.handoff && s.handoff.next.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>next:</Text>
            {s.handoff.next.map((line, i) => (
              <Box key={`nb${i}`}>
                <Button key={`n${i}`} hotkey={String(i + 1)} label={clip(line)} onPress={() => resume($, line)} />
                {line.length > NEXT_LABEL_MAX && (
                  <Box
                    position="absolute"
                    bottom={1}
                    left={0}
                    right={0}
                    display="none"
                    hover={{ display: 'flex' }}
                    borderStyle="round"
                    borderColor="#6b6b6b"
                    backgroundColor="#262626"
                    paddingX={1}
                  >
                    <Text color="#f0f0f0">{line}</Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
