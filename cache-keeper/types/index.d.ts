export type Handoff = { path: string; text: string; next: string[] }
export type LastTurn = { input: number; output: number; cached: number }
export type Snap = {
  lastAt: number
  now: number
  handoff: Handoff | null
  last: LastTurn | null
  share: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': { snap: Snap }
  }
}
