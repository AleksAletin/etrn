import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Download, MapPin, Truck, Package, Building2 } from 'lucide-react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { SkeletonCard } from '../components/ui/Skeleton'
import { getItem, simulateDelay } from '../lib/storage'
import { STORAGE_KEYS, DOC_TYPE_LABELS, STATUS_LABELS, DocumentStatus } from '../lib/constants'
import type { DocRecord } from '../lib/constants'
import { formatDateTime, formatMoney, cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import MockPdfPreview from '../components/documents/MockPdfPreview'

const historyDotColor: Record<string, string> = {
  created: 'bg-gray-400', sent: 'bg-blue-500', viewed: 'bg-yellow-500',
  signed: 'bg-green-500', rejected: 'bg-red-500', error: 'bg-red-500',
}

export default function ArchiveDetailPage() {
  const { id } = useParams()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<DocRecord | null>(null)
  const [tab, setTab] = useState<'preview' | 'details' | 'history' | 'files'>('preview')

  useEffect(() => {
    (async () => {
      await simulateDelay()
      const docs = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
      setDoc(docs.find(d => d.id === id) ?? null)
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-4 space-y-4"><SkeletonCard /><SkeletonCard /></div>
  if (!doc) return <div className="p-4 text-center text-gray-500 dark:text-gray-400 mt-20">Документ не найден</div>

  const tabs = [
    { key: 'preview' as const, label: 'Просмотр' },
    { key: 'details' as const, label: 'Детали' },
    { key: 'history' as const, label: 'История' },
    { key: 'files' as const, label: `Файлы (${doc.files.length})` },
  ]

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{doc.number}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{DOC_TYPE_LABELS[doc.type]}</p>
        </div>
        <Badge variant={doc.status === DocumentStatus.SIGNED_WITH_RESERVATIONS ? 'warning' : 'success'}>
          {STATUS_LABELS[doc.status]}
        </Badge>
      </div>

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

      {tab === 'preview' && <MockPdfPreview doc={doc} />}

      {tab === 'details' && (
        <div className="space-y-3">
          <Card>
            <div className="flex items-center gap-2 mb-3"><Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Стороны</span></div>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-400 dark:text-gray-500">Отправитель: </span><span className="text-gray-800 dark:text-gray-200">{doc.sender.name}</span></div>
              <div><span className="text-gray-400 dark:text-gray-500">Получатель: </span><span className="text-gray-800 dark:text-gray-200">{doc.receiver.name}</span></div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-3"><Truck className="h-4 w-4 text-gray-400 dark:text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Водитель</span></div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{doc.driver.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{doc.driver.vehiclePlate}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-3"><MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Маршрут</span></div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{doc.route.from} → {doc.route.to}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-3"><Package className="h-4 w-4 text-gray-400 dark:text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Груз</span></div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{doc.cargo.description}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{doc.cargo.weight.toLocaleString('ru')} кг · {doc.cargo.volume} м³</p>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-2">{formatMoney(doc.amount)}</p>
          </Card>
          {doc.signLocation && (
            <Card>
              <div className="flex items-center gap-2 mb-3"><MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">Место подписания</span></div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{doc.signLocation.address || 'Адрес не определён'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{doc.signLocation.lat.toFixed(6)}, {doc.signLocation.lng.toFixed(6)}</p>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div>
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
              <button onClick={() => toast('Скачивание недоступно в демо', 'info')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <Download className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Export button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-700/50 pb-safe">
        <Button fullWidth variant="secondary" onClick={() => toast('PDF сохранён (демо)', 'success')}>
          Экспортировать PDF
        </Button>
      </div>
    </div>
  )
}
