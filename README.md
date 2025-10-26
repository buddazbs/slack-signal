# 🔔 Slack Signal

Интеграция Slack с ESP устройством через WebSocket для мгновенных уведомлений о личных сообщениях.

## 📱 Возможности

- ✨ Мгновенное получение личных сообщений (DM) из Slack
- 👤 Автоматическое определение имени отправителя
- 📡 Передача уведомлений на ESP устройство через WebSocket
- 💾 Локальное хранение истории сообщений
- 📖 Отметка о прочтении сообщений в Slack

## 🛠 Технический стек

- **Backend**: Node.js + TypeScript
- **Фреймворк**: Express.js
- **Slack API**: 
  - Socket Mode для событий в реальном времени
  - Web API для работы с пользователями
- **WebSocket**: ws для коммуникации с ESP
- **Тесты**: Mocha + Chai

## 🚀 Быстрый старт

### Предварительные требования

- Node.js 18+ (рекомендуется)
- npm
- Slack App с настроенными правами

### Установка

1. Клонируйте репозиторий:
```bash
git clone [url-репозитория]
cd slack-signal
```

2. Установите зависимости:
```bash
npm install
```

3. Скопируйте пример конфигурации:
```bash
cp .env.example .env
```

4. Настройте переменные окружения в `.env`:
```properties
SLACK_APP_TOKEN=xapp-your-token-here
SLACK_BOT_TOKEN=xoxb-your-token-here # Bot token с правами на отправку сообщений
SLACK_USER_TOKEN=xoxp-your-user-token-here  # User token с правами на чтение DM
PORT=3000
ESP_WS_PORT=8081
MESSAGE_RETENTION_MS=300000  # Время хранения сообщений в миллисекундах
```

### Запуск

#### Режим разработки
```bash
npm run dev
```

#### Режим разработки с автоперезагрузкой
```bash
npm run dev:watch
```

#### Сборка и запуск
```bash
npm run build
npm start
```

## 📡 WebSocket API

### Формат сообщений

#### Получение нового DM
```json
{
  "type": "dm_received",
  "messageId": "1234.5678",
  "fromUserId": "U123ABC",
  "fromUserName": "John Doe",
  "text": "Привет!"
}
```

#### Отметка о прочтении
```json
{
  "type": "dm_read",
  "messageId": "1234.5678"
}
```

## 🔧 API Endpoints

### GET /messages
Получение списка всех сообщений

### POST /mock-event
Эмуляция события из Slack (для разработки)

### POST /mark-read
Отметка сообщения как прочитанного

## 🛡️ Настройка Slack App

1. Создайте новое приложение на [api.slack.com](https://api.slack.com/apps)
2. Включите Socket Mode
3. Добавьте подписки на события:
   - `message.im` (личные сообщения)
4. Добавьте следующие OAuth Scopes:
   - User Token Scopes:
     - `im:history` (чтение личных сообщений)
     - `im:read` (доступ к каналам личных сообщений)
     - `users:read` (информация о пользователях)
   - Bot Token Scopes:
     - `chat:write` (отправка сообщений)
     - `im:write` (создание и работа с личными сообщениями)

## 🔌 Подключение ESP

1. Подключитесь к WebSocket серверу:
   ```cpp
   ws://your-server:8081
   ```
2. Слушайте входящие JSON сообщения
3. Реагируйте на события типа `dm_received`

## 📦 Структура проекта

```
slack-signal/
├── srs/
│   ├── clients/      # Клиенты для внешних сервисов
│   ├── core/         # Ядро приложения
│   ├── senders/      # Отправители сообщений
│   └── server/       # HTTP и WebSocket серверы
├── test/             # Тесты
├── scripts/          # Вспомогательные скрипты
└── ...
```

## 🧪 Тестирование

### Запуск тестов
```bash
npm test
```

### Тестовый WebSocket клиент
```bash
node scripts/ws-test.js
```

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -am 'Add amazing feature'`)
4. Отправьте изменения в форк (`git push origin feature/amazing-feature`)
5. Создайте Pull Request

## 📝 TODO

- [ ] Персистентное хранение сообщений (SQLite/Redis)
- [ ] Поддержка групповых сообщений
- [ ] Веб-интерфейс для управления
- [ ] Расширенная обработка ошибок
- [ ] Метрики и мониторинг
- [ ] Docker контейнеризация

## 📄 Лицензия

MIT
  