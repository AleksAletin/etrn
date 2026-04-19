import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InviteLanding from './InviteLanding'
import type { InvitePayload } from '../../lib/mcdInvite'

const makeInvite = (overrides: Partial<InvitePayload> = {}): InvitePayload => ({
  id: 'inv-1',
  inviterId: 'user-1',
  inviterName: 'Смирнов Алексей',
  inviterCompany: 'ООО «ТрансЛогистик»',
  recipientName: 'Петров Иван Иванович',
  recipientContact: '+79991234567',
  channel: 'sms',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  oneTime: true,
  ...overrides,
})

describe('InviteLanding', () => {
  it('рендерит красивый welcome с именем получателя', () => {
    render(<InviteLanding invite={makeInvite()} onContinue={() => {}} />)
    expect(screen.getByText(/Здравствуйте, Иван!/)).toBeInTheDocument()
  })

  it('показывает отправителя — компанию и ФИО', () => {
    render(<InviteLanding invite={makeInvite()} onContinue={() => {}} />)
    expect(screen.getByText('ООО «ТрансЛогистик»')).toBeInTheDocument()
    expect(screen.getByText('Смирнов Алексей')).toBeInTheDocument()
  })

  it('показывает 3 шага инструкции', () => {
    render(<InviteLanding invite={makeInvite()} onContinue={() => {}} />)
    expect(screen.getByText('Получите XML-файл МЧД')).toBeInTheDocument()
    expect(screen.getByText('Загрузите файл')).toBeInTheDocument()
    expect(screen.getByText('Подтвердите привязку')).toBeInTheDocument()
  })

  it('показывает секьюрити-бейджи', () => {
    render(<InviteLanding invite={makeInvite()} onContinue={() => {}} />)
    expect(screen.getByText('Одноразовая')).toBeInTheDocument()
    expect(screen.getByText('256 бит')).toBeInTheDocument()
  })

  it('вызывает onContinue по кнопке «Начать»', () => {
    const onContinue = vi.fn()
    render(<InviteLanding invite={makeInvite()} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('при invalidReason рендерит экран ошибки вместо hero', () => {
    render(<InviteLanding invalidReason="expired" onContinue={() => {}} />)
    expect(screen.getByText('Ссылка недействительна')).toBeInTheDocument()
    expect(screen.getByText(/Срок действия ссылки истёк/i)).toBeInTheDocument()
    // Не должно быть шагов инструкции на экране ошибки
    expect(screen.queryByText('Получите XML-файл МЧД')).not.toBeInTheDocument()
  })

  it('для инвайта без компании показывает только ФИО отправителя', () => {
    render(<InviteLanding invite={makeInvite({ inviterCompany: undefined })} onContinue={() => {}} />)
    expect(screen.getByText('Смирнов Алексей')).toBeInTheDocument()
    expect(screen.queryByText('ООО «ТрансЛогистик»')).not.toBeInTheDocument()
  })

  it('для получателя с одиночным именем fallback к "Здравствуйте!"', () => {
    render(
      <InviteLanding invite={makeInvite({ recipientName: 'Иванов' })} onContinue={() => {}} />,
    )
    expect(screen.getByText(/Здравствуйте!/)).toBeInTheDocument()
  })
})
