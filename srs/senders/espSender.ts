// src/senders/espSender.ts
import WebSocket, { WebSocketServer } from 'ws';
import { log } from '../core/logger';
import events, { SlackDMEvent, SlackReadEvent } from '../core/events';

type Payload = {
  type: 'dm_received' | 'dm_read';
  messageId?: string;
  fromUserId?: string;
  fromUserName?: string;
  text?: string;
  channel?: string;
  ts?: string;
};

class EspSender {
  private wss?: WebSocketServer;
  private port: number;

  constructor(port = 8081) {
    this.port = port;

    // subscribe to app events
    events.onDmReceived((p: SlackDMEvent) =>
      this.broadcast({
        type: 'dm_received',
        messageId: p.ts,
        fromUserId: p.user,
        fromUserName: p.user,
        text: p.text,
        channel: p.channel,
        ts: p.ts,
      })
    );

    events.onDmRead((p: SlackReadEvent) =>
      this.broadcast({
        type: 'dm_read',
        messageId: p.ts,
        channel: p.channel,
        ts: p.ts,
      })
    );
  }

  public start() {
    const port = this.port;
    log.info('Starting ESP WebSocket server on port', port);
    try {
      this.wss = new WebSocket.Server({ port, host: '0.0.0.0' });
      this.wss.on('connection', (ws: WebSocket) => {
        log.info('ESP client connected');
        ws.on('message', (m: WebSocket.RawData) => log.debug('esp message:', m.toString()));

        ws.on('close', () => log.info('ESP client disconnected'));
      });
      log.info('ESP WebSocket server listening on ws://0.0.0.0:' + port);
    } catch (err) {
      log.error('Failed to start ESP WebSocket server', err);
      this.wss = undefined;
    }
  }

  public broadcast(payload: Payload) {
    const data = JSON.stringify(payload);
    if (!this.wss) {
      log.debug('ESP broadcast skipped - server not started');
      return;
    }
    this.wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(data);
    });
    log.info('ESP broadcast:', payload);
  }

  public stop() {
    try {
      this.wss?.close();
    } catch (err) {
      log.warn('Failed to close ESP WebSocket server', err);
    }
  }
}

export default EspSender;
