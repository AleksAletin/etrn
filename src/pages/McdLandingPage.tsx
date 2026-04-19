import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Shield, Upload, CheckCircle, FileText, Copy, Check, Send, UserCheck, AlertCircle, X, Loader2 } from 'lucide-react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { getItem, setItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { Mcd, UserProfile } from '../lib/constants'
import { formatDate, cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { parseMcdFile, parsedToMcd } from '../lib/mockMcdParser'
import type { ParsedMcd } from '../lib/mockMcdParser'
import InviteLanding from '../components/mcd/InviteLanding'
import { validateInvite, consumeInvite } from '../lib/mcdInvite'
import type { InvitePayload, InviteValidationResult } from '../lib/mcdInvite'

type Step = 'choose' | 'upload' | 'preview' | 'verify' | 'done' | 'view' | 'invite-landing'

export default function McdLandingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const linkId = searchParams.get('id')
  const inviteToken = searchParams.get('invite')
  const fileRef = useRef<HTMLInputElement>(null)

  const existingMcds = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
  const hasLinkedMcd = existingMcds.some(m => m.status === 'linked')
  const user = getItem<UserProfile>(STORAGE_KEYS.USER)

  // Первый экран:
  //  - с токеном invite → landing для получателя (или страница ошибки при invalid)
  //  - есть МЧД + ?id=... → view
  //  - иначе → choose
  const initialStep: Step = inviteToken
    ? 'invite-landing'
    : (linkId && hasLinkedMcd ? 'view' : 'choose')
  const [step, setStep] = useState<Step>(initialStep)
  const [copied, setCopied] = useState(false)
  const [parsed, setParsed] = useState<ParsedMcd | null>(null)
  const [parseError, setParseError] = useState<string>('')

  // Валидация invite-токена (async). Держим в стейте результат.
  const [inviteValidation, setInviteValidation] = useState<InviteValidationResult | null>(null)
  const [invitePayload, setInvitePayload] = useState<InvitePayload | null>(null)

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    ;(async () => {
      const result = await validateInvite(inviteToken)
      if (cancelled) return
      setInviteValidation(result)
      if (result.valid) setInvitePayload(result.invite)
    })()
    return () => { cancelled = true }
  }, [inviteToken])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Валидация типа: только XML
    const isXml = file.name.toLowerCase().endsWith('.xml') || file.type.includes('xml')
    if (!isXml) {
      setParseError('Файл должен быть в формате XML (формат МЧД ФНС)')
      return
    }
    // Валидация размера: до 10 MB
    if (file.size > 10 * 1024 * 1024) {
      setParseError('Размер файла превышает 10 МБ')
      return
    }

    setParseError('')
    // Фейковый парсинг (в проде — отправка на бэк для парсинга XML)
    try {
      const result = parseMcdFile(file.name, file.size)
      setParsed(result)
      setStep('preview')
      toast('Файл распознан', 'success')
    } catch {
      setParseError('Не удалось разобрать файл. Проверьте, что это корректный XML-МЧД ФНС.')
    }

    // Сбрасываем input чтобы тот же файл можно было выбрать снова
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleAttach = () => {
    if (!parsed) return
    setStep('verify')
    setTimeout(async () => {
      const mcd = parsedToMcd(parsed)
      const current = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
      setItem(STORAGE_KEYS.MCD, [...current, mcd])
      // Если пришли по invite — одноразовая ссылка «сгорает»
      if (inviteToken) {
        try { await consumeInvite(inviteToken) } catch { /* no-op */ }
      }
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

  const resetToChoose = () => {
    setStep('choose')
    setParsed(null)
    setParseError('')
  }

  const nameMatches = parsed?.trustedPerson === user?.name

  // === Invite-landing (получатель пришёл по защищённой ссылке) ===
  if (step === 'invite-landing') {
    // Ждём результата асинхронной валидации
    if (!inviteValidation) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white dark:from-brand-950/40 dark:via-gray-900 dark:to-gray-900">
          <Loader2 className="h-10 w-10 text-brand-600 animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Проверяем ссылку...</p>
        </div>
      )
    }
    return (
      <InviteLanding
        invite={invitePayload ?? undefined}
        invalidReason={inviteValidation.valid ? undefined : inviteValidation.reason}
        onContinue={() => setStep('upload')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50">
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
        {/* STEP: choose — выбор между «загрузить свою» и «отправить сотруднику» */}
        {step === 'choose' && (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Добавить МЧД</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Выберите подходящий сценарий
              </p>
            </div>

            <button
              onClick={() => setStep('upload')}
              className="w-full text-left rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                  <Upload className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">У меня есть XML-файл</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Загрузите файл МЧД — привяжем к вашему аккаунту
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => navigate('/mcd/invite')}
              className="w-full text-left rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                  <Send className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Отправить сотруднику</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Сотрудник сам загрузит МЧД по ссылке
                  </p>
                </div>
              </div>
            </button>

            {hasLinkedMcd && (
              <Button fullWidth variant="ghost" onClick={() => navigate('/profile')}>
                У меня уже есть привязанные МЧД — к профилю
              </Button>
            )}
          </>
        )}

        {/* STEP: upload — выбор файла */}
        {step === 'upload' && (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Загрузка МЧД</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Выберите XML-файл вашей машиночитаемой доверенности
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={handleFileChange}
              className="hidden"
            />

            <Card
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer text-center !py-10 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Нажмите, чтобы выбрать файл
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Только XML · до 10 МБ
              </p>
            </Card>

            {parseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
              </div>
            )}

            <div className="rounded-xl bg-brand-50 dark:bg-brand-900/20 p-4 text-xs text-brand-800 dark:text-brand-200 leading-relaxed">
              <p className="font-semibold mb-1">ℹ️ Формат файла</p>
              <p>
                Принимается XML-файл МЧД, выданный через личный кабинет ФНС или удостоверяющий центр.
                Полномочия и срок действия мы определим автоматически.
              </p>
            </div>

            <Button fullWidth variant="ghost" onClick={resetToChoose}>
              Назад
            </Button>
          </>
        )}

        {/* STEP: preview — предпросмотр распарсенных полей */}
        {step === 'preview' && parsed && (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Проверьте данные</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Мы распознали эти сведения из файла
              </p>
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700/50">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{parsed.fileName}</span>
              </div>

              <div className="space-y-3 text-sm">
                <FieldRow label="Номер МЧД" value={parsed.number} />
                <FieldRow label="Доверитель" value={parsed.principal.companyName} />
                <FieldRow label="ИНН доверителя" value={parsed.principal.inn} />
                <div className="flex justify-between items-start gap-3">
                  <span className="text-gray-500 dark:text-gray-400">Доверенное лицо</span>
                  <div className="text-right">
                    <span className={cn(
                      'font-medium',
                      nameMatches ? 'text-green-700 dark:text-green-400' : 'text-red-600',
                    )}>
                      {parsed.trustedPerson}
                    </span>
                    {!nameMatches && (
                      <p className="text-xs text-red-600 mt-0.5">Не совпадает с вашим профилем</p>
                    )}
                  </div>
                </div>
                <FieldRow label="Срок действия" value={formatDate(parsed.validUntil)} />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Полномочия ({parsed.powers.length}):</p>
                <div className="space-y-1.5">
                  {parsed.powers.map(p => (
                    <div key={p.code} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 px-2 py-0.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 rounded font-mono font-medium">{p.code}</span>
                      <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {!nameMatches && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ФИО доверенного лица в МЧД не совпадает с вашим профилем. Возможно, эта доверенность выдана другому человеку.
                </p>
              </div>
            )}

            <Button fullWidth size="lg" onClick={handleAttach}>
              <CheckCircle className="h-5 w-5" />
              Привязать к аккаунту
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep('upload')}>
              <X className="h-4 w-4" />
              Выбрать другой файл
            </Button>
          </>
        )}

        {/* STEP: verify — 4-шаговая верификация */}
        {step === 'verify' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-8 w-8 text-brand-600 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Проверка МЧД...</h2>
            <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 mt-4">
              <VerifyStep label="Проверка формата файла" done />
              <VerifyStep label="Проверка ЭП доверителя" active />
              <VerifyStep label="Проверка в реестре ФНС" />
              <VerifyStep label="Привязка к аккаунту" />
            </div>
          </div>
        )}

        {/* STEP: done — успех */}
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

            <div className="space-y-2">
              <Button fullWidth variant="secondary" onClick={resetToChoose}>
                Загрузить ещё одну МЧД
              </Button>
              <Button fullWidth onClick={() => navigate('/profile')}>
                В профиль
              </Button>
            </div>
          </>
        )}

        {/* STEP: view — просмотр по share-ссылке */}
        {step === 'view' && hasLinkedMcd && (
          <>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-4">
                <UserCheck className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Машиночитаемая доверенность</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user?.company || 'Компания'}</p>
            </div>

            <McdCard />

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
                    copied ? 'bg-green-500 text-white' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </Card>

            <div className="space-y-2">
              <Button fullWidth onClick={resetToChoose}>
                Загрузить ещё МЧД
              </Button>
              <Button fullWidth variant="ghost" onClick={() => navigate('/profile')}>
                В профиль
              </Button>
            </div>
          </>
        )}

        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-gray-400 dark:text-gray-500">eTRN · Машиночитаемая доверенность</p>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-gray-100 text-right">{value}</span>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Полномочия ({(mcd.powers ?? []).length}):</p>
                <div className="space-y-1.5">
                  {(mcd.powers ?? []).map((p, pi) => {
                    const code = typeof p === 'string' ? 'LEGACY' : (p?.code ?? 'LEGACY')
                    const name = typeof p === 'string' ? p : (p?.name ?? '(без названия)')
                    return (
                      <div key={code + '-' + pi} className="flex items-start gap-2 text-xs">
                        <span className="px-2 py-0.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 rounded font-mono font-medium shrink-0">{code}</span>
                        <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{name}</span>
                      </div>
                    )
                  })}
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
