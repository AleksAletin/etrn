import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, FileText, ChevronRight, SlidersHorizontal, X, CheckSquare, Square, Truck, Check, XCircle } from 'lucide-react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { SkeletonCard } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import { getItem, simulateDelay, shouldSimulateError } from '../lib/storage'
import { STORAGE_KEYS, DocumentStatus, STATUS_LABELS, STATUS_COLORS, DOC_TYPE_LABELS } from '../lib/constants'
import type { DocRecord, Trip } from '../lib/constants'
import { formatDate, cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

const statusFilters: { label: string; value: string }[] = [
  { label: 'Все', value: 'ALL' },
  { label: 'На подпись', value: DocumentStatus.NEED_SIGN },
  { label: 'В работе', value: DocumentStatus.IN_PROGRESS },
  { label: 'Отказ', value: DocumentStatus.REFUSED },
  { label: 'Ошибка', value: DocumentStatus.ERROR },
]


const SELECTABLE_STATUSES = new Set([DocumentStatus.NEED_SIGN, DocumentStatus.ERROR])

const badgeVariant: Record<DocumentStatus, 'info' | 'warning' | 'success' | 'error'> = {
  [DocumentStatus.NEED_SIGN]: 'info',
  [DocumentStatus.IN_PROGRESS]: 'warning',
  [DocumentStatus.SIGNED]: 'success',
  [DocumentStatus.SIGNED_WITH_RESERVATIONS]: 'warning',
  [DocumentStatus.REFUSED]: 'error',
  [DocumentStatus.ERROR]: 'error',
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function DocumentListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [docs, setDocs] = useState<DocRecord[]>([])

  // Filter state — initialized from URL params
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'ALL')
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '')
  const [senderFilter, setSenderFilter] = useState(searchParams.get('sender') || '')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Trip grouping
  const [groupByTrip, setGroupByTrip] = useState(false)
  const trips = useMemo(() => getItem<Trip[]>(STORAGE_KEYS.TRIPS) ?? [], [])

  // Swipe state
  const { toast } = useToast()
  const touchRef = useRef<{ startX: number; startY: number; id: string } | null>(null)

  // Sync filter state to URL search params
  const syncParams = useCallback(
    (overrides: Record<string, string> = {}) => {
      const state: Record<string, string> = {
        status: statusFilter,
        q: search,
        dateFrom,
        dateTo,
        sender: senderFilter,
        ...overrides,
      }
      const params: Record<string, string> = {}
      if (state.status && state.status !== 'ALL') params.status = state.status
      if (state.q) params.q = state.q
      if (state.dateFrom) params.dateFrom = state.dateFrom
      if (state.dateTo) params.dateTo = state.dateTo
      if (state.sender) params.sender = state.sender
      setSearchParams(params, { replace: true })
    },
    [statusFilter, search, dateFrom, dateTo, senderFilter, setSearchParams],
  )

  // Count of active advanced filters (excluding status and search which are always visible)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (dateFrom) count++
    if (dateTo) count++
    if (senderFilter) count++
    return count
  }, [dateFrom, dateTo, senderFilter])

  // List of active filter labels for removable chips
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = []
    if (dateFrom) chips.push({ key: 'dateFrom', label: `С ${dateFrom}` })
    if (dateTo) chips.push({ key: 'dateTo', label: `По ${dateTo}` })
    if (senderFilter) chips.push({ key: 'sender', label: senderFilter })
    return chips
  }, [dateFrom, dateTo, senderFilter])

  const removeFilter = (key: string) => {
    const updates: Record<string, string> = {}
    if (key === 'dateFrom') { setDateFrom(''); updates.dateFrom = '' }
    if (key === 'dateTo') { setDateTo(''); updates.dateTo = '' }
    if (key === 'sender') { setSenderFilter(''); updates.sender = '' }
    syncParams(updates)
  }

  const clearAllFilters = () => {
    setDateFrom('')
    setDateTo('')
    setSenderFilter('')
    syncParams({ dateFrom: '', dateTo: '', sender: '' })
  }

  // Extract unique sender names
  const uniqueSenders = useMemo(() => {
    const names = new Set<string>()
    docs.forEach(d => names.add(d.sender.name))
    return Array.from(names).sort()
  }, [docs])

  const load = async () => {
    setLoading(true)
    setError(false)
    await simulateDelay()
    if (shouldSimulateError() && Math.random() < 0.3) {
      setError(true)
      setLoading(false)
      return
    }
    const all = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
    // Exclude SIGNED and SIGNED_WITH_RESERVATIONS — those are in archive
    setDocs(all.filter(d => d.status !== DocumentStatus.SIGNED && d.status !== DocumentStatus.SIGNED_WITH_RESERVATIONS))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Sync params whenever filters change
  useEffect(() => {
    syncParams()
  }, [statusFilter, search, dateFrom, dateTo, senderFilter])

  const filtered = useMemo(() => {
    let result = docs

    // Status filter
    if (statusFilter !== 'ALL') result = result.filter(d => d.status === statusFilter)

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d => d.number.toLowerCase().includes(q) || d.title.toLowerCase().includes(q) || d.sender.name.toLowerCase().includes(q))
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      result = result.filter(d => new Date(d.updatedAt) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(d => new Date(d.updatedAt) <= to)
    }

    // Sender filter
    if (senderFilter) {
      result = result.filter(d => d.sender.name === senderFilter)
    }

    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [docs, statusFilter, search, dateFrom, dateTo, senderFilter])

  // Selectable documents from the filtered list
  const selectableDocs = useMemo(
    () => filtered.filter(d => SELECTABLE_STATUSES.has(d.status)),
    [filtered],
  )

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableDocs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableDocs.map(d => d.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkSign = () => {
    if (selectedIds.size === 0) return
    navigate(`/documents/bulk-sign?ids=${Array.from(selectedIds).join(',')}`)
  }

  // Date preset helpers
  const applyDatePreset = (preset: 'today' | 'week' | 'month') => {
    const now = new Date()
    const todayStr = toDateInputValue(now)
    let fromDate: Date

    if (preset === 'today') {
      fromDate = now
    } else if (preset === 'week') {
      fromDate = new Date(now)
      fromDate.setDate(now.getDate() - 7)
    } else {
      fromDate = new Date(now)
      fromDate.setMonth(now.getMonth() - 1)
    }

    const fromStr = toDateInputValue(fromDate)
    setDateFrom(fromStr)
    setDateTo(todayStr)
  }

  // Swipe handlers
  const onTouchStart = (id: string, e: React.TouchEvent) => {
    if (selectionMode) return
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, id }
  }
  const onTouchMove = (id: string, e: React.TouchEvent) => {
    if (!touchRef.current || touchRef.current.id !== id || selectionMode) return
    const dx = e.touches[0].clientX - touchRef.current.startX
    const dy = e.touches[0].clientY - touchRef.current.startY
    // Ignore vertical swipes
    if (Math.abs(dy) > Math.abs(dx)) return
    const el = (e.currentTarget as HTMLElement).querySelector('[data-swipe-card]') as HTMLElement
    if (el) el.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`
  }
  const onTouchEnd = (doc: DocRecord, e: React.TouchEvent) => {
    if (!touchRef.current || touchRef.current.id !== doc.id || selectionMode) return
    const dx = e.changedTouches[0].clientX - touchRef.current.startX
    const el = (e.currentTarget as HTMLElement).querySelector('[data-swipe-card]') as HTMLElement
    if (el) el.style.transform = ''
    touchRef.current = null

    if (doc.status !== DocumentStatus.NEED_SIGN) return
    if (dx > 80) {
      navigate(`/documents/${doc.id}/sign?mode=sign`)
    } else if (dx < -80) {
      toast('Отклонение (демо)', 'info')
    }
  }

  const renderDocCard = (doc: DocRecord) => {
    const isSelectable = SELECTABLE_STATUSES.has(doc.status)
    const isSelected = selectedIds.has(doc.id)
    const canSwipe = !selectionMode && doc.status === DocumentStatus.NEED_SIGN

    return (
      <div
        key={doc.id}
        className="relative overflow-hidden rounded-2xl"
        onTouchStart={e => onTouchStart(doc.id, e)}
        onTouchMove={e => onTouchMove(doc.id, e)}
        onTouchEnd={e => onTouchEnd(doc, e)}
      >
        {/* Swipe backgrounds */}
        {canSwipe && (
          <>
            <div className="absolute inset-0 bg-green-500 flex items-center px-6">
              <Check className="h-6 w-6 text-white" />
              <span className="text-white text-sm font-semibold ml-2">Подписать</span>
            </div>
            <div className="absolute inset-0 bg-red-500 flex items-center justify-end px-6">
              <span className="text-white text-sm font-semibold mr-2">Отклонить</span>
              <XCircle className="h-6 w-6 text-white" />
            </div>
          </>
        )}
        <Card
          data-swipe-card
          onClick={() => {
            if (selectionMode) {
              if (isSelectable) toggleSelection(doc.id)
            } else {
              navigate(`/documents/${doc.id}`)
            }
          }}
          className={cn(
            'relative z-10 flex items-center gap-3 !p-4 transition-transform',
            selectionMode && isSelected && 'ring-2 ring-brand-500 bg-brand-50/30',
            selectionMode && !isSelectable && 'opacity-50',
          )}
        >
          {selectionMode && (
            <div className="shrink-0">
              {isSelectable ? (
                isSelected ? <CheckSquare className="h-6 w-6 text-brand-600" /> : <Square className="h-6 w-6 text-gray-300" />
              ) : (
                <div className="h-6 w-6" />
              )}
            </div>
          )}
          <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', STATUS_COLORS[doc.status].bg)}>
            <FileText className={cn('h-6 w-6', STATUS_COLORS[doc.status].text)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.number}</p>
              <Badge variant={badgeVariant[doc.status]} className="shrink-0">{STATUS_LABELS[doc.status]}</Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{doc.sender.name} → {doc.receiver.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{DOC_TYPE_LABELS[doc.type]} · {formatDate(doc.updatedAt)}</p>
          </div>
          {!selectionMode && <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />}
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-12 skeleton rounded-xl" />
        <div className="flex gap-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-8 w-20 skeleton rounded-full" />)}</div>
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (error) {
    return <ErrorState title="Не удалось загрузить" description="Проверьте подключение и попробуйте снова" onRetry={load} />
  }

  return (
    <div className={cn('p-4 space-y-3', selectionMode && selectedIds.size > 0 && 'pb-32')}>
      {/* Search + Filters + Select button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Номер или отправитель..."
            className="w-full pl-11 pr-4 py-3.5 rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/80 text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-200"
          />
        </div>
        {!selectionMode ? (
          <>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={cn(
                'flex items-center gap-1.5 px-4 rounded-xl border font-medium text-sm whitespace-nowrap min-h-[44px] transition-colors shrink-0',
                filtersOpen || activeFilterCount > 0
                  ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 active:bg-gray-50 dark:active:bg-gray-700',
              )}
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span>Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </button>
            <button
              onClick={() => setSelectionMode(true)}
              className="shrink-0 px-4 rounded-[14px] bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-sm font-semibold whitespace-nowrap active:bg-brand-100 dark:active:bg-brand-900/50 transition-colors min-h-[44px]"
            >
              Выбрать
            </button>
          </>
        ) : (
          <button
            onClick={exitSelectionMode}
            className="shrink-0 w-12 h-12 rounded-[14px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        )}
      </div>

      {/* Select all / deselect toggle in selection mode */}
      {selectionMode && selectableDocs.length > 0 && (
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 active:text-brand-800 py-1"
        >
          {selectedIds.size === selectableDocs.length ? (
            <>
              <CheckSquare className="h-5 w-5" />
              Снять выделение
            </>
          ) : (
            <>
              <Square className="h-5 w-5" />
              Выбрать все ({selectableDocs.length})
            </>
          )}
        </button>
      )}

      {/* Expandable filter panel */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          filtersOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/50">
          {/* Date range */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Период</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">С</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-3 rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">По</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-3 rounded-[14px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-base text-gray-900 dark:text-gray-100 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {([['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => applyDatePreset(key)}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-600 active:bg-gray-100 min-h-[44px] transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sender filter */}
          {uniqueSenders.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Отправитель</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setSenderFilter('')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 min-h-[44px] transition-colors',
                    senderFilter === ''
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-100',
                  )}
                >
                  Все отправители
                </button>
                {uniqueSenders.map(name => (
                  <button
                    key={name}
                    onClick={() => setSenderFilter(name)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 min-h-[44px] transition-colors',
                      senderFilter === name
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-100',
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterChips.map(chip => (
            <button
              key={chip.key}
              onClick={() => removeFilter(chip.key)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-brand-50 text-brand-700 border border-brand-200 min-h-[36px] transition-colors active:bg-brand-100"
            >
              {chip.label}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-sm text-gray-500 underline underline-offset-2 active:text-gray-700 min-h-[36px] px-1"
          >
            Сбросить все
          </button>
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {statusFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 min-h-[44px]',
              statusFilter === f.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Trip grouping toggle */}
      {!selectionMode && trips.length > 0 && (
        <button
          onClick={() => setGroupByTrip(g => !g)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
            groupByTrip ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700',
          )}
        >
          <Truck className="h-4 w-4" />
          По рейсам
        </button>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Нет документов" description="Документы появятся здесь, когда будут отправлены" />
      ) : groupByTrip ? (
        // Grouped by trip
        <div className="space-y-4">
          {(() => {
            const groups: { trip: Trip | null; docs: DocRecord[] }[] = []
            const tripMap = new Map<string, DocRecord[]>()
            const noTrip: DocRecord[] = []
            for (const doc of filtered) {
              if (doc.tripId) {
                if (!tripMap.has(doc.tripId)) tripMap.set(doc.tripId, [])
                tripMap.get(doc.tripId)!.push(doc)
              } else {
                noTrip.push(doc)
              }
            }
            for (const [tripId, docs] of tripMap) {
              const trip = trips.find(t => t.id === tripId) || null
              groups.push({ trip, docs })
            }
            if (noTrip.length > 0) groups.push({ trip: null, docs: noTrip })

            return groups.map((g, gi) => (
              <div key={gi}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Truck className="h-4 w-4 text-brand-600" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {g.trip ? `${g.trip.name} · ${g.trip.date} · ${g.trip.vehiclePlate}` : 'Без рейса'}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{g.docs.length} док.</span>
                </div>
                <div className="space-y-2">
                  {g.docs.map(doc => renderDocCard(doc))}
                </div>
              </div>
            ))
          })()}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => renderDocCard(doc))}
        </div>
      )}

      {/* Fixed bottom bar when items are selected */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed left-0 right-0 bottom-20 px-4 pb-3 pt-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 shadow-lg z-30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Выбрано: <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedIds.size}</span>
            </p>
            <Button size="sm" onClick={handleBulkSign}>
              Подписать ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
