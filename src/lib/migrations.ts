// Миграции localStorage между версиями прототипа.
// Запускаются ОДИН раз на старте приложения.
// Защищают от поломок когда у юзера остались данные от прошлой версии.

import { getItem, setItem } from './storage'
import { STORAGE_KEYS, EKP_CATALOG } from './constants'

const MIGRATION_VERSION_KEY = 'etrn_migration_v'
const CURRENT_VERSION = 3

// Возможные старые формы данных
type LegacyMcd = {
  status?: string
  number?: string | null
  principal?: { companyName?: string; inn?: string }
  trustedPerson?: string
  validUntil?: string | null
  powers?: Array<string | { code?: string; name?: string }>
  fileName?: string
  uploadedAt?: string
}

type LegacyUser = {
  id?: string
  phone?: string
  name?: string
  company?: string
  inn?: string
  role?: string              // старое поле
  email?: string
  kind?: string
  ogrn?: string
  onboardingCompleted?: boolean
  edoOperators?: string[]
  certificate?: unknown
}

function migrateMcd(legacy: LegacyMcd): LegacyMcd {
  // powers: string[] → McdPower[]
  if (Array.isArray(legacy.powers)) {
    legacy.powers = legacy.powers.map(p => {
      if (typeof p === 'string') {
        // Пытаемся угадать код по наименованию
        const entry = Object.entries(EKP_CATALOG).find(([, name]) =>
          name.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(name.toLowerCase().split(' ')[0].toLowerCase())
        )
        return entry
          ? { code: entry[0], name: entry[1] }
          : { code: 'LEGACY', name: p }
      }
      if (p && typeof p === 'object') {
        return {
          code: typeof p.code === 'string' ? p.code : 'LEGACY',
          name: typeof p.name === 'string' ? p.name : '(без названия)',
        }
      }
      return { code: 'LEGACY', name: '(неизвестно)' }
    })
  } else {
    legacy.powers = []
  }
  return legacy
}

function migrateUser(legacy: LegacyUser): LegacyUser {
  // Удаляем устаревшее поле role
  if ('role' in legacy) {
    delete legacy.role
  }
  // Добавляем недостающие обязательные поля с дефолтами
  if (!legacy.email) legacy.email = ''
  if (!legacy.kind) {
    // Пытаемся определить по длине ИНН
    if (legacy.inn?.length === 10) legacy.kind = 'ul'
    else if (legacy.inn?.length === 12) legacy.kind = 'fl'
    else legacy.kind = 'fl'
  }
  return legacy
}

export function runMigrations(): void {
  // Защита от SSR / environment без localStorage (на всякий случай)
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return

  const storedVersion = Number(localStorage.getItem(MIGRATION_VERSION_KEY)) || 0
  if (storedVersion >= CURRENT_VERSION) return

  try {
    // Migrate MCDs
    const mcds = getItem<LegacyMcd[]>(STORAGE_KEYS.MCD)
    if (Array.isArray(mcds)) {
      const migrated = mcds.map(migrateMcd)
      setItem(STORAGE_KEYS.MCD, migrated)
    }

    // Migrate User
    const user = getItem<LegacyUser>(STORAGE_KEYS.USER)
    if (user) {
      const migrated = migrateUser(user)
      setItem(STORAGE_KEYS.USER, migrated)
    }

    localStorage.setItem(MIGRATION_VERSION_KEY, String(CURRENT_VERSION))
    // eslint-disable-next-line no-console
    console.info('[etrn] Migrations applied to v' + CURRENT_VERSION)
  } catch (e) {
    // При любом сбое миграции лучше откатить ключевые данные, чем крашнуть UI
    console.error('[etrn] Migration failed, clearing potentially corrupt data:', e)
    localStorage.removeItem(STORAGE_KEYS.MCD)
    // user не трогаем — без него не зайдёт
    localStorage.setItem(MIGRATION_VERSION_KEY, String(CURRENT_VERSION))
  }
}
