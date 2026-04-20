# Авторизация и онбординг — ТЗ для бэкенда

**Модуль:** eTRN → Auth & Onboarding
**Версия:** 1.0

## 1. Бизнес-контекст

Вход в приложение — через **телефон + SMS-код**, без паролей. После первого входа предлагается установить 4-значный PIN-код для быстрого повторного входа. Профиль пользователя заполняется автоматически через **ДаДату** по ИНН.

**Почему так:**
- Водители часто меняют телефоны, пароли терять неудобно — SMS проще
- PIN — защита от случайного доступа соседа к телефону
- ДаДата устраняет ручной ввод названия компании (опечатки = невалидный ИНН в доках)

### Роли
Роли в eTRN **нет** — есть один универсальный «пользователь» с ИНН. Что он может делать, определяется наличием КЭП и МЧД (см. `signing-backend-api.md`).

### Flow регистрации нового юзера
```
телефон → SMS → (если новый) PIN → Онбординг (ИНН + ДаДата + email) → Dashboard
```

### Flow возврата
```
телефон → SMS → PIN → Dashboard
       или
       → PIN (если активная сессия)
```

---

## 2. Функциональные требования

### FR-Auth

| ID | Требование | Приоритет |
|---|---|---|
| FR-01 | Вход по номеру телефона + SMS-код. | P0 |
| FR-02 | SMS-код — 4 цифры, TTL 5 минут, не более 5 попыток ввода. | P0 |
| FR-03 | Ресенд кода: не чаще чем раз в 60 секунд, не более 3 раз за сессию. | P0 |
| FR-04 | После 3 неуспешных SMS или 5 неверных кодов → блокировка на 10 минут. | P0 |
| FR-05 | JWT access_token 15 минут, refresh_token 30 дней. | P0 |
| FR-06 | Logout мгновенно инвалидирует refresh_token. | P0 |

### FR-PIN

| ID | Требование | Приоритет |
|---|---|---|
| FR-07 | Установка 4-значного PIN после первого успешного входа. | P0 |
| FR-08 | PIN хранится на клиенте (в защищённом storage), **на бэке не передаётся**. | P0 |
| FR-09 | 5 неверных вводов PIN → принудительный выход, повторный SMS-логин. | P0 |
| FR-10 | Опциональная биометрия (Face/Touch ID) как альтернатива PIN. | P1 |

### FR-Onboarding

| ID | Требование | Приоритет |
|---|---|---|
| FR-11 | Автолукап по ИНН через ДаДату (debounce 500 мс). | P0 |
| FR-12 | Поддержка ИНН юрлица (10 цифр), ИП (12 цифр), ФЛ (12 цифр). | P0 |
| FR-13 | Email — обязательное поле, валидация RFC 5322. | P0 |
| FR-14 | Показ найденных данных для подтверждения (название компании, руководитель, ОГРН). | P0 |

---

## 3. Поведение фронта (user flow)

### 3.1 Первый вход

```
Экран /
  [Войти] → /auth

Экран /auth (phase=phone)
  Поле: Телефон +7 (___) ___-__-__
  [Получить код]
  ↓
  POST /api/v1/auth/sms/request  { phone: "+79991234567" }
    ← 200 { requestId, resendAvailableAt: "2026-04-19T12:01:00Z" }
  ↓
Экран /auth (phase=code)
  «Отправили SMS на +7 999 123 45 67»
  [Изменить номер]
  Поле: Код из SMS
  [Подтвердить]  |  [Отправить повторно через 60с]
  ↓
  POST /api/v1/auth/sms/verify  { requestId, code: "1234" }
    ← 200 {
        access_token, refresh_token,
        user: { id, phone, isNew: true }
      }
  ↓
  Если user.isNew → /pin-setup
  Иначе если pin_installed=false на устройстве → /pin-setup
  Иначе если onboardingCompleted=false → /onboarding
  Иначе → /dashboard
```

### 3.2 PIN

```
Экран /pin-setup
  «Установите PIN для быстрого входа»
  [• • • •]
  ↓
  «Повторите PIN»
  [• • • •]
  ↓
  PIN сохраняется локально (SecureStorage)
  POST /api/v1/auth/pin/enable (без PIN, только флаг)
  ↓
Экран /pin-login (при возврате в приложение)
  [• • • •]
  5 попыток, ошибка → logout
```

### 3.3 Онбординг

```
Экран /onboarding

  Поле: ИНН _________________
  ↓ (на каждом изменении, debounce 500 мс)
  GET /api/v1/dadata/party?inn=7712345678
    ← 200 {
        kind: "ul" | "ip" | "fl",
        inn, ogrn, kpp,
        name: "Общество с ограниченной ответственностью «ТрансЛогистик»",
        shortName: "ООО «ТрансЛогистик»",
        management: "Смирнов Алексей Николаевич",  // только для ul
        address: "..."
      }
  ↓
Блок с результатом:
  🏢 Юридическое лицо
  ООО «ТрансЛогистик»
  ИНН 7712345678 · ОГРН 1157...
  Руководитель: Смирнов Алексей Николаевич

  Поле: Email [___________]
  [Продолжить]
  ↓
  PUT /api/v1/users/me
    { inn, kind, name, company, ogrn, email, onboardingCompleted: true }
  ↓
  → /dashboard
```

---

## 4. Схема БД

### 4.1 Таблица `users`

```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                 VARCHAR(16) NOT NULL UNIQUE,  -- E.164
  email                 VARCHAR(255),
  inn                   VARCHAR(12),
  kind                  user_kind,
  name                  TEXT,                          -- ФИО
  company               TEXT,                          -- название (short)
  ogrn                  VARCHAR(15),
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  pin_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_until         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at         TIMESTAMPTZ
);

CREATE TYPE user_kind AS ENUM ('ul', 'ip', 'fl');

CREATE INDEX idx_users_inn ON users(inn);
```

### 4.2 Таблица `auth_sms_requests` (коды)

```sql
CREATE TABLE auth_sms_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(16) NOT NULL,
  code_hash       VARCHAR(64) NOT NULL,       -- bcrypt от кода, сам не храним
  expires_at      TIMESTAMPTZ NOT NULL,       -- now() + 5 min
  attempts        INT NOT NULL DEFAULT 0,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              INET,
  user_agent      TEXT
);

CREATE INDEX idx_sms_phone_pending
  ON auth_sms_requests(phone)
  WHERE verified_at IS NULL;
```

### 4.3 Таблица `auth_refresh_tokens`

```sql
CREATE TABLE auth_refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              INET,
  user_agent      TEXT
);
```

### 4.4 Таблица `auth_audit_log`
Стандартная структура audit log (см. `docs/README.md`).
Actions: `sms_request`, `sms_verify_success`, `sms_verify_fail`, `login_block`, `token_refresh`, `logout`, `onboarding_complete`.

---

## 5. REST API

### 5.1 Запрос SMS

```
POST /api/v1/auth/sms/request
Body:  { "phone": "+79001234567" }

Response 200:
{
  "requestId": "uuid",
  "resendAvailableAt": "2026-04-19T12:01:00Z"
}

Errors:
  400 invalid_phone             — неверный формат E.164
  429 resend_too_soon           — меньше 60 сек с прошлого запроса
  429 max_resend_exceeded       — больше 3 запросов за сессию
  403 user_blocked              — юзер заблокирован до blocked_until
```

**Что делает:**
1. Валидирует формат E.164
2. Проверяет `users.blocked_until` для этого phone
3. Генерит 4-значный код (cryptorandom), bcrypt → `code_hash`
4. Сохраняет в `auth_sms_requests`
5. Отправляет через SMS-провайдера (SMS-центр / SMS.ru / Exolve)
6. Возвращает `requestId`

### 5.2 Верификация кода

```
POST /api/v1/auth/sms/verify
Body:  { "requestId": "uuid", "code": "1234" }

Response 200:
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": "uuid",
    "phone": "+79001234567",
    "isNew": true,
    "onboardingCompleted": false
  }
}

Errors:
  404 request_not_found
  410 code_expired               — прошло 5 мин
  422 code_invalid               — неверный код
  429 max_attempts_exceeded      — 5 попыток → блокировка 10 мин
```

**Что делает:**
1. Находит request, проверяет `expires_at` и `attempts`
2. Сверяет `bcrypt.compare(code, code_hash)`
3. При неудаче: `attempts++`, при 5 — блокировка `users.blocked_until = now + 10min`
4. При успехе: `verified_at = now`, `user` upsert по `phone`, `isNew = not existed before`
5. Генерит JWT access (15 min) + refresh (30 дней, сохраняется с `token_hash`)
6. Audit log

### 5.3 Refresh токена

```
POST /api/v1/auth/refresh
Body:  { "refresh_token": "eyJ..." }

Response 200:
{ "access_token": "eyJ...", "refresh_token": "eyJ..." }

Errors:
  401 token_invalid | token_expired | token_revoked
```

Rotate: при каждом refresh генерируется новый refresh_token, старый ревокается. Защита от replay.

### 5.4 Logout

```
POST /api/v1/auth/logout
Headers:  Authorization: Bearer <access_token>

Response 204
```

Ревокает все refresh_tokens юзера.

### 5.5 Включение PIN

```
POST /api/v1/auth/pin/enable
Headers:  Authorization: Bearer <access_token>

Response 204
```

PIN **не передаётся на сервер**, бэк только ставит флаг `users.pin_enabled = true` — чтобы при следующем SMS-логине фронт знал «PIN уже был установлен, предложи его ввести».

### 5.6 Отключение PIN

```
POST /api/v1/auth/pin/disable
Response 204
```

### 5.7 ДаДата — поиск по ИНН

```
GET /api/v1/dadata/party?inn=7712345678
Headers:  Authorization: Bearer <access_token>

Response 200:
{
  "kind": "ul" | "ip" | "fl",
  "inn": "7712345678",
  "ogrn": "1157746734837",
  "kpp": "771401001",          // только для ul
  "name": "ООО «ТрансЛогистик»",
  "shortName": "ООО «ТрансЛогистик»",
  "management": "Смирнов Алексей Николаевич",  // только для ul
  "address": "127015, г. Москва, ул. Бутырская, д. 75",
  "status": "active | liquidated | bankruptcy"
}

Response 404:
{ "error": "not_found", "message": "По этому ИНН ничего не найдено в ЕГРЮЛ/ЕГРИП" }
```

**Что делает:**
1. Валидирует длину ИНН (10 или 12)
2. Проверяет Redis-cache (TTL 24 часа)
3. При cache miss — запрос к ДаДате: `POST https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party`
4. Кеширует результат, возвращает

Rate-limit: 30/мин на юзера.

### 5.8 Обновление профиля

```
PUT /api/v1/users/me
Body:  { "inn", "kind", "name", "company", "ogrn", "email", "onboardingCompleted": true }

Response 200:  обновлённый user
```

### 5.9 Текущий юзер

```
GET /api/v1/users/me

Response 200:
{
  "id", "phone", "email", "name", "company", "inn", "kind", "ogrn",
  "onboardingCompleted", "pin_enabled",
  "createdAt", "lastLoginAt"
}
```

---

## 6. Безопасность

### Rate-limits

| Endpoint | Лимит |
|---|---|
| `POST /auth/sms/request` | 1 в 60 сек, 3 в 10 минут, 10 в сутки на IP |
| `POST /auth/sms/verify` | 5 на request, 10 в 10 минут на IP |
| `POST /auth/refresh` | 30/мин на юзера |
| `GET /dadata/party` | 30/мин на юзера |

### SMS-провайдер
- Fallback между двумя провайдерами (primary + secondary) на случай недоступности
- Логирование каждой отправки: `phone, provider, status, cost`
- В dev-environment — dummy-провайдер который пишет код в лог

### JWT
- HS256 или RS256
- Claims: `sub` (user_id), `iat`, `exp`, `type` (access|refresh)
- `access_token` TTL 15 мин, `refresh_token` TTL 30 дней
- Refresh token rotation при каждом использовании

### Защита от атак
- **SIM-swap:** при смене phone → уведомление на email + блокировка подписания на 24 часа
- **Brute-force SMS:** rate-limit + CAPTCHA после 3 неуспешных на одном IP
- **Token theft:** refresh_token rotation + revoke old при любых подозрениях

### ДаДата API key
- Ключ в переменных окружения, не в коде
- Rotation каждые 90 дней
- Не логировать key в audit log

---

## 7. Тест-кейсы

### Happy path
- **TC-01:** Запрос SMS → ввод кода → получение JWT → запрос `/users/me` ✅
- **TC-02:** Онбординг: ИНН → ДаДата → email → profile сохранён ✅
- **TC-03:** Повторный вход: SMS → PIN → Dashboard ✅

### Негативные
| TC | Действие | Ожидание |
|---|---|---|
| NEG-01 | Неверный формат телефона | 400 |
| NEG-02 | Ресенд через 30с | 429 resend_too_soon |
| NEG-03 | 4 ресенда подряд | 429 max_resend_exceeded |
| NEG-04 | Код спустя 6 мин | 410 code_expired |
| NEG-05 | 5 неверных кодов | 429 + блокировка 10 мин |
| NEG-06 | ИНН с 11 цифрами | 400 |
| NEG-07 | ИНН ликвидированной компании | 200, но с `status: liquidated`, юзер решает |
| NEG-08 | Email невалидный | 422 |
| NEG-09 | Старый refresh_token после rotate | 401 token_revoked |

---

## 8. Чек-лист готовности

- [ ] Миграции: `users`, `auth_sms_requests`, `auth_refresh_tokens`, `auth_audit_log`
- [ ] 9 эндпоинтов + OpenAPI
- [ ] SMS-провайдер (primary + secondary) + dev dummy
- [ ] ДаДата интеграция + Redis cache
- [ ] JWT с rotation
- [ ] Rate-limiter
- [ ] Блокировка по brute-force
- [ ] Audit log на все auth-события
- [ ] Cron: очистка expired sms_requests и refresh_tokens

---

## 9. Ссылки на прототип

| Что | Файл |
|---|---|
| Экран SMS-входа | `src/pages/AuthPage.tsx` |
| Установка PIN | `src/pages/PinSetupPage.tsx` |
| Ввод PIN | `src/pages/PinLoginPage.tsx` |
| Онбординг | `src/pages/OnboardingPage.tsx` |
| Мок-ДаДата | `src/lib/mockDadata.ts` |
| AuthGuard | `src/components/AuthGuard.tsx` |
