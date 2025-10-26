import events, { SlackDMEvent } from '../core/events';
import { log } from '../core/logger';
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';

/**
 * Slack client using official SDKs:
 * - SocketModeClient to receive Events API payloads over WebSocket (local development)
 * - WebClient to call Web API (resolve user names, mark messages read)
 */
export class SlackSocketModeClient {
  private socketClient?: SocketModeClient;
  private web?: WebClient;
  private recentEventIds?: Set<string>;

/**
 * Creates a new SlackSocketModeClient instance.
 * @param {string} [appToken] - App-level token for Socket Mode (Events API)
 * @param {string} [userToken] - User token for Web API (accessing DMs)
 * @param {string} [botToken] - Bot token for Web API (sending messages)
 */
  constructor(
    private appToken?: string,
    private userToken?: string,
    private botToken?: string
  ) {
    if (this.appToken) {
      this.socketClient = new SocketModeClient({ appToken: this.appToken });
    }
    if (this.userToken) {
      // Web client для чтения сообщений
      this.web = new WebClient(this.userToken);
    }
    if (this.botToken) {
      // Web client для отправки сообщений
      this.botWeb = new WebClient(this.botToken);
    }
  }

  private botWeb?: WebClient;

  // Helper: format incoming Slack websocket event into framed box string
  private formatEventBox(body: any): string {
    const ev = body?.event ?? body;
    const id = body?.envelope_id ?? body?.event_id ?? '';
    const type = ev?.type ?? '';
    const user = ev?.user ?? '';
    const text = (ev?.text ?? '').toString().replace(/\s+/g, ' ').trim();

    const headerLines = [
      `Событие: ${id}`,
      `Тип: ${type}`,
      `Пользователь: ${user}`,
      `Сообщение:`,
    ];
    const msgLines = text ? text.split('\n') : [''];
    const allLines = [...headerLines, ...msgLines];
    const width = Math.max(...allLines.map((l) => l.length));
    const pad = (s: string) => s + ' '.repeat(width - s.length);
    const top = '+' + '-'.repeat(width + 2) + '+';
    const middle = allLines.map((l) => `| ${pad(l)} |`).join('\n');
    return `\n${top}\n${middle}\n${top}`;
  }

/**
 * Starts the SocketModeClient, which begins listening for Events API envelopes
 * and parsing them into SlackDMEvent objects, which are then emitted as
 * 'dm_received' events.
 *
 * If the SLACK_APP_TOKEN environment variable is not set, this method will
 * return immediately without starting the SocketModeClient.
 *
 * Listens for 'events_api' events and attempts to resolve user names using
 * the WebClient if the SLACK_BOT_TOKEN environment variable is set.
 *
 * Errors are logged to the console.
 */
  async start() {
    if (!this.socketClient) {
      log.info('No SLACK_APP_TOKEN; socket mode disabled');
      return;
    }

    log.info('Starting Socket Mode client...');

    // compact multiline summary in Russian: Событие / Тип / Пользователь / Сообщение
    this.socketClient.on('message', (event: any) => {
      try {
        const body = event?.body ?? event;
        const out = this.formatEventBox(body);
        log.debug(out);
      } catch (e) {
        log.debug('Raw WebSocket message (fallback):', event);
      }
    });

    this.socketClient.on('connecting', () => {
      log.info('Connecting to Slack...');
    });

    this.socketClient.on('connected', () => {
      log.info('Connected to Slack successfully!');
    });

    this.socketClient.on('disconnecting', () => {
      log.warn('Disconnecting from Slack...');
    });

    this.socketClient.on('disconnect', () => {
      log.warn('Disconnected from Slack');
    });

    // Listen for Events API envelopes
    this.socketClient.on('events_api', async (args: any) => {
      try {
        const { body, ack } = args;

        // Acknowledge immediately to avoid Slack retries (keep processing async)
        try {
          await ack();
        } catch (ackErr) {
          log.warn('Failed to ack Slack event quickly', ackErr);
        }

        // Dedupe events by envelope/event id to avoid processing retries twice
        const evtId = body?.event_id ?? body?.envelope_id;
        if (evtId) {
          if (!this.recentEventIds) this.recentEventIds = new Set();
          if (this.recentEventIds.has(evtId)) {
            log.debug('Duplicate Slack event received, skipping:', evtId);
            return;
          }
          this.recentEventIds.add(evtId);
          // forget after 5 minutes
          setTimeout(() => this.recentEventIds?.delete(evtId), 5 * 60 * 1000);
        }

        log.debug('Received Slack event:', JSON.stringify(body, null, 2));
        const ev = SlackSocketModeClient.parseEventObject(body);
        if (!ev) {
          log.debug('Ignoring non-message event');
          return;
        }

        // Only handle plain message events (no subtype)
        const channel = ev.channel;
        const messageId = ev.ts;
        const fromUserId = ev.user;
        const text = ev.text;

        let fromUserName: string | undefined = undefined;
        if (fromUserId && this.web) {
          try {
            const info = await this.web.users.info({ user: fromUserId });
            if (info.ok && info.user) {
              // prefer display_name, fallback to real_name or name
              // @ts-ignore
              fromUserName = info.user.profile?.display_name || info.user.real_name || info.user.name;
            }
          } catch (e) {
            log.warn('users.info failed', e);
          }
        }

        events.emit('dm_received', { fromUserId, fromUserName, text, messageId, channel });
      } catch (err) {
        log.error('events_api handler error', err);
      }
    });

    this.socketClient.on('error', (err: Error) => log.error('SocketMode error', err));

    await this.socketClient.start();
    log.info('SocketMode client started');
  }

  // mark a message read in Slack (requires channel and ts)
  async markMessageRead(channel?: string, ts?: string) {
    if (!this.web) {
      log.warn('No bot token, cannot mark message read');
      return false;
    }
    if (!channel || !ts) {
      log.warn('markMessageRead missing channel or ts');
      return false;
    }
    try {
      const res = await this.web.conversations.mark({ channel, ts });
      // @ts-ignore
      return res.ok === true;
    } catch (e) {
      log.error('conversations.mark failed', e);
      return false;
    }
  }

  // Send a test message to yourself
  async sendTestMessage(text: string) {
    if (!this.web || !this.botWeb) {
      throw new Error('Both SLACK_USER_TOKEN and SLACK_BOT_TOKEN are required.');
    }

    try {
      // Get current user identity using user token
      const identity = await this.web.auth.test();
      if (!identity.ok || !identity.user_id) {
        throw new Error('Failed to get user identity');
      }

      // First try to open a direct message channel using user token
      const conversation = await this.web.conversations.open({
        users: identity.user_id
      });

      if (!conversation.ok || !conversation.channel || !conversation.channel.id) {
        throw new Error('Failed to open direct message channel');
      }

      // Send message to the DM channel using bot token
      const result = await this.botWeb.chat.postMessage({
        channel: conversation.channel.id,
        text: text
      });

      return result;
    } catch (error) {
      log.error('Send test message error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to send test message: ${message}`);
    }
  }

  // helper to parse events API envelope body -> SlackDMEvent | null
  static parseEventObject(obj: any): SlackDMEvent | null {
    const inner = obj.payload ?? obj;
    const event = inner.event ?? inner;
    if (event && event.type === 'message' && !event.subtype) {
      // ensure minimal shape
      return {
        type: 'message',
        user: event.user,
        text: event.text,
        channel: event.channel,
        ts: event.ts,
      } as SlackDMEvent;
    }
    return null;
  }
}

export default SlackSocketModeClient;
