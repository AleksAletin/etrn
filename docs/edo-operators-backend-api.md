# Интеграция с операторами ЭДО — ТЗ для бэкенда

**Модуль:** eTRN → EDO Operators integration
**Версия:** 1.0

## 1. Бизнес-контекст

**Операторы электронного документооборота (ЭДО)** — лицензированные ФНС посредники, через которых юридические лица обмениваются электронными документами (ЭТрН, счета-фактуры, УПД). Чтобы документ имел юридическую силу, он должен быть отправлен через оператора.

**eTRN не является оператором ЭДО** — мы **клиентское приложение**, которое:
- Получает входящие документы пользователя от операторов
- Отправляет подписанные документы обратно через операторов

### 4 основных оператора

| Оператор | Описание | Доля рынка |
|---|---|---|
| **СБИС** (Тензор) | Роуминг с 27+ операторами, мобильная подпись | ~20% |
| **СберКорус** (Сфера) | 60% всех ЭТрН в РФ, интеграция со Сбером | ~35% |
| **Контур.Диадок** | Онлайн-регистрация, сервис «Логистика» | ~25% |
| **Калуга Астрал** | Аккредитованный УЦ, коннекторы 1С/SAP | ~15% |

### Роуминг
Оператор A может обмениваться с клиентами оператора B через **роуминг** — согласованный протокол между операторами. eTRN **не заморачивается с роумингом** — оператор пользователя сам разбирается с роумингом, мы работаем только с «своим» оператором.

### Что нужно интегрировать
У каждого оператора — свой REST/SOAP API. Основные операции:
1. **Аутентификация** (OAuth2 / API key)
2. **Получение списка документов** юзера (pull)
3. **Получение XML конкретного документа**
4. **Отправка подписанного документа** (встроенный CAdES + МЧД)
5. **Получение статуса документа** у оператора
6. **(Опц.) Webhook** для real-time уведомлений

### Подключение юзера
Пользователь в eTRN должен **подключить своего оператора** — авторизоваться в его кабинете через OAuth2 и выдать разрешение eTRN работать от его имени.

---

## 2. Функциональные требования

### FR-EDO

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Подключение/отключение оператора ЭДО через OAuth2. | P0 |
| FR-02 | Поддержка 4 операторов: СБИС, Диадок, Контур (Диадок — Контур), СберКорус. | P0 |
| FR-03 | Ingest документов: cron pull каждые 5 минут. | P0 |
| FR-04 | При наличии webhook — real-time вместо poll. | P1 |
| FR-05 | Отправка подписи оператору через соответствующий адаптер. | P0 |
| FR-06 | Дедупликация документов по (edo_operator, external_id). | P0 |
| FR-07 | Retry при ошибках сети, circuit breaker при недоступности оператора. | P0 |
| FR-08 | Отдельное хранение OAuth-токенов пользователя (refresh auto). | P0 |
| FR-09 | Регистрация нового юрлица у оператора ЭДО (если компания не подключена). | P1 |

---

## 3. Поведение фронта

### 3.1 Подключение оператора

```
/profile → раздел «Операторы ЭДО» → /profile/edo

┌──────────────────────────────────────────┐
│ Подключенные операторы                    │
├──────────────────────────────────────────┤
│ ✅ СБИС  (подключен 15.01.2026)  [⚙]     │
│ ⬜ Диадок          [Подключить]          │
│ ⬜ СберКорус       [Подключить]          │
│ ⬜ Калуга Астрал   [Подключить]          │
└──────────────────────────────────────────┘

Клик «Подключить»:
  → POST /api/v1/edo/connect/init
    Body: { operator: "diadoc" }
    ← 200 { authUrl: "https://diadoc.kontur.ru/oauth/authorize?..." }

  → Редирект на оператора
  → После авторизации → callback на eTRN
    GET /api/v1/edo/callback?operator=diadoc&code=...&state=...
  → Успех → юзер возвращается в профиль
```

### 3.2 Авто-ingest

Фронт ничего не делает — всё в фоне (cron + webhook).
При появлении нового документа юзер видит push + in-app (см. `notifications-backend-api.md`).

### 3.3 Отправка подписи

Происходит в signing flow (см. `signing-backend-api.md`). Фронт не знает о конкретном операторе — бэк сам выбирает нужный адаптер по `document.edo_operator`.

---

## 4. Схема БД

### 4.1 Таблица `edo_connections`

```sql
CREATE TABLE edo_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  operator          edo_operator NOT NULL,
  external_user_id  TEXT NOT NULL,            -- user ID у оператора
  company_inn       VARCHAR(12) NOT NULL,
  access_token_enc  TEXT NOT NULL,            -- шифруется KMS
  refresh_token_enc TEXT,
  expires_at        TIMESTAMPTZ,
  scopes            TEXT[] NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at      TIMESTAMPTZ,

  UNIQUE (user_id, operator, company_inn)
);

CREATE TYPE edo_operator AS ENUM ('sbis', 'diadoc', 'kontur', 'sberkorus');

CREATE INDEX idx_edo_sync_queue ON edo_connections(operator, last_sync_at)
  WHERE active = TRUE;
```

### 4.2 Таблица `edo_sync_cursors`

```sql
CREATE TABLE edo_sync_cursors (
  connection_id  UUID PRIMARY KEY REFERENCES edo_connections(id) ON DELETE CASCADE,
  last_document_cursor TEXT,                  -- opaque, зависит от оператора
  last_document_at     TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Адаптеры операторов

Каждый оператор — **отдельный адаптер** с унифицированным интерфейсом:

```ts
interface EdoAdapter {
  startOAuth(state: string): { authUrl: string }
  exchangeCode(code: string): { externalUserId, accessToken, refreshToken, expiresAt, companyInn }
  refreshToken(refreshToken: string): { accessToken, refreshToken, expiresAt }

  listDocuments(conn: Connection, cursor?: string): { documents: RawDocument[], nextCursor?: string }
  getDocumentXml(conn: Connection, externalId: string): Buffer

  sendSignedDocument(conn: Connection, envelope: SignedEnvelope): { externalId: string }
  getDocumentStatus(conn: Connection, externalId: string): { status: string }
}
```

### 5.1 Адаптер СБИС (Тензор)
- API: https://api.sbis.ru/
- Auth: SSO через логин SBIS
- Формат подписи: CAdES-BES
- Док: Swagger на портале разработчика

### 5.2 Адаптер Диадок (Контур)
- API: https://diadoc.kontur.ru/docs/api-spec/
- Auth: OAuth2
- Формат подписи: CAdES-BES
- Webhook: поддерживается

### 5.3 Адаптер СберКорус (Сфера)
- API: https://developers.sberkorus.ru
- Auth: OAuth2 + mTLS client cert
- Формат подписи: CAdES-BES / CAdES-T

### 5.4 Адаптер Астрал
- API: https://astralnalog.ru/products/otchet/api/
- Auth: API key
- Формат подписи: CAdES

Каждый адаптер реализует свой `provider.ts` / `provider.service.py` с **одинаковым интерфейсом**. Единая фабрика по `edo_operator` возвращает нужный.

---

## 6. REST API (для фронта)

### 6.1 Список операторов

```
GET /api/v1/edo/operators

Response 200:
[
  { "id": "sbis",       "name": "СБИС",      "description": "..." },
  { "id": "diadoc",     "name": "Диадок",    "description": "..." },
  { "id": "kontur",     "name": "Контур",    "description": "..." },
  { "id": "sberkorus",  "name": "СберКорус", "description": "..." }
]
```

### 6.2 Мои подключения

```
GET /api/v1/edo/connections

Response 200:
[
  {
    "id", "operator", "companyInn",
    "connectedAt", "lastSyncAt",
    "active"
  }
]
```

### 6.3 Начать подключение (OAuth2)

```
POST /api/v1/edo/connect/init
Body: { "operator": "diadoc" }

Response 200:
{
  "authUrl": "https://diadoc.kontur.ru/oauth2/authorize?client_id=...&state=...&redirect_uri=...",
  "state": "uuid"   // сохраняется в Redis на 5 мин
}
```

### 6.4 OAuth callback

```
GET /api/v1/edo/callback?operator=diadoc&code=...&state=...

Response: redirect на /profile/edo?status=connected
```

Бэк:
1. Проверяет `state` в Redis (защита от CSRF)
2. `adapter.exchangeCode(code)` → tokens
3. Шифрует tokens (AES + KMS), сохраняет в `edo_connections`
4. Ставит в очередь первый sync

### 6.5 Отключить

```
DELETE /api/v1/edo/connections/:id

Response 204
```

Ревокает tokens у оператора (если API поддерживает), удаляет запись, `last_sync_at = null`.

### 6.6 Force sync (для отладки)

```
POST /api/v1/edo/connections/:id/sync

Response 202: { jobId }
```

---

## 7. Ingest-pipeline (cron / webhook)

### 7.1 Cron pull (если нет webhook)

```
Cron: */5 * * * *  (каждые 5 минут)

for connection in get_active_connections():
    try:
        adapter = get_adapter(connection.operator)
        cursor = get_sync_cursor(connection.id)

        while True:
            page = adapter.listDocuments(connection, cursor)
            for doc in page.documents:
                upsert_document(doc, connection)
            if not page.nextCursor:
                break
            cursor = page.nextCursor

        save_sync_cursor(connection.id, cursor)
    except TokenExpired:
        refresh_or_deactivate(connection)
    except OperatorDown:
        circuit_breaker.mark_failed(connection.operator)
```

### 7.2 Webhook (где поддерживается)

```
POST /api/v1/edo/webhook/:operator
Headers:  X-Operator-Signature: ...
Body:  { event: "document.created", documentId, userId, ... }

→ Проверяет подпись
→ Получает connection
→ adapter.getDocumentXml()
→ upsert_document()
```

### 7.3 Парсинг документа и сохранение

```python
def upsert_document(raw_doc, connection):
    # Парсим XML/JSON от оператора в унифицированный формат
    doc_data = parse_operator_payload(raw_doc, connection.operator)

    # Upsert по (edo_operator, external_id) — дедупликация
    document = db.upsert('documents',
        key=(connection.operator, raw_doc.external_id),
        data={
            'number': doc_data.number,
            'type': doc_data.type,
            'status': doc_data.status,
            'sender_inn': doc_data.sender_inn,
            ...
            'owner_user_id': connection.user_id
        }
    )

    # Сохраняем XML-файл в S3
    if raw_doc.xml:
        save_file(document.id, 'xml', raw_doc.xml)

    # Уведомление
    if document.is_new and doc_data.status == 'NEED_SIGN':
        send_notification(connection.user_id, 'new_document', { document_id: document.id })
```

### 7.4 Sending обратно

```python
def send_signed_to_operator(document_id, signature, mcd_id):
    document = get_document(document_id)
    connection = get_connection(user_id=document.owner_user_id, operator=document.edo_operator)
    adapter = get_adapter(document.edo_operator)

    envelope = build_envelope(document, signature, mcd_id)
    try:
        result = adapter.sendSignedDocument(connection, envelope)
        update_document_status(document_id, 'SIGNED')
    except OperatorError as e:
        update_document_status(document_id, 'ERROR', error=e.message)
        raise
```

---

## 8. Безопасность

### OAuth2 tokens
- Access + refresh — **шифруются AES-256** с ключом из KMS
- Автоматический refresh при `expires_at - now < 5 min`
- Если refresh провалился → `active = false`, юзер должен переподключить

### OAuth state
- Хранится в Redis с TTL 5 мин
- Проверяется при callback (защита от CSRF)

### mTLS (для СберКорус)
- Client cert в KMS, mount в контейнере
- Ротация раз в год

### Circuit breaker
- Если > 5% запросов к оператору провалилось за 1 мин → пауза 2 мин
- Не блокируем фронт — возвращаем статус «оператор временно недоступен»

### Webhook signatures
- Обязательная проверка HMAC-подписи от оператора
- Отклонение при невалидной → 401

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /edo/connect/init` | 10/час на юзера |
| `POST /edo/connections/:id/sync` | 1/мин на connection |

---

## 9. Тест-кейсы

- **TC-01:** Подключение СБИС → OAuth redirect → tokens сохранены → cron забирает документы ✅
- **TC-02:** Получение нового ЭТрН → push юзеру ✅
- **TC-03:** Отправка подписи → document.status = SIGNED + external_id сохранён ✅
- **TC-04:** Webhook от Диадок → документ появляется в списке < 10 сек ✅
- **TC-05:** Token expired → refresh → sync продолжается ✅
- **TC-06:** Refresh провалился → connection.active=false, юзер уведомлён ✅
- **TC-07:** Дубль документа → upsert не создаёт второй ✅

---

## 10. Чек-лист

- [ ] Миграции: `edo_connections`, `edo_sync_cursors`
- [ ] Адаптеры всех 4 операторов с единым интерфейсом
- [ ] OAuth2 для каждого (+ state в Redis)
- [ ] Шифрование tokens через KMS
- [ ] Cron pull-sync каждые 5 мин
- [ ] Webhook-endpoints для Диадок / СберКорус (если поддерживается)
- [ ] Circuit breaker + retry
- [ ] Upsert-логика с дедупликацией
- [ ] 6 эндпоинтов для фронта + OpenAPI

---

## 11. Ссылки на прототип

| Что | Файл |
|---|---|
| UI подключения оператора | `src/pages/EdoConnectPage.tsx` |
| Константы операторов | `EDO_OPERATORS` в `src/lib/constants.ts` |
| Mock-документы с разными операторами | `src/data/mockDocuments.ts` |

---

## Приложение A: Референсы документации операторов

- СБИС API: https://sbis.ru/help/integration/api
- Диадок API: https://diadoc.kontur.ru/docs/api-spec/
- СберКорус: https://developers.sberkorus.ru/
- Астрал: https://astralnalog.ru/products/otchet/api/
