// src/server/index.ts
import express from 'express';
import dotenv from 'dotenv';
import SlackSocketModeClient from '../clients/slackClient';
import events from '../core/events';
import EspSender from '../senders/espSender';
import { log } from '../core/logger';

dotenv.config();
const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT) || 3000;

// in-memory store
const messages = new Map<
  string,
  { text?: string; fromUserId?: string; fromUserName?: string; channel?: string; ts?: string; read?: boolean; createdAt?: number }
>();

/**
 * Shorten a given string if it exceeds a maximum length.
 * @param {string} [s] - The string to shorten.
 * @param {number} [max=200] - The maximum length of the string.
 * @returns {string} The shortened string.
 */
function shortText(s?: string, max = 200) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}


// Listen for dm_received and persist + notify
events.onDmReceived((p) => {
  const id = p.ts ?? p.envelopeId ?? String(Date.now());
  messages.set(id, {
    text: p.text,
    fromUserId: p.user,
    fromUserName: p.user,
    channel: p.channel,
    ts: p.ts,
    read: false,
    createdAt: Date.now(),
  });

  // Лог: новое непрочитанное сообщение
  log.info(
    `[UNREAD] id=${id} from=${p.user ?? '<unknown>'} channel=${p.channel ?? '<unknown>'} ts=${p.ts ?? '<no-ts>'} text="${shortText(p.text)}"`
  );

  // подробный дебаг (рамка)
  log.debug(`received payload detail:\n${JSON.stringify(p, null, 2)}`);
});

// Periodic cleanup
const MESSAGE_RETENTION_MS = Number(process.env.MESSAGE_RETENTION_MS) || 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of messages) {
    if (v.createdAt && now - v.createdAt > MESSAGE_RETENTION_MS) {
      messages.delete(k);
      removed++;
    }
  }
  if (removed > 0) log.info('Periodic cleanup removed messages:', removed);
}, MESSAGE_RETENTION_MS);

// Listen for dm_read to update local state and attempt to mark in Slack
events.onDmRead(async (p) => {
  // Находим и помечаем локально сообщения с тем же channel+ts
  let anyMatched = false;
  for (const [id, m] of messages) {
    if (m.channel === p.channel && m.ts === p.ts) {
      m.read = true;
      messages.set(id, m);
      anyMatched = true;

      // Лог: сообщение прочитано
      log.info(
        `[READ] id=${id} from=${m.fromUserName ?? m.fromUserId ?? '<unknown>'} channel=${m.channel} ts=${m.ts} text="${shortText(m.text)}"`
      );
    }
  }

  if (!anyMatched) {
    // если локально ничего не найдено — всё равно логируем приход события прочтения
    log.info(`[READ] No local match for channel=${p.channel} ts=${p.ts} (received envelopeId=${p.envelopeId ?? '<na>'})`);
  }

  // Если мы инициировали локальное действие (например, через /mark-read), то markMessageRead
  // вызывается из endpoint /mark-read (см. ниже), поэтому здесь не делаем дополнительного вызова;
  // но если нужно — можно установить флаг и вызывать slackClient.markMessageRead.
});

// Start Slack client
const slackAppToken = process.env.SLACK_APP_TOKEN;
const slackUserToken = process.env.SLACK_USER_TOKEN;
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackClient = new SlackSocketModeClient(slackAppToken, slackUserToken, slackBotToken);
slackClient.start().catch((e) => log.warn('slackClient.start error', e));

// Start ESP sender
const espPort = Number(process.env.ESP_WS_PORT || 8081);
const esp = new EspSender(espPort);
esp.start();

// Public endpoints
app.get('/', (req, res) => res.send('Slack Signal MVP'));

// simulate incoming slack event (local dev)
app.post('/mock-event', (req, res) => {
  const obj = req.body;
  const ev = SlackSocketModeClient.parseEventObject(obj);
  if (!ev) return res.status(400).json({ ok: false, reason: 'not a message event' });

  if (ev.type === 'message') {
    events.emitDmReceived({
      type: 'message',
      user: ev.user,
      text: ev.text,
      channel: ev.channel,
      ts: ev.ts,
      envelopeId: (ev as any).envelopeId,
    });
  } else if (ev.type === 'im_marked') {
    events.emitDmRead({
      type: 'im_marked',
      channel: (ev as any).channel,
      ts: (ev as any).ts,
      envelopeId: (ev as any).envelopeId,
    });
  }

  return res.json({ ok: true });
});

// mark a message read (manual action)
app.post('/mark-read', async (req, res) => {
  const { messageId } = req.body;
  if (!messageId || !messages.has(messageId)) return res.status(400).json({ ok: false, reason: 'missing messageId' });
  const m = messages.get(messageId)!;

  try {
    const ok = await slackClient.markMessageRead(m.channel, m.ts);
    if (ok) {
      m.read = true;
      messages.set(messageId, m);
      // also notify ESP devices
      events.emitDmRead({ type: 'im_marked', channel: m.channel, ts: m.ts, envelopeId: messageId });
      return res.json({ ok: true });
    } else {
      return res.status(500).json({ ok: false, reason: 'slack mark failed' });
    }
  } catch (err) {
    log.error('Failed to mark message read', err);
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

app.get('/messages', (req, res) => {
  const out: Record<string, any> = {};
  messages.forEach((v, k) => (out[k] = v));
  res.json(out);
});

app.post('/test-message', async (req, res) => {
  const { text = 'Тестовое сообщение' } = req.body;
  try {
    const result = await slackClient.sendTestMessage(text);
    res.json({ ok: true, message: 'Test message sent', result });
  } catch (error) {
    log.error('Test message error:', (error as Error).message);
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  log.info(`Server running at http://0.0.0.0:${PORT}`);
});

export default { app, slackClient, events };
