# LIGHT KLD

Статический сайт для GitHub Pages. Изображения находятся в `light-kld/img` и публикуются вместе с сайтом.

## Публикация

Каждый push в ветку `main` запускает GitHub Actions и выкладывает папку `light-kld` в GitHub Pages.

## Форма

Форма работает на Netlify и передаёт заявку в Telegram-бот через функцию `netlify/functions/submit-lead.js`. Для работы добавьте в Netlify переменные окружения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.

## Локальный просмотр

Откройте `light-kld/index.html` в браузере или запустите любой статический HTTP-сервер из папки проекта.
