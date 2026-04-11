import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, FileText, RotateCcw } from 'lucide-react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { getItem, setItem, shouldSimulateError } from '../lib/storage'
import { STORAGE_KEYS, DocumentStatus } from '../lib/constants'
import type { DocRecord, ActivityLogEntry } from '../lib/constants'
import { generateId, cn } from '../lib/utils'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface DocSignState {
  id: string
  number: string
  senderName: string
  steps: StepStatus[]
  status: 'waiting' | 'processing' | 'success' | 'error'
}

const STEP_LABELS = ['Проверка', 'Подпись', 'Отправка']
const STEP_DELAY = 1500

export default function BulkSigningPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean)

  const [docStates, setDocStates] = useState<DocSignState[]>([])
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const startedRef = useRef(false)

  // Initialize doc states from localStorage
  useEffect(() => {
    const allDocs = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
    const states: DocSignState[] = ids
      .map(id => {
        const doc = allDocs.find(d => d.id === id)
        if (!doc) return null
        return {
          id: doc.id,
          number: doc.number,
          senderName: doc.sender.name,
          steps: ['pending', 'pending', 'pending'] as StepStatus[],
          status: 'waiting' as const,
        }
      })
      .filter((s): s is NonNullable<typeof s> & DocSignState => s !== null)

    setDocStates(states)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const processDocuments = useCallback(async (states: DocSignState[]) => {
    if (states.length === 0) return

    setProcessing(true)
    const simulateError = shouldSimulateError()
    const failIndex = simulateError ? Math.floor(Math.random() * states.length) : -1
    const failStep = simulateError ? Math.floor(Math.random() * 3) : -1

    let currentStates = [...states]

    for (let docIdx = 0; docIdx < currentStates.length; docIdx++) {
      const docState = currentStates[docIdx]
      if (docState.status === 'success') continue // skip already successful (retry scenario)

      // Mark as processing
      currentStates = currentStates.map((s, i) =>
        i === docIdx ? { ...s, status: 'processing' as const, steps: ['pending', 'pending', 'pending'] } : s
      )
      setDocStates([...currentStates])

      let failed = false
      for (let step = 0; step < 3; step++) {
        // Mark step active
        currentStates = currentStates.map((s, i) => {
          if (i !== docIdx) return s
          const newSteps = [...s.steps] as StepStatus[]
          newSteps[step] = 'active'
          return { ...s, steps: newSteps }
        })
        setDocStates([...currentStates])

        await new Promise(resolve => setTimeout(resolve, STEP_DELAY))

        // Check for simulated error
        if (docIdx === failIndex && step === failStep) {
          currentStates = currentStates.map((s, i) => {
            if (i !== docIdx) return s
            const newSteps = [...s.steps] as StepStatus[]
            newSteps[step] = 'error'
            return { ...s, steps: newSteps, status: 'error' as const }
          })
          setDocStates([...currentStates])
          failed = true
          break
        }

        // Mark step done
        currentStates = currentStates.map((s, i) => {
          if (i !== docIdx) return s
          const newSteps = [...s.steps] as StepStatus[]
          newSteps[step] = 'done'
          return { ...s, steps: newSteps }
        })
        setDocStates([...currentStates])
      }

      if (!failed) {
        // Update localStorage for this doc
        const now = new Date().toISOString()
        const allDocs = getItem<DocRecord[]>(STORAGE_KEYS.DOCUMENTS) ?? []
        const updated = allDocs.map(d => {
          if (d.id !== docState.id) return d
          return {
            ...d,
            status: DocumentStatus.SIGNED,
            signedAt: now,
            updatedAt: now,
            history: [...d.history, {
              id: generateId(),
              timestamp: now,
              action: 'signed' as const,
              actor: 'Вы',
              description: 'Документ подписан электронной подписью (массовое подписание)',
            }],
          }
        })
        setItem(STORAGE_KEYS.DOCUMENTS, updated)

        // Add activity entry
        const activity = getItem<ActivityLogEntry[]>(STORAGE_KEYS.ACTIVITY) ?? []
        activity.unshift({
          id: generateId(),
          timestamp: now,
          type: 'sign',
          documentId: docState.id,
          documentNumber: docState.number,
          message: `Документ ${docState.number} подписан`,
        })
        setItem(STORAGE_KEYS.ACTIVITY, activity)

        // Mark success
        currentStates = currentStates.map((s, i) =>
          i === docIdx ? { ...s, status: 'success' as const } : s
        )
        setDocStates([...currentStates])
      }
    }

    setProcessing(false)
    setDone(true)
  }, [])

  // Auto-start processing
  useEffect(() => {
    if (docStates.length > 0 && !processing && !done && !startedRef.current) {
      startedRef.current = true
      processDocuments(docStates)
    }
  }, [docStates, processing, done, processDocuments])

  const successCount = docStates.filter(s => s.status === 'success').length
  const errorCount = docStates.filter(s => s.status === 'error').length
  const totalCount = docStates.length

  const handleRetryFailed = () => {
    setDone(false)
    const resetStates = docStates.map(s =>
      s.status === 'error'
        ? { ...s, status: 'waiting' as const, steps: ['pending', 'pending', 'pending'] as StepStatus[] }
        : s
    )
    setDocStates(resetStates)
    processDocuments(resetStates)
  }

  if (ids.length === 0) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-6">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Нет документов для подписания</p>
        <Button onClick={() => navigate('/documents')}>К документам</Button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header status */}
      {done ? (
        <div className={cn(
          'rounded-2xl p-5 text-center',
          errorCount > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-green-50 dark:bg-green-900/20',
        )}>
          <div className="flex justify-center mb-3">
            {errorCount > 0 ? (
              <XCircle className="h-12 w-12 text-yellow-500" />
            ) : (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            Подписано {successCount} из {totalCount} документов
          </h2>
          {errorCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {errorCount} {errorCount === 1 ? 'документ' : errorCount < 5 ? 'документа' : 'документов'} с ошибкой
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-brand-50 dark:bg-brand-900/30 p-5 text-center">
          <Loader2 className="h-10 w-10 text-brand-600 animate-spin mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Подписание документов</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {successCount} из {totalCount} подписано
          </p>
        </div>
      )}

      {/* Document list with progress */}
      <div className="space-y-2">
        {docStates.map(ds => (
          <Card key={ds.id} className={cn(
            '!p-4',
            ds.status === 'error' && 'ring-1 ring-red-200',
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                ds.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                ds.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                ds.status === 'processing' ? 'bg-brand-50 dark:bg-brand-900/30' :
                'bg-gray-100 dark:bg-gray-800',
              )}>
                {ds.status === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : ds.status === 'error' ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : ds.status === 'processing' ? (
                  <Loader2 className="h-5 w-5 text-brand-600 animate-spin" />
                ) : (
                  <FileText className="h-5 w-5 text-gray-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ds.number}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{ds.senderName}</p>

                {/* Step indicators */}
                {(ds.status === 'processing' || ds.status === 'success' || ds.status === 'error') && (
                  <div className="flex items-center gap-3 mt-2">
                    {STEP_LABELS.map((label, idx) => {
                      const stepStatus = ds.steps[idx]
                      return (
                        <div key={idx} className="flex items-center gap-1">
                          {stepStatus === 'done' ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          ) : stepStatus === 'active' ? (
                            <Loader2 className="h-3.5 w-3.5 text-brand-600 animate-spin" />
                          ) : stepStatus === 'error' ? (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border border-gray-300" />
                          )}
                          <span className={cn(
                            'text-xs',
                            stepStatus === 'done' ? 'text-green-600' :
                            stepStatus === 'active' ? 'text-brand-600 font-medium' :
                            stepStatus === 'error' ? 'text-red-600' :
                            'text-gray-400',
                          )}>
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {ds.status === 'error' && (
                  <p className="text-xs text-red-600 mt-1">Не удалось подписать документ</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Bottom actions */}
      {done && (
        <div className="space-y-3 pt-2">
          {errorCount > 0 && (
            <Button fullWidth variant="secondary" onClick={handleRetryFailed}>
              <RotateCcw className="h-5 w-5" />
              Повторить ({errorCount})
            </Button>
          )}
          <Button fullWidth onClick={() => navigate('/documents')}>К документам</Button>
          <Button fullWidth variant="ghost" onClick={() => navigate('/dashboard')}>На главную</Button>
        </div>
      )}
    </div>
  )
}
