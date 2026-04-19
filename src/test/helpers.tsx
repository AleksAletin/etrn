import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'

export interface RenderOptions {
  initialPath?: string
  routePattern?: string
}

/**
 * Рендерит компонент внутри MemoryRouter + ToastProvider.
 * Используется для тестов страниц, завязанных на роутер.
 */
export function renderWithRouter(
  ui: ReactNode,
  { initialPath = '/', routePattern = '*' }: RenderOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <Routes>
          <Route path={routePattern} element={ui} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

/**
 * Простой рендер с ToastProvider и без роутера — для unit-компонентов.
 */
export function renderWithToast(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

/** Валидный User для тестов */
export const testUser = {
  id: 'user-test',
  phone: '79991234567',
  name: 'Иванов Сергей Петрович',
  email: 'test@example.ru',
  company: 'ООО «ТестТранс»',
  inn: '7712345678',
  kind: 'ul' as const,
  ogrn: '1027700111222',
  onboardingCompleted: true,
}
