import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import BurgerMenu from './BurgerMenu'
import { renderWithRouter, testUser } from '../../test/helpers'

describe('BurgerMenu', () => {
  it('не рендерится в DOM когда open=false (нет артефактов на экране)', () => {
    renderWithRouter(
      <BurgerMenu open={false} onClose={() => {}} user={testUser} subscription={null} />,
    )
    // panel не должен быть в DOM
    expect(screen.queryByTestId('burger-panel')).not.toBeInTheDocument()
    // overlay тоже
    expect(screen.queryByTestId('burger-overlay')).not.toBeInTheDocument()
  })

  it('рендерится когда open=true и показывает имя юзера', () => {
    renderWithRouter(
      <BurgerMenu open={true} onClose={() => {}} user={testUser} subscription={null} />,
    )
    expect(screen.getByTestId('burger-panel')).toBeInTheDocument()
    expect(screen.getByText(testUser.name)).toBeInTheDocument()
    expect(screen.getByText(testUser.company)).toBeInTheDocument()
  })

  it('показывает все пункты навигации', () => {
    renderWithRouter(
      <BurgerMenu open={true} onClose={() => {}} user={testUser} subscription={null} />,
    )
    ;['Главная', 'Документы', 'Архив', 'Статистика', 'Профиль', 'Настройки'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('показывает "Выйти" кнопку', () => {
    renderWithRouter(
      <BurgerMenu open={true} onClose={() => {}} user={testUser} subscription={null} />,
    )
    expect(screen.getByText('Выйти')).toBeInTheDocument()
  })

  it('вызывает onClose при клике на overlay', () => {
    const onClose = vi.fn()
    renderWithRouter(
      <BurgerMenu open={true} onClose={onClose} user={testUser} subscription={null} />,
    )
    fireEvent.click(screen.getByTestId('burger-overlay'))
    expect(onClose).toHaveBeenCalled()
  })

  it('показывает статус подписки если передан', () => {
    renderWithRouter(
      <BurgerMenu
        open={true}
        onClose={() => {}}
        user={testUser}
        subscription={{
          companyName: 'X',
          companyInn: '7712345678',
          status: 'active',
          periodFrom: '2026-01-01',
          periodTo: '2026-12-31',
          plan: 'Пакет 500',
          used: 10,
          limit: 500,
        }}
      />,
    )
    expect(screen.getByText('Активна')).toBeInTheDocument()
  })
})
