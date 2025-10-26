import WebSocket, { WebSocketServer } from 'ws';
import { log } from '../core/logger';
import events from '../core/events';

type Payload = {
  type: 'dm_received' | 'dm_read';
  messageId?: string;
  fromUserId?: string;
  fromUserName?: string;
  text?: string;
};

class EspSender {
  private wss?: WebSocketServer;
  private port: number;

  /**
   * Creates a new EspSender instance.
   * Note: does NOT start the network listener automatically — call start() to bind the port.
   * @param {number} [port=8081] - the port number to listen on for incoming ESP WebSocket connections
   */
  constructor(port = 8081) {
    this.port = port;
    // subscribe to app events (broadcast will be a no-op until start binds the server)
    events.on('dm_received', (payload) => this.broadcast({ type: 'dm_received', ...payload }));
    events.on('dm_read', (payload) => this.broadcast({ type: 'dm_read', ...payload }));
  }

  /**
   * Starts the WebSocket server and binds to the configured port.
   */
  start() {
    const port = this.port;
    log.info('Starting ESP WebSocket server on port', port);
    try {
      this.wss = new WebSocket.Server({ 
        port,
        host: '0.0.0.0'
});
      this.wss.on('connection', (ws: WebSocket) => {
        log.info('ESP client connected');
        ws.on('message', (m: WebSocket.RawData) => log.debug('esp message:', m.toString()));
      });
      log.info('ESP WebSocket server listening on ws://localhost:' + port);
    } catch (err) {
      log.error('Failed to start ESP WebSocket server', err);
      this.wss = undefined;
    }
  }

  /**
   * Sends a JSON payload to all connected ESP clients.
   * @param {Payload} payload - object with type: 'dm_received' | 'dm_read'
   * and optional messageId, fromUserId, fromUserName, text
   */
  broadcast(payload: Payload) {
    const data = JSON.stringify(payload);
    if (this.wss) {
      this.wss.clients.forEach((c: WebSocket) => {
        if (c.readyState === WebSocket.OPEN) c.send(data);
      });
    } else {
      log.debug('ESP broadcast skipped - server not started yet');
    }
    // also log for now
    log.info('ESP broadcast:', payload);
  }
}

export default EspSender;
