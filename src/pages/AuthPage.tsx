import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, ShieldCheck } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { setAuth, setItem, getItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import { seedDocuments, seedTrips } from '../data/mockDocuments'
import { defaultUser, defaultSubscription, defaultMcds } from '../data/mockUser'
import { seedActivity } from '../data/mockHistory'
import { seedNotifications } from '../data/mockNotifications'

const DEMO_CODE = '1234'
const MAX_CODE_ATTEMPTS = 5
const MAX_RESEND_ATTEMPTS = 3
const RESEND_COOLDOWNS = [60, 120, 300] // escalating: 1min, 2min, 5min

export default function AuthPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('+7 ')
  const [code, setCode] = useState('')
  const [timer, setTimer] = useState(0)
  const [loading, setLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeAttempts, setCodeAttempts] = useState(0)
  const [resendCount, setResendCount] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockTimer, setLockTimer] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Countdown timer for resend
  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [timer])

  // Lockout timer
  useEffect(() => {
    if (lockTimer > 0) {
      const t = setTimeout(() => setLockTimer(lockTimer - 1), 1000)
      return () => clearTimeout(t)
    } else if (locked && lockTimer === 0) {
      setLocked(false)
    }
  }, [lockTimer, locked])

  // Format phone as +7 (XXX) XXX-XX-XX
  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '')
    const d = digits.startsWith('7') ? digits.slice(1) : digits.startsWith('8') ? digits.slice(1) : digits
    let formatted = '+7 '
    if (d.length > 0) formatted += '(' + d.slice(0, 3)
    if (d.length >= 3) formatted += ') ' + d.slice(3, 6)
    if (d.length >= 6) formatted += '-' + d.slice(6, 8)
    if (d.length >= 8) formatted += '-' + d.slice(8, 10)
    return formatted
  }

  const getCleanDigits = (): string => {
    return phone.replace(/\D/g, '')
  }

  const validatePhone = (): boolean => {
    const digits = getCleanDigits()
    if (digits.length < 11) {
      setPhoneError('Введите полный номер телефона')
      return false
    }
    if (digits.length > 11) {
      setPhoneError('Номер слишком длинный')
      return false
    }
    // Basic RU mobile validation: starts with 79
    if (!digits.startsWith('79')) {
      setPhoneError('Введите мобильный номер (начинается с +7 9...)')
      return false
    }
    setPhoneError('')
    return true
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Don't allow removing the +7 prefix
    if (raw.length < 3) {
      setPhone('+7 ')
      return
    }
    const formatted = formatPhone(raw)
    // Limit to 10 digits after +7
    const digits = formatted.replace(/\D/g, '')
    if (digits.length > 11) return
    setPhone(formatted)
    if (phoneError) setPhoneError('')
  }

  const handleSendCode = () => {
    if (!validatePhone()) return
    setLoading(true)
    setCodeError('')
    setCode('')
    setCodeAttempts(0)
    setTimeout(() => {
      setLoading(false)
      setPhase('code')
      setTimer(RESEND_COOLDOWNS[Math.min(resendCount, RESEND_COOLDOWNS.length - 1)])
      setTimeout(() => codeInputRef.current?.focus(), 100)
    }, 800)
  }

  const handleResend = () => {
    if (timer > 0 || resendCount >= MAX_RESEND_ATTEMPTS) return
    const nextResend = resendCount + 1
    setResendCount(nextResend)
    setCode('')
    setCodeError('')
    setCodeAttempts(0)

    if (nextResend >= MAX_RESEND_ATTEMPTS) {
      // Lock after max resends
      setLocked(true)
      setLockTimer(600) // 10 min lockout
      return
    }

    setTimer(RESEND_COOLDOWNS[Math.min(nextResend, RESEND_COOLDOWNS.length - 1)])
  }

  const handleVerify = () => {
    if (code.length < 4) {
      setCodeError('Введите 4-значный код')
      return
    }
    if (locked) return

    // Validate code (demo: accept "1234" or any 4+ digit code)
    if (code !== DEMO_CODE && code.length >= 4) {
      const attempts = codeAttempts + 1
      setCodeAttempts(attempts)

      if (attempts >= MAX_CODE_ATTEMPTS) {
        setLocked(true)
        setLockTimer(300) // 5 min lockout
        setCodeError(`Слишком много попыток. Повторите через 5 минут.`)
        return
      }

      const remaining = MAX_CODE_ATTEMPTS - attempts
      setCodeError(`Неверный код. ${remaining === 1 ? 'Осталась 1 попытка' : `Осталось ${remaining} попыток`}`)
      setCode('')
      return
    }

    setLoading(true)
    setTimeout(() => {
      const digits = getCleanDigits()
      setAuth({ isAuthenticated: true, phone: digits })
      if (!getItem(STORAGE_KEYS.DOCUMENTS)) {
        setItem(STORAGE_KEYS.DOCUMENTS, seedDocuments())
        setItem(STORAGE_KEYS.ACTIVITY, seedActivity())
        setItem(STORAGE_KEYS.SUBSCRIPTION, defaultSubscription)
        setItem(STORAGE_KEYS.MCD, defaultMcds)
        setItem(STORAGE_KEYS.NOTIFICATIONS, seedNotifications())
        setItem(STORAGE_KEYS.TRIPS, seedTrips())
      }
      const user = getItem<{ onboardingCompleted?: boolean }>(STORAGE_KEYS.USER)
      if (!user) {
        setItem(STORAGE_KEYS.USER, { ...defaultUser, phone: digits, onboardingCompleted: false })
      }
      const hasPin = getItem(STORAGE_KEYS.PIN)
      if (!hasPin) {
        navigate('/pin-setup')
      } else if (user && !user.onboardingCompleted) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
      setLoading(false)
    }, 1000)
  }

  const handleChangePhone = () => {
    setPhase('phone')
    setCode('')
    setCodeError('')
    setCodeAttempts(0)
  }

  const formatTime = (s: number): string => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}с`
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <header className="flex items-center h-14 px-4">
        <button
          onClick={() => phase === 'code' ? handleChangePhone() : navigate('/')}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Назад"
        >
          <ChevronLeft className="h-6 w-6 text-gray-700" />
        </button>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-8">
        {phase === 'phone' ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Вход</h1>
            <p className="text-base text-gray-500 mb-8">Введите номер телефона для получения SMS-кода</p>
            <Input
              label="Телефон"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+7 (999) 123-45-67"
              error={phoneError}
            />
            <div className="mt-6">
              <Button fullWidth size="lg" loading={loading} onClick={handleSendCode}>
                Получить код
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-6 text-center leading-relaxed">
              Нажимая «Получить код», вы соглашаетесь с условиями использования сервиса
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Введите код</h1>
            <p className="text-base text-gray-500 mb-2">
              Отправили SMS на <span className="font-medium text-gray-700">{phone}</span>
            </p>
            <button onClick={handleChangePhone} className="text-sm text-brand-600 font-medium mb-6">
              Изменить номер
            </button>

            <Input
              ref={codeInputRef}
              label="Код из SMS"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(v)
                if (codeError) setCodeError('')
              }}
              placeholder="1234"
              error={codeError}
              autoFocus
            />

            {/* Lockout warning */}
            {locked && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-red-50 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600">
                  {lockTimer > 0
                    ? `Вход заблокирован. Повторите через ${formatTime(lockTimer)}`
                    : 'Блокировка снята. Попробуйте снова.'
                  }
                </p>
              </div>
            )}

            <div className="mt-6">
              <Button fullWidth size="lg" loading={loading} disabled={locked && lockTimer > 0} onClick={handleVerify}>
                Подтвердить
              </Button>
            </div>

            {/* Resend section */}
            <div className="mt-4 text-center">
              {resendCount >= MAX_RESEND_ATTEMPTS ? (
                <p className="text-sm text-red-500">Превышен лимит отправок. Попробуйте позже.</p>
              ) : timer > 0 ? (
                <p className="text-sm text-gray-400">Отправить повторно через {formatTime(timer)}</p>
              ) : (
                <button onClick={handleResend} className="text-sm text-brand-600 font-medium min-h-[44px]">
                  Отправить код повторно
                </button>
              )}
            </div>

            {/* Attempt counter */}
            {codeAttempts > 0 && !locked && (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {Array.from({ length: MAX_CODE_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${i < codeAttempts ? 'bg-red-400' : 'bg-gray-200'}`}
                  />
                ))}
              </div>
            )}

            {/* Demo hint */}
            <div className="mt-8 flex items-center gap-2 px-3 py-2.5 bg-brand-50 rounded-xl">
              <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0" />
              <p className="text-xs text-brand-700">Демо: введите код <span className="font-bold">1234</span></p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
