# МЧД — техническое задание для бэкенда

**Версия:** 1.1
**Дата:** 2026-04-19
**Для:** бэкенд-разработчик, с контекстом для продукт/QA/фронта

Документ описывает модуль «Машиночитаемая доверенность» (МЧД) в приложении **eTRN** — бизнес-логику, поведение фронта, функциональные требования и техническое задание для бэкенда. Основан на действующем прототипе: https://aleksaletin.github.io/etrn/

Связанные материалы:
- `docs/mcd-spec-v2.md` — первая редакция спеки
- `docs/samples/` — реальные XML-МЧД ФНС для парсинга

---

## 1. Бизнес-контекст

### 1.1 Что такое МЧД

**Машиночитаемая доверенность** — это электронный документ (XML формата ФНС `EMCHD_1`), которым компания-доверитель делегирует конкретному физическому лицу (доверенному) право подписывать определённые электронные документы от имени этой компании.

С 1 марта 2024 года МЧД **обязательна** для подписания электронных документов сотрудником: больше нельзя подписывать ЭП «на компанию», теперь подписывается ЭП физлица + приложенная МЧД.

### 1.2 Зачем это eTRN

**eTRN** — мобильное приложение для подписания электронных транспортных накладных (ЭТрН) и сопутствующих документов. Почти каждая подпись в системе требует валидной МЧД.

Без МЧД пользователь не может:
- Подписать ЭТрН от имени перевозчика
- Подписать ЭЗЗ (заказ-наряд), ТТН, УПД
- Отказать в подписи с юридическими последствиями

С МЧД у него есть то же право, что у руководителя компании — но только в рамках перечисленных полномочий.

### 1.3 Кто пользователи и зачем им МЧД

| Роль | Типичная ситуация | МЧД |
|---|---|---|
| **Водитель** (ИП или ФЛ) | Возит груз для 1–N компаний-перевозчиков. Подписывает ЭТрН как «получатель груза» / «водитель-перевозчик». | От каждой компании, на которую работает — отдельная МЧД. |
| **Сотрудник (логист/диспетчер)** | В мобильном мониторит подписания, редко сам подписывает. | МЧД компании-работодателя, обычно с расширенным набором полномочий. |
| **Руководитель / ИП-перевозчик** | Сам подписывает документы по своему бизнесу. | Обычно МЧД не нужна — использует свою КЭП напрямую. Но может быть МЧД от партнёров. |
| **Владелец груза (грузоотправитель)** | Использует eTRN чтобы видеть что его груз подписан. | МЧД его компании (если подписывает как представитель). |

**Ключевой инсайт:** у одного юзера может быть **N МЧД** от разных компаний. При подписании документа выбирается **ровно ОДНА** — та, у которой ИНН доверителя совпадает с ИНН отправителя документа.

### 1.4 Жизненный цикл МЧД

```
Выпуск в ЛК ФНС (вне eTRN)
    ↓
Загрузка в eTRN (XML)
    ↓
Верификация (4 шага)
    ↓
Использование при подписании
    ↓
Истечение срока / отзыв доверителем в ФНС / замена новой
```

Срок жизни МЧД: обычно 1 год, не более 3 лет. eTRN **не выпускает** МЧД — только принимает готовые.

### 1.5 Два сценария появления МЧД у юзера в приложении

**Сценарий A — юзер сам загружает свою МЧД.**
Получил XML в ЛК ФНС → открыл eTRN → загрузил.

**Сценарий B — компания отправляет сотруднику invite-ссылку.**
Логист в офисе генерирует в eTRN защищённую ссылку на имя водителя → отправляет её по SMS/email → водитель открывает, видит лендос «Здравствуйте, Иван! Вам доверенность от ООО "ТрансЛогистик"», грузит свою МЧД. Ссылка одноразовая, с TTL 7 дней.

Оба сценария приводят к одному результату — МЧД привязывается к аккаунту.

---

## 2. Функциональные требования

### 2.1 FR-Core (основной контур, must-have для MVP)

| ID | Требование | Приоритет |
|---|---|---|
| **FR-01** | Система принимает XML-МЧД формата ФНС `EMCHD_1`, парсит все обязательные поля. | P0 |
| **FR-02** | Перед привязкой система показывает пользователю распарсенные данные для подтверждения. | P0 |
| **FR-03** | Система выполняет 4-шаговую верификацию: формат → ЭП доверителя → реестр ФНС → привязка к аккаунту. | P0 |
| **FR-04** | Система хранит все МЧД пользователя (минимум 10) с историей уплаченных использований. | P0 |
| **FR-05** | При подписании документа система автоматически подбирает подходящую МЧД по правилам из раздела 9. | P0 |
| **FR-06** | При отсутствии подходящей МЧД подписание блокируется с точечным сообщением об ошибке (какой ИНН, какое полномочие нужно). | P0 |
| **FR-07** | В истории подписанного документа фиксируется номер использованной МЧД и название доверителя. | P0 |
| **FR-08** | Система периодически (не реже 1 раз/сутки) проверяет статус каждой МЧД в реестре ФНС и обновляет локальный статус. | P0 |
| **FR-09** | Пользователь может отвязать МЧД (soft-delete). Файл сохраняется 90 дней для возможности восстановления. | P0 |
| **FR-10** | Все действия с МЧД пишутся в audit log (кто/когда/с какого IP/UA). | P0 |

### 2.2 FR-Invite (invite-ссылки, защищённый обмен)

| ID | Требование | Приоритет |
|---|---|---|
| **FR-11** | Авторизованный пользователь может сгенерировать invite-ссылку на конкретного получателя (ФИО + телефон/email). | P0 |
| **FR-12** | Токен ссылки генерируется из 256 бит энтропии CSPRNG, URL-safe. В БД хранится только SHA-256 хеш. | P0 |
| **FR-13** | Ссылка имеет TTL (по умолчанию 7 дней) и флаг одноразовости. | P0 |
| **FR-14** | Получатель по ссылке видит персонализированный лендос: кто отправил, что нужно сделать, индикаторы безопасности. | P0 |
| **FR-15** | После успешного использования одноразовая ссылка автоматически помечается «consumed». | P0 |
| **FR-16** | Отправитель может вручную отозвать любую свою активную ссылку. | P1 |
| **FR-17** | Rate-limit на создание ссылок: не более 10 активных на пользователя, 30/сутки на IP. | P0 |
| **FR-18** | Rate-limit на preview-эндпоинт (60/мин на IP) для защиты от перебора токенов. | P0 |

### 2.3 FR-Security (безопасность)

| ID | Требование | Приоритет |
|---|---|---|
| **FR-19** | Все критичные эндпоинты требуют JWT + CSRF protection. | P0 |
| **FR-20** | Файлы МЧД хранятся в приватном bucket. Доступ только через подписанные URL с TTL 5 минут. | P0 |
| **FR-21** | На входе — антивирусная проверка (ClamAV или аналог). | P0 |
| **FR-22** | Max размер XML — 10 MB. MIME+magic bytes проверка. | P0 |
| **FR-23** | Persistent Data с МЧД обезличивается в течение 30 дней после удаления пользователя (152-ФЗ). | P1 |
| **FR-24** | Audit log неизменяем (append-only, невозможно модифицировать прошлые записи). | P1 |

### 2.4 FR-UX (пользовательский опыт)

| ID | Требование | Приоритет |
|---|---|---|
| **FR-25** | Вся процедура загрузки МЧД занимает не более 4 кликов: выбрать файл → подтвердить → дождаться → готово. | P0 |
| **FR-26** | Статус верификации показывается real-time (через WS/SSE либо polling каждые 500 мс). | P1 |
| **FR-27** | На экране документа перед подписью показывается плашка «Будет подписано по МЧД №X от Y» (зелёная если есть, красная если нет). | P0 |
| **FR-28** | Ошибки МЧД — не «500 Internal Error», а человеческие: «У вас нет МЧД от ООО "Ромашка" с полномочием на ЭТрН. Запросите её у компании.» | P0 |
| **FR-29** | При expired/revoked/invalid МЧД пользователю предлагается одна кнопка: «Загрузить новую МЧД» или «Обновить статус в ФНС». | P0 |

### 2.5 Нефункциональные требования

| ID | Требование |
|---|---|
| **NFR-01** | P95 времени парсинга XML ≤ 500 мс, 4-шаговой верификации ≤ 5 сек |
| **NFR-02** | API доступность ≥ 99.5%, RPO ≤ 24 часа |
| **NFR-03** | Horizontal scalability — stateless API, sessions в Redis |
| **NFR-04** | Поддержка 10 000 активных пользователей на инстанс БД без партиций |

---

## 3. Поведение фронта (user flows)

Для каждого сценария — последовательность экранов, действий юзера, запросов к API. Это поможет бэкендеру понимать порядок вызовов и требования к latency.

### 3.1 Сценарий A: загрузка собственной МЧД

**Исходное состояние:** юзер авторизован, онбординг пройден.

```
┌──────────────────────────────────────────────────────────────┐
│ Шаг 1. Экран /mcd — выбор сценария                           │
├──────────────────────────────────────────────────────────────┤
│  [📤] У меня есть XML-файл          →  переход к шагу 2      │
│  [📨] Отправить сотруднику          →  сценарий C (invite)   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Шаг 2. Экран /mcd (upload) — выбор файла                     │
├──────────────────────────────────────────────────────────────┤
│ Drag&drop или [выбрать файл]                                 │
│ Только XML до 10 МБ.                                         │
│ ─────────────────────────────────────────────────            │
│ Юзер кликает → выбирает .xml                                 │
│   ↓                                                          │
│ POST /api/v1/mcd/parse  (multipart/form-data)                │
│   ← 200 { draftId, parsed: { number, principal, powers ... }}│
│   ↓                                                          │
│ Переход к шагу 3                                             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Шаг 3. Экран /mcd (preview) — подтверждение данных           │
├──────────────────────────────────────────────────────────────┤
│ МЧД-2026-00456                                               │
│ Доверитель: ООО «ТрансЛогистик» (ИНН 7712345678)             │
│ Доверенное лицо: Иванов С. П.  ✅ совпадает с вами           │
│ Срок действия: до 2027-01-15                                 │
│ Полномочия (2):                                              │
│   [02.08] Подписание ЭТрН                                    │
│   [02.09] Подписание ЭЗЗ                                     │
│                                                              │
│ [Привязать к аккаунту]  [← Выбрать другой файл]              │
│                                                              │
│ На «Привязать»:                                              │
│   POST /api/v1/mcd/attach  { draftId }                       │
│     ← 202 { mcdId, jobId, status: 'pending_verification' }   │
│   ↓                                                          │
│ Переход к шагу 4                                             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Шаг 4. Экран /mcd (verify) — прогресс 4 шагов                │
├──────────────────────────────────────────────────────────────┤
│ Проверка МЧД...                                              │
│ ✓  Проверка формата файла                                    │
│ ⏳ Проверка ЭП доверителя                                    │
│ ○  Проверка в реестре ФНС                                    │
│ ○  Привязка к аккаунту                                       │
│                                                              │
│ Фронт поллит: GET /api/v1/mcd/jobs/:jobId  раз в 500 мс     │
│ ИЛИ подписывается на SSE /api/v1/mcd/jobs/:jobId/events     │
│                                                              │
│ При status=done → шаг 5                                      │
│ При status=failed → экран ошибки с кодом и human-readable    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Шаг 5. Экран /mcd (done) — успех                             │
├──────────────────────────────────────────────────────────────┤
│ ✅ МЧД привязана!                                            │
│ [МЧД-карточка с деталями]                                    │
│ [Загрузить ещё одну]  [В профиль]                            │
└──────────────────────────────────────────────────────────────┘
```

**Критерии приёмки:**
- От выбора файла до экрана успеха — не более 8 секунд в happy path
- При сбое на любом шаге — понятное сообщение «что пошло не так и что делать»
- Файл не уходит в прод-bucket до успешного `attach` (черновик в `mcd-drafts/` с TTL 10 мин)

### 3.2 Сценарий B: просмотр МЧД и управление

```
┌──────────────────────────────────────────────────────────────┐
│ Профиль → раздел «МЧД»                                       │
├──────────────────────────────────────────────────────────────┤
│ Список всех МЧД юзера:                                       │
│   ▸ МЧД-2026-00456 от ООО «ТрансЛогистик»  [Действительна]   │
│   ▸ МЧД-2026-00789 от ООО «АгроТрейд»      [Истекла]         │
│                                                              │
│ Клик на карточку → детальный просмотр                        │
│                                                              │
│ GET /api/v1/mcd?status=linked,expired                       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Детали МЧД                                                    │
├──────────────────────────────────────────────────────────────┤
│ Все поля из XML + полномочия + история использований         │
│                                                              │
│ Действия:                                                    │
│   [Обновить статус в ФНС]  POST /mcd/:id/refresh             │
│   [Скачать XML]            GET /mcd/:id/file                 │
│   [Отвязать]               DELETE /mcd/:id                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Сценарий C: отправить invite сотруднику

**Отправитель (логист/руководитель):**

```
┌──────────────────────────────────────────────────────────────┐
│ /mcd → «Отправить сотруднику» → /mcd/invite                  │
├──────────────────────────────────────────────────────────────┤
│ Получатель:                                                  │
│   [ФИО]              Петров Иван Иванович                    │
│   [SMS / Email]      • SMS  ○ Email                          │
│   [Телефон]          +7 (900) 123-45-67                      │
│                                                              │
│ 🛡 Защита ссылки:                                           │
│   • 256-битный токен                                         │
│   • 7 дней действия                                          │
│   • Одноразовая                                              │
│                                                              │
│ [Создать и отправить]                                        │
│                                                              │
│ POST /api/v1/mcd/invite                                      │
│   { recipientName, recipientContact, channel: 'sms',         │
│     ttlDays: 7, oneTime: true }                              │
│   ← 201 { inviteId, token, inviteUrl, expiresAt }            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Экран успеха                                                  │
├──────────────────────────────────────────────────────────────┤
│ ✅ Ссылка создана. Отправили SMS на +7 900 123 45 67         │
│                                                              │
│ Карточка получателя:                                         │
│   Петров Иван Иванович    [SMS]                              │
│   Действительна 7 дней    Одноразовая                        │
│                                                              │
│ Ссылка для копирования:                                      │
│   https://app.etrn.ru/#/mcd?invite=zs6EQs5540c0hWdI3t4...    │
│   [Копировать]                                               │
│                                                              │
│ [Создать ещё одну]  [Готово]                                 │
└──────────────────────────────────────────────────────────────┘
```

**Получатель (водитель):**

```
Открывает ссылку из SMS/Email → браузер открывает /mcd?invite=<token>

┌──────────────────────────────────────────────────────────────┐
│ GET /api/v1/mcd/invite/:token/preview  (ПУБЛИЧНЫЙ, без JWT)  │
│   ← 200 { valid: true, inviter: {name, company},             │
│           recipient: {name}, expiresAt }                     │
│                                                              │
│ [Шаблон лендоса — см. InviteLanding.tsx в прототипе]         │
├──────────────────────────────────────────────────────────────┤
│                  🛡  eTRN                                   │
│                                                              │
│ # Здравствуйте, Иван!                                        │
│                                                              │
│ Вам прислали персональную ссылку на загрузку МЧД.            │
│                                                              │
│ ┌────────────────────────────────────┐                       │
│ │ ОТ КОГО                             │                      │
│ │ 🏢 ООО «ТрансЛогистик»              │                      │
│ │    Смирнов Алексей Николаевич       │                      │
│ └────────────────────────────────────┘                       │
│                                                              │
│  [⏱ 6 дней] [🔒 Одноразовая] [🛡 256 бит]                  │
│                                                              │
│ ## Что нужно сделать                                         │
│   1. Получите XML-файл МЧД (в ЛК ФНС)                        │
│   2. Загрузите файл                                          │
│   3. Подтвердите привязку                                    │
│                                                              │
│ ✅ Ваши данные защищены                                      │
│   • HTTPS                                                    │
│   • Никто кроме вас не сможет использовать эту ссылку        │
│   • МЧД проверяется в реестре ФНС                            │
│                                                              │
│ [🧾 Начать →]                                               │
└──────────────────────────────────────────────────────────────┘

Клик «Начать» →  переход к шагу 2 из сценария A (выбор файла)
                  При POST /mcd/attach передаётся inviteToken
                  → бэк помечает invite как consumed

Если ссылка невалидная (expired/used/revoked):
┌──────────────────────────────────────────────────────────────┐
│              ⚠️  Ссылка недействительна                     │
│                                                              │
│   Срок действия ссылки истёк.                                │
│   Попросите отправителя сгенерировать новую.                 │
│                                                              │
│              [В приложение]                                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 Сценарий D: подписание документа с автовыбором МЧД

**Исходное состояние:** юзер на экране документа ЭТрН.

```
┌──────────────────────────────────────────────────────────────┐
│ Карточка документа ЭТрН-2026-001                             │
├──────────────────────────────────────────────────────────────┤
│ Отправитель: ООО «ТрансЛогистик»                             │
│ Получатель: ООО «АгроТрейд»                                  │
│                                                              │
│ (Пре-проверка перед показом кнопки «Подписать»):            │
│   GET /api/v1/mcd/find-for-signing                          │
│     ?docType=etrn&senderInn=7712345678                       │
│                                                              │
│ ┌─ Если mcd найдена ──────────────────────────────────┐     │
│ │ 🟢 Будет подписано по МЧД МЧД-2026-00456            │     │
│ │    От имени ООО «ТрансЛогистик»                     │     │
│ │                                                      │    │
│ │ [Подписать] ✓                                       │     │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ Если mcd НЕ найдена ───────────────────────────────┐     │
│ │ 🔴 Нет подходящей МЧД                               │     │
│ │    Требуется МЧД от ООО «ТрансЛогистик»             │     │
│ │    с полномочием на ЭТрН                             │    │
│ │                                                      │    │
│ │ [Загрузить МЧД]                                      │    │
│ └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘

При клике «Подписать»:
  POST /api/v1/documents/:docId/sign
    { mcdId, mode: 'sign', signature, geoLocation }
    ← 200 { ...документ с status: signed, history: [...] }

В истории документа:
  «Документ подписан электронной подписью
   (по МЧД МЧД-2026-00456 от ООО «ТрансЛогистик»)»
```

### 3.5 Сценарий E: массовое подписание

```
Список документов → выделить N штук → «Подписать все»
  ↓
Для каждого документа — автопоиск МЧД (как в D)
  ↓
Если все документы имеют подходящую МЧД:
  - показать экран прогресса «Подписано 5 из 12...»
  - последовательно POST /api/v1/documents/:docId/sign
  - в истории каждого — номер использованной МЧД

Если часть документов не имеет подходящей МЧД:
  - пометить их отдельно «Нет МЧД от ООО X»
  - остальные подписать нормально
  - в финале показать сколько подписано / сколько пропущено
```

---

## 4. Схема БД

### 4.1 Таблица `mcd`

```sql
CREATE TABLE mcd (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),       -- владелец (доверенное лицо)
  status              mcd_status NOT NULL DEFAULT 'pending_verification',
  number              TEXT NOT NULL,                             -- номер МЧД из XML
  principal_inn       VARCHAR(12) NOT NULL,                      -- ИНН доверителя
  principal_name      TEXT NOT NULL,                             -- Название доверителя
  principal_ogrn      VARCHAR(15),
  principal_kpp       VARCHAR(9),
  trusted_person      TEXT NOT NULL,                             -- ФИО доверенного
  trusted_inn         VARCHAR(12),
  trusted_snils       VARCHAR(14),
  valid_from          DATE NOT NULL,
  valid_until         DATE NOT NULL,
  file_url            TEXT NOT NULL,                             -- ссылка на XML в S3
  file_hash_sha256    VARCHAR(64) NOT NULL,                      -- дедупликация загрузок
  registry_guid       UUID,                                      -- guid в реестре ФНС
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_from_invite UUID REFERENCES mcd_invite(id),            -- если загружена по инвайту
  UNIQUE (user_id, principal_inn, number)                        -- защита от дублей
);

CREATE TYPE mcd_status AS ENUM (
  'pending_verification',  -- загружена, проверка в процессе
  'linked',                -- валидна и активна
  'expired',               -- истёк срок
  'invalid',               -- провалена верификация (плохой формат/подпись)
  'revoked',               -- отозвана доверителем через реестр ФНС
  'insufficient'           -- не хватает полномочий для нужных действий
);

CREATE INDEX idx_mcd_user ON mcd(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_mcd_principal ON mcd(principal_inn) WHERE status = 'linked';
```

### 4.2 Таблица `mcd_power`

```sql
CREATE TABLE mcd_power (
  mcd_id         UUID NOT NULL REFERENCES mcd(id) ON DELETE CASCADE,
  code           VARCHAR(64) NOT NULL,                -- ведомственный код ЕКП
  name           TEXT NOT NULL,                        -- наименование из XML
  constraints    JSONB,                                -- доп. условия (сумма, период, контрагенты)
  PRIMARY KEY (mcd_id, code)
);

CREATE INDEX idx_mcd_power_code ON mcd_power(code);
```

Коды полномочий — **строковые идентификаторы** формата `{ВЕДОМСТВО}_{ПОДСИСТЕМА}_{КОД}`:
- `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8` — «Подписывать транспортные накладные»
- `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS7` — «Подписывать товарно-транспортные накладные»
- `FAS_EIAS_MA0001` — «Подписывать отчётные формы ФГИС ЕИАС»

Полный список подтягивается с `m4d.nalog.gov.ru` или от аккредитованного УЦ.

### 4.3 Таблица `mcd_invite`

```sql
CREATE TABLE mcd_invite (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id   UUID NOT NULL REFERENCES users(id),
  token_hash        VARCHAR(64) NOT NULL UNIQUE,      -- SHA-256 от токена, сам токен не храним
  recipient_name    TEXT NOT NULL,
  recipient_contact TEXT NOT NULL,                    -- phone E.164 или email
  channel           invite_channel NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  one_time          BOOLEAN NOT NULL DEFAULT TRUE,
  consumed_at       TIMESTAMPTZ,
  consumed_mcd_id   UUID REFERENCES mcd(id),
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB                             -- IP, user-agent при создании, для audit
);

CREATE TYPE invite_channel AS ENUM ('sms', 'email', 'copy');

CREATE INDEX idx_invite_hash ON mcd_invite(token_hash);
CREATE INDEX idx_invite_inviter_active ON mcd_invite(inviter_user_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
```

### 4.4 Таблица `mcd_audit_log`

```sql
CREATE TABLE mcd_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  mcd_id         UUID REFERENCES mcd(id),
  invite_id      UUID REFERENCES mcd_invite(id),
  user_id        UUID REFERENCES users(id),
  action         TEXT NOT NULL,
  payload        JSONB,
  ip             INET,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_mcd ON mcd_audit_log(mcd_id, created_at DESC);
```

`action ∈ {upload, verify_success, verify_fail, invite_create, invite_consume, invite_revoke, sign_use, mcd_refresh, mcd_revoke}`

---

## 5. Справочник ЕКП

```sql
CREATE TABLE ekp_catalog (
  code           VARCHAR(64) PRIMARY KEY,
  name           TEXT NOT NULL,
  department     VARCHAR(32),                  -- BBDOCS, FAS, ...
  subsystem      VARCHAR(32),
  parent_code    VARCHAR(64) REFERENCES ekp_catalog(code),   -- иерархия
  deprecated     BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at      TIMESTAMPTZ
);
```

Cron-job раз в сутки синхронизирует таблицу с реестром ФНС.

---

## 6. Маппинг «тип документа → достаточные полномочия»

Конфиг в БД или в коде:

```yaml
signing_requirements:
  sign_etrn:           # подписание электронной транспортной накладной
    required_one_of:
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8      # прямое
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS7      # ТТН
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS5      # широкое
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCSGENERAL

  sign_ezz:
    required_one_of:
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCSGENERAL

  sign_invoice:
    required_one_of:
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS4
      - BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCSGENERAL
```

Правило: **хотя бы один** из `required_one_of` должен быть в полномочиях МЧД юзера. Список утверждается с юристом.

---

## 7. REST API

Base: `/api/v1`

### 7.1 Парс XML

```
POST /mcd/parse
Content-Type: multipart/form-data

Body:
  file: XML (до 10 MB, application/xml|text/xml)

Response 200:
{
  "draftId": "uuid",                         // TTL 10 минут
  "parsed": {
    "number": "МЧД-2026-00456",
    "principal": {
      "inn": "7712345678",
      "ogrn": "1157746734837",
      "kpp": "771401001",
      "name": "ООО «ТрансЛогистик»",
      "kind": "ul"
    },
    "trustedPerson": {
      "fullName": "Иванов Сергей Петрович",
      "inn": "123456789012",
      "snils": "145-371-033 53"
    },
    "validFrom": "2026-01-15",
    "validUntil": "2027-01-15",
    "powers": [
      {
        "code": "BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8",
        "name": "Подписывать транспортные накладные",
        "constraints": null
      }
    ],
    "registryGuid": "472e846e-572b-4696-9ab1-ff839f9b0634"
  }
}

Errors:
  400 invalid_format
  400 file_too_large
  400 parse_failed
  422 already_linked
```

### 7.2 Привязка МЧД

```
POST /mcd/attach

Body:
{
  "draftId": "uuid",
  "inviteToken": "optional-if-by-invite"
}

Response 202:
{
  "mcdId": "uuid",
  "jobId": "uuid",
  "status": "pending_verification"
}

Errors:
  404 draft_not_found
  410 draft_expired
  422 trusted_person_mismatch
  422 invite_invalid
```

4 шага верификации (async):
1. **Формат файла** — XSD схема `EMCHD_1`
2. **ЭП доверителя** — CAdES/XAdES через криптопровайдер
3. **Реестр ФНС** — `GET https://m4d.nalog.gov.ru/api/v1/check/{guid}`
4. **Привязка** — транзакция insert в `mcd` + `mcd_power`, перенос файла из `mcd-drafts/` в `mcd-files/`, consume invite если был

### 7.3 Статус верификации

```
GET /mcd/jobs/:jobId

Response 200:
{
  "jobId": "uuid",
  "status": "running | done | failed",
  "currentStep": 2,
  "steps": [
    { "name": "format_check",    "status": "done" },
    { "name": "signature_check", "status": "running" },
    { "name": "fns_registry",    "status": "pending" },
    { "name": "account_link",    "status": "pending" }
  ],
  "error": null,
  "mcdId": "uuid"
}
```

Альтернатива: `GET /mcd/jobs/:jobId/events` (SSE) с событиями в реальном времени.

### 7.4 Список МЧД

```
GET /mcd?status=linked&principalInn=7712345678

Response 200:
{
  "mcds": [
    { "id", "number", "status", "principal", "trustedPerson",
      "validFrom", "validUntil", "powers": [...],
      "fileUrl", "registryGuid", "uploadedAt" }
  ]
}
```

### 7.5 Одна МЧД

```
GET /mcd/:mcdId  → { ...mcd, auditLog, usedForDocuments }
```

### 7.6 Refresh в реестре ФНС

```
POST /mcd/:mcdId/refresh  → { status, validUntil, powers }
```

### 7.7 Отвязка

```
DELETE /mcd/:mcdId  → 204
```

Soft-delete. Файл в S3 держим 90 дней.

### 7.8 Поиск МЧД для подписания

```
GET /mcd/find-for-signing?docType=etrn&senderInn=7712345678

Response 200:
{
  "mcd": {
    "id": "uuid",
    "number": "МЧД-2026-00456",
    "principal": { ... },
    "powers": [...]
  }
}

Response 200 (если не найдена):
{
  "mcd": null,
  "reason": "no_mcd | no_mcd_from_sender | mcd_expired | mcd_insufficient_power",
  "message": "У вас нет МЧД от ООО «...» с полномочием 02.08"
}
```

### 7.9 Создание invite-ссылки

```
POST /mcd/invite

Body:
{
  "recipientName": "Петров Иван Иванович",
  "recipientContact": "+79001234567",
  "channel": "sms | email",
  "ttlDays": 7,
  "oneTime": true
}

Response 201:
{
  "inviteId": "uuid",
  "token": "zs6EQs5540c0hWdI3t4F60cGvP3eazjT4niWkEfJezs",
  "inviteUrl": "https://app.etrn.ru/#/mcd?invite=<token>",
  "expiresAt": "2026-04-26T00:00:00Z"
}

Errors:
  422 invalid_contact
  429 rate_limit_exceeded
```

### 7.10 Публичный preview invite (для лендоса)

```
GET /mcd/invite/:token/preview   (БЕЗ JWT)

Response 200:
{
  "valid": true,
  "inviter": { "name": "...", "company": "..." },
  "recipient": { "name": "..." },
  "expiresAt": "..."
}

Response 410:
{
  "valid": false,
  "reason": "expired | revoked | used | not_found | malformed"
}
```

Rate-limit: 60/мин на IP.

### 7.11 Отзыв invite

```
DELETE /mcd/invite/:inviteId  → 204
```

### 7.12 Список активных инвайтов

```
GET /mcd/invite?status=active  → { invites: [... без token ...] }
```

### 7.13 Подпись документа

```
POST /documents/:docId/sign

Body:
{
  "mcdId": "uuid",
  "mode": "sign | reservations | refuse",
  "signature": "<base64 CAdES/XAdES>",
  "geoLocation": { "lat": 55.75, "lng": 37.61, "address": "..." },
  "reservationsText": "optional"
}

Response 200: { ...document with updated status... }

Errors 422:
  mcd_required
  mcd_expired
  mcd_revoked
  mcd_insufficient_power
  mcd_principal_mismatch
```

**Сервер обязан перепроверить:** принадлежность МЧД юзеру, активность, совпадение ИНН, наличие кода полномочия. Не доверять тому, что юзер передал корректный `mcdId`.

После успеха в `document.history` сохраняется: `used_mcd_id`, `used_mcd_number`, `used_mcd_principal_inn`.

---

## 8. Генерация invite-токенов — 2 варианта

**Вариант А — stateless HMAC (рекомендуется):**
```
payload = base64url({ inviteId, inviterUserId, exp })
signature = HMAC_SHA256(payload, SERVER_SECRET)
token = payload + "." + base64url(signature)
```
При валидации: re-compute HMAC, сравнить. В БД не лезть (если только не проверять revoked/used).

**Вариант Б — stateful random (в прототипе):**
```
token = random_bytes(32)  (256 бит)
hash = SHA-256(token)
// в mcd_invite сохраняем token_hash, не сам token
```
При валидации: SHA-256 от присланного токена, искать по `token_hash`.

В проде можно гибрид: HMAC для подписи, БД только для `used_at` / `revoked_at`.

---

## 9. Логика поиска МЧД для подписания

```python
def find_mcd_for_signing(user_id, doc_type, sender_inn):
    required = SIGNING_REQUIREMENTS[doc_type]['required_one_of']

    return db.execute("""
        SELECT m.* FROM mcd m
        JOIN mcd_power p ON p.mcd_id = m.id
        WHERE m.user_id = %s
          AND m.principal_inn = %s
          AND m.status = 'linked'
          AND m.valid_until > CURRENT_DATE
          AND m.revoked_at IS NULL
          AND p.code = ANY(%s)
        ORDER BY m.uploaded_at DESC
        LIMIT 1
    """, user_id, sender_inn, required)
```

Критерии (все AND):
1. Принадлежит юзеру
2. `principal.inn == doc.sender.inn`
3. `status = 'linked'`, не просрочена, не отозвана
4. Имеет хотя бы один код из `required_one_of[doc_type]`

Если подходящих несколько — берётся **самая свежая по uploaded_at**.

### Что отправляется оператору ЭДО

Только **ссылочная МЧД** (номер + GUID + principal_inn), не XML-файл:

```xml
<Signature>
  <MCD>
    <Number>МЧД-2026-00456</Number>
    <GUID>472e846e-572b-4696-9ab1-ff839f9b0634</GUID>
    <PrincipalInn>7712345678</PrincipalInn>
  </MCD>
  <!-- CAdES/XAdES подпись -->
</Signature>
```

Оператор сверяется с реестром ФНС по GUID.

---

## 10. Безопасность

### 10.1 Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /mcd/parse` | 10/час на юзера |
| `POST /mcd/attach` | 20/час на юзера |
| `POST /mcd/invite` | 10/час на юзера, 30/сутки на IP |
| `GET /mcd/invite/:token/preview` | 60/мин на IP |
| `POST /mcd/:id/refresh` | 1 запрос / 5 мин на МЧД |

Реализация: Redis-based sliding window.

### 10.2 Audit log
Все критичные действия с полями `user_id, ip, user_agent, timestamp, payload`. Append-only (ни одной UPDATE-операции).

### 10.3 Файлы
- S3/MinIO. Bucket `mcd-files` (приватный), `mcd-drafts` (TTL 10 мин).
- Доступ через signed URL, TTL 5 мин.
- Антивирус (ClamAV) на входе.
- Проверка magic bytes, не только Content-Type.

### 10.4 Персональные данные
152-ФЗ. Оператор ПД — Компания (КУБ). Бэкенд — процессор. При удалении юзера — обезличить audit log и удалить файлы в 30 дней.

---

## 11. Real-time события (WS/SSE)

```
event: mcd.verification.progress
data: { jobId, step: 2, status: 'done' }

event: mcd.verification.completed
data: { jobId, mcdId, status: 'linked' }

event: mcd.verification.failed
data: { jobId, error: 'invalid_signature' }

event: mcd.invite.consumed
data: { inviteId, mcdId }   // отправителю — когда получатель загрузил МЧД
```

Альтернатива — HTTP polling каждые 500 мс. В MVP можно начать с polling, WS добавить позже.

---

## 12. Тест-кейсы

### Happy paths

**TC-01: Загрузка МЧД напрямую**
1. POST /mcd/parse с валидным XML → 200 draftId
2. POST /mcd/attach { draftId } → 202 jobId
3. Polling /jobs/:jobId → done
4. GET /mcd → новая МЧД со статусом `linked`

**TC-02: Загрузка по invite**
1. UserA: POST /mcd/invite → token + url
2. UserB: GET /invite/:token/preview → 200 valid
3. UserB: POST /mcd/parse → 200 draftId
4. UserB: POST /mcd/attach { draftId, inviteToken } → 202
5. После verify: invite.consumed_at ≠ null
6. Повторное UserB /invite/:token/preview → 410 used

**TC-03: Подписание ЭТрН с автовыбором МЧД**
1. GET /mcd/find-for-signing?docType=etrn&senderInn=X → 200 { mcd }
2. POST /documents/:id/sign { mcdId, signature } → 200
3. Проверка: document.history содержит used_mcd_id

### Негативные сценарии

| TC | Действие | Ожидаемая ошибка |
|---|---|---|
| **NEG-01** | parse с файлом != XML | 400 invalid_format |
| **NEG-02** | parse с файлом > 10 MB | 400 file_too_large |
| **NEG-03** | attach с чужим draftId | 404 draft_not_found |
| **NEG-04** | attach с draftId старше 10 мин | 410 draft_expired |
| **NEG-05** | sign без mcdId | 422 mcd_required |
| **NEG-06** | sign с mcdId от чужого юзера | 403 |
| **NEG-07** | sign с МЧД, principal_inn != sender.inn | 422 mcd_principal_mismatch |
| **NEG-08** | sign с МЧД без нужного кода | 422 mcd_insufficient_power |
| **NEG-09** | preview invite с неправильным токеном | 410 not_found |
| **NEG-10** | preview invite истёкший | 410 expired |
| **NEG-11** | Повторное использование one-time invite | 410 used |
| **NEG-12** | Создание 11-го активного инвайта | 429 rate_limit_exceeded |
| **NEG-13** | 61 preview-запрос за минуту с одного IP | 429 |
| **NEG-14** | Bruteforce случайных токенов | 60 req/min lim + alert в мониторинг |

---

## 13. Чек-лист готовности к проду

### Бэкенд
- [ ] Миграции: `mcd`, `mcd_power`, `mcd_invite`, `mcd_audit_log`, `ekp_catalog`
- [ ] Seed `ekp_catalog` (синхронизация с ФНС)
- [ ] Конфиг `signing_requirements` утверждён с юристом
- [ ] 13 эндпоинтов из раздела 7 + OpenAPI-схема
- [ ] Парсер XML формата EMCHD_1 (примеры в `docs/samples/`)
- [ ] Интеграция с криптопровайдером (CAdES/XAdES)
- [ ] Интеграция с `m4d.nalog.gov.ru` API
- [ ] Async job runner (Celery/BullMQ/etc.)
- [ ] SMS-провайдер + email-провайдер
- [ ] S3/MinIO + антивирус
- [ ] Rate-limiter (Redis)
- [ ] Audit log с индексом по `(user_id, created_at)`
- [ ] Cron: суточная синхронизация `mcd.status` с реестром ФНС
- [ ] Unit + integration тесты (минимум 70% coverage на логику раздела 9)
- [ ] Load-тест: 1000 parse/sec без деградации

### Фронт
- [ ] Все сценарии A–E (раздел 3) реализованы
- [ ] Graceful handling всех error codes (раздел 12)
- [ ] Skeleton loaders на всех async-экранах
- [ ] Real-time обновление статуса верификации (polling или SSE)
- [ ] Offline-mode для читающих экранов через Service Worker
- [ ] Accessibility: все формы с aria-label, кнопки с min-height 44px

### Продукт / QA
- [ ] Все тест-кейсы раздела 12 автоматизированы (Playwright)
- [ ] Sanity-check на prod после каждого релиза
- [ ] Мониторинг: Prometheus-метрики по latency и error-rate на каждый endpoint
- [ ] Алерты: error-rate > 1% за 5 мин, latency P95 > 2s

---

## 14. Ссылки на прототип

Референсная реализация на клиенте (не для прода, но логика та же):

| Что | Файл |
|---|---|
| Invite-ссылки, токены | [`src/lib/mcdInvite.ts`](../src/lib/mcdInvite.ts) |
| Парсинг XML (мок) | [`src/lib/mockMcdParser.ts`](../src/lib/mockMcdParser.ts) |
| Поиск МЧД для подписи | `findMcdForPower()` в `mockMcdParser.ts` |
| Загрузка/привязка МЧД | [`src/pages/McdLandingPage.tsx`](../src/pages/McdLandingPage.tsx) |
| Создание инвайта | [`src/pages/McdInvitePage.tsx`](../src/pages/McdInvitePage.tsx) |
| Лендос для получателя | [`src/components/mcd/InviteLanding.tsx`](../src/components/mcd/InviteLanding.tsx) |
| Интеграция с подписанием | [`src/pages/DocumentDetailPage.tsx`](../src/pages/DocumentDetailPage.tsx), [`SigningFlowPage.tsx`](../src/pages/SigningFlowPage.tsx) |
| Типы данных | [`src/lib/constants.ts`](../src/lib/constants.ts) |

**Живой прототип:** https://aleksaletin.github.io/etrn/
**Примеры реальных XML-МЧД:** [`docs/samples/`](./samples/)
**UI-тесты:** 72 passing, `npm run test`
