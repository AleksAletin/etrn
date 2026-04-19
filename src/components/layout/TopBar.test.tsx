import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import TopBar from './TopBar'
import { renderWithRouter } from '../../test/helpers'

describe('TopBar', () => {
  it('показывает заголовок', () => {
    renderWithRouter(<TopBar title="Главная" />)
    expect(screen.getByText('Главная')).toBeInTheDocument()
  })

  it('показывает кнопку «Меню» когда нет showBack', () => {
    renderWithRouter(<TopBar title="Главная" />)
    expect(screen.getByLabelText('Меню')).toBeInTheDocument()
    expect(screen.queryByLabelText('Назад')).not.toBeInTheDocument()
  })

  it('показывает кнопку «Назад» при showBack=true', () => {
    renderWithRouter(<TopBar title="Детали" showBack />)
    expect(screen.getByLabelText('Назад')).toBeInTheDocument()
    expect(screen.queryByLabelText('Меню')).not.toBeInTheDocument()
  })

  it('вызывает onMenuClick при клике на «Меню»', () => {
    const onMenuClick = vi.fn()
    renderWithRouter(<TopBar title="Главная" onMenuClick={onMenuClick} />)
    fireEvent.click(screen.getByLabelText('Меню'))
    expect(onMenuClick).toHaveBeenCalled()
  })

  it('показывает кнопки Уведомлений и Профиля', () => {
    renderWithRouter(<TopBar title="Главная" />)
    expect(screen.getByLabelText('Уведомления')).toBeInTheDocument()
    expect(screen.getByLabelText('Профиль')).toBeInTheDocument()
  })

  it('не теряет кликабельность Menu-кнопки при длинном заголовке', () => {
    const longTitle = 'Очень Длинный Заголовок Страницы Который Должен Быть Обрезан Truncate'
    const onMenuClick = vi.fn()
    renderWithRouter(<TopBar title={longTitle} onMenuClick={onMenuClick} />)
    const menuBtn = screen.getByLabelText('Меню')
    // Кнопка существует и кликабельна
    expect(menuBtn).toBeInTheDocument()
    fireEvent.click(menuBtn)
    expect(onMenuClick).toHaveBeenCalled()
  })

  it('показывает счётчик непрочитанных уведомлений', () => {
    localStorage.setItem(
      'etrn_notifications',
      JSON.stringify([
        { id: '1', type: 'new_doc', title: 'N1', message: 'm', timestamp: '2026-01-01', read: false },
        { id: '2', type: 'new_doc', title: 'N2', message: 'm', timestamp: '2026-01-01', read: false },
        { id: '3', type: 'new_doc', title: 'N3', message: 'm', timestamp: '2026-01-01', read: true },
      ]),
    )
    renderWithRouter(<TopBar title="Главная" />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
