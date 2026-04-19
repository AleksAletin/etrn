// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from './migrations'
import { STORAGE_KEYS } from './constants'

describe('runMigrations', () => {
  beforeEach(() => {
    try { localStorage?.clear?.() } catch {}
  })

  it('мигрирует legacy Mcd.powers из string[] в McdPower[]', () => {
    localStorage.setItem(
      STORAGE_KEYS.MCD,
      JSON.stringify([
        {
          status: 'linked',
          number: 'МЧД-123',
          principal: { companyName: 'Тест', inn: '7712345678' },
          trustedPerson: 'Иванов',
          validUntil: '2027-01-01',
          powers: ['Подписание ЭТрН', 'Подписание ЭПД'],
        },
      ]),
    )

    runMigrations()

    const mcds = JSON.parse(localStorage.getItem(STORAGE_KEYS.MCD)!)
    expect(mcds[0].powers).toHaveLength(2)
    mcds[0].powers.forEach((p: unknown) => {
      expect(typeof p).toBe('object')
      expect(p).toHaveProperty('code')
      expect(p).toHaveProperty('name')
    })
  })

  it('удаляет устаревшее поле role у user', () => {
    localStorage.setItem(
      STORAGE_KEYS.USER,
      JSON.stringify({
        id: 'u', phone: '7', name: 'X', company: 'Y', inn: '7712345678',
        role: 'driver', onboardingCompleted: true,
      }),
    )

    runMigrations()

    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)
    expect(user.role).toBeUndefined()
    expect(user.kind).toBeTruthy() // kind назначается по длине ИНН
  })

  it('добавляет kind=ul для ИНН из 10 цифр', () => {
    localStorage.setItem(
      STORAGE_KEYS.USER,
      JSON.stringify({ id: 'u', phone: '7', name: 'X', inn: '7712345678', onboardingCompleted: true }),
    )

    runMigrations()

    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)
    expect(user.kind).toBe('ul')
  })

  it('добавляет kind=fl для ИНН из 12 цифр', () => {
    localStorage.setItem(
      STORAGE_KEYS.USER,
      JSON.stringify({ id: 'u', phone: '7', name: 'X', inn: '123456789012', onboardingCompleted: true }),
    )

    runMigrations()

    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)
    expect(user.kind).toBe('fl')
  })

  it('не запускается повторно если версия уже накачена', () => {
    localStorage.setItem('etrn_migration_v', '999')
    localStorage.setItem(
      STORAGE_KEYS.USER,
      JSON.stringify({ id: 'u', role: 'driver', inn: '7712345678' }),
    )

    runMigrations()

    // role сохранился — миграция не запускалась
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)
    expect(user.role).toBe('driver')
  })

  it('не падает если MCD или USER отсутствуют в localStorage', () => {
    expect(() => runMigrations()).not.toThrow()
  })
})
