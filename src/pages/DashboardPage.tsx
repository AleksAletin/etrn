import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, Clock, Archive, FileText, CheckCircle, AlertTriangle, Eye, ChevronRight, Inbox, Shield, KeyRound, BarChart3, QrCode, UserCheck } from 'lucide-react'
import Card from '../components/ui/Card'
import { SkeletonCard } from '../components/ui/Skeleton'
import Skeleton from '../components/ui/Skeleton'
import { getItem } from '../lib/storage'
import { STORAGE_KEYS, DocumentStatus } from '../lib/constants'
import type { DocRecord, ActivityLogEntry, UserProfile, Certificate, Mcd } from '../lib/constants'
import { formatDateTime } from '../lib/utils'
import { simulateDelay } from '../lib/storage'

const activityIcons = {
  sign: CheckCircle,
  view: Eye,
  receive: FileText,
  error: AlertTriangle,
}

const activityColors = {
  sign: 'text-green-600 bg-green-50',
  view: 'text-blue-600 bg-blue-50',
  receive: 'text-brand-600 bg-brand-50',
  error: 'text-red-600 bg-red-50',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [activity, setActivity] = useState<ActivityLogEntry[]>([])

  useEffect(() => {
    (async () => {
      await simulateDelay()
      setDocs(getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? [])
      setActivity(getItem<ActivityLogEntry[]>(STORAGE_KEYS.ACTIVITY) ?? [])
      setLoading(false)
    })()
  }, [])

  const user = getItem<UserProfile>(STORAGE_KEYS.USER)
  const cert = getItem<Certificate>(STORAGE_KEYS.CERTIFICATE)
  const mcds = getItem<Mcd[]>(STORAGE_KEYS.MCD) ?? []

  // Expiry warnings
  const now = new Date()
  const warnings: { icon: typeof AlertTriangle; color: string; bg: string; text: string; action: string }[] = []

  if (!cert || cert.status !== 'active') {
    warnings.push({ icon: KeyRound, color: 'text-red-600', bg: 'bg-red-50', text: 'Сертификат УКЭП не выпущен. Выпустите для подписания.', action: '/cert-issue' })
  } else if (cert.validTo) {
    const daysLeft = Math.ceil((new Date(cert.validTo).getTime() - now.getTime()) / 86400000)
    if (daysLeft <= 30 && daysLeft > 0) {
      warnings.push({ icon: KeyRound, color: 'text-orange-600', bg: 'bg-orange-50', text: `Сертификат УКЭП истекает через ${daysLeft} дн.`, action: '/cert-issue' })
    } else if (daysLeft <= 0) {
      warnings.push({ icon: KeyRound, color: 'text-red-600', bg: 'bg-red-50', text: 'Сертификат УКЭП истёк. Обновите сертификат.', action: '/cert-issue' })
    }
  }

  const expiringMcds = mcds.filter(m => {
    if (!m.validUntil || m.status !== 'linked') return false
    const daysLeft = Math.ceil((new Date(m.validUntil).getTime() - now.getTime()) / 86400000)
    return daysLeft <= 30
  })
  if (expiringMcds.length > 0) {
    const m = expiringMcds[0]
    const daysLeft = Math.ceil((new Date(m.validUntil!).getTime() - now.getTime()) / 86400000)
    if (daysLeft <= 0) {
      warnings.push({ icon: Shield, color: 'text-red-600', bg: 'bg-red-50', text: `МЧД от ${m.principal.companyName} истекла`, action: '/profile' })
    } else {
      warnings.push({ icon: Shield, color: 'text-orange-600', bg: 'bg-orange-50', text: `МЧД от ${m.principal.companyName} истекает через ${daysLeft} дн.`, action: '/profile' })
    }
  }

  if (mcds.length === 0 || mcds.every(m => m.status === 'none')) {
    warnings.push({ icon: Shield, color: 'text-red-600', bg: 'bg-red-50', text: 'МЧД не привязана. Загрузите для подписания.', action: '/mcd' })
  }

  const needSign = docs.filter(d => d.status === DocumentStatus.NEED_SIGN).length
  const inProgress = docs.filter(d => d.status === DocumentStatus.IN_PROGRESS).length
  const signed = docs.filter(d => d.status === DocumentStatus.SIGNED || d.status === DocumentStatus.SIGNED_WITH_RESERVATIONS).length

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      {/* Greeting */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {user?.name ? `${user.name.split(' ')[1] || user.name.split(' ')[0]}, привет!` : 'Привет!'}
      </h2>

      {/* Expiry warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <button
              key={i}
              onClick={() => navigate(w.action)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl ${w.bg} dark:bg-opacity-20 active:scale-[0.98] transition-all duration-200`}
            >
              <w.icon className={`h-5 w-5 ${w.color} shrink-0`} />
              <p className={`text-sm font-medium ${w.color} text-left flex-1`}>{w.text}</p>
              <ChevronRight className={`h-4 w-4 ${w.color} shrink-0 opacity-50`} />
            </button>
          ))}
        </div>
      )}

      {/* Primary action — documents to sign */}
      {needSign > 0 ? (
        <div className="w-full bg-gradient-to-r from-brand-600 to-brand-700 rounded-2xl p-5 text-white shadow-lg">
          <button
            onClick={() => navigate('/documents?status=NEED_SIGN')}
            className="w-full text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <FileSignature className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-3xl font-bold">{needSign}</p>
                  <p className="text-base text-white/90 mt-0.5">
                    {needSign === 1 ? 'документ на подпись' : needSign < 5 ? 'документа на подпись' : 'документов на подпись'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-6 w-6 text-white/60" />
            </div>
          </button>
          <button
            onClick={() => {
              const needSignIds = docs.filter(d => d.status === DocumentStatus.NEED_SIGN).map(d => d.id)
              navigate(`/documents/bulk-sign?ids=${needSignIds.join(',')}`)
            }}
            className="w-full mt-3 py-2.5 rounded-xl bg-white/20 text-white text-sm font-medium active:bg-white/30 transition-colors"
          >
            Подписать все
          </button>
        </div>
      ) : (
        <div className="w-full bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 dark:text-green-400 mx-auto mb-2" />
          <p className="text-base font-semibold text-green-800 dark:text-green-300">Все документы подписаны</p>
          <p className="text-sm text-green-600 dark:text-green-400/70 mt-1">Новые документы появятся здесь</p>
        </div>
      )}

      {/* Assigned to you */}
      {(() => {
        const assignedDocs = docs.filter(d => d.assignedTo === user?.name && d.status === DocumentStatus.NEED_SIGN)
        if (assignedDocs.length === 0) return null
        return (
          <Card className="!p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <UserCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Назначено вам</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{assignedDocs.length} {assignedDocs.length === 1 ? 'документ' : assignedDocs.length < 5 ? 'документа' : 'документов'}</p>
              </div>
            </div>
            <div className="space-y-2">
              {assignedDocs.slice(0, 3).map(d => (
                <button key={d.id} onClick={() => navigate(`/documents/${d.id}`)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/30 transition-colors text-left">
                  <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{d.number}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{d.sender.name} · {d.route.from} → {d.route.to}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
            {assignedDocs.length > 3 && (
              <button onClick={() => navigate('/documents?assigned=true')} className="w-full mt-2 text-sm text-brand-600 font-medium py-1">
                Показать все
              </button>
            )}
          </Card>
        )
      })()}

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card onClick={() => navigate('/documents?status=IN_PROGRESS')} className="text-center !py-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
            <Clock className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{inProgress}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">В работе</p>
        </Card>
        <Card onClick={() => navigate('/archive')} className="text-center !py-4">
          <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-2">
            <Archive className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{signed}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">В архиве</p>
        </Card>
      </div>

      {/* Stats link */}
      <Card onClick={() => navigate('/stats')} className="flex items-center gap-3 !p-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0">
          <BarChart3 className="h-6 w-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Статистика за месяц</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Подписания, суммы, маршруты</p>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
      </Card>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Последние действия</h2>
          {activity.length > 5 && (
            <button onClick={() => navigate('/documents')} className="text-sm text-brand-600 font-medium">
              Все
            </button>
          )}
        </div>
        {activity.length === 0 ? (
          <div className="text-center py-8">
            <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Пока нет действий</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 5).map(a => {
              const Icon = activityIcons[a.type]
              const color = activityColors[a.type]
              return (
                <Card key={a.id} onClick={() => navigate(`/documents/${a.documentId}`)} className="flex items-center gap-3 !p-3.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{a.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatDateTime(a.timestamp)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* QR Scanner FAB */}
      <button
        onClick={() => navigate('/scan')}
        className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full bg-brand-600 text-white shadow-[0_4px_14px_rgba(124,58,237,0.4)] flex items-center justify-center active:bg-brand-700 active:scale-90 transition-all duration-200"
        aria-label="Сканировать QR-код"
      >
        <QrCode className="h-6 w-6" />
      </button>
    </div>
  )
}
