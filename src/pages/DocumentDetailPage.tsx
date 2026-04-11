import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FileText, Download, MapPin, Truck, Package, Building2, Shield, X, AlertTriangle, CheckCircle2, Clock, XCircle, UserCheck, UserPlus } from 'lucide-react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { SkeletonCard } from '../components/ui/Skeleton'
import Skeleton from '../components/ui/Skeleton'
import { getItem, setItem, simulateDelay } from '../lib/storage'
import { STORAGE_KEYS, DocumentStatus, STATUS_LABELS, DOC_TYPE_LABELS, EDO_OPERATORS } from '../lib/constants'
import type { DocRecord, TitleStatus, Mcd, Certificate } from '../lib/constants'
import { formatDate, formatDateTime, formatMoney, cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import MockPdfPreview from '../components/documents/MockPdfPreview'

const badgeVariant: Record<DocumentStatus, 'info' | 'warning' | 'success' | 'error'> = {
  [DocumentStatus.NEED_SIGN]: 'info',
  [DocumentStatus.IN_PROGRESS]: 'warning',
  [DocumentStatus.SIGNED]: 'success',
  [DocumentStatus.SIGNED_WITH_RESERVATIONS]: 'warning',
  [DocumentStatus.REFUSED]: 'error',
  [DocumentStatus.ERROR]: 'error',
}

const historyDotColor: Record<string, string> = {
  created: 'bg-gray-400',
  sent: 'bg-blue-500',
  viewed: 'bg-yellow-500',
  signed: 'bg-green-500',
  rejected: 'bg-red-500',
  error: 'bg-red-500',
}

const titleStatusIcon: Record<string, typeof CheckCircle2> = {
  signed: CheckCircle2,
  signed_with_reservations: AlertTriangle,
  refused: XCircle,
  pending: Clock,
}

const titleStatusColor: Record<string, string> = {
  signed: 'text-green-500',
  signed_with_reservations: 'text-yellow-500',
  refused: 'text-red-500',
  pending: 'text-gray-400',
}

const titleStatusLabel: Record<string, string> = {
  signed: 'Подписан',
  signed_with_reservations: 'С оговоркой',
  refused: 'Отказ',
  pending: 'Ожидает',
}

export default function DocumentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<DocRecord | null>(null)
  const [tab, setTab] = useState<'preview' | 'details' | 'titles' | 'history' | 'files'>('preview')
  const [showActions, setShowActions] = useState(false)
  const [showReservations, setShowReservations] = useState(false)
  const [showRefuse, setShowRefuse] = useState(false)
  const [showMcdError, setShowMcdError] = useState(false)
  const [mcdErrorMessage, setMcdErrorMessage] = useState('')
  const [showCertError, setShowCertError] = useState(false)
  const [reservationsText, setReservationsText] = useState('')
  const [refuseReason, setRefuseReason] = useState('')
  const [showAssign, setShowAssign] = useState(false)

  const DRIVERS = [
    'Иванов Сергей Петрович',
    'Петров Алексей Иванович',
    'Сидоров Дмитрий Олегович',
    'Козлов Андрей Викторович',
    'Морозов Виктор Николаевич',
  ]

  useEffect(() => {
    (async () => {
      await simulateDelay()
      const docs = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
      setDoc(docs.find(d => d.id === id) ?? null)
      setLoading(false)
    })()
  }, [id])

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <SkeletonCard /><SkeletonCard /><Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!doc) {
    return <div className="p-4 text-center text-gray-500 dark:text-gray-400 mt-20">Документ не найден</div>
  }

  const hasTitles = doc.titles && doc.titles.length > 0
  const tabs = [
    { key: 'preview' as const, label: 'Просмотр' },
    { key: 'details' as const, label: 'Детали' },
    ...(hasTitles ? [{ key: 'titles' as const, label: 'Титулы' }] : []),
    { key: 'history' as const, label: 'История' },
    { key: 'files' as const, label: `Файлы (${doc.files.length})` },
  ]

  // Validate MCD and certificate before signing
  const validateBeforeSigning = (): boolean => {
    const cert = getItem<Certificate>(STORAGE_KEYS.CERTIFICATE)
    if (!cert) {
      setShowCertError(true)
      setShowActions(false)
      return false
    }
    if (cert.status !== 'active') {
      setShowCertError(true)
      setShowActions(false)
      return false
    }

    const mcds = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []
    if (mcds.length === 0 || mcds.every(m => m.status === 'none')) {
      setMcdErrorMessage('МЧД не привязана. Для подписания документов необходима действующая машиночитаемая доверенность.')
      setShowMcdError(true)
      setShowActions(false)
      return false
    }
    // Check if at least one valid (linked) MCD exists
    const hasValid = mcds.some(m => m.status === 'linked')
    if (!hasValid) {
      // Pick the most relevant error
      if (mcds.some(m => m.status === 'expired')) {
        setMcdErrorMessage('Срок действия всех МЧД истёк. Обновите доверенность для продолжения работы с документами.')
      } else if (mcds.some(m => m.status === 'invalid')) {
        setMcdErrorMessage('Все МЧД недействительны. Загрузите корректную машиночитаемую доверенность.')
      } else if (mcds.some(m => m.status === 'insufficient')) {
        setMcdErrorMessage('Недостаточно полномочий в МЧД. Доверенности не содержат прав на подписание транспортных документов.')
      } else {
        setMcdErrorMessage('МЧД не привязана. Для подписания документов необходима действующая машиночитаемая доверенность.')
      }
      setShowMcdError(true)
      setShowActions(false)
      return false
    }
    return true
  }

  const handleOpenActions = () => {
    if (validateBeforeSigning()) {
      setShowActions(true)
    }
  }

  const handleSign = () => {
    setShowActions(false)
    navigate(`/documents/${doc.id}/sign?mode=sign`)
  }

  const handleSignWithReservations = () => {
    setShowActions(false)
    setShowReservations(true)
  }

  const handleRefuse = () => {
    setShowActions(false)
    setShowRefuse(true)
  }

  const submitReservations = () => {
    if (!reservationsText.trim()) {
      toast('Укажите текст оговорки', 'error')
      return
    }
    setShowReservations(false)
    navigate(`/documents/${doc.id}/sign?mode=reservations&text=${encodeURIComponent(reservationsText)}`)
  }

  const submitRefuse = () => {
    if (!refuseReason.trim()) {
      toast('Укажите причину отказа', 'error')
      return
    }
    setShowRefuse(false)
    navigate(`/documents/${doc.id}/sign?mode=refuse&reason=${encodeURIComponent(refuseReason)}`)
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="flex-1 p-4 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{doc.number}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{DOC_TYPE_LABELS[doc.type]}</p>
          </div>
          <Badge variant={badgeVariant[doc.status]}>{STATUS_LABELS[doc.status]}</Badge>
        </div>

        {/* EDO Operator badge */}
        {doc.edoOperator && (
          <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl">
            <Shield className="h-4 w-4 text-brand-600" />
            <span className="text-sm text-brand-700 font-medium">
              {EDO_OPERATORS[doc.edoOperator].name}
            </span>
            <span className="text-xs text-brand-500">
              {EDO_OPERATORS[doc.edoOperator].description}
            </span>
          </div>
        )}

        {/* Assignment badge */}
        {doc.assignedTo && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">
              Назначен: {doc.assignedTo}
            </span>
            {doc.assignedAt && (
              <span className="text-xs text-blue-500 ml-auto">
                {formatDate(doc.assignedAt)}
              </span>
            )}
          </div>
        )}

        {/* Reservations notice */}
        {doc.status === DocumentStatus.SIGNED_WITH_RESERVATIONS && doc.reservations && (
          <div className="px-3 py-2 bg-yellow-50 rounded-xl border border-yellow-200">
            <p className="text-xs font-medium text-yellow-700 mb-1">Оговорка при подписании:</p>
            <p className="text-sm text-yellow-800">{doc.reservations}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
                tab === t.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'preview' && <MockPdfPreview doc={doc} />}

        {tab === 'details' && (
          <div className="space-y-3">
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Стороны</span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Отправитель: </span>
                  <span className="text-gray-800 dark:text-gray-200">{doc.sender.name}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">ИНН {doc.sender.inn}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Получатель: </span>
                  <span className="text-gray-800 dark:text-gray-200">{doc.receiver.name}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">ИНН {doc.receiver.inn}</span>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Водитель</span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-800 dark:text-gray-200">{doc.driver.name}</p>
                <p className="text-gray-500 dark:text-gray-400">{doc.driver.vehiclePlate} · {doc.driver.phone}</p>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Маршрут</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{doc.route.from} → {doc.route.to}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Груз</span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-800 dark:text-gray-200">{doc.cargo.description}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {doc.cargo.weight.toLocaleString('ru')} кг · {doc.cargo.volume} м³ · {doc.cargo.packages} мест
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-2">{formatMoney(doc.amount)}</p>
              </div>
            </Card>
            {doc.signLocation && (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Место подписания</span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{doc.signLocation.address || 'Адрес не определён'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{doc.signLocation.lat.toFixed(6)}, {doc.signLocation.lng.toFixed(6)}</p>
              </Card>
            )}
          </div>
        )}

        {tab === 'titles' && hasTitles && (
          <div className="space-y-2">
            {doc.titles!.map((t: TitleStatus) => {
              const Icon = titleStatusIcon[t.status]
              return (
                <Card key={t.title} className="flex items-start gap-3 !p-3">
                  <div className="mt-0.5">
                    <Icon className={cn('h-5 w-5', titleStatusColor[t.status])} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Титул {t.title}</p>
                      <span className={cn('text-xs font-medium', titleStatusColor[t.status])}>
                        {titleStatusLabel[t.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Подписант: {t.signer}</p>
                    {t.signedAt && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{formatDateTime(t.signedAt)}</p>
                    )}
                    {t.reservations && (
                      <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 mt-1">
                        Оговорка: {t.reservations}
                      </p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-0">
            {doc.history.map((h, i) => (
              <div key={h.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn('w-3 h-3 rounded-full shrink-0 mt-1.5', historyDotColor[h.action] || 'bg-gray-400')} />
                  {i < doc.history.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 my-1" />}
                </div>
                <div className="pb-4">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{h.description}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{h.actor} · {formatDateTime(h.timestamp)}</p>
                  {h.location && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {h.location.address || `${h.location.lat.toFixed(4)}, ${h.location.lng.toFixed(4)}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-2">
            {doc.files.map(f => (
              <Card key={f.id} className="flex items-center gap-3 !p-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{(f.size / 1024).toFixed(0)} КБ</p>
                </div>
                <button
                  onClick={() => toast('Скачивание недоступно в демо', 'info')}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Download className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-700/50 pb-safe">
        {doc.status === DocumentStatus.NEED_SIGN && (
          <div className="flex gap-2">
            <Button fullWidth size="lg" onClick={handleOpenActions}>
              Подписать
            </Button>
            <button
              onClick={() => setShowAssign(true)}
              className="shrink-0 w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center active:bg-blue-100 transition-colors"
              aria-label="Назначить"
            >
              <UserPlus className="h-6 w-6 text-blue-600" />
            </button>
          </div>
        )}
        {(doc.status === DocumentStatus.SIGNED || doc.status === DocumentStatus.SIGNED_WITH_RESERVATIONS) && (
          <Button fullWidth size="lg" variant="secondary" disabled>
            {STATUS_LABELS[doc.status]}
          </Button>
        )}
        {doc.status === DocumentStatus.REFUSED && (
          <Button fullWidth size="lg" variant="secondary" disabled>
            Отказано в подписи
          </Button>
        )}
        {doc.status === DocumentStatus.ERROR && (
          <Button fullWidth size="lg" variant="danger" onClick={handleOpenActions}>
            Повторить подписание
          </Button>
        )}
        {doc.status === DocumentStatus.IN_PROGRESS && (
          <Button fullWidth size="lg" variant="secondary" disabled>
            Ожидает подписания
          </Button>
        )}
      </div>

      {/* Signing action sheet */}
      {showActions && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowActions(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Действия с документом</h3>
              <button onClick={() => setShowActions(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleSign}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 transition-colors"
              >
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Подписать</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Подписать документ электронной подписью</p>
                </div>
              </button>
              <button
                onClick={handleSignWithReservations}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 transition-colors"
              >
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Подписать с оговоркой</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Подписать и указать замечания по грузу</p>
                </div>
              </button>
              <button
                onClick={handleRefuse}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition-colors"
              >
                <XCircle className="h-6 w-6 text-red-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Отказать в подписи</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Отклонить документ с указанием причины</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reservations modal */}
      {showReservations && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowReservations(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Оговорка</h3>
              <button onClick={() => setShowReservations(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Укажите замечания к грузу или документу. Документ будет подписан со статусом «С оговоркой».
            </p>
            <textarea
              value={reservationsText}
              onChange={e => setReservationsText(e.target.value)}
              placeholder="Например: обнаружена недостача 2 мест, повреждение упаковки..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
            <div className="mt-4 space-y-2">
              <Button fullWidth onClick={submitReservations}>Подписать с оговоркой</Button>
              <Button fullWidth variant="ghost" onClick={() => setShowReservations(false)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* Refuse modal */}
      {showRefuse && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowRefuse(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Отказ в подписи</h3>
              <button onClick={() => setShowRefuse(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Укажите причину отказа. Отправитель получит уведомление.
            </p>
            <textarea
              value={refuseReason}
              onChange={e => setRefuseReason(e.target.value)}
              placeholder="Например: несоответствие данных о грузе, неверный маршрут..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
            <div className="mt-4 space-y-2">
              <Button fullWidth variant="danger" onClick={submitRefuse}>Отказать в подписи</Button>
              <Button fullWidth variant="ghost" onClick={() => setShowRefuse(false)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* MCD error modal */}
      {showMcdError && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowMcdError(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ошибка МЧД</h3>
              <button onClick={() => setShowMcdError(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-red-500" />
              </div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Подписание невозможно</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{mcdErrorMessage}</p>

              <div className="w-full space-y-2">
                <Button fullWidth onClick={() => { setShowMcdError(false); navigate('/mcd') }}>
                  Загрузить МЧД
                </Button>
                <Button fullWidth variant="secondary" onClick={() => { setShowMcdError(false); navigate('/profile') }}>
                  Перейти в профиль
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setShowMcdError(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment bottom sheet */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowAssign(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Назначить водителю</h3>
              <button onClick={() => setShowAssign(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <div className="space-y-2">
              {DRIVERS.map(name => (
                <button
                  key={name}
                  onClick={() => {
                    const docs = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
                    const now = new Date().toISOString()
                    const updated = docs.map(d => d.id === doc.id ? { ...d, assignedTo: name, assignedAt: now } : d)
                    setItem(STORAGE_KEYS.DOCUMENTS, updated)
                    setDoc({ ...doc, assignedTo: name, assignedAt: now })
                    setShowAssign(false)
                    toast(`Документ назначен: ${name.split(' ')[0]} ${name.split(' ')[1]?.[0]}.`, 'success')
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-xl transition-colors',
                    doc.assignedTo === name ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200' : 'bg-gray-50 dark:bg-gray-800/50 active:bg-gray-100',
                  )}
                >
                  <UserCheck className={cn('h-5 w-5', doc.assignedTo === name ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500')} />
                  <span className={cn('text-sm font-medium', doc.assignedTo === name ? 'text-blue-700' : 'text-gray-800 dark:text-gray-200')}>{name}</span>
                  {doc.assignedTo === name && <span className="text-xs text-blue-500 ml-auto">Текущий</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Certificate error modal */}
      {showCertError && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowCertError(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl p-4 pb-safe animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ошибка сертификата</h3>
              <button onClick={() => setShowCertError(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Сертификат ЭП не найден</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Для подписания документов необходим действующий сертификат УКЭП. Выпустите сертификат через КриптоКлюч.
              </p>

              <div className="w-full space-y-2">
                <Button fullWidth onClick={() => { setShowCertError(false); navigate('/cert-issue') }}>
                  Выпустить сертификат
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setShowCertError(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
