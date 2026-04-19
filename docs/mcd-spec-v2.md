# МЧД — техническая спецификация v2 (для бэкендера)

Документ описывает логику, реализованную в прототипе eTRN. Заменяет/дополняет предыдущую спеку.
На что обратить внимание — помечено ⚠️.

---

## 1. Изменения в модели данных

### 1.1 Полномочия теперь — объект, не строка

**Было:**
```ts
Mcd.powers: string[]  // ["Подписание ЭТрН", ...]
```

**Стало:**
```ts
interface McdPower {
  code: string   // строковый идентификатор из ЕКП ФНС
  name: string   // человекочитаемое наименование из справочника
}

Mcd.powers: McdPower[]
```

⚠️ **Почему так:** в XML-МЧД ФНС полномочия задаются кодами из Единого классификатора полномочий (тег `<МашПолн КодПолн="..."/>`). Сверка при подписании должна идти **по коду**, имя — только для отображения.

⚠️ **ВАЖНО: формат кодов — строковый, ведомственный.** Это НЕ числовой `02.08`, а идентификаторы вида `{ВЕДОМСТВО}_{ПОДСИСТЕМА}_{КОД}`:
- `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8` — «Подписывать транспортные накладные»
- `FAS_EIAS_MA0001` — «Подписывать отчётные формы ФГИС ЕИАС»
- и т.д.

Реальные примеры XML-МЧД — см. [`docs/samples/mcd-real-ul.xml`](samples/mcd-real-ul.xml) и [`samples/mcd-real-ip.xml`](samples/mcd-real-ip.xml).

### 1.2 Полная модель Mcd (итог)

```ts
interface Mcd {
  id: string
  status: 'linked' | 'none' | 'expired' | 'invalid' | 'insufficient'
  number: string | null              // номер МЧД из XML
  principal: {
    companyName: string              // доверитель
    inn: string                      // 10 или 12 цифр
  }
  trustedPerson: string              // ФИО доверенного лица
  validUntil: string | null          // ISO date
  powers: McdPower[]                 // из XML, с кодами ЕКП
  fileName?: string                  // оригинальное имя файла
  fileUrl?: string                   // ссылка на storage (S3/MinIO)
  uploadedAt: string                 // ISO datetime
  verifiedAt?: string                // ISO datetime
  userId: string                     // владелец (доверенное лицо)
}
```

---

## 2. Справочник ЕКП (новая сущность)

Бэку нужна таблица-справочник кодов полномочий.

### 2.1 Структура

```sql
CREATE TABLE ekp_catalog (
  code VARCHAR(10) PRIMARY KEY,    -- "02.08"
  name TEXT NOT NULL,              -- "Подписание электронных транспортных накладных (ЭТрН)"
  doc_type VARCHAR(20)             -- необязательно: связка с типом документа ("trn")
);
```

### 2.2 Реальные коды ЕКП для транспортных документов

Из анализа реальных XML-МЧД (см. `docs/samples/`):

| Код | Наименование |
|---|---|
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8` | Подписывать транспортные накладные |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS7` | Подписывать товарно-транспортные накладные |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS5` | Подписывать товарные, товарно-транспортные, транспортные накладные, УПД |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS11` | Подписывать международные товарно-транспортные накладные CMR |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS14` | Подписывать акт о приемке выполненных работ (КС-2) |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS6` | Подписывать товарные накладные |
| `BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCSGENERAL` | Подписывать, направлять, получать и оплачивать бухгалтерские документы |

Полный справочник ЕКП содержит тысячи записей — нужно взять машиночитаемый справочник с сайта ФНС (`m4d.nalog.gov.ru` или официальные XSD) и загрузить целиком.

### 2.3 Маппинг «тип документа → требуемый код»

```ts
const DOC_TYPE_REQUIRED_POWER = {
  trn: 'BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8',  // ЭТрН / транспортные накладные
  // ...добавятся для ТТН, УПД, счетов-фактур, актов
}
```

⚠️ **Тонкость:** в МЧД может быть ЛЮБОЙ из «семейства» подходящих кодов (`SOURCEDOCS5`, `SOURCEDOCS7`, `SOURCEDOCS8`, `SOURCEDOCSGENERAL`). Правильнее делать проверку через список «приемлемых» кодов, а не один:

```ts
const ACCEPTED_POWERS_FOR_TRN = [
  'BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS8',
  'BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS7',
  'BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCS5',
  'BBDOCS_DOCS_DCSALL_SRCDOC_SOURCEDOCSGENERAL', // общее полномочие покрывает всё
]
```

Это задача бэкендера совместно с юристом — какие коды считать «достаточными» для подписания ЭТрН.

Используется при проверке МЧД перед подписанием.

---

## 3. Форма загрузки — только XML + автопарсинг

⚠️ **Изменение от предыдущей спеки:** ручной ввод полей удалён полностью.

### 3.1 Новый эндпоинт — парсинг без сохранения

```
POST /api/v1/mcd/parse
Content-Type: multipart/form-data
Body: file (XML, ≤10 MB)
```

**Валидация:**
- MIME: `application/xml`, `text/xml`, или расширение `.xml`
- Размер ≤ 10 MB
- XML соответствует схеме ФНС по МЧД

**Успешный ответ (200):**
```json
{
  "parsed": {
    "number": "МЧД-2026-00456",
    "principal": { "companyName": "ООО ТрансЛогистик", "inn": "7712345678" },
    "trustedPerson": "Иванов Сергей Петрович",
    "validUntil": "2027-06-01",
    "powers": [
      { "code": "02.08", "name": "Подписание электронных транспортных накладных (ЭТрН)" },
      { "code": "02.09", "name": "Подписание заказ-нарядов (ЭЗЗ)" }
    ],
    "fileName": "mcd.xml",
    "fileHash": "sha256:..."
  }
}
```

**Ошибки:**
| Код | Сообщение |
|---|---|
| `invalid_format` | Файл не соответствует формату МЧД ФНС |
| `file_too_large` | Файл больше 10 МБ |
| `parse_failed` | Не удалось разобрать XML |

### 3.2 Эндпоинт привязки

```
POST /api/v1/mcd/attach
Body: { "fileHash": "sha256:..." }  или  { "parsed": {...} }
```

Запускает верификацию (см. п. 4). Возвращает `mcdId` и `jobId` (если верификация асинхронна).

### 3.3 Фронт-флоу (для контекста)

1. Пользователь выбирает XML → `POST /mcd/parse` → экран предпросмотра (read-only)
2. Пользователь видит распарсенные поля, решает «привязывать или нет»
3. Клик «Привязать» → `POST /mcd/attach` → 4-шаговая верификация → `status: linked`

---

## 4. Два сценария на экране `/mcd`

### Flow A — «Загрузить свою МЧД»
Стандартный путь: парсинг → предпросмотр → привязка (см. п. 3). Доступен всем залогиненным.

### Flow B — «Отправить ссылку сотруднику»
⚠️ **Новое.** Нужен эндпоинт генерации magic-link.

```
POST /api/v1/mcd/invite
Body: {
  "recipientName": "Петров Иван Иванович",
  "channel": "sms" | "email",
  "contact": "+79001234567" | "ivan@company.ru"
}
Response: {
  "inviteId": "uuid",
  "inviteLink": "https://app.etrn.ru/#/mcd?invite=<hmac-token>",
  "expiresAt": "2026-04-25T00:00:00Z"
}
```

**Что делает бэк:**
- Генерит HMAC-токен с TTL 7 дней (`userId отправителя + recipient + exp`)
- Отправляет SMS/email через провайдера (SMS-центр/Mailgun)
- Логирует в `mcd_invites`
- Возвращает ссылку (фронт показывает QR)

**Переход по ссылке:**
- Валидируется токен
- Пользователь логинится (если не авторизован)
- Открывается Flow A (загрузка своей XML)
- После успешной привязки — событие в аудит о том, что МЧД загружена по приглашению от `inviteId`

⚠️ **Важно:** инвайт не генерирует МЧД на стороне eTRN. eTRN принимает только готовые МЧД из реестра ФНС. Инвайт — это лишь «ссылка-помощник».

---

## 5. Логика подписания с МЧД

⚠️ **Самая важная часть** — определяет, какая МЧД используется при подписи документа.

### 5.1 Правило выбора МЧД

Для документа с `sender.inn = X` и типом `T`:

```ts
function findMcdForSigning(userMcds: Mcd[], doc: Document): Mcd | null {
  const requiredCode = DOC_TYPE_REQUIRED_POWER[doc.type]
  return userMcds.find(m =>
    m.status === 'linked'
    && (!m.validUntil || new Date(m.validUntil) > now())
    && m.principal.inn === doc.sender.inn
    && m.powers.some(p => p.code === requiredCode)
  )
}
```

**Ключевые критерии (AND):**
1. Статус `linked`
2. Срок не истёк
3. `principal.inn` совпадает с `sender.inn` документа
4. В `powers` есть код, соответствующий типу документа

### 5.2 Edge case: несколько подходящих МЧД

Если условию удовлетворяют несколько — берётся **самая свежая по `uploadedAt`**. В UI можно дать селектор, но по умолчанию — автовыбор.

### 5.3 Что уходит оператору ЭДО при подписи

**Только ОДНА МЧД** — та, которую выбрали по правилу выше. Не все сразу.

```
POST /api/v1/documents/:id/sign
Body: {
  "mcdId": "uuid",           // ID конкретной МЧД из списка пользователя
  "mode": "sign" | "reservations" | "refuse",
  "signature": "<подпись>",  // от криптопровайдера
  "geoLocation": { "lat": 55.75, "lng": 37.61, "address": "..." },
  "reservationsText": "...",
  "refuseReason": "..."
}
```

Бэк при подписании:
1. Проверяет, что `mcdId` принадлежит текущему пользователю
2. Перепроверяет условия из п. 5.1 (защита от race-condition)
3. Перепроверяет МЧД в реестре ФНС (опционально, с кэшем на N минут)
4. Формирует конверт для отправки оператору ЭДО с указанием **номера МЧД** (`principal.inn`, `mcd.number`)
5. Сохраняет в истории документа: `usedMcdId`, `usedMcdNumber`

### 5.4 Что возвращать при провале проверки МЧД

Если подходящей МЧД нет — блокировать подписание **до обращения в криптопровайдер**.

```
422 Unprocessable Entity
{
  "error": "mcd_required",
  "reason": "no_mcd" | "no_mcd_from_sender" | "mcd_expired" | "mcd_insufficient_power",
  "message": "У вас нет МЧД от ООО «ТрансЛогистик» с полномочием 02.08",
  "senderInn": "7712345678",
  "requiredPowerCode": "02.08"
}
```

Фронт по этим кодам показывает точечные сообщения (уже реализовано в прототипе).

---

## 6. Запись в историю документа

⚠️ **Новое требование:** в `history` документа при подписании должен быть зафиксирован факт использования конкретной МЧД.

### 6.1 Поля события

```ts
interface HistoryEvent {
  id: string
  timestamp: string
  action: 'signed' | 'rejected' | 'signed_with_reservations' | ...
  actor: string                   // ФИО подписанта
  description: string             // уже с упоминанием МЧД (см. ниже)
  location?: GeoLocation
  mcdId?: string                  // ⚠️ новое поле
  mcdNumber?: string              // ⚠️ дублирование для отображения
}
```

### 6.2 Формат описания

В `description` шаблон:
```
"Документ подписан электронной подписью (по МЧД {mcdNumber} от {principal.companyName})"
```

Например:
> Документ подписан электронной подписью (по МЧД МЧД-2026-00456 от ООО «ТрансЛогистик»)

Для массового подписания:
> Документ подписан электронной подписью (массовое подписание, МЧД МЧД-2026-00456 от ООО «ТрансЛогистик»)

С оговоркой:
> Подписан с оговоркой: {текст} (по МЧД {number} от {company})

### 6.3 Использование в UI

На экране детализации документа и в архиве — вкладка «История» берёт `description` как есть. Отдельного UI-поля для МЧД не нужно.

---

## 7. Множественные МЧД у пользователя

⚠️ Прежняя реализация позволяла иметь **одну** МЧД на пользователя. Сейчас — **N штук**.

**Реальный кейс:** водитель возит для 3 компаний → у него 3 МЧД:
- №456 от ООО «ТрансЛогистик» (полномочия 02.08, 02.09)
- №789 от ООО «АгроТрейд» (только 02.08)
- №123 от ООО «МегаЛогистика» (только 06.01, просмотр)

**Последствия для бэка:**
- `GET /api/v1/mcd` возвращает массив всех МЧД пользователя
- При подписании выбирается ОДНА (см. п. 5)
- Отзыв МЧД одной компанией не влияет на МЧД от других
- Лимиты/квоты считать по пользователю, а не по МЧД

---

## 8. Что обновить в предыдущей спеке

Относительно v1 (вчерашней):

| Что | Было | Стало |
|---|---|---|
| `powers` | `string[]` | `McdPower[]` с `{code, name}` |
| Форма загрузки | Ручной ввод полей + файл | Только XML + автопарсинг |
| Ручной ввод | Поддерживался | Удалён |
| PDF-загрузка | Опционально | Только XML |
| Справочник ЕКП | — | Новая таблица `ekp_catalog` |
| Выбор МЧД при подписи | Не было | `findMcdForSigning()` + `mcdId` в body |
| История с МЧД | Не было | Поля `mcdId`/`mcdNumber`, упоминание в description |
| Flow invite | Один сценарий | Два: own-upload + invite-link |
| API `/mcd/parse` | — | Новый эндпоинт |
| API `/mcd/invite` | — | Новый эндпоинт |

---

## 9. Минимальный чек-лист для бэка (итог)

- [ ] Миграция модели `Mcd` с новыми полями (`powers` как JSONB или related table)
- [ ] Таблица `ekp_catalog` + seed стартового набора
- [ ] Константа `DOC_TYPE_REQUIRED_POWER`
- [ ] `POST /mcd/parse` — парсинг XML без сохранения
- [ ] `POST /mcd/attach` — привязка и верификация
- [ ] `POST /mcd/invite` — magic-link на загрузку
- [ ] `GET /mcd/share/:userId` — валидация токена при переходе по ссылке
- [ ] Функция `findMcdForSigning(userMcds, doc)`
- [ ] Обновить `POST /documents/:id/sign` — требовать `mcdId`, валидировать, писать в историю
- [ ] Ошибки `422 mcd_required` с конкретным `reason`
- [ ] Поля `mcdId`/`mcdNumber` в `history` документа
- [ ] Поддержка множественных МЧД на одного пользователя

---

## Приложение: ссылки на прототип

- Исходник модели: [`src/lib/constants.ts`](../src/lib/constants.ts) — `McdPower`, `EKP_CATALOG`, `DOC_TYPE_REQUIRED_POWER`
- Логика подбора МЧД: [`src/lib/mockMcdParser.ts`](../src/lib/mockMcdParser.ts) — `findMcdForPower`, `parseMcdFile`
- Форма загрузки: [`src/pages/McdLandingPage.tsx`](../src/pages/McdLandingPage.tsx)
- Флоу инвайта: [`src/pages/McdInvitePage.tsx`](../src/pages/McdInvitePage.tsx)
- Интеграция при подписании: [`src/pages/DocumentDetailPage.tsx`](../src/pages/DocumentDetailPage.tsx), [`src/pages/SigningFlowPage.tsx`](../src/pages/SigningFlowPage.tsx)
- Массовое подписание: [`src/pages/BulkSigningPage.tsx`](../src/pages/BulkSigningPage.tsx)

Живой прототип: https://aleksaletin.github.io/etrn/
