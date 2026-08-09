const MAX_BODY_SIZE = 10_000;
// Keeps basic protection from automated spam without blocking normal retries
// or several requests from one office/network during a short period.
const MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const requestsByIp = new Map();

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function getClientIp(headers) {
  const forwarded = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    requestsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

function isSameOrigin(event) {
  const origin = event.headers.origin;
  const host = event.headers.host;

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

async function sendTelegramMessage(botToken, chatId, text) {
  // A short retry protects the form from one-off Telegram/network failures.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const telegramData = await telegramResponse.json().catch(() => null);

      if (telegramResponse.ok && telegramData?.ok) {
        return true;
      }

      console.error('Telegram request failed', telegramResponse.status);

      // Invalid credentials or access cannot be resolved by retrying.
      if (telegramResponse.status >= 400 && telegramResponse.status < 500 && telegramResponse.status !== 429) {
        return false;
      }
    } catch (error) {
      console.error('Telegram request failed', {
        code: error?.code || error?.cause?.code,
        message: error?.message,
      });
    }

    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' });
  }

  if (!isSameOrigin(event)) {
    return response(403, { error: 'Forbidden' });
  }

  const contentType = event.headers['content-type'] || '';
  if (!contentType.includes('application/json') || !event.body || event.body.length > MAX_BODY_SIZE) {
    return response(400, { error: 'Invalid request' });
  }

  const clientIp = getClientIp(event.headers);
  if (isRateLimited(clientIp)) {
    return response(429, { error: 'Too many requests' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return response(400, { error: 'Invalid request' });
  }

  // Hidden field catches automated submissions without exposing a CAPTCHA to real visitors.
  if (cleanText(payload.website, 200)) {
    return response(200, { ok: true });
  }

  const name = cleanText(payload.name, 100);
  const phone = cleanText(payload.phone, 50);
  const topic = cleanText(payload.topic, 100) || 'Не указано';
  const comment = cleanText(payload.comment, 1_000) || 'Нет';

  if (!name || !phone) {
    return response(400, { error: 'Name and phone are required' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Telegram environment variables are not configured');
    return response(500, { error: 'Service is not configured' });
  }

  const text = [
    '🔔 Новая заявка с сайта LIGHT KLD',
    '',
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    `Тема: ${topic}`,
    `Комментарий: ${comment}`,
  ].join('\n');

  if (!await sendTelegramMessage(botToken, chatId, text)) {
    return response(502, { error: 'Unable to send request' });
  }

  return response(200, { ok: true });
};
