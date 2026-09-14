# 🔍 КАК ПРОВЕРИТЬ СВЯЗЬ МЕЖДУ ФРОНТЕНДОМ И ТЕЛЕМЕТРИЕЙ

## ❓ ВАШЕ ПРИЛОЖЕНИЕ СВЯЗАНО С ТЕЛЕМЕТРИЕЙ?

**ДА!** Если оно правильно настроено. Вот как проверить:

---

## 🎯 **ШАГ 1: ПРОВЕРЬТЕ ПРИЛОЖЕНИЕ В БРАУЗЕРЕ**

### Откройте:
```
https://tesla-y-dashboard.netlify.app/
```

### Смотрите в консоли браузера (F12 → Console):

Вы должны видеть:
```
✅ "Fetching vehicle data..."
✅ "Successfully loaded telemetry data"
✅ Vehicle info loaded
```

Или ошибки:
```
❌ "Failed to fetch telemetry data"
❌ "No authentication token"
❌ CORS error
```

---

## 🔌 **ШАГ 2: ПРОВЕРЬТЕ API ЗАПРОСЫ (Network Tab)**

### В браузере F12 → Network tab

Смотрите запросы к:
```
https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles/...
```

### Должны быть:
- ✅ **Status: 200** (успех)
- ✅ **Response**: JSON с данными vehicle
- ✅ **Authorization**: Bearer token

Если ошибки:
```
❌ 401 Unauthorized
❌ 403 Forbidden
❌ CORS error
```

---

## 📋 **ШАГ 3: ПРОВЕРЬТЕ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ НА NETLIFY**

Переменные должны быть установлены:

```bash
TESLA_FLEET_REGION=eu
TESLA_FLEET_CLIENT_ID=4a420ab6-d667-4e2b-9cb3-b98be275db7c
TESLA_FLEET_CLIENT_SECRET=<secret>
TESLA_FLEET_REDIRECT_URI=https://tesla-y-dashboard.netlify.app/api/fleet/callback
NEXT_PUBLIC_APP_URL=https://tesla-y-dashboard.netlify.app
```

### Как проверить на Netlify:
1. Откройте https://app.netlify.com/
2. Выберите проект `tesla-y-dashboard`
3. **Site settings** → **Build & deploy** → **Environment**
4. Проверьте все переменные

---

## 🧪 **ШАГ 4: ПРОТЕСТИРУЙТЕ ЛОГИН**

### Попробуйте логин через Tesla:
1. Откройте приложение
2. Нажмите **"Login with Tesla"**
3. Авторизуйтесь
4. Должны вернуться с access token

### Проверьте в локальном storage:
```javascript
// В консоли браузера F12:
localStorage.getItem('tesla_access_token')
```

Должно быть:
```
"eyJ0eXAiOiJKV1QiLC..."  (длинный token)
```

Если пусто - **НЕ логировались**

---

## 🚗 **ШАГ 5: ПРОВЕРЬТЕ ДАННЫЕ МАШИНЫ**

### Консоль браузера F12 → Console:

```javascript
// Проверить есть ли данные в памяти
console.log(localStorage.getItem('vehicle_data'))

// Должно быть что-то вроде:
// {"vin":"7SAYGDEFXPF942896","state":"online","battery_level":85,...}
```

---

## 📊 **ШАГ 6: ПРОВЕРЬТЕ МЕТРИКИ ТЕЛЕМЕТРИИ СЕРВЕРА**

С вашего компьютера (если у вас есть доступ):

```bash
# Через SSH туннель
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'curl -s http://localhost:9090/metrics | grep fleet'
```

### Должны видеть:
```
fleet_telemetry_messages_received{vehicle_id="..."} 42
fleet_telemetry_bytes_received{vehicle_id="..."} 103456
fleet_telemetry_connections{state="connected"} 1
```

Если 0 - машина еще не подключилась!

---

## 🔗 **СВЯЗЬ МЕЖДУ КОМПОНЕНТАМИ**

```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│  БРАУЗЕР (tesla-y-dashboard.netlify.app)                 │
│  ├─ Пользователь логирует (OAuth)                        │
│  ├─ Получает access token                               │
│  └─ Запрашивает: GET /api/1/vehicles/[VIN]/data_updates │
│                                                           │
│         ↓ API запрос                                      │
│                                                           │
│  FLEET API (fleet-api.prd.eu.vn.cloud.tesla.com)        │
│  ├─ Проверяет token (Authorization: Bearer ...)          │
│  ├─ Если машина отправляла телеметрию → возвращает      │
│  └─ Response: {latitude, longitude, speed, battery...}  │
│                                                           │
│         ↓ Данные                                          │
│                                                           │
│  БРАУЗЕР                                                  │
│  └─ Отображает GPS, скорость, батарею и т.д.           │
│                                                           │
│  ПАРАЛЛЕЛЬНО:                                            │
│  ┌─ МАШИНА ──mTLS──→ ТЕЛЕМЕТРИЯ СЕРВЕР (443)           │
│  │  отправляет       получает и хранит                  │
│  │  телеметрию       (в метриках)                       │
│  └─ Fleet API получает эти данные и отвечает           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ **КОНТРОЛЬНЫЙ СПИСОК СВЯЗИ**

- [ ] Приложение открывается без ошибок
- [ ] Есть кнопка "Login with Tesla"
- [ ] После логина → вы в защищенной области
- [ ] Нет CORS ошибок в консоли
- [ ] Network tab показывает успешные запросы (200)
- [ ] localStorage содержит access token
- [ ] Машина включена
- [ ] Интернет в машине работает
- [ ] Логи сервера показывают подключение
- [ ] Метрики показывают счетчики > 0

---

## 🔧 **ЧТО ПРОВЕРИТЬ УДАЛЕННО (без машины рядом)**

### 1. **Приложение работает?**
```bash
curl -I https://tesla-y-dashboard.netlify.app/
# Ответ должен быть 200 OK
```

### 2. **Логины настроены?**
Откройте приложение → "Login with Tesla" → работает ли?

### 3. **API доступна?**
```bash
# После логина, в консоли браузера:
fetch('https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
}).then(r => r.json()).then(d => console.log(d))
```

### 4. **Сервер телеметрии работает?**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'docker-compose -C /home/ubuntu/TeslaApp/deploy/fleet-telemetry ps'
# Должно быть: State = Up
```

### 5. **Сертификаты установлены?**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/'
# Должны быть: fullchain.pem, privkey.pem
```

---

## 🚗 **КОГДА МАШИНА ПОДКЛЮЧИТСЯ**

1. **Телеметрия сервер получит мTLS соединение**
   ```
   Логи: "connection_established"
   ```

2. **Начнет получать данные**
   ```
   Логи: {"msg":"received_record","V":[{latitude,longitude,speed...}]}
   Метрики: fleet_telemetry_messages_received > 0
   ```

3. **Fleet API получит эти данные**
   ```
   API ответит: {latitude, longitude, speed, battery...}
   ```

4. **Ваше приложение отобразит**
   ```
   Dashboard: GPS, скорость, батарея, все 21 сигнал!
   ```

---

## 🎯 **БЫСТРАЯ ПРОВЕРКА ПРЯМО СЕЙЧАС**

```bash
# Проверка 1: Сервер работает
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo ss -tulpn | grep 443'
# ✅ должно быть: LISTEN on port 443

# Проверка 2: Контейнер запущен
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'docker ps | grep fleet'
# ✅ должно быть: fleet-telemetry Up

# Проверка 3: Логи работают
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   docker-compose logs --tail=1'
# ✅ должны быть свежие логи
```

---

## 📞 **ЕСЛИ ДАННЫЕ НЕ ИДЯТ**

Вероятные проблемы:

| Проблема | Признаки | Решение |
|----------|----------|---------|
| Машина не подключилась | Логи: "client didn't provide cert" | Включите машину, проверьте интернет |
| Токен истек | 401 Unauthorized в API | Перелогиньтесь в приложении |
| CORS ошибка | Network tab: CORS error | Проверьте NEXT_PUBLIC переменные |
| Сертификат не валиден | "certificate verification failed" | Проверьте сертификаты на сервере |
| API не доступна | "Connection refused" | Проверьте DNS, firewall |

---

**СТАТУС:** 🟢 **Приложение и сервер подготовлены, ждут машину!**

Включайте машину и смотрите логи! 🚗⚡

