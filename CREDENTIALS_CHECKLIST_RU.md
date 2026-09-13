# Чек-лист учётных данных и настроек для DriveScope

**Дата подготовки**: 2026-09-13
**Статус**: Требует заполнения перед финальной настройкой

## Раздел 1: Учётные данные Tesla

### 1.1 Tesla Developer Account

| Параметр | Значение | Где получить | Статус |
|----------|----------|---------------|--------|
| **EMAIL** | `your.email@example.com` | [developer.tesla.com](https://developer.tesla.com) Settings | ⬜ Требуется |
| **PASSWORD** | `***` (только для входа) | [developer.tesla.com](https://developer.tesla.com) | ⬜ Требуется |

### 1.2 Регистрация приложения в Tesla

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **TESLA_CLIENT_ID** | `xxxxxxxxxxxxxxxx` | [developer.tesla.com](https://developer.tesla.com) → Your App → Credentials | ✅ Да |
| **TESLA_CLIENT_SECRET** | `xxxxxxxxxxxxxxxx` | [developer.tesla.com](https://developer.tesla.com) → Your App → Credentials | ✅ Да |
| **TESLA_REDIRECT_URI** | `https://example.com/api/fleet/callback` | Указана при регистрации приложения | ✅ Да |
| **APP_DOMAIN** | `example.com` или `drivescope.example.com` | Ваш домен | ✅ Да |
| **TESLA_API_HOST** | `https://api.tesla.com` | Указано в Tesla docs | ✅ Да |

### 1.3 Scopes (разрешения)

**Убедитесь, что приложение имеет доступ к**:

- [ ] `vehicle:read_location` — геолокация автомобиля
- [ ] `vehicle:read_telemetry` — потоки телеметрии в реальном времени
- [ ] `vehicle_cmds` — управление автомобилем (опционально)
- [ ] `energy_cmds` — управление энергией (опционально)
- [ ] `offline_access` — refresh tokens (обязательно!)

**Статус доступа**: ⬜ (запросить у Tesla, если нет всех scopes)

---

## Раздел 2: Supabase

### 2.1 Supabase Project

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **NEXT_PUBLIC_SUPABASE_URL** | `https://xxxxxx.supabase.co` | [supabase.com](https://supabase.com) → Project Settings → API | ✅ Да |
| **NEXT_PUBLIC_SUPABASE_ANON_KEY** | `eyJxxx...` | [supabase.com](https://supabase.com) → Project Settings → API | ✅ Да |
| **SUPABASE_SERVICE_ROLE_KEY** | `eyJxxx...` (никогда не коммитьте) | [supabase.com](https://supabase.com) → Project Settings → API | ✅ Да |
| **SUPABASE_PROJECT_ID** | `xxxxxx` | [supabase.com](https://supabase.com) → Project Settings → General | ℹ️ Справочно |

### 2.2 Таблицы Supabase (автоматически созданы)

**Убедитесь, что существуют таблицы**:

- [ ] `auth.users` — пользователи приложения (автоматически)
- [ ] `public.vehicles` — ваши автомобили (требует миграции)
- [ ] `public.fleet_credentials` — Tesla tokens (требует миграции)
- [ ] `public.tesla_request_log` — логи запросов (требует миграции)

**Миграция БД**: ⬜ (запустить миграции из `supabase/migrations/`)

---

## Раздел 3: Netlify

### 3.1 Netlify Site

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **NETLIFY_SITE_NAME** | `drivescope` (часть URL) | [netlify.com](https://netlify.com) → Site Settings | ℹ️ Справочно |
| **NETLIFY_SITE_ID** | `xxxxxxxxxxxxxxxx` | [netlify.com](https://netlify.com) → Site Settings → General | ℹ️ Справочно |
| **DEPLOYMENT_URL** | `https://example.com` или `https://drivescope.netlify.app` | Настройка домена в Netlify | ✅ Да |

### 3.2 Переменные окружения в Netlify

**Обязательно добавить в** [netlify.com](https://netlify.com) → Site Settings → Build & deploy → Environment:

```
NEXT_PUBLIC_SUPABASE_URL = https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJxxx...
TESLA_CLIENT_ID = xxxxxxxxxxxxxxxx
TESLA_CLIENT_SECRET = xxxxxxxxxxxxxxxx
TESLA_REDIRECT_URI = https://example.com/api/fleet/callback
TESLA_API_HOST = https://api.tesla.com
```

**Проверка**: ⬜ (все 6 переменных добавлены и видны в Netlify)

### 3.3 Сертификат .well-known

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **PUBLIC_KEY_FILE** | `public/.well-known/appspecific/com.tesla.3p.public-key.pem` | Сгенерирован `./make-key.sh` | ✅ Да |
| **PUBLIC_KEY_URL** | `https://example.com/.well-known/appspecific/com.tesla.3p.public-key.pem` | Должен быть доступен по HTTPS | ✅ Да |

**Статус**: ⬜ (ключ опубликован в Netlify и доступен по URL)

---

## Раздел 4: Oracle Cloud (Fleet Telemetry)

### 4.1 Oracle Cloud Instance

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **INSTANCE_IP** | `1.2.3.4` | [cloud.oracle.com](https://cloud.oracle.com) → Compute → Instances | ✅ Да |
| **INSTANCE_USER** | `ubuntu` | SSH пользователь | ✅ Да |
| **INSTANCE_KEY_FILE** | `~/.ssh/oracle-key.pem` | Сохранить при создании Instance | ✅ Да |
| **TELEMETRY_HOST** | `telemetry.example.com` | Поддомен вашего домена | ✅ Да |
| **TELEMETRY_PORT** | `443` | Фиксированный (TLS) | ✅ Да |

### 4.2 Сертификат для Telemetry Server

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **TLS_CERT_FILE** | `deploy/fleet-telemetry/certs/server.crt` | `./issue-cert.sh` (Let's Encrypt) | ✅ Да |
| **TLS_KEY_FILE** | `deploy/fleet-telemetry/certs/server.key` | `./issue-cert.sh` (Let's Encrypt) | ✅ Да |
| **CA_CERT_FILE** | `deploy/fleet-telemetry/certs/ca.crt` | `./issue-cert.sh` (Let's Encrypt chain) | ✅ Да |
| **CERT_VALID_UNTIL** | `2025-12-31` | Проверить: `openssl x509 -enddate -noout -in server.crt` | ✅ Да |

**Требования к сертификату**:
- [ ] Подписан **известным CA** (Let's Encrypt, Digicert и т.д.)
- [ ] **НЕ самоподписанный** (мTLS от Tesla не примет)
- [ ] CN/SAN содержит `telemetry.example.com`
- [ ] Будет действителен минимум 3 месяца

### 4.3 Fleet Telemetry конфигурация

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **CONFIG_FILE** | `deploy/fleet-telemetry/config.local.json` | Или `docker compose up` скачает | ✅ Да |
| **VEHICLE_CONFIGS_URL** | Указана в конфиге | Требует TOKEN (шаг 5.1) | ✅ Да |
| **LOGGER_DISPATCHER** | `logger` (для dev) или `mqtt`/`kafka` (для prod) | В конфиге | ℹ️ Выбрать |
| **DOCKER_IMAGE** | `ghcr.io/teslamotors/fleet-telemetry:latest` | Docker Hub → Tesla | ✅ Да |

**Статус**: ⬜ (контейнер запущен и слушает на port 443)

### 4.4 Приватный ключ для подписи команд (опционально)

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **PRIVATE_KEY_FILE** | `deploy/fleet-telemetry/keys/private.pem` | `./make-key.sh` | ❓ Для vehicle_cmds |
| **PRIVATE_KEY_PASSPHRASE** | `***` (если зашифрован) | Сохранено при генерации | ❓ Для vehicle_cmds |

**Требуется ТОЛЬКО если**:
- [ ] Вы планируете отправлять команды на машину (`vehicle_cmds`)
- [ ] Для чтения-только (телеметрия) — не нужен

---

## Раздел 5: Git / GitHub

### 5.1 GitHub Repository

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **GITHUB_REPO_URL** | `https://github.com/your-account/TeslaApp.git` | [github.com](https://github.com) | ✅ Да |
| **GITHUB_BRANCH** | `master` или `main` | Главная ветка репо | ✅ Да |
| **DEPLOY_KEY** | SSH ключ (для CI/CD) | Генерируется автоматически в Netlify | ℹ️ Справочно |

### 5.2 Файлы, которые НЕ коммитить (в `.gitignore`)

**Убедитесь, что добавлены в `.gitignore`**:

- [ ] `deploy/fleet-telemetry/keys/` — приватные ключи
- [ ] `deploy/fleet-telemetry/certs/` — сертификаты (опционально)
- [ ] `.env` и `.env.local` — переменные окружения
- [ ] `.env.*.local` — локальные переменные
- [ ] `supabase/migrations/applied_migrations.sql` — статус миграций

**Статус**: ⬜ (проверено с `git status`)

---

## Раздел 6: Финальная регистрация в Tesla

### 6.1 Virtual Key Registration

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **PARTNER_ACCOUNT_REGISTERED** | `true` / `false` | Результат `register-partner.mts` | ✅ Да |
| **PARTNER_ACCOUNT_ID** | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Возвращено `register-partner.mts` | ℹ️ Справочно |
| **KEY_PAIR_INSTALLED** | `true` / `false` | https://tesla.com/_ak/telemetry.example.com | ✅ Да |

**Процесс регистрации**:

```bash
# Шаг 1: Проверка
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/register-partner.mts --dry-run

# Шаг 2: Регистрация (если шаг 1 прошёл)
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/register-partner.mts

# Шаг 3: Получение ID
# Сохраните PARTNER_ACCOUNT_ID из ответа
```

**Статус**: ⬜ (регистрация завершена)

### 6.2 Vehicle Telemetry Configuration

| Параметр | Значение | Где получить | Обязательно |
|----------|----------|---------------|------------|
| **VEHICLE_VIN** | `5YJ3E1E...` | На машине (Settings → Service) | ✅ Да |
| **TELEMETRY_SYNCED** | `true` / `false` | Результат `configure-vehicle.mts` | ✅ Да |
| **TELEMETRY_KEY_PAIRED** | `true` / `false` | Результат `configure-vehicle.mts` | ✅ Да |

**Процесс конфигурации**:

```bash
# Шаг 1: Проверка
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --dry-run

# Если всё хорошо:
# 1. Откройте https://tesla.com/_ak/telemetry.example.com (как доверенный пользователь)
# 2. Примите подтверждение на экране машины
# 3. Проверьте статус снова

# Шаг 2: Финальная регистрация
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts \
  --hostname=telemetry.example.com --port=443
```

**Статус**: ⬜ (машина синхронизирована и ключ установлен)

---

## Раздел 7: Проверочный список перед продакшеном

### Локальная окружение

- [ ] `node --version` → 22.18+ или 24+
- [ ] `npm --version` → 10+
- [ ] `.env.local` создан с данными из Разделов 1–6
- [ ] `npm run lint` проходит без ошибок
- [ ] `npm run build` успешно собирается
- [ ] `npm run verify` показывает **363 checks passed**

### Netlify

- [ ] Сайт развёрнут и доступен по HTTPS
- [ ] `.well-known/appspecific/com.tesla.3p.public-key.pem` доступен
- [ ] Все 6 переменных окружения установлены
- [ ] Deploy logs показывают успех (`✓ Build completed`)
- [ ] Статус DNS указывает на Netlify

### Supabase

- [ ] Project создан и активен
- [ ] Таблицы созданы (migrations applied)
- [ ] Email verification отключен (для dev) или настроен (для prod)
- [ ] Row Level Security (RLS) политики установлены для `fleet_credentials`

### Oracle Cloud

- [ ] Instance создан и работает (Ubuntu 22.04)
- [ ] Security Group открыт: входящий port 443, 22
- [ ] Docker и Docker Compose установлены
- [ ] Fleet Telemetry контейнер запущен: `docker compose up -d`
- [ ] `netstat -tlnp | grep 443` показывает слушание

### Tesla

- [ ] Приложение зарегистрировано на developer.tesla.com
- [ ] CLIENT_ID и CLIENT_SECRET получены
- [ ] Virtual key зарегистрирован (`register-partner.mts` выполнен)
- [ ] Машина подключена к телеметрии (`configure-vehicle.mts synced: true`)
- [ ] `key paired: yes` подтвержден

---

## Раздел 8: Первый запуск (тестирование)

### Шаг 1: Вход в приложение

```
1. Откройте https://example.com/login
2. Создайте account (NOT Tesla, это app-level auth)
3. Введите email и пароль
```

**Ожидаемый результат**: Перенаправление на Dashboard или Settings (если нет Fleet connect)

### Шаг 2: Подключение Tesla

```
1. На Dashboard нажмите "Connect Tesla" (или Settings → Connect Fleet)
2. Пройдите OAuth на tesla.com
3. Примите разрешения
```

**Ожидаемый результат**: Редирект обратно в приложение, сохранение токена

### Шаг 3: Проверка данных

```
1. Dashboard должен показывать имя машины
2. State card показывает состояние (driving, parked, charging, sleeping)
3. Данные обновляются каждые 5–10 секунд (если машина включена)
```

**Ожидаемый результат**: Данные машины видны

### Шаг 4: Проверка логов

```bash
# Netlify (функции)
# https://app.netlify.com → Functions → fleet/callback → Logs

# Oracle Telemetry
docker compose logs -f fleet-telemetry | grep -i "location\|state\|battery"
```

**Ожидаемый результат**: JSON фреймы телеметрии видны в логах

---

## Раздел 9: Обновление и ротация учётных данных

### Обновление Tesla CLIENT_SECRET

1. На developer.tesla.com → Your App → Credentials → Rotate Secret
2. **Немедленно** обновите в Netlify
3. Старый secret будет невалидным в течение 5 минут

### Обновление сертификата TLS

```bash
cd deploy/fleet-telemetry

# Перед истечением (за 30 дней)
./issue-cert.sh  # Обновить Let's Encrypt

# Перезагрузить контейнер
docker compose down
docker compose up -d
```

### Ротация Fleet Key Pair

```bash
# Генерируем новую пару
./make-key.sh --force

# Регистрируем новый открытый ключ
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/register-partner.mts

# Переустанавливаем на машине
# https://tesla.com/_ak/telemetry.example.com (как trusted user)
```

---

## Приложение А: Быстрая справка по команды

```bash
# Локальная разработка
npm install                    # Установить зависимости
npm run dev                    # Локальный сервер (http://localhost:3000)
npm run lint                   # Проверка синтаксиса
npm run build                  # Сборка для продакшена
npm run verify                 # Запуск 363+ проверок Tesla логики

# Fleet Telemetry
cd deploy/fleet-telemetry
./make-key.sh                  # Генерируем ключи
./issue-cert.sh                # Генерируем TLS сертификат
docker compose up -d           # Запуск контейнера
docker compose logs -f         # Логи в реальном времени
docker compose down            # Остановка контейнера

# Tesla Registration
node --env-file=.env --import ./scripts/register.mjs \
  register-partner.mts --dry-run              # Проверка перед отправкой
node --env-file=.env --import ./scripts/register.mjs \
  register-partner.mts                        # Регистрация ключа
node --env-file=.env --import ./scripts/register.mjs \
  configure-vehicle.mts --dry-run             # Проверка машины
node --env-file=.env --import ./scripts/register.mjs \
  configure-vehicle.mts \
  --hostname=telemetry.example.com --port=443 # Конфигурация машины
```

---

## Приложение Б: Часто задаваемые вопросы

### Q: Могу ли я использовать самоподписанный сертификат для телеметрии?

**A**: Нет. Tesla mTLS требует сертификата, подписанного известным CA (Let's Encrypt, Digicert и т.д.). Самоподписанные сертификаты будут отклонены машиной.

### Q: Что если машина не поддерживает Fleet Telemetry?

**A**: Fleet Telemetry требует:
- **Firmware 2023.26+** (для полной функциональности)
- **Firmware 2023.20+** (для базовой функциональности)

Если машина старше, используйте только Fleet API (без телеметрии).

### Q: Где хранятся токены Tesla?

**A**: В таблице `fleet_credentials` в Supabase, **зашифрованные** и привязанные к вашему Supabase user ID. Они **не передаются** браузеру.

### Q: Что происходит при выходе из приложения (Sign out)?

**A**: 
1. Удаляется ваша сессия Supabase (app auth)
2. Удаляются ваши Fleet credentials из БД
3. Машина **остаётся подключена** к телеметрии (это долговечная конфигурация Tesla)

---

**Готовы развёртывать?** Начните с [SETUP_RU.md](./SETUP_RU.md) и этого чек-листа.
