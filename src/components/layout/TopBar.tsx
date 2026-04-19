import { useNavigate } from 'react-router-dom'
import { Menu, ChevronLeft, User, Bell } from 'lucide-react'
import { getItem } from '../../lib/storage'
import { STORAGE_KEYS } from '../../lib/constants'
import type { AppNotification } from '../../lib/constants'

interface TopBarProps {
  title: string
  showBack?: boolean
  onMenuClick?: () => void
}

export default function TopBar({ title, showBack, onMenuClick }: TopBarProps) {
  const navigate = useNavigate()

  const notifications = getItem<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS) ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100/80 dark:border-gray-800/50">
      <div className="flex items-center justify-between h-14 px-4 gap-2">
        <button
          onClick={showBack ? () => navigate(-1) : onMenuClick}
          aria-label={showBack ? 'Назад' : 'Меню'}
          type="button"
          className="relative z-10 w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 dark:active:bg-gray-800 -ml-1 transition-colors shrink-0"
        >
          {showBack ? (
            <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300 pointer-events-none" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700 dark:text-gray-300 pointer-events-none" />
          )}
        </button>
        <h1 className="text-[17px] font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1 text-center">{title}</h1>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => navigate('/notifications')}
            aria-label="Уведомления"
            className="relative w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
          >
            <Bell className="h-[22px] w-[22px] text-gray-600 dark:text-gray-400" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center px-1 ring-2 ring-white dark:ring-gray-900">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/profile')}
            aria-label="Профиль"
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 dark:active:bg-gray-800 -mr-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
              <User className="h-4 w-4 text-brand-700 dark:text-brand-400" />
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}
