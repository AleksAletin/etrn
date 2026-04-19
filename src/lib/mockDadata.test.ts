import { describe, it, expect } from 'vitest'
import { lookupByInn, validateInn } from './mockDadata'

describe('mockDadata', () => {
  describe('validateInn', () => {
    it('принимает ИНН из 10 цифр (юрлицо)', () => {
      expect(validateInn('7712345678')).toBeNull()
    })

    it('принимает ИНН из 12 цифр (ФЛ/ИП)', () => {
      expect(validateInn('771234567890')).toBeNull()
    })

    it('отклоняет пустой ИНН', () => {
      expect(validateInn('')).toBeTruthy()
    })

    it('отклоняет ИНН неправильной длины', () => {
      expect(validateInn('123')).toBeTruthy()
      expect(validateInn('12345678901')).toBeTruthy()
    })

    it('игнорирует не-цифры при проверке длины', () => {
      expect(validateInn('7712 345 678')).toBeNull()
    })
  })

  describe('lookupByInn', () => {
    it('возвращает данные для преднастроенного ИНН юрлица', async () => {
      const r = await lookupByInn('7712345678')
      expect(r).toBeTruthy()
      expect(r?.kind).toBe('ul')
      expect(r?.inn).toBe('7712345678')
      expect(r?.shortName).toContain('ТрансЛогистик')
    })

    it('возвращает данные для преднастроенного ИП', async () => {
      const r = await lookupByInn('771234567890')
      expect(r?.kind).toBe('ip')
      expect(r?.ogrn).toBeTruthy()
    })

    it('возвращает данные для преднастроенного ФЛ', async () => {
      const r = await lookupByInn('123456789012')
      expect(r?.kind).toBe('fl')
    })

    it('генерирует правдоподобные данные для неизвестного ИНН', async () => {
      const r = await lookupByInn('9999888877')
      expect(r).toBeTruthy()
      expect(r?.kind).toBe('ul')
      expect(r?.name).toContain('Общество')
    })

    it('возвращает null для невалидной длины', async () => {
      expect(await lookupByInn('123')).toBeNull()
    })
  })
})
