export type Handoff = { path: string; text: string; next: string[] }
export type Snap = { lastAt: number; now: number; handoff: Handoff | null }

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': { snap: Snap }
  }
}
