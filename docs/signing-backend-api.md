# Подписание документов — ТЗ для бэкенда

**Модуль:** eTRN → Signing
**Версия:** 1.0

## 1. Бизнес-контекст

**Главный сценарий** eTRN. Пользователь получает документ (ЭТрН/ЭПД/ТТН), проверяет его содержимое и подписывает электронной подписью **от имени компании** через МЧД. Это создаёт юридически значимый документооборот и заменяет бумажную подпись + печать.

### Варианты действий с документом
1. **Подписать** (`sign`) — штатное согласие.
2. **Подписать с оговоркой** (`sign_with_reservations`) — подпись + текст замечаний (недостача/повреждение/несоответствие). Получатель оповещается.
3. **Отказаться** (`refuse`) — отказ в подписи с указанием причины. Документ возвращается отправителю.

### Требования к подписи
- Используется **КЭП** (квалифицированная электронная подпись) физлица — её сертификат выпускается через провайдера (КриптоКлюч / КриптоПро)
- Вместе с подписью прикладывается **МЧД** — доверенность от компании, у которой `principal_inn == doc.sender_inn`
- В МЧД должно быть полномочие (`КодПолн`), соответствующее типу документа (см. `mcd-backend-api.md` раздел 6)

### Режимы подписания

| Режим | Описание | eTRN приоритет |
|---|---|---|
| **КЭП на устройстве** | Сертификат на телефоне, криптопровайдер (МобайлКЭП / КриптоПро Мобайл) | P0 |
| **Дистанционная подпись** | Сертификат на сервере оператора (КЭП-on-server) | P1 |
| **Госключ** | Подпись через приложение Госключ | P2 |
| **ПЭП** (простая ЭП) | Только для определённых документов (не ЭТрН) | P2 |

### Массовое подписание
Пользователь выбирает N документов, eTRN по каждому отдельно:
1. Находит подходящую МЧД (разные компании → разные МЧД)
2. Получает КЭП-подпись от криптопровайдера
3. Отправляет оператору ЭДО
4. Показывает прогресс: "подписано 5 из 12"

Если для какого-то документа нет подходящей МЧД — пропускается с пометкой.

---

## 2. Функциональные требования

### FR-Signing

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Подписание одного документа с указанием МЧД и КЭП. | P0 |
| FR-02 | Автоматический выбор подходящей МЧД перед подписью. | P0 |
| FR-03 | Подписание с оговоркой (текст + обязательный). | P0 |
| FR-04 | Отказ от подписания (текст + обязательный). | P0 |
| FR-05 | Массовое подписание (до 50 документов за раз). | P0 |
| FR-06 | Фиксация геолокации (lat/lng/address) в момент подписи. | P0 |
| FR-07 | Запись в историю документа: кто, когда, какой МЧД, с какой локации. | P0 |
| FR-08 | Отправка подписанного документа оператору ЭДО с прикреплённой МЧД. | P0 |
| FR-09 | Защита от двойной подписи (idempotency по requestId). | P0 |
| FR-10 | Re-try при сетевых ошибках до отправки оператору. | P0 |

### NFR

| ID | Требование |
|---|---|
| NFR-01 | P95 время подписи одного документа ≤ 3 сек |
| NFR-02 | Bulk подписание 20 документов ≤ 30 сек |
| NFR-03 | Геолокация фиксируется даже при offline (синкается при online) |

---

## 3. Поведение фронта (user flows)

### 3.1 Single-подписание

```
Экран: карточка документа (status=NEED_SIGN)

[Подписать ✓]  — click

  → POST /api/v1/documents/:docId/sign/init
    Body: { mode: "sign" }
    ← 200 {
        signRequestId,
        mcd: { id, number, principalName },
        requiredDigest: "base64-hash-to-sign",
        nonce: "uuid"
      }

  → Криптопровайдер подписывает digest:
    crypto.sign(requiredDigest) = signatureBase64

  → POST /api/v1/documents/:docId/sign/submit
    Body: {
      signRequestId,
      signature: "base64",
      geoLocation: { lat, lng, address },
      timestamp: "..."
    }
    ← 202 { jobId }  // async: отправка оператору ЭДО

Экран: прогресс (4 шага)
  ✓ Проверка сертификата и МЧД
  ⏳ Формирование подписи
  ○ Отправка документа оператору ЭДО
  ○ Документ подписан

  Фронт поллит GET /api/v1/signing/jobs/:jobId каждые 500 мс
  ИЛИ подписан на SSE

  При status=done → Экран успеха
```

### 3.2 Подписание с оговоркой

```
[Подписать ▼] → [Подписать с оговоркой]

  Bottom sheet:
    «Укажите замечания»
    [textarea: "обнаружена недостача 2 мест"]
    [Подписать с оговоркой]

  → POST /sign/init с mode=sign_with_reservations
  → ... submit с reservations: "..."
  → Бэк сохраняет в document.reservations + в historyMetadata
```

### 3.3 Отказ от подписания

```
[Отказать в подписи]

  Bottom sheet:
    «Укажите причину»
    [textarea]
    [Отклонить]

  → POST /api/v1/documents/:docId/refuse
    Body: { reason: "...", geoLocation }
    ← 200 { status: "REFUSED" }
```

### 3.4 Массовое подписание

```
Экран: Список /documents
Мультивыбор → [Подписать все] (N)

  → Переход на /documents/bulk-sign?ids=id1,id2,id3

Экран: массовое подписание
  «Подписано 3 из 12»
  [прогресс-бар]

  Список карточек:
    ✓ ЭТрН-001 (подписан по МЧД-2026-456)
    ⏳ ЭТрН-002 (подписывается...)
    ○ ЭТрН-003
    ✗ ЭТрН-004 — нет подходящей МЧД

  → Для каждого параллельно / последовательно:
    POST /sign/init → crypto.sign → POST /sign/submit

  При ошибке на одном — продолжаем со следующим
  В конце: [Повторить (N)] для failed
```

### 3.5 Блокировка при отсутствии МЧД

```
Экран: карточка документа
Плашка над кнопкой:
  🔴 Нет подходящей МЧД
     Требуется МЧД от ООО «X» с полномочием 02.08

[Подписать] (disabled) → при клике показывает modal:
  «У вас нет МЧД от ООО «ТрансЛогистик» с полномочием на ЭТрН.
   Запросите её у компании.»
  [Загрузить МЧД] → /mcd
  [Закрыть]

Фронт вызвал:
  GET /api/v1/mcd/find-for-signing?docType=etrn&senderInn=X
    ← 200 { mcd: null, reason, message }
```

---

## 4. Схема БД

Подписание использует поля из `documents` (см. `documents-backend-api.md`) + новые таблицы:

### 4.1 Таблица `sign_requests` (для idempotency и retry)

```sql
CREATE TABLE sign_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL REFERENCES documents(id),
  user_id            UUID NOT NULL REFERENCES users(id),
  mode               sign_mode NOT NULL,
  mcd_id             UUID NOT NULL REFERENCES mcd(id),
  certificate_id     UUID NOT NULL REFERENCES certificates(id),
  required_digest    TEXT NOT NULL,              -- base64 хеш к подписи
  nonce              UUID NOT NULL UNIQUE,
  signature          TEXT,                       -- base64 CAdES/XAdES — после submit
  reservations_text  TEXT,
  refusal_reason     TEXT,
  geo_location       JSONB,
  status             sign_request_status NOT NULL DEFAULT 'init',
  job_id             UUID,
  operator_external_id TEXT,                     -- ID подписи у оператора ЭДО
  error_code         VARCHAR(64),
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ
);

CREATE TYPE sign_mode AS ENUM ('sign', 'sign_with_reservations', 'refuse');

CREATE TYPE sign_request_status AS ENUM (
  'init',           -- digest выдан, ждём signature
  'submitted',      -- signature получена, отправляется оператору
  'sent',           -- оператор принял
  'completed',      -- статус документа обновлён
  'failed'
);
```

### 4.2 Геолокация
Встроена в `sign_location` документа и в `geo_location` sign_request. Храним как JSONB:
```json
{ "lat": 55.75, "lng": 37.61, "address": "Москва, Тверская 12", "accuracy": 15 }
```

---

## 5. REST API

### 5.1 Инициация подписания

```
POST /api/v1/documents/:docId/sign/init
Body:
{
  "mode": "sign" | "sign_with_reservations" | "refuse"
}

Response 200:
{
  "signRequestId": "uuid",
  "nonce": "uuid",
  "mcd": {                            // null если mode=refuse
    "id": "uuid",
    "number": "МЧД-2026-00456",
    "principalName": "ООО «ТрансЛогистик»",
    "principalInn": "7712345678"
  },
  "certificate": {                    // null если mode=refuse
    "id": "uuid",
    "subject": "Иванов С. П.",
    "serialNumber": "..."
  },
  "requiredDigest": "base64-sha256-hash-of-canonical-xml-to-sign"
}

Errors:
  404 document_not_found
  403 not_owner
  409 document_already_signed
  422 mcd_required | mcd_expired | mcd_insufficient_power | mcd_principal_mismatch
  422 certificate_missing | certificate_expired | certificate_revoked
```

**Что делает:**
1. Проверяет, что document принадлежит юзеру
2. Проверяет status != SIGNED/REFUSED
3. Находит МЧД через `findMcdForSigning(user, doc)` (см. `mcd-backend-api.md`)
4. Проверяет активность сертификата
5. Формирует канонизированный XML с attached data для подписи
6. Считает sha-256 digest
7. Создаёт `sign_requests` с `status=init` и возвращает digest

### 5.2 Отправка подписи

```
POST /api/v1/documents/:docId/sign/submit
Body:
{
  "signRequestId": "uuid",
  "nonce": "uuid",
  "signature": "base64-CAdES-BES",
  "geoLocation": { "lat": 55.75, "lng": 37.61, "address": "...", "accuracy": 15 }
}

Response 202:
{
  "jobId": "uuid",
  "status": "submitted"
}

Errors:
  404 sign_request_not_found
  410 sign_request_expired    — TTL 5 мин с init
  422 signature_invalid       — криптопроверка подписи провалилась
  422 nonce_mismatch          — nonce не совпадает (защита от replay)
```

Async job:
1. Проверяет подпись (сверка с `required_digest` через КриптоПро)
2. Формирует конверт для оператора ЭДО (XML + signature + ссылка на МЧД)
3. Отправляет оператору ЭДО
4. Получает подтверждение (или ошибку)
5. Обновляет `documents.status = SIGNED | SIGNED_WITH_RESERVATIONS`
6. Пишет в `document_history` с метаданными
7. Пушит уведомление пользователю

### 5.3 Статус подписания

```
GET /api/v1/signing/jobs/:jobId

Response 200:
{
  "jobId": "uuid",
  "status": "running | completed | failed",
  "currentStep": 2,
  "steps": [
    { "name": "verify_signature",  "status": "done" },
    { "name": "build_envelope",    "status": "done" },
    { "name": "send_to_operator",  "status": "running" },
    { "name": "update_document",   "status": "pending" }
  ],
  "error": null,
  "documentId": "uuid"
}
```

Альтернатива — SSE `/signing/jobs/:jobId/events`.

### 5.4 Отказ (специальный)

```
POST /api/v1/documents/:docId/refuse
Body:
{
  "reason": "несоответствие данных о грузе",
  "geoLocation": { ... }
}

Response 200:  обновлённый документ со status=REFUSED

Errors:
  422 reason_required
```

Тот же функционал что `sign` с `mode=refuse`, но без МЧД/КЭП (юридически — отказ, не подпись). Однако для юридической значимости отказ **тоже должен быть подписан КЭП**. Это уточнить с юристом — возможно, `refuse` проходит через полный signing flow, только mode отличается.

### 5.5 Массовое подписание

```
POST /api/v1/documents/bulk-sign
Body:
{
  "documentIds": ["uuid", "uuid", "uuid"],
  "mode": "sign"   // только sign, bulk нельзя делать с оговоркой
}

Response 202:
{
  "batchId": "uuid",
  "items": [
    { "documentId", "signRequestId", "mcd", "requiredDigest" },
    ...
  ],
  "skipped": [
    { "documentId", "reason": "no_matching_mcd", "message": "..." }
  ]
}
```

Дальше фронт итерирует `items`, подписывает каждый digest, отправляет submit по каждому.

Либо (проще) — бэк выполняет sign последовательно, digests подписываются на клиенте одним батчем.

### 5.6 Статус batch

```
GET /api/v1/signing/batches/:batchId

Response 200:
{
  "batchId",
  "total": 12,
  "completed": 8,
  "failed": 1,
  "inProgress": 3,
  "items": [
    { "documentId", "status", "error?" }
  ]
}
```

---

## 6. Интеграция с операторами ЭДО

См. `edo-operators-backend-api.md`. Кратко: у каждого оператора свой API отправки подписанного документа. Конверт + signature отправляются через соответствующий адаптер (SBIS, Диадок, Контур, СберКорус).

---

## 7. Безопасность

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /documents/:id/sign/init` | 30/мин на юзера |
| `POST /documents/:id/sign/submit` | 30/мин на юзера |
| `POST /documents/bulk-sign` | 5/час на юзера |

### Idempotency
- `sign_requests.nonce` уникальный, повторные submit с тем же nonce возвращают 200 и существующий jobId
- Документ не может быть подписан дважды (защита на уровне `documents.status` + unique constraint по `document_id` в sign_requests с status=completed)

### Audit log
Каждое действие — `action ∈ {sign_init, sign_submit, sign_complete, sign_fail, refuse}` с полями `doc_id, mcd_id, certificate_id, ip, ua, location`.

### Криптопроверка
- Проверка, что `signature` валидна по `required_digest`
- Проверка, что сертификат подписи соответствует `certificate_id` из init
- Проверка цепочки сертификата до корневого УЦ
- Проверка CRL/OCSP — сертификат не отозван

### Защита от replay
- `nonce` одноразовый
- `init` TTL 5 минут
- Связка `signRequestId + nonce` обязательна

---

## 8. Real-time события

```
event: signing.progress
data: { jobId, step, status }

event: signing.completed
data: { jobId, documentId, newStatus }

event: signing.failed
data: { jobId, documentId, error }

event: signing.batch.progress
data: { batchId, total, completed }
```

---

## 9. Тест-кейсы

### Happy
- **TC-01:** Sign single документа с валидной МЧД → status SIGNED, history обновлён
- **TC-02:** Sign with reservations → status SIGNED_WITH_RESERVATIONS, reservations сохранён
- **TC-03:** Refuse → status REFUSED, reason сохранён
- **TC-04:** Bulk 5 документов → все подписаны
- **TC-05:** Mcd автоматически подобралась правильная (проверка по principal_inn)

### Негативные
| TC | Действие | Ожидание |
|---|---|---|
| NEG-01 | Sign без МЧД | 422 mcd_required |
| NEG-02 | Sign с МЧД от чужого ИНН | 422 mcd_principal_mismatch |
| NEG-03 | Sign с МЧД без полномочия 02.08 | 422 mcd_insufficient_power |
| NEG-04 | Sign с просроченной МЧД | 422 mcd_expired |
| NEG-05 | Sign с невалидной signature | 422 signature_invalid |
| NEG-06 | Submit с чужим nonce | 422 nonce_mismatch |
| NEG-07 | Submit через 6 мин после init | 410 sign_request_expired |
| NEG-08 | Повторный submit с тем же nonce | 200 (idempotency), один и тот же jobId |
| NEG-09 | Sign документа, который уже подписан | 409 document_already_signed |
| NEG-10 | Bulk с 51 документом | 400 too_many_items |
| NEG-11 | Bulk где половина без МЧД | 202, но в `skipped` список пропущенных |
| NEG-12 | Отказ без причины | 422 reason_required |

---

## 10. Чек-лист

- [ ] Миграции: `sign_requests`
- [ ] 6 эндпоинтов + OpenAPI
- [ ] Интеграция с криптопровайдером (КриптоПро) для проверки signature
- [ ] Async job runner (отправка оператору ЭДО)
- [ ] findMcdForSigning (см. mcd-backend-api.md)
- [ ] Sub-integrations: SBIS, Диадок, Контур, СберКорус (см. edo-operators-backend-api.md)
- [ ] Idempotency по nonce
- [ ] Защита от replay (TTL 5 мин, одноразовый nonce)
- [ ] Audit log
- [ ] SSE/WS для real-time
- [ ] Load-тест: 100 single-signs/сек

---

## 11. Ссылки на прототип

| Что | Файл |
|---|---|
| Карточка с кнопкой «Подписать» | `src/pages/DocumentDetailPage.tsx` |
| Флоу single-подписания | `src/pages/SigningFlowPage.tsx` |
| Массовое подписание | `src/pages/BulkSigningPage.tsx` |
| Находилка МЧД | `findMcdForPower()` в `src/lib/mockMcdParser.ts` |
| Маппинг doc.type → required power | `DOC_TYPE_REQUIRED_POWER` в `src/lib/constants.ts` |
| История с МЧД | в `documents.history` + `SigningFlowPage.tsx` |
