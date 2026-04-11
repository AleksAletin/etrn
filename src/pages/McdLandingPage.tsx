import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, Upload, CheckCircle, FileText, Copy, Check } from 'lucide-react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import { getItem, setItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { Mcd, UserProfile } from '../lib/constants'
import { formatDate, cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

type Step = 'upload' | 'verify' | 'done' | 'view'

export default function McdLandingPage() {
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const linkId = searchParams.get('id')

  // If there's a linked MCD already, show view mode
  const existingMcds = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
  const hasLinkedMcd = existingMcds.some(m => m.status === 'linked')
  const user = getItem<UserProfile>(STORAGE_KEYS.USER)

  const [step, setStep] = useState<Step>(linkId && hasLinkedMcd ? 'view' : 'upload')
  const [, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Form fields for new MCD
  const [mcdNumber, setMcdNumber] = useState('')
  const [principal, setPrincipal] = useState(user?.company ?? '')
  const [principalInn, setPrincipalInn] = useState(user?.inn ?? '')
  const [trustedPerson, setTrustedPerson] = useState(user?.name ?? '')
  const [validUntil, setValidUntil] = useState('2027-12-31')
  const [fileName, setFileName] = useState('')
  const [powers, setPowers] = useState<string[]>(['Подписание ЭТрН', 'Подписание ЭПД'])

  const allPowers = [
    'Подписание ЭТрН',
    'Подписание ЭПД',
    'Подписание ТТН',
    'Подписание актов',
    'Подписание счетов-фактур',
    'Просмотр документов',
  ]

  const togglePower = (p: string) => {
    setPowers(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const handleFileSelect = () => {
    // Simulate file selection
    setFileName(`МЧД_${Date.now().toString(36).toUpperCase()}.xml`)
    toast('Файл выбран', 'success')
  }

  const handleUpload = () => {
    if (!mcdNumber.trim()) {
      toast('Укажите номер МЧД', 'error')
      return
    }
    if (!trustedPerson.trim()) {
      toast('Укажите доверенное лицо', 'error')
      return
    }
    if (powers.length === 0) {
      toast('Выберите хотя бы одно полномочие', 'error')
      return
    }

    setUploading(true)
    setStep('verify')

    setTimeout(() => {
      const mcd: Mcd = {
        status: 'linked',
        number: mcdNumber,
        principal: { companyName: principal, inn: principalInn },
        trustedPerson,
        validUntil,
        powers,
      }
      const current = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
      setItem(STORAGE_KEYS.MCD, [...current, mcd])
      setUploading(false)
      setStep('done')
    }, 2500)
  }

  const shareLink = (() => {
    const base = window.location.origin + window.location.pathname
    return `${base}#/mcd?id=${user?.id || 'demo'}`
  })()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast('Ссылка скопирована!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = shareLink
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      toast('Ссылка скопирована!', 'success')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleNewUpload = () => {
    setStep('upload')
    setFileName('')
    setMcdNumber('')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700/50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">eTRN — МЧД</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Машиночитаемая доверенность</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Upload form */}
        {step === 'upload' && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Загрузка МЧД</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Загрузите файл МЧД для привязки к вашему аккаунту eTRN
              </p>
            </div>

            {/* File upload area */}
            <Card
              onClick={handleFileSelect}
              className={cn(
                'border-2 border-dashed cursor-pointer text-center !py-8 transition-colors',
                fileName ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30',
              )}
            >
              {fileName ? (
                <>
                  <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{fileName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Нажмите чтобы выбрать другой файл</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Нажмите для выбора файла</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">XML, PDF · до 10 МБ</p>
                </>
              )}
            </Card>

            {/* MCD details form */}
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Данные доверенности</h3>
              <div className="space-y-3">
                <Input
                  label="Номер МЧД"
                  value={mcdNumber}
                  onChange={e => setMcdNumber(e.target.value)}
                  placeholder="МЧД-2026-00123"
                />
                <Input
                  label="Доверитель (компания)"
                  value={principal}
                  onChange={e => setPrincipal(e.target.value)}
                  placeholder='ООО "Название"'
                />
                <Input
                  label="ИНН доверителя"
                  value={principalInn}
                  onChange={e => setPrincipalInn(e.target.value)}
                  placeholder="7712345678"
                />
                <Input
                  label="Доверенное лицо (ФИО)"
                  value={trustedPerson}
                  onChange={e => setTrustedPerson(e.target.value)}
                  placeholder="Иванов Сергей Петрович"
                />
                <Input
                  label="Действует до"
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                />
              </div>
            </Card>

            {/* Powers */}
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Полномочия</h3>
              <div className="space-y-2">
                {allPowers.map(p => {
                  const active = powers.includes(p)
                  return (
                    <button
                      key={p}
                      onClick={() => togglePower(p)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors text-sm',
                        active ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-800' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        active ? 'bg-brand-600 border-brand-600' : 'border-gray-300',
                      )}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                      {p}
                    </button>
                  )
                })}
              </div>
            </Card>

            <Button fullWidth size="lg" onClick={handleUpload}>
              <Upload className="h-5 w-5" />
              Загрузить и привязать
            </Button>
          </>
        )}

        {/* Verifying */}
        {step === 'verify' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-8 w-8 text-brand-600 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Проверка МЧД...</h2>
            <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 mt-4">
              <VerifyStep label="Проверка формата файла" done />
              <VerifyStep label="Проверка ЭП доверителя" active />
              <VerifyStep label="Проверка реестра ФНС" />
              <VerifyStep label="Привязка к аккаунту" />
            </div>
          </div>
        )}

        {/* Done - success */}
        {step === 'done' && (
          <>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4 scale-in">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">МЧД привязана!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Доверенность успешно загружена и проверена</p>
            </div>

            <McdCard />

            {/* Share link */}
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Ссылка на МЧД</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Отправьте эту ссылку доверенному лицу или сохраните для быстрого доступа
              </p>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-xs text-gray-600 dark:text-gray-400 font-mono truncate border border-gray-200 dark:border-gray-600">
                  {shareLink}
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-1.5 shrink-0',
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </Card>

            <div className="space-y-2">
              <Button fullWidth variant="secondary" onClick={handleNewUpload}>
                Загрузить другую МЧД
              </Button>
              <Button fullWidth variant="ghost" onClick={() => { window.location.hash = '#/profile' }}>
                Вернуться в приложение
              </Button>
            </div>
          </>
        )}

        {/* View existing MCD via link */}
        {step === 'view' && hasLinkedMcd && (
          <>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Машиночитаемая доверенность</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user?.company || 'Компания'}</p>
            </div>

            <McdCard />

            {/* Share link */}
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Ссылка на МЧД</h3>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-xs text-gray-600 dark:text-gray-400 font-mono truncate border border-gray-200 dark:border-gray-600">
                  {shareLink}
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-1.5 shrink-0',
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </Card>

            <div className="space-y-2">
              <Button fullWidth onClick={handleNewUpload}>
                Загрузить новую МЧД
              </Button>
              <Button fullWidth variant="ghost" onClick={() => { window.location.hash = '#/profile' }}>
                Вернуться в приложение
              </Button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-gray-400 dark:text-gray-500">eTRN Demo · Машиночитаемая доверенность</p>
        </div>
      </div>
    </div>
  )
}

function McdCard() {
  const mcds = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
  const user = getItem<UserProfile>(STORAGE_KEYS.USER)
  if (mcds.length === 0) return null

  return (
    <div className="space-y-3">
      {mcds.map((mcd, idx) => {
        const isExpired = mcd.validUntil ? new Date(mcd.validUntil) < new Date() : false
        const badgeVariant = mcd.status === 'linked' && !isExpired ? 'success' : 'error'
        const badgeLabel = mcd.status === 'linked' && !isExpired ? 'Действительна' : 'Недействительна'
        return (
          <Card key={mcd.number || idx}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-600" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">МЧД {mcds.length > 1 ? `#${idx + 1}` : ''}</span>
              </div>
              <Badge variant={badgeVariant}>{badgeLabel}</Badge>
            </div>
            <div className="text-sm space-y-2">
              {mcd.number && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Номер</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{mcd.number}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Доверитель</span>
                <span className="font-medium text-right">{mcd.principal.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">ИНН</span>
                <span className="font-medium">{mcd.principal.inn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Доверенное лицо</span>
                <span className={cn(
                  'font-medium',
                  mcd.trustedPerson === user?.name ? 'text-green-700' : 'text-gray-800 dark:text-gray-200',
                )}>
                  {mcd.trustedPerson}
                </span>
              </div>
              {mcd.validUntil && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Действует до</span>
                  <span className={cn('font-medium', isExpired ? 'text-red-600' : 'text-gray-800 dark:text-gray-200')}>
                    {formatDate(mcd.validUntil)}
                  </span>
                </div>
              )}
              <div className="pt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Полномочия:</p>
                <div className="flex flex-wrap gap-1.5">
                  {mcd.powers.map(p => (
                    <span key={p} className="px-2.5 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 rounded-lg text-xs font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function VerifyStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 justify-center">
      {done ? (
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
      ) : active ? (
        <div className="w-4 h-4 rounded-full border-2 border-brand-600 border-t-transparent animate-spin shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" />
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
