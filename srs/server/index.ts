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

// minimal in-memory store for messages
const messages = new Map<string, { text?: string; fromUserId?: string; fromUserName?: string; channel?: string; ts?: string; read?: boolean }>();

// Listen for dm_received and persist + notify
events.on('dm_received', (p: any) => {
  const id = p.messageId || String(Date.now());
  messages.set(id, { text: p.text, fromUserId: p.fromUserId, fromUserName: p.fromUserName, channel: p.channel, ts: p.messageId, read: false });
  log.info('DM received stored id=', id, p);
});

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
const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackClient = new SlackSocketModeClient(slackAppToken, slackBotToken);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

export default { app, slackClient, events };
