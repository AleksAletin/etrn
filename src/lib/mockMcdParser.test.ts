import { describe, it, expect } from 'vitest'
import { parseMcdFile, findMcdForPower, parsedToMcd } from './mockMcdParser'
import type { Mcd } from './constants'

describe('mockMcdParser', () => {
  describe('parseMcdFile', () => {
    it('возвращает стабильный результат для одного и того же файла', () => {
      const a = parseMcdFile('test.xml', 1234)
      const b = parseMcdFile('test.xml', 1234)
      expect(a.number).toBe(b.number)
      expect(a.principal.inn).toBe(b.principal.inn)
      expect(a.powers).toEqual(b.powers)
    })

    it('возвращает разный результат для разных файлов', () => {
      const a = parseMcdFile('file-a.xml', 111)
      const b = parseMcdFile('file-b.xml', 999)
      // Хотя бы одно из ключевых полей отличается
      const same = a.number === b.number && a.principal.inn === b.principal.inn
      expect(same).toBe(false)
    })

    it('заполняет обязательные поля', () => {
      const p = parseMcdFile('mcd.xml', 42)
      expect(p.number).toMatch(/^МЧД-/)
      expect(p.principal.companyName).toBeTruthy()
      expect(p.principal.inn).toMatch(/^\d{10}$/)
      expect(p.trustedPerson).toBeTruthy()
      expect(p.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(p.powers.length).toBeGreaterThan(0)
      p.powers.forEach(pw => {
        expect(pw.code).toBeTruthy()
        expect(pw.name).toBeTruthy()
      })
    })
  })

  describe('parsedToMcd', () => {
    it('преобразует ParsedMcd в полноценную Mcd со статусом linked', () => {
      const parsed = parseMcdFile('mcd.xml', 42)
      const mcd = parsedToMcd(parsed)
      expect(mcd.status).toBe('linked')
      expect(mcd.number).toBe(parsed.number)
      expect(mcd.uploadedAt).toBeTruthy()
    })
  })

  describe('findMcdForPower', () => {
    const makeMcd = (opts: Partial<Mcd>): Mcd => ({
      status: 'linked',
      number: 'МЧД-TEST',
      principal: { companyName: 'ООО Тест', inn: '7712345678' },
      trustedPerson: 'Иванов И. И.',
      validUntil: '2099-01-01',
      powers: [{ code: '02.08', name: 'ЭТрН' }],
      ...opts,
    })

    it('находит МЧД с нужным полномочием от нужного доверителя', () => {
      const mcds = [makeMcd({})]
      expect(findMcdForPower(mcds, '02.08', '7712345678')).toBeTruthy()
    })

    it('не находит МЧД если статус не linked', () => {
      const mcds = [makeMcd({ status: 'expired' })]
      expect(findMcdForPower(mcds, '02.08', '7712345678')).toBeNull()
    })

    it('не находит МЧД если истёк срок', () => {
      const mcds = [makeMcd({ validUntil: '2000-01-01' })]
      expect(findMcdForPower(mcds, '02.08', '7712345678')).toBeNull()
    })

    it('не находит МЧД если другой ИНН доверителя', () => {
      const mcds = [makeMcd({})]
      expect(findMcdForPower(mcds, '02.08', '7701234567')).toBeNull()
    })

    it('не находит МЧД если нет нужного полномочия', () => {
      const mcds = [makeMcd({ powers: [{ code: '01.01', name: 'УПД' }] })]
      expect(findMcdForPower(mcds, '02.08', '7712345678')).toBeNull()
    })

    it('работает с legacy-форматом powers (строки)', () => {
      const legacyMcd = {
        ...makeMcd({}),
        powers: ['Подписание ЭТрН'] as unknown as Mcd['powers'],
      }
      // Legacy МЧД не должна проходить проверку по коду (у неё нет кода)
      expect(findMcdForPower([legacyMcd], '02.08', '7712345678')).toBeNull()
    })

    it('находит конкретную МЧД из нескольких по соответствию ИНН', () => {
      const mcds = [
        makeMcd({ number: 'МЧД-A', principal: { companyName: 'A', inn: '1111111111' } }),
        makeMcd({ number: 'МЧД-B', principal: { companyName: 'B', inn: '7712345678' } }),
      ]
      const found = findMcdForPower(mcds, '02.08', '7712345678')
      expect(found?.number).toBe('МЧД-B')
    })
  })
})
