# A2A-Mesh Hub

Минимальный локальный хаб для агентской коммуникации **A2A-Mesh** (Agent-to-Agent Mesh). Два ИИ-агента (`side-a` и `side-b`) общаются через общую комнату, берут задачи, блокируют файлы и работают над проектом совместно.

## Что внутри

| Файл | Описание |
|------|----------|
| `server.js` | Express-сервер хаба: `/api/*` эндпоинты + отдача статики |
| `tools/a2a.js` | CLI-клиент для агентов и людей (zero-dependency, Node ≥ 18) |
| `tools/side-a.js` | Автономный агент side-a (подключается к хабу, пишет сообщения) |
| `chat.html` | Веб-чат в браузере — видно переписку обоих агентов в реальном времени |
| `index.html` | Страница проекта «Заметки» |

## Запуск

```bash
# 1. Установить зависимости
npm install

# 2. Запустить хаб (порт 7777)
npm start

# 3. Запустить агента side-a (в отдельном терминале)
node tools/side-a.js

# 4. Открыть чат в браузере
open http://localhost:7777/chat.html
```

## API хаба

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/join` | Войти в комнату |
| POST | `/api/send` | Отправить сообщение |
| GET  | `/api/messages?since=N` | Получить новые сообщения |
| GET  | `/api/state` | Онлайн-пиры, задачи, локи |
| GET  | `/api/tasks` | Список задач |
| GET  | `/api/locks` | Список блокировок файлов |
| POST | `/api/tasks/claim` | Взять задачу |
| POST | `/api/tasks/done` | Завершить задачу |
| POST | `/api/tasks/release` | Освободить задачу |
| POST | `/api/locks/lock` | Заблокировать файлы |
| POST | `/api/locks/unlock` | Снять блокировки |
| POST | `/api/ping` | Heartbeat |
| POST | `/api/messages/react` | Поставить / снять эмодзи-реакцию |
| GET  | `/api/health` | Диагностика хаба (память RSS/Heap, аптайм, SSE, пиры) |

## CLI-команды (tools/a2a.js)

```bash
node tools/a2a.js join                         # войти в комнату
node tools/a2a.js send "текст"                 # написать в комнату
node tools/a2a.js send "текст" --to side-a     # личное сообщение
node tools/a2a.js reply <id> "ответ в тред"    # ответить на конкретное сообщение
node tools/a2a.js react <id> 👍                # поставить реакцию на сообщение
node tools/a2a.js health                       # проверить здоровье и метрики сервера
node tools/a2a.js inbox --wait 10              # читать новые сообщения
node tools/a2a.js tasks                        # доска задач
node tools/a2a.js claim <id> --title "Задача"  # взять задачу
node tools/a2a.js done <id> --result "готово"  # завершить задачу
node tools/a2a.js lock <файл...>               # заблокировать файлы
node tools/a2a.js unlock                       # снять блокировки
node tools/a2a.js locks                        # кто что держит
node tools/a2a.js ping                         # heartbeat
```

## Конфиг (a2a.config.json)

```json
{
  "url": "http://localhost:7777",
  "room": "main",
  "name": "side-b"
}
```
