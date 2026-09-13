# DriveScope — Полное руководство по настройке и развёртыванию

**Языки:** Русский | [English](./README.md)

## Содержание

1. [Обзор архитектуры](#обзор-архитектуры)
2. [Предварительные требования](#предварительные-требования)
3. [Шаг 1: Получение учётных данных Tesla](#шаг-1-получение-учётных-данных-tesla)
4. [Шаг 2: Генерация виртуального ключа](#шаг-2-генерация-виртуального-ключа)
5. [Шаг 3: Развёртывание в Netlify](#шаг-3-развёртывание-в-netlify)
6. [Шаг 4: Развёртывание телеметрии в Oracle Cloud](#шаг-4-развёртывание-телеметрии-в-oracle-cloud)
7. [Шаг 5: Регистрация приложения в Tesla](#шаг-5-регистрация-приложения-в-tesla)
8. [Шаг 6: Первый запуск](#шаг-6-первый-запуск)
9. [Проверка и мониторинг](#проверка-и-мониторинг)
10. [Решение проблем](#решение-проблем)

---

## Обзор архитектуры

DriveScope состоит из трёх компонентов:

| Компонент | Местоположение | Назначение |
|-----------|---------------|-----------|
| **App** | Netlify | Веб-интерфейс для просмотра статуса автомобиля, управления Fleet API |
| **Telemetry** | Oracle Cloud Always Free | Получение потока данных в реальном времени от Tesla в виде mTLS соединения |
| **Credentials** | Supabase | Хранение зашифрованных токенов Fleet API (не затрагивается при переходе на новый ключ) |

### Жизненный цикл данных

```
Tesla Fleet API
   ↓
   ├─→ [Callback] → Supabase (credentials)
   └─→ [App UI] → Пользователь
   
Tesla Fleet Telemetry (мTLS)
   ↓
   [Oracle Cloud] → Логирование/Хранение
```

---

## Предварительные требования

Перед началом убедитесь, что у вас есть:

- **Tesla Account** — для разработчиков на [developer.tesla.com](https://developer.tesla.com)
- **Supabase Project** — [supabase.com](https://supabase.com) (бесплатный уровень подходит)
- **Netlify Account** — [netlify.com](https://netlify.com) для хостинга приложения
- **Oracle Cloud Account** — [oracle.com/cloud/free](https://oracle.com/cloud/free) для Always Free tier телеметрии
- **Домен (или поддомен)** — для регистрации виртуального ключа в Tesla (например, `drivescope.example.com` или `tesla-app.yourname.com`)
- **Git репозиторий** — форк или копия этого проекта
- **Node.js 22.18+** или **Node 24** — для локальной работы и скриптов

### Убедитесь в наличии команд

```bash
node --version        # Должно быть 22.18+ или 24+
npm --version         # Должно быть 10+
git --version         # Должно быть 2.30+
openssl version       # Должно быть OpenSSL 1.1+
docker --version      # Для локального запуска телеметрии (опционально)
```

---

## Шаг 1: Получение учётных данных Tesla

### 1.1 Регистрация приложения в Tesla Developer Portal

1. Перейдите на [developer.tesla.com](https://developer.tesla.com)
2. Нажмите **"Create app"** (Создать приложение)
3. Заполните данные:
   - **App Name**: DriveScope (или любое имя)
   - **App Domain**: `https://example.com` (ваш основной домен, или поддомен)
   - **Redirect URI**: `https://example.com/api/fleet/callback` (точное совпадение обязательно)

4. **Сохраните** полученные значения:
   ```
   CLIENT_ID = xxxxxxxxxxxxxxxx
   CLIENT_SECRET = xxxxxxxxxxxxxxxx
   ```

### 1.2 Проверка Scopes

При создании приложения убедитесь, что у вас есть следующие scopes:

- `vehicle_cmds` — управление автомобилем (опционально)
- `vehicle:read_location` — геолокация
- `vehicle:read_telemetry` — потоки телеметрии
- `energy_cmds` — управление энергией (опционально)
- `offline_access` — refresh tokens

Если вы не видите эти scopes, обратитесь в Tesla Support и запросите доступ к Fleet API.

---

## Шаг 2: Генерация виртуального ключа

### 2.1 Генерация пары ключей (локально)

```bash
cd deploy/fleet-telemetry
./make-key.sh
```

Этот скрипт создаст:
- `keys/private.pem` — **НИКОГДА** не коммитьте это
- `keys/public.pem` — этот файл нужно опубликовать

### 2.2 Публикация открытого ключа в Netlify

1. **Скопируйте содержимое** `keys/public.pem`:
   ```bash
   cat deploy/fleet-telemetry/keys/public.pem
   ```

2. **Создайте в репозитории** файл:
   ```
   public/.well-known/appspecific/com.tesla.3p.public-key.pem
   ```
   и вставьте содержимое.

3. **Коммитьте и пушьте** в GitHub:
   ```bash
   git add public/.well-known/appspecific/com.tesla.3p.public-key.pem
   git commit -m "Add Tesla virtual key (public half)"
   git push origin master
   ```

### 2.3 Проверка доступности ключа

После деплоя Netlify убедитесь, что ключ доступен:

```bash
curl https://example.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Должен вернуть PEM содержимое (не 404 и не HTML).

---

## Шаг 3: Развёртывание в Netlify

### 3.1 Подготовка переменных окружения

Создайте файл `.env.local` в корне проекта (не коммитьте его):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxxxx

# Tesla Fleet API
TESLA_CLIENT_ID=xxxxxxxxxxxxxxxx
TESLA_CLIENT_SECRET=xxxxxxxxxxxxxxxx
TESLA_REDIRECT_URI=https://example.com/api/fleet/callback

# Для локальной разработки
TESLA_API_HOST=https://api.tesla.com

# Ключ для Oracle Telemetry (генерируется после шага 4)
FLEET_TELEMETRY_KEY_PRIVATE=-----BEGIN EC PRIVATE KEY-----\n...
```

### 3.2 Добавление в Netlify

1. **Коннектните GitHub репозиторий** к Netlify
2. Перейдите в **Site Settings** → **Environment**
3. Добавьте переменные (не коммитьте их в код):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `TESLA_CLIENT_ID`
   - `TESLA_CLIENT_SECRET`
   - `TESLA_REDIRECT_URI`
   - `TESLA_API_HOST`

4. **Deploy settings**:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Node version**: `22` (укажите явно)

5. **Коммитьте и пушьте** в `master` — Netlify автоматически задеплоится.

### 3.3 Проверка деплоя

```bash
curl https://example.com/
# Должно вернуть HTML приложения (не ошибку)

curl https://example.com/.well-known/appspecific/com.tesla.3p.public-key.pem
# Должно вернуть PEM содержимое
```

---

## Шаг 4: Развёртывание телеметрии в Oracle Cloud

### 4.1 Подготовка Oracle Cloud

1. Создайте **Compute Instance** (Always Free, Ubuntu 22.04)
2. Откройте **Security Group** (входящие):
   - Port 443 (HTTPS) — для mTLS от Tesla
   - Port 22 (SSH) — для вашего управления

### 4.2 Получение сертификата

На машине, где будет работать телеметрия (локально или на Oracle):

```bash
cd deploy/fleet-telemetry

# Установите необходимые переменные
export TELEMETRY_HOST=telemetry.example.com
export ACME_EMAIL=you@example.com

# Генерируйте сертификат (требует контроля DNS или HTTP)
./issue-cert.sh
```

**Важно:** Хост ДОЛЖЕН быть поддоменом вашего основного домена (например, `example.com`).

### 4.3 Развёртывание на Oracle Cloud

1. **SSH на Oracle машину**:
   ```bash
   ssh ubuntu@<oracle-ip>
   ```

2. **Установите Docker и Docker Compose**:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   sudo usermod -aG docker ubuntu
   ```

3. **Загрузите проект**:
   ```bash
   git clone https://github.com/your-account/TeslaApp.git
   cd TeslaApp/deploy/fleet-telemetry
   ```

4. **Скопируйте сертификат и приватный ключ**:
   ```bash
   # Скопируйте certs/ и keys/ на Oracle машину
   # Используйте scp или включите в код
   ```

5. **Запустите Docker Compose**:
   ```bash
   docker compose up -d
   docker compose logs -f fleet-telemetry
   ```

6. **Проверьте, что серверслушает на 443**:
   ```bash
   sudo netstat -tlnp | grep 443
   ```

### 4.4 Настройка Tunnel (Cloudflare или ngrok)

Если ваш серверне имеет прямого доступа в интернет на 443:

**С Cloudflare Tunnel (рекомендуется)**:
```bash
cloudflared tunnel run --config cloudflared.yml
```

**С ngrok** (альтернатива):
```bash
ngrok tcp 443 --domain=telemetry.example.com --tls-passthrough
```

---

## Шаг 5: Регистрация приложения в Tesla

### 5.1 Регистрация virtual key у Tesla

Используйте скрипт:

```bash
cd deploy/fleet-telemetry

# Сначала — проверка (не отправляет на Tesla)
node --env-file=../.env --import ./scripts/register.mjs \
  register-partner.mts --dry-run

# Если всё хорошо, отправьте (отправляет на Tesla)
node --env-file=../.env --import ./scripts/register.mjs \
  register-partner.mts
```

Это создаст запись в `/api/1/partner_accounts` с вашим открытым ключом.

### 5.2 Регистрация автомобиля на Fleet Telemetry

1. **Получите VIN вашего автомобиля**
2. **Откройте** https://tesla.com/_ak/telemetry.example.com в браузере как доверенный пользователь
3. На экране автомобиля **примите** подтверждение регистрации
4. **Проверьте статус**:
   ```bash
   node --env-file=../.env --import ./scripts/register.mjs \
     configure-vehicle.mts --dry-run
   ```
   Ищите `key paired yes` и `synced: true`

---

## Шаг 6: Первый запуск

### 6.1 Вход в приложение

1. Откройте https://example.com/login
2. **Создайте аккаунт** (приложение это не ваш Tesla account)
3. **Нажмите** "Подключить Tesla"
4. **Пройдите OAuth** на сайте Tesla
5. Приложение автоматически сохранит токен в Supabase

### 6.2 Проверка данных

1. **Откройте Dashboard** — должны видеть машину
2. **Если автомобиль спит**, подождите 5–10 минут (очень мало данных)
3. **Если автомобиль включен**, данные должны обновляться в реальном времени

### 6.3 Проверка телеметрии

На Oracle машине проверьте логи:

```bash
docker compose logs -f fleet-telemetry | grep -i "location\|state\|battery"
```

Вы должны видеть JSON фреймы с telemetry данными.

---

## Проверка и мониторинг

### Локальная проверка перед продакшеном

```bash
npm run lint          # Проверка синтаксиса
npm run build         # Сборка приложения
npm run verify        # Запуск 363+ проверок Tesla логики
```

### Мониторинг Netlify

- Dashboard: https://app.netlify.com
- Проверяйте логи функций в **Functions** → **fleet/callback**
- Ищите ошибки вроде "Sign-in required", "Could not refresh"

### Мониторинг Oracle

```bash
docker compose logs --tail=100 fleet-telemetry
docker compose ps
sudo journalctl -u docker -f
```

### Метрики в Supabase

```sql
-- Проверьте последние токены
SELECT owner_id, expires_at, updated_at 
FROM fleet_credentials 
ORDER BY updated_at DESC 
LIMIT 5;

-- Проверьте логи запросов
SELECT COUNT(*), status 
FROM tesla_request_log 
GROUP BY status;
```

---

## Решение проблем

### 1. Ошибка "Sign-in required" при нажатии на "Подключить Tesla"

**Причина**: Токен приложения не установлен в Supabase или истёк.

**Решение**:
1. Проверьте, что вы **вошли в приложение** (не Tesla, а DriveScope account)
2. Убедитесь, что **NEXT_PUBLIC_SUPABASE_URL** и **NEXT_PUBLIC_SUPABASE_ANON_KEY** установлены в Netlify
3. Очистите cookies браузера и попробуйте снова

### 2. Ошибка "Invalid redirect_uri" при OAuth

**Причина**: Redirect URI не совпадает с указанным в developer.tesla.com.

**Решение**:
1. Откройте developer.tesla.com → ваше приложение
2. Убедитесь, что **Redirect URI** точно совпадает: `https://example.com/api/fleet/callback`
3. **Сохраните** и пересоберите Netlify

### 3. Телеметрия не приходит (машина не отправляет данные)

**Причина**: Машина не подключена к телеметрии, сертификат не доверен, или ключ не зарегистрирован.

**Решение**:
1. Проверьте, что машина **синхронизирована** с Tesla cloud (не offline)
2. **Повторите шаг 5.2** — откройте https://tesla.com/_ak/telemetry.example.com ещё раз
3. Убедитесь, что сертификат подписан **известным CA** (не self-signed)
4. Проверьте логи Oracle:
   ```bash
   docker compose logs fleet-telemetry | grep -i "tls\|cert\|error"
   ```

### 4. 429 ошибка (Too Many Requests)

**Причина**: Вы превысили лимиты Tesla (60 realtime / 30 commands / 3 wakes в минуту).

**Решение**:
1. Уменьшите **частоту обновлений** в коде
2. **Подождите 1–2 часа** (лимиты восстанавливаются)
3. Обратитесь в Tesla Support для увеличения лимитов (если готово к продакшену)

### 5. Ошибка "Vehicle does not support telemetry"

**Причина**: Ваша машина старше 2023 года или на старой прошивке.

**Решение**:
1. **Обновитесь** до последней прошивки Tesla
2. Fleet API требует **2023.20+**, Fleet Telemetry требует **2023.26+**
3. Если машина очень старая, используйте только Fleet API (без телеметрии)

---

## Итоговый чек-лист для продакшена

- [ ] Виртуальный ключ сгенерирован (`make-key.sh`)
- [ ] Открытый ключ опубликован на `/.well-known/appspecific/com.tesla.3p.public-key.pem`
- [ ] Приложение развёрнуто в Netlify и доступно по HTTPS
- [ ] Supabase Project создан и переменные добавлены в Netlify
- [ ] Tesla credentials (CLIENT_ID, CLIENT_SECRET) добавлены в Netlify
- [ ] Oracle Cloud машина запущена и доступна на port 443
- [ ] Fleet Telemetry контейнер работает (`docker compose up`)
- [ ] Ключ зарегистрирован у Tesla (`register-partner.mts`)
- [ ] Машина синхронизирована с телеметрией (`configure-vehicle.mts synced: true`)
- [ ] `npm run verify` проходит все проверки
- [ ] `npm run build` завершается без ошибок
- [ ] Вход через Supabase работает
- [ ] Подключение Tesla работает (OAuth flow)
- [ ] Данные машины видны в Dashboard

---

## Получение помощи

- **Документация**: [docs/TESLA_FLEET_MIGRATION_PLAN.md](./docs/TESLA_FLEET_MIGRATION_PLAN.md)
- **GitHub Issues**: Создайте issue в репозитории
- **Tesla Developer Support**: https://developer.tesla.com/support

---

**Версия**: 1.0
**Последнее обновление**: 2026-09-13
**Статус**: Production Ready (Fleet API + Fleet Telemetry)
