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

// minimal in-memory store for messages (includes createdAt for cleanup)
const messages = new Map<string, { text?: string; fromUserId?: string; fromUserName?: string; channel?: string; ts?: string; read?: boolean; createdAt?: number }>();

// Listen for dm_received and persist + notify
events.on('dm_received', (p: any) => {
  const id = p.messageId || String(Date.now());
  messages.set(id, { text: p.text, fromUserId: p.fromUserId, fromUserName: p.fromUserName, channel: p.channel, ts: p.messageId, read: false, createdAt: Date.now() });
  log.info('DM received stored id=', id, p);
});

// Periodic cleanup: remove messages older than MESSAGE_RETENTION_MS (default 5 minutes)
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

// Listen for dm_read to update local state
events.on('dm_read', async (p: any) => {
  if (p.messageId && messages.has(p.messageId)) {
    const m = messages.get(p.messageId)!;
    m.read = true;
    messages.set(p.messageId, m);
    log.info('DM marked read:', p.messageId);

    // attempt to mark read in Slack if we have channel/ts
    try {
      if (m.channel && m.ts) {
        const ok = await slackClient.markMessageRead(m.channel, m.ts);
        log.info('Slack markMessageRead result:', ok);
      }
    } catch (e) {
      log.warn('Failed to mark message read in Slack', e);
    }
  }
});

// Start Slack client (Socket Mode) if tokens present
const slackAppToken = process.env.SLACK_APP_TOKEN;
const slackUserToken = process.env.SLACK_USER_TOKEN;
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackClient = new SlackSocketModeClient(slackAppToken, slackUserToken, slackBotToken);
slackClient.start().catch((e) => log.warn('slackClient.start error', e));

// Start ESP sender explicitly (was previously started as an import side-effect)
const espPort = Number(process.env.ESP_WS_PORT || 8081);
const esp = new EspSender(espPort);
esp.start();

// Public endpoints for local dev / testing
app.get('/', (req, res) => res.send('Slack Signal MVP'));

// simulate incoming slack event (local development)
app.post('/mock-event', (req, res) => {
  const obj = req.body;
  const ev = SlackSocketModeClient.parseEventObject(obj);
  if (!ev) return res.status(400).json({ ok: false, reason: 'not a message event' });
  events.emit('dm_received', { fromUserId: ev.user, text: ev.text, messageId: ev.ts });
  return res.json({ ok: true });
});

// mark a message read (local action) - emits dm_read and would call Slack API in full impl
app.post('/mark-read', (req, res) => {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ ok: false, reason: 'missing messageId' });
  events.emit('dm_read', { messageId });
  return res.json({ ok: true });
});

app.get('/messages', (req, res) => {
  const out: Record<string, any> = {};
  messages.forEach((v, k) => (out[k] = v));
  res.json(out);
});

// Endpoint для отправки тестового сообщения самому себе
app.post('/test-message', async (req, res) => {
  const { text = 'Тестовое сообщение' } = req.body;
  
  try {
    const result = await slackClient.sendTestMessage(text);
    res.json({ 
      ok: true, 
      message: 'Test message sent',
      result 
    });
  } catch (error) {
    if (error instanceof Error) {
      log.error('Test message error:', error.message);
      res.status(500).json({ 
        ok: false, 
        error: error.message 
      });
    } else {
      log.error('Test message error:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'Unknown error' 
      });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

export default { app, slackClient, events };
