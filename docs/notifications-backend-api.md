# Уведомления — ТЗ для бэкенда

**Модуль:** eTRN → Notifications (in-app + push)
**Версия:** 1.0

## 1. Бизнес-контекст

Пользователь должен узнавать о важных событиях в системе: новый документ, подпись прошла, МЧД скоро истечёт, платёж провалился. Уведомления — это **в приложении (in-app центр)** и **push** (SMS/FCM/APNs) одновременно, с разными правилами доставки.

### Типы уведомлений

| Тип | Триггер | Push? | In-app? | SMS? |
|---|---|---|---|---|
| `new_document` | Получен новый документ от оператора | ✅ | ✅ | ❌ |
| `doc_assigned` | Документ назначен этому юзеру | ✅ | ✅ | ❌ |
| `doc_signed` | Документ подписан (для отправителя) | ❌ | ✅ | ❌ |
| `doc_refused` | В подписи отказано | ✅ | ✅ | ❌ |
| `mcd_expiring` | МЧД истекает (30/14/7/1 день) | ✅ | ✅ | ❌ |
| `mcd_expired` | МЧД истекла | ✅ | ✅ | ❌ |
| `cert_expiring` | УКЭП истекает (30/14/7/1) | ✅ | ✅ | ❌ |
| `cert_expired` | УКЭП истёк | ✅ | ✅ | ✅ |
| `payment_success` | Оплата подписки прошла | ❌ | ✅ | ❌ |
| `payment_failed` | Не списались деньги | ✅ | ✅ | ✅ |
| `subscription_expiring` | Подписка кончается через 7 дней | ✅ | ✅ | ❌ |
| `subscription_expired` | Подписка кончилась | ✅ | ✅ | ❌ |
| `system` | Оповещения от поддержки / техработы | ✅ | ✅ | ❌ |

### Правила доставки
- **Quiet hours** — с 22:00 до 08:00 МСК push откладываются до утра, кроме критичных (`cert_expired`, `payment_failed`)
- **Throttling** — не более 1 push в минуту одному юзеру
- **User preferences** — юзер может отключить конкретные типы
- **Deep-linking** — push открывает конкретный экран (`/documents/:id`, `/mcd`, `/profile/payment`)

---

## 2. Функциональные требования

### FR-Notifications

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | In-app центр уведомлений на странице `/notifications`. | P0 |
| FR-02 | Счётчик непрочитанных в TopBar (Bell icon). | P0 |
| FR-03 | Push через FCM (Android + web) и APNs (iOS). | P0 |
| FR-04 | Deep-linking в push на конкретный экран. | P0 |
| FR-05 | Возможность отметить все как прочитанные одним кликом. | P0 |
| FR-06 | Настройки по типам — юзер отключает нежелательные. | P1 |
| FR-07 | Quiet hours (22:00–08:00 МСК) для не-критичных. | P1 |
| FR-08 | История уведомлений хранится 90 дней, потом архивируется. | P1 |

### NFR

| ID | Требование |
|---|---|
| NFR-01 | Push доставляется в 95% случаев в течение 30 сек |
| NFR-02 | In-app список — P95 латентность ≤ 300 мс для 100 записей |

---

## 3. Поведение фронта

### 3.1 Счётчик в TopBar

```
┌──────────────────────────────────────────────┐
│ [≡]  Главная              🔔³   👤          │
└──────────────────────────────────────────────┘

Счётчик = кол-во unread. Обновляется при:
  - Открытии приложения: GET /api/v1/notifications/counts
  - В фоне: SSE event notifications.updated → refetch
  - После отметки о прочтении
```

### 3.2 Страница `/notifications`

```
┌──────────────────────────────────────────────┐
│ ‹ Уведомления                                │
├──────────────────────────────────────────────┤
│ 3 непрочитанных          [Отметить все ✓]    │
├──────────────────────────────────────────────┤
│ Сегодня                                      │
│  🟣 Новый документ ЭТрН-2026-001             │
│     от ООО «АгроТрейд» требует вашей подписи │
│     2 мин назад                              │
│                                              │
│  🟠 МЧД МЧД-2026-00789 истекает через 7 дней │
│     30 мин назад                             │
│                                              │
│ Вчера                                        │
│  ⚪ Документ подписан                        │
│     ЭТрН-2026-000 · 15:42                    │
└──────────────────────────────────────────────┘

GET /api/v1/notifications?cursor=&limit=20
  ← { items, nextCursor, unreadCount }

Клик на уведомление:
  → POST /api/v1/notifications/:id/read
  → navigate(notification.action)  // e.g., "/documents/abc-123"
```

### 3.3 Push

- **Web push** — Service Worker + VAPID
- **Mobile** — FCM (Android) / APNs (iOS)
- При первом заходе юзер подтверждает запрос разрешения
- Fallback: если push заблокирован → только in-app

### 3.4 Настройки

```
/settings → раздел «Уведомления»
  ☑ Новые документы
  ☑ Истечение МЧД / КЭП
  ☑ Платежи
  ☐ Маркетинговые (рассылки новостей)

  Quiet hours: ☑ с 22:00 до 08:00
```

PUT /api/v1/notifications/preferences

---

## 4. Схема БД

### 4.1 Таблица `notifications`

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            VARCHAR(32) NOT NULL,          -- см. список типов
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  action          TEXT,                           -- deep-link "/documents/abc"
  metadata        JSONB,                          -- { documentId, mcdId, ... }
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
```

### 4.2 Таблица `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  enabled_types     TEXT[] NOT NULL DEFAULT ARRAY['new_document','mcd_expiring','cert_expiring','payment_failed','subscription_expiring','system'],
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start  TIME NOT NULL DEFAULT '22:00:00',
  quiet_hours_end    TIME NOT NULL DEFAULT '08:00:00',
  timezone          VARCHAR(32) NOT NULL DEFAULT 'Europe/Moscow'
);
```

### 4.3 Таблица `push_subscriptions` (для web push / FCM / APNs)

```sql
CREATE TABLE push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  platform        push_platform NOT NULL,   -- web | fcm | apns
  endpoint        TEXT,                      -- для web push
  fcm_token       TEXT,                      -- FCM device token
  apns_token      TEXT,                      -- APNs device token
  device_info     JSONB,                     -- os, browser, model
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,

  UNIQUE (user_id, platform, COALESCE(endpoint, fcm_token, apns_token))
);

CREATE TYPE push_platform AS ENUM ('web', 'fcm', 'apns');
```

---

## 5. REST API

### 5.1 Список

```
GET /api/v1/notifications?cursor=&limit=20&unread=false

Response 200:
{
  "items": [
    {
      "id", "type", "title", "message", "action",
      "metadata", "readAt", "createdAt"
    }
  ],
  "nextCursor": "opaque-or-null",
  "unreadCount": 3
}
```

### 5.2 Счётчики

```
GET /api/v1/notifications/counts

Response 200:
{ "unread": 3, "total": 42 }
```

### 5.3 Отметить как прочитанное

```
POST /api/v1/notifications/:id/read

Response 204
```

### 5.4 Отметить все

```
POST /api/v1/notifications/read-all

Response 204
```

### 5.5 Настройки

```
GET /api/v1/notifications/preferences
PUT /api/v1/notifications/preferences
  Body: { enabledTypes: [...], quietHours: {...} }
```

### 5.6 Регистрация push-подписки

```
POST /api/v1/notifications/push/subscribe
Body (web):
{
  "platform": "web",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": { "p256dh": "...", "auth": "..." }
}

Body (mobile):
{
  "platform": "fcm" | "apns",
  "token": "device-token",
  "deviceInfo": { "os": "android", "model": "..." }
}

Response 201: { "subscriptionId" }
```

### 5.7 Отписка от push

```
DELETE /api/v1/notifications/push/subscribe/:id
```

### 5.8 Real-time (SSE)

```
GET /api/v1/notifications/events

event: notifications.new
data: { id, type, title, message, action }

event: notifications.counts.updated
data: { unread: 5 }
```

---

## 6. Сервис отправки уведомлений (внутренний)

### 6.1 Функция `sendNotification(userId, type, payload)`

```python
def send_notification(user_id, type, payload):
    # 1. Проверяем preferences
    prefs = get_preferences(user_id)
    if type not in prefs.enabled_types:
        return

    # 2. Quiet hours
    if is_quiet_hours(prefs) and type not in CRITICAL_TYPES:
        schedule_for_later(user_id, type, payload)
        return

    # 3. Throttling
    if sent_recently(user_id, within_sec=60):
        queue.push(user_id, type, payload)
        return

    # 4. In-app
    notification = create_in_app(user_id, type, payload)

    # 5. Push (если есть подписки)
    subscriptions = get_active_subscriptions(user_id)
    for sub in subscriptions:
        send_push(sub, notification)

    # 6. SMS (только для критичных)
    if type in SMS_TYPES:
        send_sms(user.phone, template(type, payload))

    # 7. Audit log
    audit_log(user_id, 'notification_sent', { type, channels })
```

### 6.2 Триггеры уведомлений

Триггеры — это **сервис-to-сервис вызовы**: другие модули (документы, МЧД, подписки) вызывают `sendNotification` при своих событиях.

| Модуль | Событие | Type |
|---|---|---|
| Documents | Новый документ от оператора | `new_document` |
| Documents | Документ назначен | `doc_assigned` |
| Signing | Signed | `doc_signed` (отправителю) |
| Signing | Refused | `doc_refused` |
| MCD | Scheduled: МЧД истекает за 30/14/7/1 | `mcd_expiring` |
| MCD | Scheduled: истекла | `mcd_expired` |
| Certificate | Scheduled: УКЭП истекает | `cert_expiring` |
| Subscription | Успех оплаты | `payment_success` |
| Subscription | Провал оплаты | `payment_failed` |

### 6.3 Cron-jobs

| Job | Период | Что делает |
|---|---|---|
| `check_mcd_expiring` | Раз в сутки, 09:00 МСК | Шлёт `mcd_expiring` при 30/14/7/1 день |
| `check_cert_expiring` | Раз в сутки, 09:00 МСК | То же для УКЭП |
| `check_subscription_expiring` | Раз в сутки, 09:00 МСК | Для подписки |
| `quiet_hours_flush` | Каждые 10 мин | Отправляет отложенные push из quiet hours |
| `cleanup_old` | Раз в сутки, 03:00 МСК | Переносит notifications старше 90 дней в архив |

---

## 7. Безопасность

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `GET /notifications` | 60/мин на юзера |
| `POST /notifications/push/subscribe` | 10/час на юзера |

### Push-провайдеры
- **FCM** — API key в KMS
- **APNs** — p8 key в KMS
- **Web Push** — VAPID keys (public + private)
- Провайдер-ошибки обрабатываются: если endpoint вернул 410 → `push_subscriptions.active = false`

### Не спамить
- Throttling + queue
- Юзер может отключить конкретные типы
- **НИКОГДА** не отправлять маркетинговые push без согласия (152-ФЗ, ст. 9)

---

## 8. Тест-кейсы

- **TC-01:** Получение нового документа → in-app + push в течение 30 сек ✅
- **TC-02:** Push в quiet hours → доставлен в 08:00 утром ✅
- **TC-03:** Отключил `mcd_expiring` → никаких notif за 7 дней ✅
- **TC-04:** Читаю все → счётчик → 0 ✅
- **TC-05:** expired push subscription → помечается inactive, не спамим ✅

---

## 9. Чек-лист

- [ ] Миграции: `notifications`, `notification_preferences`, `push_subscriptions`
- [ ] 8 эндпоинтов + OpenAPI
- [ ] Интеграция FCM + APNs + VAPID web push
- [ ] Сервис `sendNotification()` с quiet hours + throttling
- [ ] 5 cron-jobs (expiring / flush / cleanup)
- [ ] SSE для real-time обновления счётчика
- [ ] Аудит log

---

## 10. Ссылки на прототип

| Что | Файл |
|---|---|
| Страница уведомлений | `src/pages/NotificationsPage.tsx` |
| Счётчик в TopBar | `src/components/layout/TopBar.tsx` |
| Типы (AppNotification) | `src/lib/constants.ts` |
| Mock-уведомления | `src/data/mockNotifications.ts` |
