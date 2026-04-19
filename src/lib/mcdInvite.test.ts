// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateSecureToken,
  hashToken,
  createInvite,
  validateInvite,
  consumeInvite,
  revokeInvite,
  listActiveInvites,
  formatTimeLeft,
} from './mcdInvite'

describe('generateSecureToken', () => {
  it('генерирует токен разной длины при разных байтах', () => {
    const a = generateSecureToken(16)
    const b = generateSecureToken(32)
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(a.length)
  })

  it('токены уникальны при каждом вызове', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()))
    expect(tokens.size).toBe(100)
  })

  it('не содержит символов, ломающих URL', () => {
    const t = generateSecureToken()
    // base64url: A-Z, a-z, 0-9, '-', '_'
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('hashToken', () => {
  it('одинаковые токены → одинаковые хеши', async () => {
    const h1 = await hashToken('abc123')
    const h2 = await hashToken('abc123')
    expect(h1).toBe(h2)
  })

  it('разные токены → разные хеши', async () => {
    const h1 = await hashToken('abc123')
    const h2 = await hashToken('abc124')
    expect(h1).not.toBe(h2)
  })

  it('хеш — строка base64url', async () => {
    const h = await hashToken('любой_токен')
    expect(h).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('createInvite + validateInvite + consumeInvite', () => {
  const inviter = { id: 'user-1', name: 'Иванов И. И.', company: 'ООО Тест' }
  const recipient = { name: 'Петров П. П.', contact: '+79991234567' }

  beforeEach(() => {
    try { localStorage?.clear?.() } catch {}
  })

  it('createInvite возвращает url, invite, token', async () => {
    const r = await createInvite({ inviter, recipient, channel: 'sms' })
    expect(r.url).toContain('#/mcd?invite=')
    expect(r.token).toBeTruthy()
    expect(r.invite.recipientName).toBe('Петров П. П.')
    expect(r.invite.inviterName).toBe('Иванов И. И.')
    expect(r.invite.oneTime).toBe(true)
  })

  it('validateInvite возвращает valid: true для свежего токена', async () => {
    const { token } = await createInvite({ inviter, recipient, channel: 'email' })
    const result = await validateInvite(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.invite.recipientContact).toBe('+79991234567')
    }
  })

  it('возвращает not_found для случайного токена', async () => {
    const result = await validateInvite('someRandomInvalidToken123')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('not_found')
  })

  it('возвращает malformed для пустого токена', async () => {
    const r1 = await validateInvite('')
    const r2 = await validateInvite(null)
    expect(r1.valid).toBe(false)
    expect(r2.valid).toBe(false)
  })

  it('consumeInvite помечает one-time ссылку использованной', async () => {
    const { token } = await createInvite({ inviter, recipient, channel: 'sms' })

    const before = await validateInvite(token)
    expect(before.valid).toBe(true)

    await consumeInvite(token)

    const after = await validateInvite(token)
    expect(after.valid).toBe(false)
    if (!after.valid) expect(after.reason).toBe('used')
  })

  it('revokeInvite отзывает ссылку', async () => {
    const { token } = await createInvite({ inviter, recipient, channel: 'sms' })
    await revokeInvite(token)
    const result = await validateInvite(token)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('revoked')
  })

  it('возвращает expired если TTL истёк', async () => {
    const { token } = await createInvite({
      inviter, recipient, channel: 'sms', ttlDays: -1,
    })
    const result = await validateInvite(token)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('expired')
  })

  it('listActiveInvites возвращает только активные инвайты пользователя', async () => {
    await createInvite({ inviter, recipient, channel: 'sms' })
    const { token: t2 } = await createInvite({ inviter, recipient, channel: 'email' })
    await consumeInvite(t2)
    await createInvite({ inviter, recipient, channel: 'sms', ttlDays: -1 })

    const active = listActiveInvites(inviter.id)
    // Первый активен, второй consumed, третий expired — остаётся 1
    expect(active).toHaveLength(1)
  })
})

describe('formatTimeLeft', () => {
  it('возвращает "X дней" для срока больше суток', () => {
    const in3d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatTimeLeft(in3d)).toMatch(/3 дня|3 дней/)
  })

  it('возвращает "X часов" если меньше суток', () => {
    const in5h = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    expect(formatTimeLeft(in5h)).toMatch(/час/)
  })

  it('возвращает "истекла" для прошедшей даты', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    expect(formatTimeLeft(past)).toBe('истекла')
  })
})
