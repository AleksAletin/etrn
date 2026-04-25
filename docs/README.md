# eTRN — техническое задание (индекс)

**Приложение:** мобильный PWA для подписания электронных транспортных накладных (ЭТрН).
**Прототип:** https://aleksaletin.github.io/etrn/
**Репозиторий:** https://github.com/AleksAletin/etrn

Документация разбита по модулям. Каждый документ содержит:
- бизнес-контекст,
- функциональные требования с приоритетами,
- user flows фронта со схемами экранов,
- схему БД,
- REST API со всеми эндпоинтами,
- безопасность,
- тест-кейсы (happy + негативные),
- чек-лист готовности к проду.

---

## 📚 Модули

| Модуль | Документ | Статус |
|---|---|---|
| **МЧД** (машиночитаемая доверенность) | [mcd-backend-api.md](./mcd-backend-api.md) | ✅ готов |
| **Авторизация** (SMS + PIN + Онбординг + ДаДата) | [auth-backend-api.md](./auth-backend-api.md) | ✅ готов |
| **Документы** (список, детали, фильтры, архив) | [documents-backend-api.md](./documents-backend-api.md) | ✅ готов |
| **Подписание** (single/bulk/reservations/refuse) | [signing-backend-api.md](./signing-backend-api.md) | ✅ готов |
| **Сертификат КЭП** (выпуск через КриптоКлюч) | [certificate-backend-api.md](./certificate-backend-api.md) | ✅ готов |
| **Уведомления** (push + in-app) | [notifications-backend-api.md](./notifications-backend-api.md) | ✅ готов |
| **Подписка и платежи** | [subscription-backend-api.md](./subscription-backend-api.md) | ✅ готов |
| **Операторы ЭДО** (СБИС, Диадок, Контур, СберКорус) | [edo-operators-backend-api.md](./edo-operators-backend-api.md) | ✅ готов |

## 📦 Справочники

- [samples/](./samples/) — примеры реальных XML-МЧД для тестирования парсера
- [mcd-spec-v2.md](./mcd-spec-v2.md) — первая редакция МЧД-спеки (сохранена для истории)

## ✅ Контроль приёмки

- [api-checklist.md](./api-checklist.md) — **чек-лист всех 67 эндпоинтов** + cron-jobs + webhook'ов + внешних интеграций. Используй чтобы проверить бэкендера.

---

## 🎯 Общие принципы для всех модулей

### Backend
- **Stateless API** — JWT в `Authorization: Bearer`, сессии в Redis если нужны
- **PostgreSQL** — основной store, миграции через Alembic / Flyway / Prisma
- **Redis** — rate-limiting, кеш, счётчики
- **S3/MinIO** — файлы (подписанные URL, TTL 5 мин)
- **Async jobs** — Celery / BullMQ для длительных операций
- **OpenAPI 3.1** — обязательна схема, фронт читает контракт оттуда

### Security (распространяется на все модули)
| Требование | Где применяется |
|---|---|
| HTTPS обязательно | Все эндпоинты |
| CSRF protection | Все мутации |
| Rate-limiting (Redis-based sliding window) | Все публичные + sensitive эндпоинты |
| Audit log (append-only) | Все мутации с PII/security-impact |
| Антивирус (ClamAV) | Все file-uploads |
| 152-ФЗ compliance | Все эндпоинты с ПД |

### Ошибки (единый формат для всех модулей)
```json
{
  "error": "machine_readable_code",
  "message": "Человекочитаемое сообщение для пользователя",
  "details": { /* доп. контекст */ }
}
```

HTTP коды: `400` (валидация), `401` (нет auth), `403` (нет прав), `404` (не найдено), `409` (конфликт), `410` (устарело/удалено), `422` (бизнес-правило), `429` (rate-limit), `500` (внутренняя).

### Единые типы данных
```ts
type ISO8601      = string  // "2026-04-19T15:30:00Z"
type UUID         = string  // "550e8400-e29b-41d4-a716-446655440000"
type Phone        = string  // E.164: "+79001234567"
type Email        = string  // RFC 5322
type INN          = string  // 10 или 12 цифр
type OGRN         = string  // 13 или 15 цифр (ОГРН / ОГРНИП)
type SNILS        = string  // "NNN-NNN-NNN NN"
```

### Версионирование
- Все эндпоинты начинаются с `/api/v1/`
- Breaking changes → `/api/v2/`, `v1` живёт ещё 6 месяцев
- Deprecation header: `Deprecation: true; Link: </api/v2/...>; rel="successor-version"`

### Мониторинг
- **Prometheus-метрики:** latency P50/P95/P99, error rate, request rate на каждый endpoint
- **Алерты:** error-rate >1% за 5 мин, latency P95 >2s, disk/memory >80%
- **Distributed tracing:** OpenTelemetry с trace_id в каждом request/response
- **Structured logging:** JSON, уровни `debug|info|warn|error`, обязательно `user_id`, `trace_id`

---

## 🧑 Контакты

Вопросы по спекам → @AleksandrAletin (продакт).
Вопросы по прототипу → смотри исходники в репе + `docs/samples/`.

**Важно для бэкендера:** если что-то в спеке непонятно — открой прототип, он работает, посмотри как должно быть на фронте. Ссылки на конкретные файлы есть в конце каждого документа.

**Ещё важнее:** не переизобретай. Если в одном модуле есть логика (типа пагинации, ошибок, audit log) — она должна быть одинаковая и в других. Единые принципы описаны выше.
