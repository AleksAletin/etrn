# Подписка и платежи — ТЗ для бэкенда

**Модуль:** eTRN → Subscription & Payments
**Версия:** 1.0

## 1. Бизнес-контекст

eTRN работает по модели **SaaS-подписки** компании. Оплачивает либо компания юр.лицо (по счёту), либо физлицо (ИП/руководитель карточкой). Тариф — количество документов в месяц. Подписка общая на всех сотрудников компании.

### Планы (MVP)

| План | Документов/мес | Цена/мес |
|---|---|---|
| Пробный | 10 | 0 ₽ (14 дней) |
| Стандарт | 500 | 5 000 ₽ |
| Бизнес | 2 000 | 12 000 ₽ |
| Безлимит | ∞ | 25 000 ₽ |

Превышение лимита = блокировка подписания до апгрейда или следующего расчётного периода.

### Способы оплаты

| Способ | Для кого | Процесс |
|---|---|---|
| Банковская карта | ФЛ / ИП | Онлайн через эквайринг (ЮKassa / CloudPayments / Тинькофф) |
| СБП | ФЛ / ИП | QR-код → оплата из банковского приложения |
| Счёт для юрлица | ЮЛ | Выставление счёта → оплата по безналу |

### Статусы подписки

| Статус | Что это |
|---|---|
| `trial` | Пробный период, активна |
| `active` | Оплачена и действует |
| `expired` | Истёк срок, не продлили |
| `unpaid` | Не оплачена, grace-период 3 дня |
| `cancelled` | Отменена юзером, активна до конца периода |

---

## 2. Функциональные требования

### FR-Subscription

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Отображение текущего плана и статуса в Профиле. | P0 |
| FR-02 | Прогресс-бар использования (used / limit). | P0 |
| FR-03 | Переход на страницу оплаты с выбором способа. | P0 |
| FR-04 | Оплата карта / СБП / счёт юрлица. | P0 |
| FR-05 | Автосписание при `autorenew=true` за 3 дня до конца. | P0 |
| FR-06 | Блокировка подписания при превышении лимита. | P0 |
| FR-07 | Grace-period 3 дня после истечения — ещё работает. | P0 |
| FR-08 | История платежей с квитанциями. | P0 |
| FR-09 | Уведомления за 7 и 1 день до истечения. | P0 |
| FR-10 | Смена плана (upgrade/downgrade) с пропорциональной пересчёткой. | P1 |

---

## 3. Поведение фронта

### 3.1 Блок подписки в Профиле

```
┌──────────────────────────────────────────────┐
│ Подписка компании                             │
├──────────────────────────────────────────────┤
│ ООО «ТрансЛогистик»                           │
│ [Активна] · до 31.12.2026                     │
│                                                │
│ План: Стандарт (500 док/мес)                  │
│ Использовано: 127 из 500                      │
│ ████████░░░░░░░░░░░░  25%                     │
│                                                │
│ [Оплатить как физлицо]  [Выставить счёт]      │
└──────────────────────────────────────────────┘

GET /api/v1/subscriptions/me
  ← { status, plan, used, limit, validFrom, validTo,
      autorenew, companyName, companyInn }
```

### 3.2 Оплата физлицом

```
/profile/payment

Табы:  [Банковская карта]  [СБП]

Карта:
  Номер            4242 4242 4242 4242
  Срок             12/28
  CVV              123
  Владелец         IVAN IVANOV
  [Оплатить 5 000 ₽]

→ POST /api/v1/payments/card/init
  Body: { planId, amount }
  ← 200 { paymentId, redirectUrl: "https://yookassa.ru/..." }

→ Пользователь перенаправляется на форму эквайера
→ Callback: /api/v1/payments/webhook/yookassa
→ Фронт видит результат через polling / SSE

СБП:
  QR-код + [Открыть приложение банка]
  [Оплатить]

→ POST /api/v1/payments/sbp/init
  ← 200 { paymentId, qrCodeUrl, deepLink }
```

### 3.3 Счёт для юрлица

```
[Выставить счёт для юрлица]

→ POST /api/v1/payments/invoice
  Body: { planId }
  ← 200 { invoiceId, invoiceUrl: "pdf-ссылка" }
→ Счёт скачивается + отправляется на email компании
```

### 3.4 История платежей

```
/profile/payments/history

Список транзакций:
  ✅ 05.03.2026 · 5 000 ₽ · Стандарт · Карта   [Квитанция]
  ✅ 05.02.2026 · 5 000 ₽ · Стандарт · Карта
  ⏳ Счёт №123 · 12 000 ₽ · Бизнес · Ожидает оплаты
```

### 3.5 Блокировка

При превышении лимита:
```
⚠️ Лимит документов исчерпан (500/500)
   Обновите план, чтобы подписывать документы.
   [Оплатить]
```

---

## 4. Схема БД

### 4.1 Таблица `subscriptions`

```sql
CREATE TABLE subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_inn    VARCHAR(12) NOT NULL UNIQUE,  -- одна подписка на ИНН
  company_name   TEXT NOT NULL,
  status         subscription_status NOT NULL DEFAULT 'trial',
  plan_id        VARCHAR(32) NOT NULL REFERENCES plans(id),
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ NOT NULL,
  autorenew      BOOLEAN NOT NULL DEFAULT TRUE,
  used_this_period INT NOT NULL DEFAULT 0,   -- счётчик подписанных документов
  period_reset_at TIMESTAMPTZ NOT NULL,      -- когда обнуляем used
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at   TIMESTAMPTZ
);

CREATE TYPE subscription_status AS ENUM ('trial','active','expired','unpaid','cancelled');

CREATE INDEX idx_sub_expiring ON subscriptions(valid_to) WHERE status IN ('trial','active');
```

### 4.2 Таблица `plans`

```sql
CREATE TABLE plans (
  id             VARCHAR(32) PRIMARY KEY,     -- 'trial','standard','business','unlimited'
  name           TEXT NOT NULL,
  documents_limit INT,                         -- NULL = безлимит
  price_rub      NUMERIC(10,2) NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE
);
```

### 4.3 Таблица `payments`

```sql
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  provider       payment_provider NOT NULL,
  external_id    TEXT,                         -- ID у эквайера
  amount         NUMERIC(10,2) NOT NULL,
  currency       VARCHAR(3) NOT NULL DEFAULT 'RUB',
  status         payment_status NOT NULL DEFAULT 'pending',
  receipt_url    TEXT,
  invoice_number TEXT,                         -- для юрлица
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ,
  failed_reason  TEXT
);

CREATE TYPE payment_provider AS ENUM ('yookassa','cloudpayments','tinkoff','sbp','invoice_legal');
CREATE TYPE payment_status AS ENUM ('pending','success','failed','refunded','cancelled');

CREATE INDEX idx_payments_sub ON payments(subscription_id, created_at DESC);
```

---

## 5. REST API

### 5.1 Текущая подписка

```
GET /api/v1/subscriptions/me

Response 200:
{
  "id": "uuid",
  "companyInn": "7712345678",
  "companyName": "ООО «ТрансЛогистик»",
  "status": "active",
  "plan": { "id": "standard", "name": "Стандарт", "documentsLimit": 500, "priceRub": 5000 },
  "validFrom": "2026-01-01T00:00:00Z",
  "validTo": "2026-02-01T00:00:00Z",
  "autorenew": true,
  "usedThisPeriod": 127,
  "periodResetAt": "2026-02-01T00:00:00Z",
  "canSign": true
}
```

### 5.2 Доступные планы

```
GET /api/v1/plans

Response 200: [{ id, name, documentsLimit, priceRub }]
```

### 5.3 Инициация оплаты картой/СБП

```
POST /api/v1/payments/card/init
Body:
{
  "planId": "standard",
  "autorenew": true
}

Response 200:
{
  "paymentId": "uuid",
  "redirectUrl": "https://yookassa.ru/checkout/...",
  "expiresAt": "2026-04-19T12:30:00Z"
}
```

```
POST /api/v1/payments/sbp/init
Body: { "planId": "standard" }

Response 200:
{
  "paymentId": "uuid",
  "qrCodeSvgUrl": "https://...",
  "deepLink": "https://qr.nspk.ru/..."
}
```

### 5.4 Счёт для юрлица

```
POST /api/v1/payments/invoice
Body: { "planId": "business" }

Response 200:
{
  "invoiceId": "uuid",
  "invoiceNumber": "СЧ-2026-0123",
  "invoiceUrl": "https://cdn.etrn.ru/invoice.pdf",
  "validUntil": "2026-04-26T00:00:00Z"
}
```

### 5.5 Webhook эквайера (inbound)

```
POST /api/v1/payments/webhook/:provider
Headers:  X-Provider-Signature: ...
Body:     { payment_id, status, amount, ... }

Response 200 (всегда, чтобы эквайер не retry'ил без надобности)
```

Обработчик:
1. Проверяет подпись webhook
2. Находит `payments.external_id`
3. Обновляет `payments.status`
4. Если success — продлевает `subscriptions.valid_to`
5. Шлёт notification юзеру

### 5.6 Статус платежа

```
GET /api/v1/payments/:paymentId

Response 200:
{ "id", "status", "amount", "paidAt", "receiptUrl" }
```

### 5.7 История платежей

```
GET /api/v1/payments?cursor=&limit=20

Response 200: { items: [...], nextCursor }
```

### 5.8 Отмена подписки

```
POST /api/v1/subscriptions/me/cancel

Response 200: { status: "cancelled", validTo: "..." }
```

Отмена = `status=cancelled`, но юзер пользуется до `valid_to`. После — `expired`.

### 5.9 Смена плана

```
POST /api/v1/subscriptions/me/change-plan
Body: { "planId": "business" }

Response 200:
{
  "newPlan": { ... },
  "proratedAmount": 7000,  // доплата за оставшиеся дни месяца
  "paymentInitiated": true
}
```

---

## 6. Счётчик документов

Каждое успешное подписание документа **инкрементит** `subscriptions.used_this_period`.

```python
def increment_usage(subscription_id):
    with transaction():
        sub = get_for_update(subscription_id)
        if sub.plan.documents_limit and sub.used_this_period >= sub.plan.documents_limit:
            raise LimitExceeded()
        sub.used_this_period += 1
        commit()
```

### Cron-jobs

| Job | Период | Что делает |
|---|---|---|
| `reset_period` | Каждую минуту | Сбрасывает `used_this_period=0` при `period_reset_at <= now`, обновляет `period_reset_at += 1 month` |
| `check_expiring` | Раз в сутки, 09:00 МСК | Шлёт `subscription_expiring` за 7 и 1 день |
| `autorenew` | Раз в сутки, 10:00 МСК | За 3 дня до `valid_to` при `autorenew=true` — инициирует списание с сохранённой карты |
| `expire_unpaid` | Раз в час | После 3 дней grace без оплаты → `status=expired`, блокирует подписание |

---

## 7. Безопасность

### PCI DSS
- **Никогда не храним номера карт.** Всё через tokenization эквайера.
- В `payments` храним только `external_id` эквайера и маскированный `card_last4`.

### Webhook-signature
- Все webhook-и от эквайеров проверяются по HMAC-подписи
- Отклонение при невалидной подписи → 401

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /payments/*/init` | 10/час на юзера |
| `POST /subscriptions/me/cancel` | 3/час |

### Audit log
Все изменения подписок и платежи — в audit log (для бухгалтерии и налоговой).

---

## 8. Тест-кейсы

- **TC-01:** Оплата картой → webhook → подписка `active` ✅
- **TC-02:** Автосписание за 3 дня → продление ✅
- **TC-03:** Webhook невалидной подписью → 401 ✅
- **TC-04:** Достиг лимита → попытка подписания → 422 `subscription_limit_exceeded` ✅
- **TC-05:** Отмена подписки → до `valid_to` работает, потом `expired` ✅
- **TC-06:** Счёт юрлица → оплата по безналу → ручная активация бухгалтером через admin API ✅

---

## 9. Чек-лист

- [ ] Миграции: `subscriptions`, `plans`, `payments`
- [ ] 9 эндпоинтов + OpenAPI
- [ ] Интеграция с эквайером (ЮKassa + fallback CloudPayments)
- [ ] СБП (через NSPK)
- [ ] Генерация PDF-счетов для юрлица
- [ ] Webhook-обработчики + HMAC-проверка
- [ ] 4 cron-jobs
- [ ] Инкремент `used_this_period` в транзакции с подписанием
- [ ] PCI-DSS compliance (никаких номеров карт)

---

## 10. Ссылки на прототип

| Что | Файл |
|---|---|
| Блок подписки в профиле | `src/pages/ProfilePage.tsx` |
| Страница оплаты | `src/pages/PaymentPage.tsx` |
| Тип (Subscription) | `src/lib/constants.ts` |
