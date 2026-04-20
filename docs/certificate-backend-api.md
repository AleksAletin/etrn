# Сертификат КЭП — ТЗ для бэкенда

**Модуль:** eTRN → Certificate (электронная подпись)
**Версия:** 1.0

## 1. Бизнес-контекст

Чтобы подписать документ в eTRN, пользователю нужен **квалифицированный сертификат электронной подписи (УКЭП)** — документ, выдаваемый аккредитованным удостоверяющим центром (УЦ). eTRN не выпускает сертификаты сам — мы **интегрируемся с провайдером**, например **КриптоКлюч** (или КриптоПро, ID ФНС).

### Что такое УКЭП
- Цифровая подпись физлица (ФИО + СНИЛС + ИНН)
- Выдана аккредитованным УЦ с Минцифры РФ
- Срок действия 12–15 месяцев
- Содержит закрытый ключ (на токене / в облаке / на устройстве)

### Почему через провайдера
- Выпуск УКЭП требует идентификации личности (видеоконф / ЕСИА)
- Хранение закрытого ключа должно быть криптографически надёжным
- Проще интегрироваться с готовым провайдером, чем становиться УЦ самим

### Интегрируемый провайдер: **КриптоКлюч**
- API для выпуска УКЭП online
- Хранение ключа в облаке с доступом по биометрии/PIN
- Для подписи — онлайн-запрос к провайдеру

### Процесс выпуска (по шагам)
1. Юзер в eTRN жмёт «Выпустить сертификат»
2. Открывается форма: ФИО, паспорт, СНИЛС, ИНН (подтягиваются из профиля + ДаДаты)
3. Идентификация: видеозвонок через КриптоКлюч **или** через Госуслуги (ЕСИА)
4. Подписание заявления на выпуск через СМС-код от КриптоКлюча
5. Выпуск сертификата — мгновенно (для облачного ключа) или 2–5 минут
6. Сертификат появляется в профиле пользователя
7. С этого момента можно подписывать документы в eTRN

---

## 2. Функциональные требования

### FR-Cert

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Начало выпуска УКЭП из eTRN с заполненной формой. | P0 |
| FR-02 | Поля формы: ФИО, паспорт, СНИЛС, ИНН, email — автозаполнение из профиля. | P0 |
| FR-03 | Идентификация через провайдера (видео / ЕСИА). | P0 |
| FR-04 | Подписание заявления через SMS-код от провайдера. | P0 |
| FR-05 | Хранение метаданных сертификата в eTRN (id, subject, issuer, serial, validFrom/validTo). | P0 |
| FR-06 | Проверка статуса сертификата (CRL/OCSP) раз в сутки. | P0 |
| FR-07 | Уведомление юзера за 30, 14, 7, 1 день до истечения. | P0 |
| FR-08 | Блокировка подписания при expired/revoked сертификате + кнопка «Обновить». | P0 |
| FR-09 | Поддержка «дистанционной подписи» (облачный ключ на стороне провайдера). | P0 |
| FR-10 | Отзыв сертификата (юзером или УЦ) корректно обрабатывается. | P0 |

---

## 3. Поведение фронта

### 3.1 Выпуск сертификата

```
Dashboard:
  🔴 Сертификат УКЭП не выпущен. Выпустите для подписания.
     [→]

→ /cert-issue

┌──────────────────────────────────────────────────┐
│ Выпуск УКЭП через КриптоКлюч                     │
├──────────────────────────────────────────────────┤
│ ШАГ 1 из 5: Анкета                               │
│                                                  │
│ ФИО *        Иванов Сергей Петрович              │
│ Паспорт *    4512 345678                         │
│ СНИЛС *      145-371-033 53                      │
│ ИНН *        7712345678 (из профиля)             │
│ Email *      ivan@example.ru                     │
│                                                  │
│ [Продолжить]                                     │
└──────────────────────────────────────────────────┘

POST /api/v1/certificates/init
  Body: { passport, snils, email }
  ← 200 { sessionId, nextStep: "identification" }
```

### 3.2 Идентификация

```
┌──────────────────────────────────────────────────┐
│ ШАГ 2: Идентификация                             │
├──────────────────────────────────────────────────┤
│ Способ:  • Госуслуги (ЕСИА)                      │
│          ○ Видеозвонок с оператором              │
│                                                  │
│ [Продолжить через Госуслуги]                     │
└──────────────────────────────────────────────────┘

→ POST /api/v1/certificates/:sessionId/identification/start
  Body: { method: "esia" }
  ← 200 { redirectUrl: "https://esia.gosuslugi.ru/..." }

→ [redirect в браузер на ЕСИА]
→ [после успеха — return на callback URL eTRN]

GET /api/v1/certificates/:sessionId/identification/status
  ← 200 { status: "verified" | "pending" | "failed" }
```

### 3.3 Подписание заявления

```
┌──────────────────────────────────────────────────┐
│ ШАГ 3: Подписание заявления                      │
├──────────────────────────────────────────────────┤
│ Мы выпустим сертификат на имя:                   │
│ Иванов Сергей Петрович                           │
│                                                  │
│ Нажимая "Подтвердить", вы соглашаетесь с         │
│ условиями выпуска УКЭП.                          │
│                                                  │
│ SMS-код:  [• • • •]                              │
│ [Отправить заново (58с)]                         │
│ [Подтвердить]                                    │
└──────────────────────────────────────────────────┘

→ POST /api/v1/certificates/:sessionId/sms/request
  ← 200 { resendAvailableAt }

→ POST /api/v1/certificates/:sessionId/sms/verify
  Body: { code }
  ← 202 { jobId }
```

### 3.4 Выпуск

```
┌──────────────────────────────────────────────────┐
│ ШАГ 4: Выпуск                                    │
├──────────────────────────────────────────────────┤
│ Выпуск сертификата...                            │
│ ⏳ Проверка в ФНС                                │
│ ○  Формирование ключа                            │
│ ○  Выпуск сертификата                            │
│ ○  Регистрация в реестре                         │
│                                                  │
│ Это может занять 2–5 минут.                      │
└──────────────────────────────────────────────────┘

polling GET /api/v1/certificates/:sessionId/job/:jobId
   ← 200 { status: "running|done|failed", currentStep, certificate? }
```

### 3.5 Готово

```
┌──────────────────────────────────────────────────┐
│ ✅ Сертификат выпущен!                           │
├──────────────────────────────────────────────────┤
│ УКЭП готов к использованию.                      │
│                                                  │
│ Владелец       Иванов Сергей Петрович            │
│ УЦ             КриптоКлюч (Минцифры)             │
│ Серия          1234 5678 90AB                    │
│ Действителен до 15.04.2027                       │
│ Статус         ✅ Активен                        │
│                                                  │
│ [Продолжить]                                     │
└──────────────────────────────────────────────────┘
```

### 3.6 Предупреждения об истечении

На Dashboard и в Профиле:
```
🟡 Сертификат истекает через 14 дней. [Обновить]
🔴 Сертификат истёк. Выпустите новый. [Выпустить]
🔴 Сертификат отозван УЦ. [Выпустить новый]
```

---

## 4. Схема БД

### 4.1 Таблица `certificates`

```sql
CREATE TABLE certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  provider        VARCHAR(32) NOT NULL,      -- 'cryptokey' | 'cryptopro' | 'idfns'
  provider_cert_id TEXT NOT NULL,            -- ID сертификата у провайдера
  subject         TEXT NOT NULL,             -- "CN=Иванов С. П.,..."
  subject_name    TEXT NOT NULL,             -- ФИО
  issuer          TEXT NOT NULL,             -- "CN=КриптоКлюч,..."
  serial_number   VARCHAR(64) NOT NULL,
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ NOT NULL,
  status          certificate_status NOT NULL DEFAULT 'active',
  key_location    certificate_key_location NOT NULL,  -- where ключ хранится
  thumbprint      VARCHAR(64) NOT NULL,      -- SHA-1 отпечаток
  public_cert_pem TEXT NOT NULL,             -- сам сертификат в PEM
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ocsp_check_at TIMESTAMPTZ,

  UNIQUE (user_id, serial_number)
);

CREATE TYPE certificate_status AS ENUM ('active', 'expired', 'revoked', 'suspended');
CREATE TYPE certificate_key_location AS ENUM ('cloud', 'device', 'token');

CREATE INDEX idx_cert_user_active ON certificates(user_id) WHERE status = 'active';
CREATE INDEX idx_cert_expiring ON certificates(valid_to) WHERE status = 'active';
```

### 4.2 Таблица `certificate_issue_sessions` (временные сессии выпуска)

```sql
CREATE TABLE certificate_issue_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  status            cert_session_status NOT NULL DEFAULT 'init',
  provider          VARCHAR(32) NOT NULL,
  passport          TEXT,                -- шифруется (AES)
  snils             TEXT,
  email             TEXT,
  identification_method VARCHAR(16),     -- 'esia' | 'video'
  identification_verified_at TIMESTAMPTZ,
  signed_at         TIMESTAMPTZ,
  certificate_id    UUID REFERENCES certificates(id),
  error_code        VARCHAR(64),
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL   -- TTL 24 часа
);

CREATE TYPE cert_session_status AS ENUM (
  'init',
  'identification_pending',
  'identification_verified',
  'signing',
  'issuing',
  'done',
  'failed'
);
```

---

## 5. REST API

### 5.1 Начать выпуск

```
POST /api/v1/certificates/init
Body:
{
  "provider": "cryptokey",
  "passport": "4512345678",
  "snils": "145-371-033 53",
  "email": "ivan@example.ru"
}

Response 200:
{
  "sessionId": "uuid",
  "nextStep": "identification"
}

Errors:
  409 active_cert_exists  — у юзера уже есть активный
  422 invalid_passport | invalid_snils | invalid_email
```

### 5.2 Начало идентификации

```
POST /api/v1/certificates/:sessionId/identification/start
Body:  { "method": "esia" | "video" }

Response 200 (method=esia):
{
  "redirectUrl": "https://esia.gosuslugi.ru/aas/oauth2/ac?...",
  "callbackUrl": "https://app.etrn.ru/cert-issue?sid=:sessionId"
}

Response 200 (method=video):
{
  "scheduledAt": "2026-04-20T10:00:00Z",
  "meetingUrl": "https://..."
}
```

### 5.3 Статус идентификации

```
GET /api/v1/certificates/:sessionId/identification/status

Response 200:
{ "status": "pending" | "verified" | "failed", "error": null }
```

### 5.4 Запрос SMS для подписания

```
POST /api/v1/certificates/:sessionId/sms/request

Response 200: { "resendAvailableAt": "..." }
```

### 5.5 Подтверждение и выпуск

```
POST /api/v1/certificates/:sessionId/sms/verify
Body:  { "code": "1234" }

Response 202: { "jobId": "uuid" }
```

### 5.6 Статус выпуска

```
GET /api/v1/certificates/:sessionId/job/:jobId

Response 200:
{
  "status": "running" | "done" | "failed",
  "currentStep": 2,
  "steps": [
    { "name": "fns_check", "status": "done" },
    { "name": "generate_key", "status": "running" },
    { "name": "issue_cert", "status": "pending" },
    { "name": "register", "status": "pending" }
  ],
  "certificate": {  // только при status=done
    "id", "subject", "issuer", "serialNumber",
    "validFrom", "validTo", "thumbprint"
  }
}
```

### 5.7 Получение сертификата юзера

```
GET /api/v1/certificates/me

Response 200:
{
  "certificate": {
    "id", "subject", "subjectName",
    "issuer", "serialNumber",
    "validFrom", "validTo", "thumbprint",
    "status", "keyLocation",
    "daysUntilExpiry": 28
  }
}

Response 200 (если нет):
{ "certificate": null }
```

### 5.8 Ручная проверка статуса (refresh в OCSP)

```
POST /api/v1/certificates/:certId/refresh

Response 200: { "status", "validUntil" }
```

### 5.9 Отзыв сертификата

```
DELETE /api/v1/certificates/:certId
Body:  { "reason": "lost" | "compromised" | "noLongerNeeded" }

Response 202: { "jobId" }
```

Отзыв через API провайдера. После подтверждения — `certificates.status = revoked`.

---

## 6. Cron и жизненный цикл

### 6.1 Ежесуточная проверка OCSP

Cron-job раз в сутки для всех `certificates.status = 'active'`:
1. Запрос к OCSP-эндпоинту УЦ
2. Если отозван → `status = revoked`, `revoked_at = now`, push юзеру
3. Если истёк → `status = expired`, push юзеру

### 6.2 Уведомления об истечении

Cron раз в день — при `valid_to - now` = `{30, 14, 7, 1}` дней:
- Push + in-app notification: «Сертификат истекает через N дней. Обновите.»

### 6.3 Очистка сессий

Cron каждые 6 часов — удаление `certificate_issue_sessions` где `expires_at < now`.

---

## 7. Безопасность

### PII в сессиях
- Паспорт и СНИЛС в `certificate_issue_sessions` шифруются AES-256 с ключом из KMS/Vault
- После успешного выпуска (status=done) PII стирается из сессии

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /certificates/init` | 3/час на юзера |
| `POST /certificates/:id/sms/request` | 1 в 60 сек, 3 на сессию |
| `POST /certificates/:id/sms/verify` | 5 попыток на SMS |
| `POST /certificates/:id/refresh` | 1 в 5 мин |

### Провайдер (КриптоКлюч)
- API key в KMS/Vault
- Не логируем API key и PII пользователей
- Retry с exponential backoff при сетевых ошибках
- Circuit breaker при >5% ошибок за 1 минуту

### 152-ФЗ
- Паспортные данные и СНИЛС — особая категория ПД
- Доступ только через роли `security_admin` (не через обычное API)
- Удаление при удалении юзера (30 дней)

---

## 8. Тест-кейсы

### Happy
- **TC-01:** Выпуск через ЕСИА → сертификат появляется в `/certificates/me`
- **TC-02:** Подпись документа при активном сертификате ✅
- **TC-03:** Предупреждение за 7 дней до истечения

### Негативные
| TC | Действие | Ожидание |
|---|---|---|
| NEG-01 | init при уже активном сертификате | 409 active_cert_exists |
| NEG-02 | verify чужой sessionId | 404 |
| NEG-03 | expire сессии через 24 часа | 410 session_expired |
| NEG-04 | Попытка sign с revoked | 422 certificate_revoked |
| NEG-05 | Попытка sign с expired | 422 certificate_expired |

---

## 9. Чек-лист

- [ ] Миграции: `certificates`, `certificate_issue_sessions`
- [ ] Интеграция с КриптоКлюч API (init, identification, sign, issue, revoke)
- [ ] Интеграция с ЕСИА (OAuth2 redirect)
- [ ] 9 эндпоинтов + OpenAPI
- [ ] Async job runner для выпуска
- [ ] Cron-job проверки OCSP раз в сутки
- [ ] Cron-job уведомлений об истечении
- [ ] Шифрование PII в сессиях (AES + KMS)
- [ ] Rate-limit + audit log

---

## 10. Ссылки на прототип

| Что | Файл |
|---|---|
| Флоу выпуска УКЭП | `src/pages/CertIssuancePage.tsx` |
| Отображение сертификата в Профиле | `src/pages/ProfilePage.tsx` |
| Проверка при подписании | `validateBeforeSigning()` в `src/pages/DocumentDetailPage.tsx` |
| Тип `Certificate` | `src/lib/constants.ts` |
