import { useNavigate } from 'react-router-dom'
import { X, LayoutDashboard, FileText, Archive, BarChart3, User, Settings, LogOut } from 'lucide-react'
import Badge from '../ui/Badge'
import type { UserProfile, Subscription } from '../../lib/constants'

interface BurgerMenuProps {
  open: boolean
  onClose: () => void
  user: UserProfile | null
  subscription: Subscription | null
}

const menuItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Главная' },
  { to: '/documents', icon: FileText, label: 'Документы' },
  { to: '/archive', icon: Archive, label: 'Архив' },
  { to: '/stats', icon: BarChart3, label: 'Статистика' },
  { to: '/profile', icon: User, label: 'Профиль' },
  { to: '/settings', icon: Settings, label: 'Настройки' },
]

const subBadge: Record<string, 'success' | 'error' | 'warning'> = {
  active: 'success',
  expired: 'error',
  unpaid: 'warning',
}

const subLabel: Record<string, string> = {
  active: 'Активна',
  expired: 'Просрочена',
  unpaid: 'Не оплачена',
}

export default function BurgerMenu({ open, onClose, user, subscription }: BurgerMenuProps) {
  const navigate = useNavigate()

  const goTo = (to: string) => {
    navigate(to)
    onClose()
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/')
    onClose()
  }

  // Условный рендер: если меню закрыто, вообще не рендерим DOM.
  // Это надёжнее чем transform, который в Tailwind v4 иногда не скрывает
  // элементы за экран и перекрывает кнопки TopBar.
  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        data-testid="burger-overlay"
        className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        data-testid="burger-panel"
        className="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
        style={{ animation: 'slideInLeft 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
              <User className="h-6 w-6 text-brand-700 dark:text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.name ?? 'Пользователь'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.company ?? ''}</p>
              {subscription && (
                <Badge variant={subBadge[subscription.status]} className="mt-1">
                  {subLabel[subscription.status]}
                </Badge>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1 -mt-1 rounded-xl active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Menu items */}
        <div className="flex-1 py-2 overflow-y-auto">
          {menuItems.map(({ to, icon: Icon, label }) => (
            <button
              key={to}
              onClick={() => goTo(to)}
              className="flex items-center gap-3 w-full px-5 py-3.5 text-left text-gray-700 dark:text-gray-300 active:bg-gray-50 dark:active:bg-gray-800 transition-colors min-h-[48px]"
            >
              <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <span className="text-[15px] font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Logout */}
        <div className="border-t border-gray-100 dark:border-gray-800/50 p-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-3 text-left text-red-600 dark:text-red-400 rounded-xl active:bg-red-50 dark:active:bg-red-900/20 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Выйти</span>
          </button>
        </div>
      </div>
    </>
  )
}
