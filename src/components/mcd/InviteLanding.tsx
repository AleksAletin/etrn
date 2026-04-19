import { ShieldCheck, Clock, Lock, Building2, UserCheck, AlertTriangle, ArrowRight } from 'lucide-react'
import Button from '../ui/Button'
import type { InvitePayload } from '../../lib/mcdInvite'
import { formatTimeLeft, VALIDATION_REASON_LABEL } from '../../lib/mcdInvite'

type Reason = keyof typeof VALIDATION_REASON_LABEL

interface InviteLandingProps {
  /** Валидный invite payload, если прошла проверка. */
  invite?: InvitePayload
  /** Причина невалидности, если не прошёл. */
  invalidReason?: Reason
  /** Callback для начала процесса загрузки МЧД. */
  onContinue: () => void
}

/**
 * Красивый лендос для получателя invite-ссылки на загрузку МЧД.
 * Показывает:
 *  - кто отправил (компания + ФИО руководителя);
 *  - что нужно сделать (3 шага);
 *  - индикаторы безопасности (TTL, одноразовость, зашифрованная передача);
 *  - CTA «Начать».
 */
export default function InviteLanding({ invite, invalidReason, onContinue }: InviteLandingProps) {
  // Ошибочное состояние — красивая ошибка вместо белого экрана
  if (!invite || invalidReason) {
    const label = invalidReason
      ? VALIDATION_REASON_LABEL[invalidReason]
      : 'Ссылка недоступна'
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white dark:from-red-950/30 dark:to-gray-900 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Ссылка недействительна</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            {label}. Попросите отправителя сгенерировать новую ссылку.
          </p>
          <Button fullWidth size="lg" variant="secondary" onClick={() => { window.location.hash = '#/dashboard' }}>
            В приложение
          </Button>
        </div>
      </div>
    )
  }

  const timeLeft = formatTimeLeft(invite.expiresAt)

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white dark:from-brand-950/40 dark:via-gray-900 dark:to-gray-900">
      {/* Hero */}
      <div className="px-6 pt-10 pb-8">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-100">eTRN</span>
          </div>

          {/* Greeting */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight mb-3">
            {invite.recipientName.split(' ')[1]
              ? `Здравствуйте, ${invite.recipientName.split(' ')[1]}!`
              : 'Здравствуйте!'}
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
            Вам прислали персональную ссылку на загрузку{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">машиночитаемой доверенности (МЧД)</span>.
            Это займёт меньше минуты.
          </p>

          {/* From card */}
          <div className="rounded-2xl border border-brand-100 dark:border-brand-900/40 bg-white dark:bg-gray-900 shadow-sm p-5 mb-6">
            <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">От кого</p>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {invite.inviterCompany || invite.inviterName}
                </p>
                {invite.inviterCompany && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {invite.inviterName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Security badges */}
          <div className="grid grid-cols-3 gap-2 mb-8">
            <SecurityBadge icon={Clock} label="Действует" value={timeLeft} />
            <SecurityBadge icon={Lock} label="Ссылка" value="Одноразовая" />
            <SecurityBadge icon={ShieldCheck} label="Токен" value="256 бит" />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-6 py-8 bg-white dark:bg-gray-900">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">Что нужно сделать</h2>
          <ol className="space-y-4">
            <Step n={1} title="Получите XML-файл МЧД" desc="В личном кабинете ФНС: m4d.nalog.gov.ru, или у руководителя." />
            <Step n={2} title="Загрузите файл" desc="Выберите файл на следующем экране — автоматически распознаем данные." />
            <Step n={3} title="Подтвердите привязку" desc="Проверим МЧД в реестре ФНС и привяжем к вашему аккаунту." />
          </ol>
        </div>
      </div>

      {/* Security reassurance */}
      <div className="px-6 py-6">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 p-4 mb-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-xs text-green-900 dark:text-green-200 leading-relaxed space-y-1">
                <p className="font-semibold text-sm">Ваши данные защищены</p>
                <p>• Передача по HTTPS с end-to-end шифрованием</p>
                <p>• Никто кроме вас не сможет использовать эту ссылку</p>
                <p>• МЧД проверяется в государственном реестре ФНС</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-10">
        <div className="max-w-md mx-auto">
          <Button fullWidth size="lg" onClick={onContinue}>
            <UserCheck className="h-5 w-5" />
            Начать
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
            Нажимая «Начать», вы подтверждаете, что являетесь <span className="font-medium">{invite.recipientName}</span>
            {invite.inviterCompany && <> — доверенным лицом {invite.inviterCompany}</>}.
          </p>
        </div>
      </div>
    </div>
  )
}

function SecurityBadge({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-center">
      <Icon className="h-4 w-4 text-brand-600 mx-auto mb-1.5" />
      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{value}</p>
    </div>
  )
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-semibold text-sm flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </li>
  )
}

