# eTRN — Чек-лист API для приёмки бэкенда

**Дата:** 2026-04-19
**Назначение:** проверить что бэкендер реализовал все эндпоинты из спек.

Используй как опросник: для каждого эндпоинта спрашивай у бэка
«сделано ✓ / не сделано ✗ / в работе 🟡». Если что-то не сделано —
требуй объяснения почему и когда будет.

Источники: спеки в `docs/*.md` + прототип на https://aleksaletin.github.io/etrn/

---

## Обзор по модулям

| Модуль | Endpoints | Статус |
|---|---|---|
| 1. Авторизация | 9 | ☐ |
| 2. Документы | 7 | ☐ |
| 3. Подписание | 6 | ☐ |
| 4. Сертификат КЭП | 9 | ☐ |
| 5. МЧД | 13 | ☐ |
| 6. Уведомления | 8 | ☐ |
| 7. Подписка и платежи | 9 | ☐ |
| 8. Операторы ЭДО | 6 | ☐ |
| **Всего REST endpoints** | **67** | |
| + Webhook receivers | 4 | ☐ |
| + Cron-jobs | 11 | ☐ |
| + SSE streams | 5 | ☐ |

---

## 1. Авторизация (9 endpoints)

📄 Полная спека: [`auth-backend-api.md`](./auth-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `POST` | `/api/v1/auth/sms/request` | Запрос SMS-кода на телефон |
| ☐ | `POST` | `/api/v1/auth/sms/verify` | Верификация кода + выдача JWT |
| ☐ | `POST` | `/api/v1/auth/refresh` | Обновление токена (rotation) |
| ☐ | `POST` | `/api/v1/auth/logout` | Logout с инвалидацией refresh |
| ☐ | `POST` | `/api/v1/auth/pin/enable` | Юзер установил PIN на устройстве (флаг) |
| ☐ | `POST` | `/api/v1/auth/pin/disable` | Юзер снял PIN |
| ☐ | `GET`  | `/api/v1/dadata/party?inn=` | ДаДата-обёртка с кешем |
| ☐ | `GET`  | `/api/v1/users/me` | Текущий юзер |
| ☐ | `PUT`  | `/api/v1/users/me` | Обновление профиля + onboarding |

### Доп. требования модуля
- ☐ Rate-limit по правилам спеки (1 SMS/мин, 3/10мин, 10/сутки)
- ☐ JWT access 15 мин + refresh 30 дней
- ☐ Refresh token rotation (старый ревочется при выдаче нового)
- ☐ Блокировка после 5 неверных кодов на 10 минут
- ☐ Audit log на все события auth

---

## 2. Документы (7 endpoints)

📄 Полная спека: [`documents-backend-api.md`](./documents-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `GET`  | `/api/v1/documents` | Список с фильтрами + cursor pagination |
| ☐ | `GET`  | `/api/v1/documents/:id` | Детали документа (включая file URLs, history) |
| ☐ | `POST` | `/api/v1/documents/:id/export` | Экспорт PDF/XML (signed URL) |
| ☐ | `POST` | `/api/v1/documents/:id/assign` | Назначить документ водителю |
| ☐ | `POST` | `/api/v1/documents/:id/view` | Отметить как просмотренный (status SENT→VIEWED) |
| ☐ | `GET`  | `/api/v1/documents/counts` | Счётчики по статусам для Dashboard |
| ☐ | `GET`  | `/api/v1/documents/events` (SSE) | Real-time обновления списка |

### Доп. требования
- ☐ Cursor-based пагинация (НЕ offset!)
- ☐ Full-text search по `number` + `sender_name` (GIN индекс на tsvector)
- ☐ Подписанные URL для файлов с TTL 5 мин
- ☐ Дедупликация по `(edo_operator, external_id)`

---

## 3. Подписание (6 endpoints)

📄 Полная спека: [`signing-backend-api.md`](./signing-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `POST` | `/api/v1/documents/:id/sign/init` | Инициация подписи: возврат digest для подписания |
| ☐ | `POST` | `/api/v1/documents/:id/sign/submit` | Отправка signature, async-отправка оператору |
| ☐ | `POST` | `/api/v1/documents/:id/refuse` | Отказ от подписи (с причиной) |
| ☐ | `GET`  | `/api/v1/signing/jobs/:jobId` | Статус async-job подписания |
| ☐ | `POST` | `/api/v1/documents/bulk-sign` | Массовое подписание (до 50 документов) |
| ☐ | `GET`  | `/api/v1/signing/batches/:batchId` | Статус массового подписания |

### Доп. требования
- ☐ Idempotency по `nonce` (одноразовый, TTL 5 мин)
- ☐ Криптопроверка signature через КриптоПро SDK
- ☐ Перепроверка МЧД на сервере перед отправкой оператору
- ☐ Запись в `documents.history` номера МЧД при успехе
- ☐ SSE на `/api/v1/signing/jobs/:jobId/events`

---

## 4. Сертификат КЭП (9 endpoints)

📄 Полная спека: [`certificate-backend-api.md`](./certificate-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `POST` | `/api/v1/certificates/init` | Старт выпуска (анкета → sessionId) |
| ☐ | `POST` | `/api/v1/certificates/:sessionId/identification/start` | Запуск идентификации (ЕСИА / video) |
| ☐ | `GET`  | `/api/v1/certificates/:sessionId/identification/status` | Статус идентификации |
| ☐ | `POST` | `/api/v1/certificates/:sessionId/sms/request` | SMS для подписания заявления |
| ☐ | `POST` | `/api/v1/certificates/:sessionId/sms/verify` | Верификация → запуск выпуска |
| ☐ | `GET`  | `/api/v1/certificates/:sessionId/job/:jobId` | Статус выпуска (4 шага) |
| ☐ | `GET`  | `/api/v1/certificates/me` | Текущий сертификат юзера |
| ☐ | `POST` | `/api/v1/certificates/:certId/refresh` | Перепроверка статуса (CRL/OCSP) |
| ☐ | `DELETE`| `/api/v1/certificates/:certId` | Отзыв сертификата |

### Доп. требования
- ☐ Интеграция с провайдером (КриптоКлюч ИЛИ РосЭлТорг — уточнить у продакта)
- ☐ Шифрование PII (паспорт/СНИЛС) AES-256 в `certificate_issue_sessions`
- ☐ Cron: ежесуточная проверка OCSP всех активных сертификатов
- ☐ Cron: уведомления за 30/14/7/1 день до истечения

---

## 5. МЧД (13 endpoints)

📄 Полная спека: [`mcd-backend-api.md`](./mcd-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `POST` | `/api/v1/mcd/parse` | Парсинг XML-МЧД, возврат draftId |
| ☐ | `POST` | `/api/v1/mcd/attach` | Привязка МЧД (запуск 4-шаговой верификации) |
| ☐ | `GET`  | `/api/v1/mcd/jobs/:jobId` | Статус верификации (4 шага) |
| ☐ | `GET`  | `/api/v1/mcd` | Список МЧД пользователя |
| ☐ | `GET`  | `/api/v1/mcd/:mcdId` | Детали одной МЧД + audit + usedFor |
| ☐ | `POST` | `/api/v1/mcd/:mcdId/refresh` | Перепроверка в реестре ФНС |
| ☐ | `DELETE`| `/api/v1/mcd/:mcdId` | Отвязка (soft-delete, файл хранится 90 дней) |
| ☐ | `GET`  | `/api/v1/mcd/find-for-signing?docType=&senderInn=` | Подбор МЧД для подписания |
| ☐ | `POST` | `/api/v1/mcd/invite` | Создание защищённой invite-ссылки |
| ☐ | `GET`  | `/api/v1/mcd/invite/:token/preview` | Публичный preview для лендоса (БЕЗ JWT) |
| ☐ | `DELETE`| `/api/v1/mcd/invite/:inviteId` | Отзыв ссылки |
| ☐ | `GET`  | `/api/v1/mcd/invite?status=active` | Список активных ссылок юзера |
| ☐ | `POST` | `/api/v1/documents/:docId/sign` | Подписание (использует МЧД, см. модуль 3) |

### Доп. требования
- ☐ Парсер XML формата `EMCHD_1` (см. примеры в `docs/samples/`)
- ☐ Справочник `ekp_catalog` с реальными кодами ЕКП
- ☐ Конфиг `signing_requirements` для маппинга «doc-type → required code»
- ☐ Интеграция с криптопровайдером (CAdES проверка ЭП доверителя)
- ☐ Интеграция с реестром ФНС (через РосЭлТорг / СБИС / МИГ24 — на выбор)
- ☐ Invite-токены: 256 бит из CSPRNG, SHA-256 хеш в БД, TTL 7 дней
- ☐ Rate-limit 60/мин на `preview` (защита от bruteforce токенов)

---

## 6. Уведомления (8 endpoints)

📄 Полная спека: [`notifications-backend-api.md`](./notifications-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `GET`  | `/api/v1/notifications` | Список с cursor-пагинацией |
| ☐ | `GET`  | `/api/v1/notifications/counts` | Счётчик непрочитанных для TopBar |
| ☐ | `POST` | `/api/v1/notifications/:id/read` | Отметить одно как прочитанное |
| ☐ | `POST` | `/api/v1/notifications/read-all` | Отметить все |
| ☐ | `GET`  | `/api/v1/notifications/preferences` | Настройки типов + quiet hours |
| ☐ | `PUT`  | `/api/v1/notifications/preferences` | Обновление настроек |
| ☐ | `POST` | `/api/v1/notifications/push/subscribe` | Регистрация push-подписки (web/FCM/APNs) |
| ☐ | `DELETE`| `/api/v1/notifications/push/subscribe/:id` | Отписка |
| ☐ | `GET`  | `/api/v1/notifications/events` (SSE) | Real-time обновление счётчика |

### Доп. требования
- ☐ Сервис `sendNotification(userId, type, payload)` для других модулей
- ☐ Quiet hours (22:00–08:00 МСК) — кроме критичных типов
- ☐ Throttling — не более 1 push в минуту юзеру
- ☐ FCM (Android+web) + APNs (iOS) + VAPID (web push)
- ☐ Deep-linking в push на конкретный экран

---

## 7. Подписка и платежи (9 endpoints)

📄 Полная спека: [`subscription-backend-api.md`](./subscription-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `GET`  | `/api/v1/subscriptions/me` | Текущая подписка + использование |
| ☐ | `POST` | `/api/v1/subscriptions/me/cancel` | Отмена подписки (до конца периода ещё работает) |
| ☐ | `POST` | `/api/v1/subscriptions/me/change-plan` | Смена плана с пропорциональной пересчёткой |
| ☐ | `GET`  | `/api/v1/plans` | Доступные планы |
| ☐ | `POST` | `/api/v1/payments/card/init` | Оплата картой (redirect на эквайер) |
| ☐ | `POST` | `/api/v1/payments/sbp/init` | СБП (QR-код) |
| ☐ | `POST` | `/api/v1/payments/invoice` | Счёт для юрлица (PDF) |
| ☐ | `GET`  | `/api/v1/payments/:paymentId` | Статус платежа |
| ☐ | `GET`  | `/api/v1/payments` | История платежей юзера |

### Доп. требования
- ☐ Интеграция с эквайером (ЮKassa primary + CloudPayments fallback)
- ☐ HMAC-проверка webhook'ов от эквайеров
- ☐ Атомарный инкремент `subscriptions.used_this_period` при подписании
- ☐ Cron: автосписание за 3 дня до конца при `autorenew=true`
- ☐ Cron: сброс `used_this_period` при наступлении `period_reset_at`
- ☐ Grace-period 3 дня после истечения

---

## 8. Операторы ЭДО (6 endpoints)

📄 Полная спека: [`edo-operators-backend-api.md`](./edo-operators-backend-api.md)

| ✓/✗ | Method | Endpoint | Описание |
|---|---|---|---|
| ☐ | `GET`  | `/api/v1/edo/operators` | Список доступных операторов |
| ☐ | `GET`  | `/api/v1/edo/connections` | Подключения юзера |
| ☐ | `POST` | `/api/v1/edo/connect/init` | Старт OAuth2 flow |
| ☐ | `GET`  | `/api/v1/edo/callback` | OAuth callback от оператора |
| ☐ | `DELETE`| `/api/v1/edo/connections/:id` | Отключить оператора (revoke tokens) |
| ☐ | `POST` | `/api/v1/edo/connections/:id/sync` | Force sync для отладки |

### Доп. требования
- ☐ Адаптеры всех 4 операторов: СБИС, Диадок, Контур, СберКорус
- ☐ Шифрование OAuth tokens (AES + KMS)
- ☐ Авто-refresh tokens перед истечением
- ☐ Circuit breaker при недоступности оператора
- ☐ Cron pull-sync каждые 5 минут

---

## Webhook receivers (4 inbound)

| ✓/✗ | Method | Endpoint | От кого |
|---|---|---|---|
| ☐ | `POST` | `/api/v1/payments/webhook/yookassa` | ЮKassa — статус платежа |
| ☐ | `POST` | `/api/v1/payments/webhook/cloudpayments` | CloudPayments fallback |
| ☐ | `POST` | `/api/v1/edo/webhook/:operator` | Операторы ЭДО — новые/обновлённые документы |
| ☐ | `POST` | `/api/v1/mcd/webhook/roseltorg` | РосЭлТорг — новые МЧД (если будет интеграция) |

### Требования к webhook
- ☐ Обязательная проверка HMAC-подписи входящего webhook
- ☐ Идемпотентность по `external_id`
- ☐ Возврат `200` всегда (даже при ошибке — в audit log записываем, эквайер не должен retry'ить)

---

## Cron-jobs (11 минимум)

| ✓/✗ | Job | Период | Что делает |
|---|---|---|---|
| ☐ | `cleanup_expired_sms` | каждые 6ч | Удаление просроченных `auth_sms_requests` |
| ☐ | `cleanup_expired_refresh_tokens` | сутки | Очистка просроченных refresh |
| ☐ | `sync_edo_documents` | каждые 5 мин | Pull документов от всех операторов |
| ☐ | `check_certs_ocsp` | сутки 09:00 | OCSP-проверка всех активных сертификатов |
| ☐ | `notify_cert_expiring` | сутки 09:00 | Уведомления за 30/14/7/1 день |
| ☐ | `sync_mcd_fns` | сутки 03:00 | Перепроверка МЧД в реестре ФНС |
| ☐ | `notify_mcd_expiring` | сутки 09:00 | Уведомления за 30/14/7/1 день |
| ☐ | `notify_subscription_expiring` | сутки 09:00 | За 7 и 1 день |
| ☐ | `subscription_autorenew` | сутки 10:00 | Автосписание за 3 дня |
| ☐ | `subscription_reset_period` | каждую минуту | Сброс `used_this_period` |
| ☐ | `subscription_expire_unpaid` | каждый час | После 3 дней grace → expired |
| ☐ | `notifications_quiet_hours_flush` | каждые 10 мин | Отложенные push из quiet hours |
| ☐ | `notifications_archive_old` | сутки 03:00 | Архивация notif > 90 дней |
| ☐ | `cleanup_mcd_drafts` | каждый час | Удаление `mcd-drafts/` старше 10 мин |
| ☐ | `cleanup_cert_sessions` | каждые 6ч | Очистка `certificate_issue_sessions` старше 24ч |

---

## SSE / WebSocket streams (5)

| ✓/✗ | Endpoint | События |
|---|---|---|
| ☐ | `/api/v1/notifications/events` | `notifications.new`, `notifications.counts.updated` |
| ☐ | `/api/v1/documents/events` | `document.received`, `document.updated` |
| ☐ | `/api/v1/signing/jobs/:jobId/events` | `signing.progress`, `signing.completed`, `signing.failed` |
| ☐ | `/api/v1/mcd/jobs/:jobId/events` | `mcd.verification.progress`, `mcd.verification.completed` |
| ☐ | `/api/v1/edo/connections/:id/sync-events` | `sync.progress`, `sync.completed` |

---

## Внешние интеграции (исходящие — что использует наш бэк)

| ✓/✗ | Сервис | Что используем |
|---|---|---|
| ☐ | **SMS-провайдер** (SMS.ru / Exolve / SMS-центр) | Отправка SMS-кодов |
| ☐ | **ДаДата API** | Поиск компании/ИП/ФЛ по ИНН |
| ☐ | **РосЭлТорг УЦ API** | Выпуск КЭП + МЧД (если получим API) |
| ☐ | **КриптоКлюч API** (или аналог) | Альтернатива РосЭлТорг для КЭП |
| ☐ | **ФНС m4d.nalog.gov.ru** | Реестр МЧД (через посредника, прямого API нет) |
| ☐ | **МИГ24 / ИТКОМ API** | Fallback для проверки МЧД в реестре ФНС |
| ☐ | **СБИС API** | Pull/push документов |
| ☐ | **Диадок API** (Контур) | То же |
| ☐ | **Контур API** | То же |
| ☐ | **СберКорус API** | То же |
| ☐ | **ЮKassa** (или CloudPayments) | Эквайринг карт |
| ☐ | **СБП (NSPK)** | СБП-платежи |
| ☐ | **FCM Google** | Push для Android + Web |
| ☐ | **APNs Apple** | Push для iOS |
| ☐ | **Email-провайдер** (Mailgun / SendGrid) | Email-уведомления, magic-link |
| ☐ | **КриптоПро SDK** | Проверка CAdES/XAdES подписей |
| ☐ | **ESIA OAuth2** | Идентификация при выпуске КЭП |

---

## Базовая инфраструктура (must-have)

### Хранилища
- ☐ PostgreSQL 14+ (основная БД)
- ☐ Redis 6+ (rate-limit, sessions, кеш ДаДата, cron locks)
- ☐ S3 / MinIO (файлы: МЧД-XML, документы, экспорт PDF)
- ☐ KMS / Vault (ключи шифрования OAuth tokens, API keys)

### Безопасность
- ☐ HTTPS обязательно (Let's Encrypt или комм. сертификаты)
- ☐ JWT с rotation
- ☐ CSRF protection на всех мутациях
- ☐ Rate-limiter (Redis sliding window)
- ☐ Antivirus (ClamAV) на file uploads
- ☐ HMAC-подпись на все webhook (входящие и исходящие)
- ☐ Audit log (append-only, append-only constraint в БД)
- ☐ PII-шифрование AES-256

### Мониторинг
- ☐ Prometheus метрики (latency P50/P95/P99, error rate, RPS на каждый endpoint)
- ☐ Алерты: error rate > 1% за 5 мин, P95 > 2s, disk/memory > 80%
- ☐ OpenTelemetry distributed tracing с `trace_id`
- ☐ Structured logging (JSON, levels, обязательно `user_id`+`trace_id`)
- ☐ Sentry / аналог для exception tracking
- ☐ Health-check эндпоинты `/health`, `/health/ready`

### Документация
- ☐ OpenAPI 3.1 спецификация всего API
- ☐ Постман-коллекция для QA
- ☐ Storybook / API Reference в Swagger UI

---

## 🎯 Что спросить у бэкендера

После того как он скажет «всё готово», прогони этот чек-лист:

1. **«Покажи OpenAPI-схему — все 67 эндпоинтов там должны быть»**
   → если нет схемы — это уже минус, требуй
2. **«Дай Postman-коллекцию»** — лучший способ проверить
3. **«Какой у тебя Sentry / откуда смотришь ошибки?»** — должен быть хоть какой-то error tracking
4. **«Где Prometheus-метрики?»** — `/metrics` endpoint
5. **«Сколько cron-jobs?»** — должно быть минимум 11, см. таблицу
6. **«Покажи интеграционные тесты на 3 happy + 5 негативных сценариев»** — из спек
7. **«Что в audit log за последний час?»** — должны быть записи на каждое действие

Если на любой пункт — мычание или «потом сделаю» — это **флаг**.

---

## Выводы по спекам

- **67 REST endpoints** — основной API
- **+ 4 webhook receivers** — для эквайеров и операторов ЭДО
- **+ 5 SSE streams** — для real-time обновлений
- **+ 11+ cron-jobs**
- **+ 17 внешних интеграций**

**Это не маленькое приложение.** Один senior-бэкендер сделает MVP за 3–4 месяца. Если торопится за месяц — что-то выбрасывается, и нужно понимать что именно.

---

## 📞 Контакты

Если у бэкендера есть вопросы — пусть открывает соответствующую спеку
([`docs/`](.)) и читает. На каждый вопрос там есть ответ. Если в спеке
не описано — не выдумывает, а спрашивает у продакта.

**Главное правило:** НЕ переизобретать. Все принципы (формат ошибок,
типы данных, версионирование) описаны в [`README.md`](./README.md).
Если делается иначе — пусть аргументирует почему.
