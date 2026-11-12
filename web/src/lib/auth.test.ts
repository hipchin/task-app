import { describe, expect, it } from 'vitest'
import { parseStoredSession } from './auth'

describe('parseStoredSession', () => {
  it('トークンとユーザーIDがそろっていればセッションとして返す（期限切れでも返す）', () => {
    const raw = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } })
    expect(parseStoredSession(raw)?.user.id).toBe('u1')
  })
  it('空・壊れた JSON・項目の欠けは null', () => {
    expect(parseStoredSession(null)).toBeNull()
    expect(parseStoredSession('{')).toBeNull()
    expect(parseStoredSession('null')).toBeNull()
    expect(parseStoredSession(JSON.stringify({ access_token: 'a', user: { id: 'u1' } }))).toBeNull()
    expect(parseStoredSession(JSON.stringify({ access_token: 'a', refresh_token: 'r' }))).toBeNull()
  })
})
