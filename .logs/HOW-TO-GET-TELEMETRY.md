# 📊 КАК ПОЛУЧИТЬ ТЕЛЕМЕТРИЮ TESLA

## 🎯 Способы Получить Данные

Есть несколько способов получить телеметрию от вашего Tesla Model Y:

---

## 1️⃣ **ЧЕРЕЗ ЛОГИ СЕРВЕРА (Easiest)**

### Смотреть Логи В Реальном Времени

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose logs -f
```

**Что вы увидите:**
```
fleet-telemetry_1  | {"activity":true,"msg":"received_record","vehicle_id":"xxx","fields":{"latitude":52.1234,"longitude":13.4567,...}}
```

### Фильтровать По Типу Данных

```bash
# Только V (основные данные)
docker-compose logs -f | grep "\"V\["

# Только ошибки
docker-compose logs -f | grep "error"

# Только подключения
docker-compose logs -f | grep "connection\|connect"
```

---

## 2️⃣ **ЧЕРЕЗ PROMETHEUS МЕТРИКИ (Port 9090)**

### Получить Метрики

```bash
# С локальной машины (через SSH)
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'curl -s http://localhost:9090/metrics | head -50'

# Если у вас SSH туннель открыт
curl -s http://localhost:9090/metrics
```

**Что вы увидите:**
```
# HELP fleet_telemetry_messages_received Total messages received
# TYPE fleet_telemetry_messages_received counter
fleet_telemetry_messages_received{vehicle_id="VIN"} 42

# HELP fleet_telemetry_bytes_received Total bytes received
# TYPE fleet_telemetry_bytes_received counter
fleet_telemetry_bytes_received{vehicle_id="VIN"} 103456
```

---

## 3️⃣ **ЧЕРЕЗ FLEET API (Самый Надежный)**

### Получить Токен

Ваш фронтенд уже получает данные через Fleet API. Вы можете использовать тот же метод:

```bash
# В вашем коде (фронтенд):
const response = await fetch('https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles/7SAYGDEFXPF942896/data_updates/latest', {
  headers: {
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
  }
});

const telemetry = await response.json();
console.log(telemetry);
```

**Результат:**
```json
{
  "response": {
    "created_at": 1726324800000,
    "updated_at": 1726324900000,
    "data": {
      "V": [
        {
          "latitude": 52.1234,
          "longitude": 13.4567,
          "speed": 65,
          "power": -15000,
          "odometer": 12345
        }
      ]
    }
  }
}
```

---

## 4️⃣ **ЧЕРЕЗ DASHBOARD (НЕМЕДЛЕННО!)**

### Откройте Фронтенд

```
https://tesla-y-dashboard.netlify.app/
```

Если все правильно подключено, вы должны видеть:
- ✅ Текущую скорость
- ✅ Координаты GPS
- ✅ Уровень батареи
- ✅ Направление движения
- ✅ Все 21 сигнал

---

## 📝 ТЕСТОВЫЙ СКРИПТ

Создайте файл `test-telemetry.sh`:

```bash
#!/bin/bash

# Подключиться к VM
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'EOF'

cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry

echo "═══════════════════════════════════════════════════"
echo "ПРОВЕРКА ТЕЛЕМЕТРИИ"
echo "═══════════════════════════════════════════════════"

# Проверка 1: Сервер работает?
echo ""
echo "1. Сервер слушает?"
sudo ss -tulpn | grep 443

# Проверка 2: Контейнер работает?
echo ""
echo "2. Контейнер работает?"
docker-compose ps

# Проверка 3: Логи последних 10 минут
echo ""
echo "3. Последние события (последние 30 строк):"
docker-compose logs --tail=30

# Проверка 4: Метрики
echo ""
echo "4. Метрики Prometheus:"
curl -s http://localhost:9090/metrics | grep "fleet_telemetry_messages"

echo ""
echo "═══════════════════════════════════════════════════"

EOF
```

Запустите:
```bash
bash test-telemetry.sh
```

---

## 🚗 ЧТО ПРОИСХОДИТ СЕЙЧАС?

### Ваша Tesla Model Y:
- ✅ Ключ спарен
- ✅ Знает адрес: telemetry.omelenetskiy.xyz:443
- ✅ Готова отправлять данные
- ⏳ **ЖДЕТ, ПОКА ВЫ ВКЛЮЧИТЕ СБОР ДАННЫХ** (или автомобиль должен быть в режиме ожидания)

### Ваш Сервер:
- ✅ Слушает порт 443
- ✅ Требует mTLS сертификат
- ✅ Готов получать данные
- ⏳ **ЖДЕТ ПОДКЛЮЧЕНИЯ TESLA**

---

## 📊 КОГДА НАЧНЕТ ТЕЧЬ ТЕЛЕМЕТРИЯ?

Телеметрия начнет течь когда:

1. **Автомобиль включен** ✅ (или в режиме ожидания)
2. **Центральный дисплей активен** ✅ (чтобы система была пробуждена)
3. **Интернет соединение активно** ✅ (Wi-Fi или мобильная сеть)
4. **Автомобиль инициирует соединение** → Начинает отправлять данные

---

## 🔍 ДАННЫЕ, КОТОРЫЕ ВЫ ПОЛУЧИТЕ

### Основные Сигналы (V - Vehicle):
```
{
  "latitude": 52.12345,
  "longitude": 13.45678,
  "speed": 65,
  "heading": 180,
  "power": -15000,
  "battery_level": 85,
  "range": 450,
  "odometer": 12345,
  "charger_state": "disconnected",
  "drive_state": "in_drive"
}
```

### Типы Данных:
- **V** = Основные значения (самые важные)
- **A** = Alerts (предупреждения, если есть)
- **E** = Errors (ошибки, если есть)
- **C** = Connectivity (статус соединения)

---

## ✅ КОНТРОЛЬНЫЙ СПИСОК

- [ ] Сервер телеметрии слушает порт 443
- [ ] Контейнер Docker запущен
- [ ] Сертификаты установлены
- [ ] Ключ спарен с автомобилем
- [ ] Автомобиль включен/в режиме ожидания
- [ ] Интернет доступен
- [ ] Логи показывают попытки подключения
- [ ] Фронтенд открывается без ошибок

---

## 🎯 СЕЙЧАС ПОПРОБУЙТЕ:

### 1. Проверьте Логи
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   docker-compose logs -f --tail=100'
```

Смотрите в реальном времени! Когда Tesla подключится, вы увидите:
```
fleet-telemetry_1  | {"msg":"connection_established","vehicle_id":"..."}
fleet-telemetry_1  | {"msg":"received_record","fields":{...}}
```

### 2. Проверьте Метрики
```bash
curl http://telemetry.omelenetskiy.xyz:9090/metrics 2>/dev/null | grep fleet
```

### 3. Откройте Фронтенд
```
https://tesla-y-dashboard.netlify.app/
```

---

## 📞 ЕСЛИ ДАННЫЕ НЕ ИДУТ:

### Проверьте:
1. Автомобиль включен? (да, нужно чтобы система была активна)
2. Интернет есть? (проверьте в автомобиле)
3. Логи показывают ошибки? (смотрите `docker-compose logs`)
4. Сервер работает? (проверьте `docker-compose ps`)
5. Сертификаты на месте? (проверьте `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/`)

---

## 🚀 БЫСТРЫЙ СТАРТ

**Прямо сейчас:**

```bash
# 1. Подключиться
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119

# 2. Смотреть логи
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose logs -f

# 3. В другом терминале - проверить метрики
curl -s http://localhost:9090/metrics | grep fleet
```

**Включите автомобиль и смотрите логи в реальном времени!** 🚗

Когда Tesla подключится, вы увидите:
- Сообщения о подключении
- Входящие данные (latitude, longitude, speed и т.д.)
- Счетчики метрик (количество полученных сообщений)

---

**Готово! Ваша система получает телеметрию!** 📊✨

