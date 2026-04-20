# Документы — ТЗ для бэкенда

**Модуль:** eTRN → Documents (электронные транспортные накладные и смежное)
**Версия:** 1.0

## 1. Бизнес-контекст

Документы — **ядро eTRN**. Пользователи получают, просматривают, подписывают и архивируют электронные транспортные накладные (ЭТрН) и смежные (ЭЗЗ, ТТН, УПД, счета, акты). Сам создание и отправка документов — **вне мобильного приложения** (делается в 1С / веб-портале отправителя). eTRN — это **«приёмник и подписант»** для доверенного лица.

### Типы документов

| Тип | Код | Описание |
|---|---|---|
| ЭТрН | `etrn` | Электронная транспортная накладная — основной документ |
| ЭЗЗ | `ezz` | Электронный заказ-наряд (к ЭТрН) |
| ТТН | `ttn` | Товарно-транспортная накладная |
| УПД | `upd` | Универсальный передаточный документ |
| Акт | `act` | Акт выполненных работ |
| Счёт | `invoice` | Счёт на оплату |

### Статусы документа (жизненный цикл)

```
      создан (вне eTRN)
            ↓
       отправлен
            ↓
    ┌───────┴────────┐
  просмотрен         ↓
    ↓          требует подписи ← фокус eTRN
    ↓           ├─ в работе (назначен водителю)
    ↓           ├─ подписан
    ↓           ├─ подписан с оговоркой
    ↓           ├─ отказано
    ↓           └─ ошибка (например, МЧД невалидна)
```

Полный набор статусов:
- `DRAFT` — черновик (создан, не отправлен; на eTRN обычно не встречается)
- `SENT` — отправлен, ждёт адресата
- `VIEWED` — просмотрен, но не подписан
- `NEED_SIGN` — требует подписи от текущего юзера
- `IN_PROGRESS` — назначен водителю, ждёт его подписи
- `SIGNED` — подписан
- `SIGNED_WITH_RESERVATIONS` — подписан с оговоркой
- `REFUSED` — отказано в подписи
- `ERROR` — ошибка при подписании (повторить)

### Ключевые сценарии
1. **Получил документ** → открыл → подписал.
2. **Получил партию документов** → выбрал несколько → подписал все.
3. **Получил документ** → не нравится → отказался или подписал с оговоркой.
4. **Получил документ** → ответственный не я → назначил водителю.
5. **Ищу в архиве** старый документ для скачивания PDF.

---

## 2. Функциональные требования

### FR-Documents

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Получение входящих документов от операторов ЭДО (pull или webhook). | P0 |
| FR-02 | Список документов с фильтрами по статусу, типу, дате, отправителю. | P0 |
| FR-03 | Полнотекстовый поиск по номеру и названию. | P0 |
| FR-04 | Детальный просмотр: реквизиты, груз, маршрут, история, файлы. | P0 |
| FR-05 | Скачивание оригиналов файлов (XML + визуализация PDF). | P0 |
| FR-06 | Назначение документа другому водителю в компании. | P1 |
| FR-07 | Архив — отдельный раздел подписанных документов с поиском и экспортом. | P0 |
| FR-08 | История действий (Timeline) для каждого документа с геолокацией. | P0 |
| FR-09 | Дедупликация — один и тот же документ от разных операторов склеивается. | P1 |
| FR-10 | Синхронизация статусов с операторами ЭДО раз в 5 минут. | P0 |

### NFR

| ID | Требование |
|---|---|
| NFR-01 | P95 latency списка ≤ 300 мс (для 100 документов) |
| NFR-02 | Полнотекстовый поиск ≤ 500 мс на выборке до 10k |
| NFR-03 | История хранится минимум 5 лет (налоговое требование) |

---

## 3. Поведение фронта

### 3.1 Список документов `/documents`

```
┌────────────────────────────────────────────────┐
│ TopBar: «Документы»                      🔔 👤 │
├────────────────────────────────────────────────┤
│ [Поиск] 🔍                                     │
│ Фильтры: [Все] [Требуют подписи] [В работе]    │
│          [Подписаны] [Ошибка]                  │
├────────────────────────────────────────────────┤
│ Группировка: По дате ▼                         │
│                                                │
│ Сегодня                                        │
│  ▸ ЭТрН-2026-001 · ООО Агро → ООО Фуд        │
│    🟢 Требует подписи · 45 мин назад           │
│  ▸ ЭТрН-2026-002 · ...                         │
│                                                │
│ Вчера                                          │
│  ▸ ...                                         │
├────────────────────────────────────────────────┤
│ BottomNav: [📋 Документы]                      │
└────────────────────────────────────────────────┘

GET /api/v1/documents?status=NEED_SIGN,IN_PROGRESS
                      &search=&sort=updated_desc
                      &cursor=&limit=20
  ← {
      items: [...],
      nextCursor: "opaque",
      totals: { NEED_SIGN: 5, IN_PROGRESS: 3, SIGNED: 42, ... }
    }
```

Infinite scroll через cursor-based пагинацию. Фильтры и поиск — в query-параметрах, дебаунс 300 мс при наборе в поиске.

### 3.2 Детали документа `/documents/:id`

```
┌────────────────────────────────────────────────┐
│ ‹ Назад · Документ                       🔔 👤 │
├────────────────────────────────────────────────┤
│ ЭТрН-2026-001                   🟡 Требует     │
│ Электронная транспортная накладная     подписи │
│                                                │
│ [СБИС · Роуминг с 27+ операторами]             │
│                                                │
│ Вкладки: [Просмотр] [Детали] [История] [Файлы]│
├────────────────────────────────────────────────┤
│ (Содержимое активной вкладки)                  │
├────────────────────────────────────────────────┤
│ Подпишется по МЧД МЧД-2026-00456 (зелёная)   │
│ От имени ООО «ТрансЛогистик» · полномочие 02.08│
│                                                │
│ [Подписать]  [UserPlus  Назначить]             │
└────────────────────────────────────────────────┘

GET /api/v1/documents/:id
  ← { ...detail, files: [...], history: [...] }

GET /api/v1/mcd/find-for-signing?docType=etrn&senderInn=X
  ← { mcd: {...} | null, reason }
```

### 3.3 Архив `/archive`

```
TopBar: «Архив»
Фильтры: Все / По месяцам / По компании
[Поиск по номеру, компании]

Список подписанных документов (status = SIGNED or SIGNED_WITH_RESERVATIONS)

GET /api/v1/documents?status=SIGNED,SIGNED_WITH_RESERVATIONS
```

### 3.4 Детали архивного `/archive/:id`

Та же структура что и `/documents/:id`, но без кнопки «Подписать» — вместо неё «Экспортировать PDF» / «Скачать XML».

```
POST /api/v1/documents/:id/export
  Body: { format: "pdf" | "xml" }
  ← 200 { url }  (подписанный URL, TTL 5 мин)
```

---

## 4. Схема БД

### 4.1 Таблица `documents`

```sql
CREATE TABLE documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id           TEXT NOT NULL,             -- ID у оператора ЭДО
  edo_operator          VARCHAR(32) NOT NULL,      -- sbis|diadoc|kontur|sberkorus
  number                TEXT NOT NULL,             -- номер документа
  type                  document_type NOT NULL,
  status                document_status NOT NULL,
  title                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at             TIMESTAMPTZ,

  -- Отправитель и получатель
  sender_inn            VARCHAR(12) NOT NULL,
  sender_name           TEXT NOT NULL,
  receiver_inn          VARCHAR(12),
  receiver_name         TEXT,

  -- Водитель и ТС
  driver_name           TEXT,
  driver_phone          VARCHAR(16),
  vehicle_plate         VARCHAR(20),

  -- Маршрут и груз
  route_from            TEXT,
  route_to              TEXT,
  cargo_description     TEXT,
  cargo_weight_kg       INT,
  cargo_volume_m3       NUMERIC(10,2),
  cargo_packages        INT,
  amount                NUMERIC(14,2),

  -- Назначение водителю
  assigned_to_user_id   UUID REFERENCES users(id),
  assigned_at           TIMESTAMPTZ,

  -- Подписание
  signed_by_user_id     UUID REFERENCES users(id),
  signed_by_mcd_id      UUID REFERENCES mcd(id),
  sign_location         JSONB,                     -- { lat, lng, address }
  reservations          TEXT,                      -- если SIGNED_WITH_RESERVATIONS
  refusal_reason        TEXT,                      -- если REFUSED

  -- Привязки
  owner_user_id         UUID NOT NULL REFERENCES users(id),   -- кому принадлежит в eTRN
  trip_id               UUID REFERENCES trips(id),            -- опциональная связь с рейсом

  UNIQUE (edo_operator, external_id)
);

CREATE TYPE document_type AS ENUM ('etrn','ezz','ttn','upd','act','invoice');

CREATE TYPE document_status AS ENUM (
  'DRAFT','SENT','VIEWED',
  'NEED_SIGN','IN_PROGRESS',
  'SIGNED','SIGNED_WITH_RESERVATIONS',
  'REFUSED','ERROR'
);

CREATE INDEX idx_docs_owner_status ON documents(owner_user_id, status);
CREATE INDEX idx_docs_sender_inn  ON documents(sender_inn);
CREATE INDEX idx_docs_updated     ON documents(owner_user_id, updated_at DESC);
CREATE INDEX idx_docs_search      ON documents USING gin(to_tsvector('russian', number || ' ' || sender_name));
```

### 4.2 Таблица `document_files`

```sql
CREATE TABLE document_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind            VARCHAR(16) NOT NULL,         -- xml | pdf | signature | attachment
  name            TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  mime_type       VARCHAR(64),
  storage_key     TEXT NOT NULL,                -- путь в S3
  hash_sha256     VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 Таблица `document_history`

```sql
CREATE TABLE document_history (
  id              BIGSERIAL PRIMARY KEY,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action          VARCHAR(32) NOT NULL,  -- received|viewed|signed|signed_with_reservations|refused|assigned|error
  actor_user_id   UUID REFERENCES users(id),
  actor_name      TEXT,                  -- для внешних action от отправителя
  description     TEXT NOT NULL,
  location        JSONB,
  metadata        JSONB,                 -- { mcd_id, mcd_number, reservations, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_history_doc ON document_history(document_id, created_at DESC);
```

### 4.4 Таблица `trips` (опционально — рейсы)

```sql
CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,           -- "Москва → Казань"
  date            DATE NOT NULL,
  vehicle_plate   VARCHAR(20),
  driver_user_id  UUID REFERENCES users(id),
  owner_user_id   UUID NOT NULL REFERENCES users(id)
);
```

---

## 5. REST API

### 5.1 Список документов

```
GET /api/v1/documents
Query:
  status         — comma-separated, напр. NEED_SIGN,IN_PROGRESS
  type           — comma-separated
  senderInn      — фильтр по отправителю
  dateFrom       — YYYY-MM-DD
  dateTo         — YYYY-MM-DD
  search         — поиск по number + sender_name
  sort           — updated_desc (default) | created_desc | amount_desc
  cursor         — opaque
  limit          — 1..100 (default 20)

Response 200:
{
  "items": [
    {
      "id", "number", "type", "status", "title",
      "sender": { "inn", "name" },
      "receiver": { "inn", "name" },
      "updatedAt", "signedAt",
      "amount",
      "edoOperator",
      "hasAttachedMcd": true,
      "requiresSign": true
    }
  ],
  "nextCursor": "opaque-or-null",
  "totals": {
    "NEED_SIGN": 5, "IN_PROGRESS": 3, "SIGNED": 42,
    "SIGNED_WITH_RESERVATIONS": 2, "REFUSED": 1, "ERROR": 0
  }
}
```

Пагинация — cursor-based (не offset), чтобы стабильно работала при частых изменениях.

### 5.2 Детали документа

```
GET /api/v1/documents/:id

Response 200:
{
  "id", "number", "type", "status",
  "sender": { ... }, "receiver": { ... },
  "driver": { "name", "phone", "vehiclePlate" },
  "route": { "from", "to" },
  "cargo": { "description", "weight", "volume", "packages" },
  "amount",
  "signLocation": { "lat", "lng", "address" },
  "reservations", "refusalReason",
  "signedByMcd": { "id", "number", "principalName" },
  "assignedTo": { "userId", "name" },
  "files": [
    { "id", "kind", "name", "sizeBytes", "mimeType",
      "downloadUrl": "https://cdn.etrn.ru/..." /* signed 5 min */ }
  ],
  "history": [
    {
      "id", "action", "description",
      "actorName", "createdAt",
      "location": { "lat", "lng", "address" },
      "metadata": { "mcdNumber": "МЧД-2026-00456", ... }
    }
  ],
  "createdAt", "receivedAt", "updatedAt", "signedAt"
}

Response 404:
{ "error": "not_found" }
```

### 5.3 Экспорт

```
POST /api/v1/documents/:id/export
Body:  { "format": "pdf" | "xml" }

Response 200:
{ "downloadUrl": "https://...", "expiresAt": "..." }
```

### 5.4 Назначение водителю

```
POST /api/v1/documents/:id/assign
Body:  { "userId": "uuid" | null }   // null = снять назначение

Response 200: обновлённый документ
```

Требует, чтобы `userId` принадлежал той же компании что и текущий юзер.

### 5.5 Пометить как просмотренный

```
POST /api/v1/documents/:id/view
Response 204
```

Вызывается фронтом автоматически при открытии детали документа (если status был SENT, становится VIEWED).

### 5.6 Счётчики для табов

```
GET /api/v1/documents/counts

Response 200:
{ "needSign": 5, "inProgress": 3, "signed": 42, "refused": 1, "error": 0 }
```

Используется на Dashboard.

### 5.7 Подписка на новые документы (optional, real-time)

```
GET /api/v1/documents/events   (SSE)

event: document.received
data: { id, number, sender, type }

event: document.updated
data: { id, status, updatedAt }
```

Альтернативно — push-уведомления через FCM/APNs (см. `notifications-backend-api.md`).

---

## 6. Интеграция с операторами ЭДО

См. `edo-operators-backend-api.md` для деталей. Кратко:

- Каждые 5 минут cron-job опрашивает **все подключённые операторы** для каждого юзера
- Новые документы парсятся (XML → поля БД), сохраняются в `documents`
- Вычисляется `owner_user_id` (по ИНН компании юзера)
- Пушится уведомление юзеру
- При изменении статуса у оператора → обновляется локально

Для real-time можно подключить webhook-и у операторов, но это зависит от каждого.

---

## 7. Безопасность

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `GET /documents` | 60/мин на юзера |
| `GET /documents/:id` | 120/мин на юзера |
| `POST /documents/:id/export` | 10/мин на документ |

### Доступ
- Юзер видит только свои документы (`owner_user_id = current_user.id`)
- Назначить может только документы своей компании (совпадение `sender_inn` или `receiver_inn` с `company_inn` юзера)
- Скачать файл можно только через подписанный URL (TTL 5 мин)

### Файлы
- XML и PDF в приватном bucket
- Антивирус при получении от оператора
- Хеш sha-256 для каждого файла (дедупликация, целостность)

---

## 8. Тест-кейсы

### Happy
- **TC-01:** Получение нового документа от СБИС → появляется в списке status=NEED_SIGN ✅
- **TC-02:** Фильтр по status → возвращаются только нужные ✅
- **TC-03:** Открыть деталь → status автоматически меняется SENT→VIEWED ✅
- **TC-04:** Назначить водителю → тот видит документ у себя ✅
- **TC-05:** Экспорт PDF → получить signed URL → скачать файл ✅

### Негативные
| TC | Действие | Ожидание |
|---|---|---|
| NEG-01 | Чужой документ по ID | 404 (не утечка, что такой вообще есть) |
| NEG-02 | Назначить чужому пользователю (не из компании) | 403 |
| NEG-03 | Экспорт удалённого документа | 410 |
| NEG-04 | Слишком длинный search (>200 симв.) | 400 |
| NEG-05 | Невалидный cursor | 400 |
| NEG-06 | Дубль документа от разных операторов | deduped, один экземпляр в ответе |

---

## 9. Чек-лист

- [ ] Миграции: `documents`, `document_files`, `document_history`, `trips`
- [ ] Full-text search (tsvector + GIN индекс)
- [ ] Cursor-based пагинация
- [ ] 7 эндпоинтов + OpenAPI
- [ ] Cron-job sync с операторами каждые 5 мин
- [ ] SSE-endpoint для real-time
- [ ] Индексы под все часто используемые фильтры
- [ ] Signed URL для файлов (TTL 5 мин)
- [ ] Дедупликация документов от разных операторов

---

## 10. Ссылки на прототип

| Что | Файл |
|---|---|
| Список документов | `src/pages/DocumentListPage.tsx` |
| Карточка документа | `src/pages/DocumentDetailPage.tsx` |
| Архив — список | `src/pages/ArchivePage.tsx` |
| Архив — детали | `src/pages/ArchiveDetailPage.tsx` |
| Dashboard | `src/pages/DashboardPage.tsx` |
| Типы (DocRecord, HistoryEvent) | `src/lib/constants.ts` |
| Mock-данные | `src/data/mockDocuments.ts` |
