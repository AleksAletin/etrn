import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Fingerprint, ChevronLeft } from 'lucide-react'
import { getItem, setAuth } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { UserProfile } from '../lib/constants'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

export default function PinLoginPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const savedPin = getItem<string>(STORAGE_KEYS.PIN)
  const biometricsEnabled = getItem<boolean>(STORAGE_KEYS.BIOMETRICS) ?? false
  const user = getItem<UserProfile>(STORAGE_KEYS.USER)

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [biometricPrompt, setBiometricPrompt] = useState(biometricsEnabled)
  const inputRef = useRef<HTMLInputElement>(null)

  const pinLength = savedPin?.length ?? 4

  useEffect(() => {
    if (!biometricPrompt) {
      inputRef.current?.focus()
    }
  }, [biometricPrompt])

  // Auto-trigger biometric prompt
  useEffect(() => {
    if (biometricsEnabled && biometricPrompt) {
      // Simulate biometric check after a short delay
      const timer = setTimeout(() => {
        handleBiometricAuth()
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleSuccess = () => {
    setAuth({ isAuthenticated: true, phone: user?.phone ?? '' })
    navigate('/dashboard', { replace: true })
  }

  const handleDigit = (digit: string) => {
    if (pin.length >= pinLength) return
    const next = pin + digit
    setPin(next)
    setError('')

    if (next.length === pinLength) {
      setTimeout(() => {
        if (next === savedPin) {
          handleSuccess()
        } else {
          const newAttempts = attempts + 1
          setAttempts(newAttempts)
          setPin('')
          if (newAttempts >= 5) {
            setError('Слишком много попыток. Войдите по номеру телефона.')
          } else {
            setError(`Неверный ПИН-код (${5 - newAttempts} попыток)`)
          }
        }
      }, 200)
    }
  }

  const handleDelete = () => {
    setPin(pin.slice(0, -1))
    setError('')
  }

  const handleBiometricAuth = () => {
    // Simulate biometric authentication
    setBiometricPrompt(false)
    toast('Биометрия подтверждена', 'success')
    setTimeout(() => handleSuccess(), 300)
  }

  const handleSwitchToPhone = () => {
    navigate('/auth', { replace: true })
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || '?'

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <header className="flex items-center h-14 px-4">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Biometric prompt */}
        {biometricPrompt && biometricsEnabled ? (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center mb-4 mx-auto">
              <span className="text-2xl font-bold text-brand-700">{initials}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{user?.name}</p>

            <button
              onClick={handleBiometricAuth}
              className="w-20 h-20 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-4 hover:bg-brand-100 active:bg-brand-200 transition-colors"
            >
              <Fingerprint className="h-10 w-10 text-brand-600 animate-pulse" />
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Приложите палец или посмотрите в камеру</p>

            <button
              onClick={() => setBiometricPrompt(false)}
              className="text-sm text-brand-600 font-medium"
            >
              Ввести ПИН-код
            </button>
          </div>
        ) : (
          /* PIN entry */
          <>
            <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-4">
              <span className="text-xl font-bold text-brand-700">{initials}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{user?.name}</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-8">Введите ПИН-код</h1>

            <PinDots length={pinLength} filled={pin.length} error={!!error} />
            {error && <p className="text-sm text-red-500 mt-3 text-center">{error}</p>}

            <div className="mt-8 w-full max-w-xs">
              <Numpad
                onDigit={handleDigit}
                onDelete={handleDelete}
                showBiometric={biometricsEnabled && !biometricPrompt}
                onBiometric={handleBiometricAuth}
                disabled={attempts >= 5}
              />
            </div>

            <div className="mt-6 space-y-2 text-center">
              {biometricsEnabled && (
                <button
                  onClick={handleBiometricAuth}
                  className="text-sm text-brand-600 font-medium flex items-center gap-1.5 mx-auto"
                >
                  <Fingerprint className="h-4 w-4" />
                  Войти по биометрии
                </button>
              )}
              <button onClick={handleSwitchToPhone} className="text-sm text-gray-500 dark:text-gray-400 block mx-auto">
                Войти по номеру телефона
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PinDots({ length, filled, error }: { length: number; filled: number; error: boolean }) {
  return (
    <div className="flex gap-4 justify-center">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-4 h-4 rounded-full transition-all duration-150',
            i < filled
              ? error ? 'bg-red-500 scale-110' : 'bg-brand-600 scale-110'
              : 'border-2 border-gray-300 dark:border-gray-600',
          )}
        />
      ))}
    </div>
  )
}

function Numpad({
  onDigit,
  onDelete,
  showBiometric,
  onBiometric,
  disabled,
}: {
  onDigit: (d: string) => void
  onDelete: () => void
  showBiometric?: boolean
  onBiometric?: () => void
  disabled?: boolean
}) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [showBiometric ? 'bio' : '', '0', 'del'],
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.flat().map((key, i) => {
        if (key === '') return <div key={i} />
        if (key === 'bio') {
          return (
            <button
              key={i}
              onClick={onBiometric}
              className="h-16 rounded-2xl flex items-center justify-center text-brand-600 hover:bg-brand-50 active:bg-brand-100 transition-colors"
            >
              <Fingerprint className="h-6 w-6" />
            </button>
          )
        }
        if (key === 'del') {
          return (
            <button
              key={i}
              onClick={onDelete}
              className="h-16 rounded-2xl flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )
        }
        return (
          <button
            key={i}
            onClick={() => !disabled && onDigit(key)}
            disabled={disabled}
            className="h-16 rounded-2xl text-2xl font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition-colors disabled:opacity-30"
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
