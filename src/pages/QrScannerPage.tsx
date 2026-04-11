import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, CheckCircle, AlertTriangle, Search, FileText } from 'lucide-react'
import { getItem } from '../lib/storage'
import { STORAGE_KEYS, DocumentStatus, STATUS_LABELS } from '../lib/constants'
import type { DocRecord } from '../lib/constants'

type ScanState = 'scanning' | 'found' | 'found_signed' | 'not_found'

function formatAmount(v: number): string {
  return v.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })
}

export default function QrScannerPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<ScanState>('scanning')
  const [foundDoc, setFoundDoc] = useState<DocRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DocRecord[]>([])
  const [searchPerformed, setSearchPerformed] = useState(false)

  const allDocs = useMemo(() => getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? [], [])

  // Fake scan: pick a random NEED_SIGN doc after 2.5s
  useEffect(() => {
    if (state !== 'scanning') return

    const timer = setTimeout(() => {
      const needSign = allDocs.filter(d => d.status === DocumentStatus.NEED_SIGN)

      if (needSign.length > 0) {
        const randomDoc = needSign[Math.floor(Math.random() * needSign.length)]
        setFoundDoc(randomDoc)
        setState('found')
      } else {
        // Try any doc at all for the scan demo
        if (allDocs.length > 0) {
          const randomDoc = allDocs[Math.floor(Math.random() * allDocs.length)]
          setFoundDoc(randomDoc)
          setState(randomDoc.status === DocumentStatus.SIGNED ? 'found_signed' : 'found')
        } else {
          setState('not_found')
        }
      }
    }, 2500)

    return () => clearTimeout(timer)
  }, [state, allDocs])

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setSearchResults([])
      setSearchPerformed(false)
      return
    }
    const results = allDocs.filter(d => {
      const num = d.number.toLowerCase()
      if (num === q) return true
      const parts = d.number.split('-')
      const tail = parts[parts.length - 1]
      if (tail === q) return true
      return num.includes(q)
    })
    setSearchResults(results)
    setSearchPerformed(true)
  }, [searchQuery, allDocs])

  const selectSearchResult = useCallback((doc: DocRecord) => {
    setFoundDoc(doc)
    setState(doc.status === DocumentStatus.SIGNED ? 'found_signed' : 'found')
  }, [])

  const resetToScanning = useCallback(() => {
    setFoundDoc(null)
    setState('scanning')
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Cancel button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
      >
        <X className="h-6 w-6 text-white" />
      </button>

      {/* Manual search input */}
      <div className="pt-14 px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (!e.target.value.trim()) {
                setSearchResults([])
                setSearchPerformed(false)
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            placeholder='Номер документа (напр. "001" или "ЭТрН-2026-001")'
            className="w-full pl-10 pr-20 py-3 rounded-xl bg-white/10 text-white placeholder:text-white/40 text-sm outline-none focus:ring-2 focus:ring-green-400/50"
          />
          <button
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-green-500/80 text-white text-xs font-medium active:bg-green-500 transition-colors"
          >
            Найти
          </button>
        </div>

        {/* Search results */}
        {searchPerformed && searchResults.length > 0 && (
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {searchResults.map(doc => (
              <button
                key={doc.id}
                onClick={() => selectSearchResult(doc)}
                className="w-full text-left px-4 py-3 rounded-xl bg-white/10 active:bg-white/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-white/60 flex-shrink-0" />
                    <span className="text-white text-sm font-medium">{doc.number}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    doc.status === DocumentStatus.SIGNED ? 'bg-green-500/20 text-green-400' :
                    doc.status === DocumentStatus.NEED_SIGN ? 'bg-amber-500/20 text-amber-400' :
                    'bg-white/10 text-white/60'
                  }`}>
                    {STATUS_LABELS[doc.status]}
                  </span>
                </div>
                <p className="text-white/50 text-xs mt-1 truncate">
                  {doc.sender.name} &middot; {doc.route.from} &rarr; {doc.route.to}
                </p>
              </button>
            ))}
          </div>
        )}

        {searchPerformed && searchResults.length === 0 && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">Документ не найден</span>
            </div>
            <p className="text-white/40 text-xs mt-1">Проверьте номер и попробуйте ещё раз</p>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {state === 'scanning' && (
          <>
            {/* Viewfinder */}
            <div className="relative w-64 h-64">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white rounded-br-lg" />

              {/* Scanning line */}
              <div
                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent"
                style={{
                  animation: 'scanLine 2s ease-in-out infinite',
                }}
              />
            </div>

            <p className="text-white/80 text-center mt-8 text-base px-8">
              Наведите камеру на QR-код документа
            </p>
          </>
        )}

        {/* Found document (NEED_SIGN / IN_PROGRESS etc.) */}
        {state === 'found' && foundDoc && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-base">{foundDoc.number}</p>
                    <p className="text-amber-400 text-xs font-medium">{STATUS_LABELS[foundDoc.status]}</p>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Отправитель</p>
                  <p className="text-white text-sm">{foundDoc.sender.name}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Маршрут</p>
                  <p className="text-white text-sm">{foundDoc.route.from} &rarr; {foundDoc.route.to}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Сумма</p>
                  <p className="text-white text-sm font-medium">{formatAmount(foundDoc.amount)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex gap-3">
                <button
                  onClick={() => navigate(`/documents/${foundDoc.id}`)}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium active:bg-white/20 transition-colors"
                >
                  Открыть документ
                </button>
                <button
                  onClick={() => navigate(`/documents/${foundDoc.id}/sign?mode=sign`)}
                  className="flex-1 py-3 rounded-xl bg-green-500 text-white text-sm font-semibold active:bg-green-600 transition-colors"
                >
                  Подписать
                </button>
              </div>
            </div>

            {/* Scan again */}
            <button
              onClick={resetToScanning}
              className="w-full mt-3 py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium active:bg-white/10 transition-colors"
            >
              Сканировать ещё
            </button>
          </div>
        )}

        {/* Found document (already SIGNED) */}
        {state === 'found_signed' && foundDoc && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-green-500/10 backdrop-blur-md rounded-2xl border border-green-500/20 overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-green-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-base">{foundDoc.number}</p>
                    <p className="text-green-400 text-xs font-medium">Документ уже подписан</p>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Отправитель</p>
                  <p className="text-white text-sm">{foundDoc.sender.name}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Маршрут</p>
                  <p className="text-white text-sm">{foundDoc.route.from} &rarr; {foundDoc.route.to}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Сумма</p>
                  <p className="text-white text-sm font-medium">{formatAmount(foundDoc.amount)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 pb-5">
                <button
                  onClick={() => navigate(`/documents/${foundDoc.id}`)}
                  className="w-full py-3 rounded-xl bg-green-500 text-white text-sm font-semibold active:bg-green-600 transition-colors"
                >
                  Просмотреть
                </button>
              </div>
            </div>

            {/* Scan again */}
            <button
              onClick={resetToScanning}
              className="w-full mt-3 py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium active:bg-white/10 transition-colors"
            >
              Сканировать ещё
            </button>
          </div>
        )}

        {state === 'not_found' && (
          <div className="flex flex-col items-center px-8">
            <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-orange-400" />
            </div>
            <p className="text-white text-lg font-semibold text-center">Документ не найден</p>
            <p className="text-white/60 text-sm mt-2 text-center">
              Нет документов в системе
            </p>
            <button
              onClick={resetToScanning}
              className="mt-6 px-8 py-3 rounded-xl bg-white/10 text-white font-medium active:bg-white/20 transition-colors"
            >
              Сканировать ещё
            </button>
            <button
              onClick={() => navigate(-1)}
              className="mt-3 px-8 py-3 rounded-xl bg-white/5 text-white/60 font-medium active:bg-white/10 transition-colors"
            >
              Назад
            </button>
          </div>
        )}
      </div>

      {/* Bottom cancel button (scanning state only) */}
      {state === 'scanning' && (
        <div className="pb-12 flex justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-8 py-3 rounded-xl bg-white/10 text-white font-medium active:bg-white/20 transition-colors"
          >
            Отмена
          </button>
        </div>
      )}

      {/* CSS animation */}
      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 8px; }
          50% { top: calc(100% - 8px); }
        }
        .border-t-3 { border-top-width: 3px; }
        .border-b-3 { border-bottom-width: 3px; }
        .border-l-3 { border-left-width: 3px; }
        .border-r-3 { border-right-width: 3px; }
      `}</style>
    </div>
  )
}
