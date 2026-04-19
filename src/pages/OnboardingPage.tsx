import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, User, Briefcase, Loader2, AlertCircle, Search } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import { getItem, setItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { UserProfile } from '../lib/constants'
import { cn } from '../lib/utils'
import { lookupByInn, validateInn } from '../lib/mockDadata'
import type { DadataResult } from '../lib/mockDadata'

// Один короткий экран: ИНН → ДаДата → email → Dashboard

export default function OnboardingPage() {
  const navigate = useNavigate()
  const existingUser = getItem<UserProfile>(STORAGE_KEYS.USER)

  const [inn, setInn] = useState(existingUser?.inn ?? '')
  const [email, setEmail] = useState(existingUser?.email ?? '')
  const [dadata, setDadata] = useState<DadataResult | null>(null)
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInnChange = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 12)
    setInn(clean)
    setDadata(null)
    setLookupError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (clean.length === 10 || clean.length === 12) {
      setLooking(true)
      debounceRef.current = setTimeout(async () => {
        const result = await lookupByInn(clean)
        setLooking(false)
        if (!result) {
          setLookupError('По этому ИНН ничего не найдено в ЕГРЮЛ/ЕГРИП')
        } else if (result.status && result.status !== 'active') {
          setLookupError('Запись не активна в ЕГРЮЛ')
          setDadata(result)
        } else {
          setDadata(result)
        }
      }, 500)
    }
  }

  // Cleanup
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Автолукап на маунте, если ИНН уже подставлен
  useEffect(() => {
    if ((inn.length === 10 || inn.length === 12) && !dadata && !looking) {
      setLooking(true)
      lookupByInn(inn).then(result => {
        setLooking(false)
        if (!result) setLookupError('По этому ИНН ничего не найдено в ЕГРЮЛ/ЕГРИП')
        else setDadata(result)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateEmail = (e: string): string | null => {
    if (!e.trim()) return 'Email обязателен'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Некорректный email'
    return null
  }

  const handleSubmit = () => {
    const innErr = validateInn(inn)
    if (innErr) { setLookupError(innErr); return }
    if (!dadata) { setLookupError('Дождитесь проверки ИНН'); return }
    const emErr = validateEmail(email)
    if (emErr) { setEmailError(emErr); return }

    setSubmitting(true)
    setTimeout(() => {
      const base: UserProfile = existingUser ?? {
        id: 'user-' + Math.random().toString(36).slice(2, 10),
        phone: '',
        name: '',
        email: '',
        inn: '',
        kind: 'fl',
        company: '',
        onboardingCompleted: false,
      }
      // Извлекаем ЧИСТОЕ ФИО для name:
      // - ЮЛ: управляющий (уже ФИО)
      // - ИП: из "Индивидуальный предприниматель ФИО" убираем префикс
      // - ФЛ: уже ФИО
      const cleanName = (() => {
        if (dadata.kind === 'ul') return dadata.management ?? ''
        if (dadata.kind === 'ip') {
          return dadata.name.replace(/^Индивидуальный предприниматель\s+/i, '').trim()
        }
        return dadata.name
      })()

      const user: UserProfile = {
        ...base,
        inn: dadata.inn,
        kind: dadata.kind,
        name: cleanName,
        // company — обязательно shortName (ООО «...»), никогда полное название
        company: dadata.shortName || dadata.name.slice(0, 60),
        ogrn: dadata.ogrn,
        email,
        onboardingCompleted: true,
      }
      setItem(STORAGE_KEYS.USER, user)
      navigate('/dashboard')
    }, 600)
  }

  const canSubmit = dadata && email.trim() && !looking && !submitting

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex-1 flex flex-col px-6 py-8 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-brand-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Завершите регистрацию</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Найдём вас в ЕГРЮЛ / ЕГРИП по ИНН</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* ИНН */}
          <div>
            <Input
              label="ИНН"
              value={inn}
              onChange={e => handleInnChange(e.target.value)}
              placeholder="10 цифр для компании или 12 — для ИП/физлица"
              inputMode="numeric"
              error={lookupError || undefined}
            />
            {looking && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Ищем в ЕГРЮЛ / ЕГРИП...</span>
              </div>
            )}
          </div>

          {/* Результат ДаДаты */}
          {dadata && !looking && (
            <Card className={cn(
              '!p-4',
              dadata.status === 'active' ? '!border-green-200 dark:!border-green-800' : '!border-red-200 dark:!border-red-800',
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  dadata.kind === 'ul' ? 'bg-brand-50 dark:bg-brand-900/30' :
                  dadata.kind === 'ip' ? 'bg-blue-50 dark:bg-blue-900/20' :
                  'bg-gray-50 dark:bg-gray-800/50',
                )}>
                  {dadata.kind === 'ul' ? (
                    <Building2 className="h-5 w-5 text-brand-600" />
                  ) : dadata.kind === 'ip' ? (
                    <Briefcase className="h-5 w-5 text-blue-600" />
                  ) : (
                    <User className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {dadata.kind === 'ul' ? 'Юридическое лицо' : dadata.kind === 'ip' ? 'Индивидуальный предприниматель' : 'Физическое лицо'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-2">
                    {dadata.name}
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex gap-2">
                      <span className="text-gray-400 dark:text-gray-500 shrink-0">ИНН</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{dadata.inn}</span>
                    </div>
                    {dadata.ogrn && (
                      <div className="flex gap-2">
                        <span className="text-gray-400 dark:text-gray-500 shrink-0">{dadata.kind === 'ip' ? 'ОГРНИП' : 'ОГРН'}</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{dadata.ogrn}</span>
                      </div>
                    )}
                    {dadata.management && (
                      <div className="flex gap-2">
                        <span className="text-gray-400 dark:text-gray-500 shrink-0">Руководитель</span>
                        <span className="text-gray-700 dark:text-gray-300">{dadata.management}</span>
                      </div>
                    )}
                    {dadata.address && (
                      <div className="flex gap-2">
                        <span className="text-gray-400 dark:text-gray-500 shrink-0">Адрес</span>
                        <span className="text-gray-700 dark:text-gray-300">{dadata.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {dadata === null && !looking && inn.length > 0 && inn.length < 10 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <Search className="h-3 w-3" />
              <span>Введите полный ИНН для поиска</span>
            </div>
          )}

          {/* Email */}
          {dadata && (
            <div>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError('') }}
                placeholder="ivan@example.ru"
                error={emailError}
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Для уведомлений и восстановления доступа. Может отличаться от корпоративной почты.
              </p>
            </div>
          )}
        </div>

        {/* Сабмит */}
        <div className="mt-8">
          <Button fullWidth size="lg" loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
            Продолжить
          </Button>

          {dadata && (
            <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 text-xs text-brand-800 dark:text-brand-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Для подписания документов в дальнейшем потребуется УКЭП и МЧД — это можно настроить после входа в приложение.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
