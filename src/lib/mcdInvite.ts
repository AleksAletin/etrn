// Секьюрный генератор и валидатор invite-ссылок для МЧД.
//
// В прототипе (без бэка) это ПОЛУ-настоящая реализация:
//   - токен генерится через crypto.getRandomValues (256 бит энтропии)
//   - данные приглашения хранятся в localStorage под хешем токена
//   - невозможно перебором угадать токен
//   - проверяется срок жизни (TTL), отзыв, одноразовость
//
// В ПРОДЕ бэкенд должен:
//   1. POST /mcd/invite — генерит HMAC(SHA-256) от {inviterId, recipient, exp, nonce}
//      ключом из серверного секрета. Возвращает URL с этим токеном.
//   2. GET /mcd/invite/:token — валидирует HMAC + TTL + отсутствие отзыва
//      в таблице invites (с индексом по token_hash).
//   3. POST /mcd/invite/:token/consume — помечает инвайт как использованный
//      (для one-time ссылок) в рамках транзакции с attach МЧД.
//   4. Rate-limit: максимум N активных инвайтов на пользователя и IP.
//   5. Audit log: все операции пишутся в audit_log с user_id и IP.
//
// КРИТИЧНО для прода: НЕ доверять никакой информации из localStorage/клиента.
// Клиент может подделать любые поля. Только бэк, только HMAC.

export type InviteChannel = 'sms' | 'email' | 'copy'

export interface InvitePayload {
  /** Уникальный идентификатор записи (для audit log и отзыва). */
  id: string
  /** ID пользователя, отправившего инвайт (доверитель / руководитель). */
  inviterId: string
  /** ФИО доверителя / компания — для отображения получателю. */
  inviterName: string
  inviterCompany?: string
  /** Кому адресован инвайт. */
  recipientName: string
  recipientContact: string       // телефон или email
  channel: InviteChannel
  /** Дата создания (ISO). */
  createdAt: string
  /** Срок истечения (ISO). По умолчанию +7 дней. */
  expiresAt: string
  /** Одноразовый — после использования становится невалидным. */
  oneTime: boolean
  /** Уже использован (если oneTime). */
  usedAt?: string
  /** Отозван вручную (revoked). */
  revokedAt?: string
}

export type InviteValidationResult =
  | { valid: true; invite: InvitePayload }
  | { valid: false; reason: 'not_found' | 'expired' | 'revoked' | 'used' | 'malformed' }

const STORAGE_KEY = 'etrn_mcd_invites'
const DEFAULT_TTL_DAYS = 7

// ── Криптографически безопасный токен ───────────────────────────

/**
 * Генерит URL-safe токен на 32 случайных байта (256 бит энтропии).
 * Невозможно угадать перебором.
 */
export function generateSecureToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  // crypto.getRandomValues — доступно в браузере и в Node 20+
  crypto.getRandomValues(buf)
  return toBase64Url(buf)
}

function toBase64Url(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  // btoa не любит бинарные строки за пределами latin-1 — но Uint8Array с
  // String.fromCharCode даёт корректную binary string.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Простой SHA-256 хеш токена для хранения (чтобы даже при компрометации
 * localStorage нельзя было восстановить исходный токен).
 */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}

// ── Хранилище инвайтов (stub для бэка) ──────────────────────────

type InviteRecord = InvitePayload & { tokenHash: string }

function loadInvites(): InviteRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveInvites(invites: InviteRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invites))
  } catch {
    // storage full — silently ignore в демо
  }
}

// ── Публичное API ───────────────────────────────────────────────

export interface CreateInviteInput {
  inviter: { id: string; name: string; company?: string }
  recipient: { name: string; contact: string }
  channel: InviteChannel
  ttlDays?: number
  oneTime?: boolean
}

export interface CreateInviteResult {
  token: string
  url: string
  invite: InvitePayload
}

/**
 * Создаёт безопасный инвайт и возвращает полную URL для отправки получателю.
 * Токен не хранится — хранится только его SHA-256 хеш.
 */
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const token = generateSecureToken()
  const tokenHash = await hashToken(token)
  const now = new Date()
  const ttl = input.ttlDays ?? DEFAULT_TTL_DAYS
  const exp = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000)

  const id = generateSecureToken(16)

  const invite: InvitePayload = {
    id,
    inviterId: input.inviter.id,
    inviterName: input.inviter.name,
    inviterCompany: input.inviter.company,
    recipientName: input.recipient.name,
    recipientContact: input.recipient.contact,
    channel: input.channel,
    createdAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    oneTime: input.oneTime ?? true,
  }

  const record: InviteRecord = { ...invite, tokenHash }
  const invites = loadInvites()
  // Обрезаем старые записи (>50 штук на пользователя) чтобы не распухало
  const filtered = invites.filter(i => i.inviterId === input.inviter.id).length > 50
    ? [...invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
    : invites
  filtered.push(record)
  saveInvites(filtered)

  const base = window.location.origin + window.location.pathname
  const url = `${base}#/mcd?invite=${encodeURIComponent(token)}`

  return { token, url, invite }
}

/**
 * Валидирует токен и возвращает payload инвайта либо причину ошибки.
 * Проверки: наличие, срок жизни, отзыв, использование (для one-time).
 */
export async function validateInvite(token: string | null | undefined): Promise<InviteValidationResult> {
  if (!token) return { valid: false, reason: 'malformed' }

  let tokenHash: string
  try {
    tokenHash = await hashToken(token)
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  const invites = loadInvites()
  const rec = invites.find(i => i.tokenHash === tokenHash)
  if (!rec) return { valid: false, reason: 'not_found' }
  if (rec.revokedAt) return { valid: false, reason: 'revoked' }
  if (rec.oneTime && rec.usedAt) return { valid: false, reason: 'used' }

  const now = Date.now()
  if (new Date(rec.expiresAt).getTime() < now) return { valid: false, reason: 'expired' }

  return { valid: true, invite: rec }
}

/**
 * Помечает инвайт как использованный (для one-time ссылок).
 */
export async function consumeInvite(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token)
  const invites = loadInvites()
  const idx = invites.findIndex(i => i.tokenHash === tokenHash)
  if (idx < 0) return false
  invites[idx].usedAt = new Date().toISOString()
  saveInvites(invites)
  return true
}

/**
 * Отзыв инвайта (revoke) — недоступен для повторного использования.
 */
export async function revokeInvite(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token)
  const invites = loadInvites()
  const idx = invites.findIndex(i => i.tokenHash === tokenHash)
  if (idx < 0) return false
  invites[idx].revokedAt = new Date().toISOString()
  saveInvites(invites)
  return true
}

/**
 * Список активных инвайтов пользователя (без токенов, только metadata).
 */
export function listActiveInvites(inviterId: string): InvitePayload[] {
  const now = Date.now()
  return loadInvites()
    .filter(i => i.inviterId === inviterId)
    .filter(i => !i.revokedAt)
    .filter(i => !i.oneTime || !i.usedAt)
    .filter(i => new Date(i.expiresAt).getTime() > now)
    .map(({ tokenHash: _hash, ...rest }) => rest)
}

/** Человекочитаемое объяснение причины невалидности. */
export const VALIDATION_REASON_LABEL: Record<Exclude<InviteValidationResult, { valid: true }>['reason'], string> = {
  not_found: 'Ссылка не найдена или неверна',
  expired: 'Срок действия ссылки истёк',
  revoked: 'Ссылка была отозвана отправителем',
  used: 'Ссылка уже использована',
  malformed: 'Некорректный формат ссылки',
}

/** Формат остатка TTL — «X дней», «X часов», «X минут». */
export function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'истекла'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days >= 1) return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])}`
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours >= 1) return `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])}`
  const mins = Math.max(1, Math.floor(ms / (60 * 1000)))
  return `${mins} ${pluralRu(mins, ['минута', 'минуты', 'минут'])}`
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}
