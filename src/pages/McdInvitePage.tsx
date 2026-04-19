import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Copy, Check, CheckCircle, ChevronLeft, ShieldCheck, Clock, Lock } from 'lucide-react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { getItem } from '../lib/storage'
import { STORAGE_KEYS } from '../lib/constants'
import type { UserProfile } from '../lib/constants'
import { createInvite, formatTimeLeft } from '../lib/mcdInvite'
import type { InvitePayload } from '../lib/mcdInvite'

type Step = 'form' | 'sent'

export default function McdInvitePage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('form')
  const [recipientName, setRecipientName] = useState('')
  const [recipientContact, setRecipientContact] = useState('')
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [invite, setInvite] = useState<InvitePayload | null>(null)

  const handleSend = async () => {
    if (!recipientName.trim()) {
      toast('Укажите ФИО получателя', 'error')
      return
    }
    if (!recipientContact.trim()) {
      toast(channel === 'sms' ? 'Укажите телефон' : 'Укажите email', 'error')
      return
    }

    const user = getItem<UserProfile>(STORAGE_KEYS.USER)
    if (!user) {
      toast('Войдите в аккаунт для отправки инвайта', 'error')
      return
    }

    setSending(true)
    try {
      const result = await createInvite({
        inviter: { id: user.id, name: user.name, company: user.company },
        recipient: { name: recipientName.trim(), contact: recipientContact.trim() },
        channel,
        ttlDays: 7,
        oneTime: true,
      })
      // Имитация задержки доставки
      await new Promise(r => setTimeout(r, 600))
      setInviteUrl(result.url)
      setInvite(result.invite)
      setStep('sent')
      toast(`Ссылка отправлена на ${channel === 'sms' ? 'телефон' : 'email'}`, 'success')
    } catch (e) {
      toast('Не удалось создать ссылку. Попробуйте ещё раз.', 'error')
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = inviteUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    toast('Ссылка скопирована!', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700/50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => step === 'sent' ? navigate('/profile') : navigate('/mcd')}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Назад"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Отправить сотруднику</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Безопасная ссылка на загрузку МЧД</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* STEP: form */}
        {step === 'form' && (
          <>
            <div className="rounded-xl bg-brand-50 dark:bg-brand-900/20 p-4 text-sm text-brand-800 dark:text-brand-200 leading-relaxed">
              <p>
                Создадим уникальную защищённую ссылку. Сотрудник откроет её на своём телефоне, увидит ваше имя и загрузит свою МЧД.
              </p>
            </div>

            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Получатель</h3>
              <div className="space-y-3">
                <Input
                  label="ФИО"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                />

                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Способ отправки</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setChannel('sms'); setRecipientContact('') }}
                      className={cn(
                        'py-2.5 rounded-xl text-sm font-medium border transition-colors',
                        channel === 'sms'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
                      )}
                    >
                      SMS на телефон
                    </button>
                    <button
                      onClick={() => { setChannel('email'); setRecipientContact('') }}
                      className={cn(
                        'py-2.5 rounded-xl text-sm font-medium border transition-colors',
                        channel === 'email'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
                      )}
                    >
                      Email
                    </button>
                  </div>
                </div>

                {channel === 'sms' ? (
                  <Input
                    label="Телефон"
                    type="tel"
                    value={recipientContact}
                    onChange={e => setRecipientContact(e.target.value)}
                    placeholder="+7 (900) 123-45-67"
                  />
                ) : (
                  <Input
                    label="Email"
                    type="email"
                    value={recipientContact}
                    onChange={e => setRecipientContact(e.target.value)}
                    placeholder="ivanov@company.ru"
                  />
                )}
              </div>
            </Card>

            {/* Security assurance */}
            <Card className="!bg-green-50 dark:!bg-green-900/20 !border-green-200 dark:!border-green-800/50">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div className="text-xs text-green-800 dark:text-green-200 leading-relaxed space-y-1">
                  <p className="font-semibold text-sm">Защита ссылки</p>
                  <p>• 256-битный случайный токен — невозможно подобрать</p>
                  <p>• Срок действия 7 дней, после истекает автоматически</p>
                  <p>• Одноразовая — после использования отключается</p>
                  <p>• Можно отозвать вручную в любой момент</p>
                </div>
              </div>
            </Card>

            <Button fullWidth size="lg" loading={sending} onClick={handleSend}>
              <Send className="h-5 w-5" />
              Создать и отправить
            </Button>
          </>
        )}

        {/* STEP: sent */}
        {step === 'sent' && invite && (
          <>
            <div className="text-center mb-2">
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4 scale-in">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Ссылка создана</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {channel === 'sms' ? 'Отправили SMS на ' : 'Отправили письмо на '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{recipientContact}</span>
              </p>
            </div>

            <Card>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Получатель</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{recipientName}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 text-xs font-medium shrink-0 ml-2">
                  {channel === 'sms' ? 'SMS' : 'Email'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">Действительна {formatTimeLeft(invite.expiresAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">Одноразовая</span>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ссылка для копирования</h3>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-xs text-gray-600 dark:text-gray-400 font-mono truncate border border-gray-200 dark:border-gray-600">
                  {inviteUrl}
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-1.5 shrink-0',
                    copied ? 'bg-green-500 text-white' : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Готово' : 'Копировать'}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                Полный URL со 256-битным токеном. Можно переслать в любом мессенджере — только у получателя с этой ссылкой будет доступ к загрузке МЧД.
              </p>
            </Card>

            <div className="space-y-2">
              <Button fullWidth variant="secondary" onClick={() => { setStep('form'); setRecipientName(''); setRecipientContact(''); setInviteUrl(''); setInvite(null) }}>
                Создать ещё одну
              </Button>
              <Button fullWidth onClick={() => navigate('/profile')}>
                Готово
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
