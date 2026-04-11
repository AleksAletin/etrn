import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, CheckCircle, Loader2, KeyRound, QrCode, FileText, Shield, Smartphone, Download } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { getItem, setItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { UserProfile, Certificate } from '../lib/constants'
import { generateId, cn } from '../lib/utils'
import { removeItem } from '../lib/storage'
import { maskSnils, maskPhone, maskInn, maskOgrn, maskRegion, unmaskDigits, validateEmail, validateSnils, validatePhone, validateInn, validateRequired } from '../lib/masks'

type CertStep = 'type' | 'anketa' | 'submit' | 'qr' | 'waiting' | 'review' | 'done'

interface AnketaData {
  surname: string
  name: string
  patronymic: string
  snils: string
  innfl: string
  email: string
  phone: string
  inn: string
  ogrn: string
  companyShort: string
  companyFull: string
  position: string
  region: string
  city: string
  clientProfileId: '1' | '2' | '3'
}

const CERT_STATUSES = [
  { key: 'creating', label: 'Создание заявки на сертификат...' },
  { key: 'smev', label: 'Проверка в СМЭВ ФНС...' },
  { key: 'application', label: 'Формирование заявления ФНС...' },
  { key: 'sign_wait', label: 'Ожидание подписи в КриптоКлюч...' },
  { key: 'cert_issue', label: 'Выпуск сертификата в УЦ...' },
  { key: 'review', label: 'Ознакомление с составом сертификата...' },
  { key: 'install', label: 'Установка сертификата на устройство...' },
]

export default function CertIssuancePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromOnboarding = searchParams.get('from') === 'onboarding'
  const isReissue = searchParams.get('reissue') === 'true'

  const user = getItem<UserProfile>(STORAGE_KEYS.USER)
  const savedCertStep = getItem<CertStep>(STORAGE_KEYS.CERT_STEP)
  // Restore step — but skip transient steps (submit, waiting)
  const initialCertStep: CertStep = savedCertStep && !['submit', 'waiting'].includes(savedCertStep) ? savedCertStep : 'type'
  const [step, setStepRaw] = useState<CertStep>(initialCertStep)

  const setStep = (s: CertStep) => {
    setStepRaw(s)
    // Persist meaningful steps for CJM
    if (!['submit', 'waiting'].includes(s)) {
      setItem(STORAGE_KEYS.CERT_STEP, s)
    }
  }
  const [clientProfile, setClientProfile] = useState<'1' | '2' | '3'>('1')
  const [anketa, setAnketa] = useState<AnketaData>({
    surname: user?.name?.split(' ')[0] || '',
    name: user?.name?.split(' ')[1] || '',
    patronymic: user?.name?.split(' ')[2] || '',
    snils: '',
    innfl: '',
    email: '',
    phone: user?.phone ? maskPhone(user.phone) : '+7',
    inn: user?.inn || '',
    ogrn: '',
    companyShort: user?.company || '',
    companyFull: '',
    position: '',
    region: '77',
    city: 'г. Москва',
    clientProfileId: '1',
  })
  const [, setSubmitting] = useState(false)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [waitingStatusIdx, setWaitingStatusIdx] = useState(0)
  const [, setCertIssued] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof AnketaData, string>>>({})
  const waitingTimerRef = useRef<number | null>(null)

  const updateAnketa = useCallback((key: keyof AnketaData, value: string) => {
    // Apply masks
    let masked = value
    switch (key) {
      case 'snils': masked = maskSnils(value); break
      case 'phone': masked = maskPhone(value); break
      case 'inn': masked = maskInn(value, 10); break
      case 'innfl': masked = maskInn(value, 12); break
      case 'ogrn': masked = maskOgrn(value); break
      case 'region': masked = maskRegion(value); break
    }
    setAnketa(prev => ({ ...prev, [key]: masked }))
    // Clear error on edit
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }, [errors])

  // Auto-fill company fields based on clientProfileId
  useEffect(() => {
    setAnketa(prev => ({ ...prev, clientProfileId: clientProfile }))
  }, [clientProfile])

  const handleTypeSelect = (type: 'new' | 'existing') => {
    if (type === 'existing') {
      // Skip to mock "existing cert" flow
      handleQuickIssue()
    } else {
      setStep('anketa')
    }
  }

  const handleQuickIssue = () => {
    setStep('submit')
    setSubmitting(true)
    setTimeout(() => {
      setApplicationId(`${700000 + Math.floor(Math.random() * 99999)}`)
      setSubmitting(false)
      setStep('waiting')
      startWaitingSequence(3) // fast — skip to sign_wait
    }, 1500)
  }

  const handleAnketaSubmit = () => {
    const newErrors: Partial<Record<keyof AnketaData, string>> = {}

    // Required text fields
    const surnameErr = validateRequired(anketa.surname)
    if (surnameErr) newErrors.surname = surnameErr
    const nameErr = validateRequired(anketa.name)
    if (nameErr) newErrors.name = nameErr

    // SNILS
    const snilsErr = validateSnils(anketa.snils)
    if (snilsErr) newErrors.snils = snilsErr

    // Email
    const emailErr = validateEmail(anketa.email)
    if (emailErr) newErrors.email = emailErr

    // Phone
    const phoneErr = validatePhone(anketa.phone)
    if (phoneErr) newErrors.phone = phoneErr

    // INN org (required for ЮЛ/ИП)
    if (clientProfile !== '3') {
      const innErr = validateInn(anketa.inn, 10)
      if (innErr) newErrors.inn = innErr
    }

    // INN FL (optional but validate length if filled)
    if (anketa.innfl && clientProfile !== '2') {
      const innflDigits = unmaskDigits(anketa.innfl)
      if (innflDigits.length > 0 && innflDigits.length !== 12) {
        newErrors.innfl = 'ИНН должен содержать 12 цифр'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    setStep('submit')
    setSubmitting(true)

    // Simulate Шаг 1: Создание заявки
    setTimeout(() => {
      const appId = `${700000 + Math.floor(Math.random() * 99999)}`
      setApplicationId(appId)
      setSubmitting(false)
      setStep('qr')
    }, 2000)
  }

  const handleQrScanned = () => {
    setStep('waiting')
    startWaitingSequence(0)
  }

  const handleSaveQr = () => {
    const canvas = document.createElement('canvas')
    const size = 400
    canvas.width = size
    canvas.height = size + 60
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw mock QR pattern
    const cellSize = 10
    const offset = 40
    const gridSize = Math.floor((size - offset * 2) / cellSize)
    ctx.fillStyle = '#1a1a1a'

    // Fixed pattern corners (finder patterns)
    const drawFinder = (x: number, y: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            ctx.fillRect(offset + (x + c) * cellSize, offset + (y + r) * cellSize, cellSize, cellSize)
          }
        }
      }
    }
    drawFinder(0, 0)
    drawFinder(gridSize - 7, 0)
    drawFinder(0, gridSize - 7)

    // Random data modules
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c > gridSize - 9) || (r > gridSize - 9 && c < 8)) continue
        if (Math.random() > 0.55) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize)
        }
      }
    }

    // Label
    ctx.fillStyle = '#666666'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`КриптоКлюч · Заявка #${applicationId}`, size / 2, size + 40)

    // Download
    const link = document.createElement('a')
    link.download = `cryptokey-qr-${applicationId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const startWaitingSequence = (startIdx: number) => {
    setWaitingStatusIdx(startIdx)
    let idx = startIdx

    const advance = () => {
      idx++
      if (idx < CERT_STATUSES.length) {
        setWaitingStatusIdx(idx)
        const delay = idx === 3 ? 4000 : idx === 4 ? 3000 : 2000
        waitingTimerRef.current = window.setTimeout(advance, delay)
      } else {
        // Done!
        setStep('review')
      }
    }
    const firstDelay = startIdx === 0 ? 2500 : 3000
    waitingTimerRef.current = window.setTimeout(advance, firstDelay)
  }

  useEffect(() => {
    return () => {
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    }
  }, [])

  const handleReviewConfirm = () => {
    // Save certificate
    const cert: Certificate = {
      id: generateId(),
      owner: `${anketa.surname} ${anketa.name} ${anketa.patronymic}`.trim() || user?.name || 'Пользователь',
      issuer: 'ФНС России (КриптоКлюч)',
      serialNumber: `${Math.random().toString(16).slice(2, 10).toUpperCase()}${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      provider: 'cryptopro',
    }
    setItem(STORAGE_KEYS.CERTIFICATE, cert)
    if (user) setItem(STORAGE_KEYS.USER, { ...user, certificate: cert })
    setCertIssued(true)
    setStep('done')
  }

  const handleFinish = () => {
    removeItem(STORAGE_KEYS.CERT_STEP)
    if (fromOnboarding) {
      navigate('/onboarding?certDone=true', { replace: true })
    } else {
      navigate('/profile', { replace: true })
    }
  }

  const handleBack = () => {
    if (step === 'anketa') setStep('type')
    else if (step === 'qr') setStep('anketa')
    else if (fromOnboarding) navigate('/onboarding', { replace: true })
    else navigate('/profile', { replace: true })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <header className="flex items-center h-14 px-4 border-b border-gray-100 dark:border-gray-700/50">
        {(step === 'type' || step === 'anketa' || step === 'qr') && (
          <button onClick={handleBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          </button>
        )}
        <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-gray-100 pr-8">
          {isReissue ? 'Перевыпуск сертификата' : 'Выпуск сертификата УКЭП'}
        </h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 overflow-y-auto">
        {/* Step: Type selection */}
        {step === 'type' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-brand-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Электронная подпись</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">КриптоКлюч / КриптоПро DSS</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleTypeSelect('new')}
                className="w-full text-left p-4 rounded-2xl border border-gray-200 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                    <KeyRound className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Выпустить через КриптоКлюч</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Заполнение анкеты, проверка ФНС, QR-код, подпись в приложении</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleTypeSelect('existing')}
                className="w-full text-left p-4 rounded-2xl border border-gray-200 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                    <Shield className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">У меня есть сертификат</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Привязать существующий УКЭП / КЭП</p>
                  </div>
                </div>
              </button>

              {fromOnboarding && (
                <button
                  onClick={handleFinish}
                  className="w-full text-center p-3 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600"
                >
                  Пропустить
                </button>
              )}
            </div>
          </>
        )}

        {/* Step: Anketa — application form */}
        {step === 'anketa' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <FileText className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Анкета на выпуск УКЭП</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Данные для заявки в ФНС</p>
              </div>
            </div>

            {/* Client profile type selector */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Тип владельца</label>
              <div className="flex gap-2">
                {([['1', 'ЮЛ'], ['2', 'ИП'], ['3', 'ФЛ']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setClientProfile(val)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-medium transition-colors',
                      clientProfile === val
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Владелец сертификата</p>
              <Input label="Фамилия *" value={anketa.surname} onChange={e => updateAnketa('surname', e.target.value)} placeholder="Иванов" error={errors.surname} />
              <Input label="Имя *" value={anketa.name} onChange={e => updateAnketa('name', e.target.value)} placeholder="Сергей" error={errors.name} />
              <Input label="Отчество" value={anketa.patronymic} onChange={e => updateAnketa('patronymic', e.target.value)} placeholder="Петрович" />
              <Input label="СНИЛС *" value={anketa.snils} onChange={e => updateAnketa('snils', e.target.value)} placeholder="123-456-789 01" inputMode="numeric" error={errors.snils} />
              {clientProfile !== '2' && (
                <Input label="ИНН физ. лица" value={anketa.innfl} onChange={e => updateAnketa('innfl', e.target.value)} placeholder="772345678901" inputMode="numeric" error={errors.innfl} />
              )}
              <Input label="Email *" type="email" value={anketa.email} onChange={e => updateAnketa('email', e.target.value)} placeholder="user@company.ru" error={errors.email} />
              <Input label="Телефон *" value={anketa.phone} onChange={e => updateAnketa('phone', e.target.value)} placeholder="+7 (999) 123-45-67" inputMode="tel" error={errors.phone} />

              {clientProfile !== '3' && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">Организация</p>
                  <Input label="ИНН организации *" value={anketa.inn} onChange={e => updateAnketa('inn', e.target.value)} placeholder="7712345678" inputMode="numeric" error={errors.inn} />
                  <Input label="ОГРН" value={anketa.ogrn} onChange={e => updateAnketa('ogrn', e.target.value)} placeholder="1177879559" inputMode="numeric" />
                  <Input label="Краткое наименование" value={anketa.companyShort} onChange={e => updateAnketa('companyShort', e.target.value)} placeholder='ООО "Название"' />
                  <Input label="Должность" value={anketa.position} onChange={e => updateAnketa('position', e.target.value)} placeholder="Генеральный директор" />
                </>
              )}

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">Адрес</p>
              <Input label="Регион (код)" value={anketa.region} onChange={e => updateAnketa('region', e.target.value)} placeholder="77" inputMode="numeric" />
              <Input label="Город" value={anketa.city} onChange={e => updateAnketa('city', e.target.value)} placeholder="г. Москва" />
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700/50">
              <Button fullWidth onClick={handleAnketaSubmit}>
                Отправить заявку
              </Button>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-3">
                Данные будут отправлены в ФНС для проверки через СМЭВ
              </p>
            </div>
          </>
        )}

        {/* Step: Submitting */}
        {step === 'submit' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-16 w-16 text-brand-600 animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Создание заявки...</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Отправляем данные в удостоверяющий центр</p>
            <div className="mt-6 space-y-2 text-left w-full max-w-xs">
              <StatusLine label="Валидация данных анкеты" done />
              <StatusLine label="Создание заявки в УЦ" done={false} active />
              <StatusLine label="Получение application_id" done={false} />
            </div>
          </div>
        )}

        {/* Step: QR code */}
        {step === 'qr' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-green-600 font-medium mb-1">Заявка создана</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">ID: {applicationId}</p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Откройте КриптоКлюч</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Отсканируйте QR-код в приложении КриптоКлюч для подписания заявления
            </p>

            {/* Mock QR code */}
            <div className="w-56 h-56 bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <div className="text-center">
                <QrCode className="h-32 w-32 text-gray-800 dark:text-gray-200 mx-auto" />
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">QR для КриптоКлюч</p>
              </div>
            </div>

            <div className="space-y-3 w-full max-w-xs">
              <Button fullWidth onClick={handleQrScanned}>
                <Smartphone className="h-4 w-4" />
                Подписал в КриптоКлюч
              </Button>
              <Button fullWidth variant="secondary" onClick={handleSaveQr}>
                <Download className="h-4 w-4" />
                Сохранить QR-код
              </Button>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Нажмите после подписания заявления в приложении КриптоКлюч
              </p>
            </div>
          </div>
        )}

        {/* Step: Waiting — status polling */}
        {step === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="h-14 w-14 text-brand-600 animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">Выпуск сертификата</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 text-center">Пожалуйста, подождите — это может занять несколько минут</p>

            <div className="space-y-3 w-full max-w-sm">
              {CERT_STATUSES.map((s, i) => (
                <StatusLine
                  key={s.key}
                  label={s.label}
                  done={i < waitingStatusIdx}
                  active={i === waitingStatusIdx}
                />
              ))}
            </div>

            {applicationId && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">Заявка #{applicationId}</p>
            )}
          </div>
        )}

        {/* Step: Review — ознакомление с составом сертификата */}
        {step === 'review' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Состав сертификата</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Проверьте данные перед установкой</p>
              </div>
            </div>

            <Card className="!p-4 space-y-3">
              <CertField label="Владелец (CN)" value={`${anketa.surname} ${anketa.name} ${anketa.patronymic}`.trim()} />
              <CertField label="СНИЛС" value={anketa.snils || '—'} />
              {anketa.innfl && <CertField label="ИНН ФЛ" value={anketa.innfl} />}
              {anketa.inn && clientProfile !== '3' && <CertField label="ИНН ЮЛ" value={anketa.inn} />}
              {anketa.companyShort && <CertField label="Организация (O)" value={anketa.companyShort} />}
              {anketa.position && <CertField label="Должность" value={anketa.position} />}
              <CertField label="Email" value={anketa.email || '—'} />
              <CertField label="Удостоверяющий центр" value="ФНС России" />
              <CertField label="Провайдер" value="КриптоПро CSP (КриптоКлюч)" />
              <CertField label="Тип" value="УКЭП (квалифицированная)" />
              <CertField label="Алгоритм" value="ГОСТ Р 34.10-2012, 256 бит" />
              <CertField label="Срок действия" value="1 год" />
            </Card>

            <div className="mt-6 space-y-3">
              <Button fullWidth onClick={handleReviewConfirm}>
                Подтвердить и установить
              </Button>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Нажимая «Подтвердить», вы соглашаетесь с составом сертификата ЭП
              </p>
            </div>
          </>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-6 scale-in">
              <KeyRound className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Сертификат выпущен!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">УКЭП установлен на устройство и готов к использованию</p>

            <Card className="!p-4 w-full max-w-sm text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Владелец</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">{`${anketa.surname} ${anketa.name}`.trim()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">УЦ</span>
                <span className="font-medium">ФНС России</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Провайдер</span>
                <span className="font-medium">КриптоКлюч</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Тип</span>
                <Badge variant="info">УКЭП</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Статус</span>
                <Badge variant="success">Действителен</Badge>
              </div>
            </Card>

            <div className="mt-8 w-full max-w-sm">
              <Button fullWidth size="lg" onClick={handleFinish}>
                {fromOnboarding ? 'Далее' : 'Готово'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusLine({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
      ) : active ? (
        <Loader2 className="h-5 w-5 text-brand-600 animate-spin shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" />
      )}
      <span className={cn(
        'text-sm',
        done ? 'text-green-700' : active ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500',
      )}>
        {label}
      </span>
    </div>
  )
}

function CertField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 text-right">{value}</span>
    </div>
  )
}
