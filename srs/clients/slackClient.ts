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

/**
 * Creates a new SlackSocketModeClient instance.
 * @param {string} [appToken] - App-level token for Socket Mode (Events API)
 * @param {string} [botToken] - Bot token for Web API (resolving user names, marking messages read)
 */
  constructor(private appToken?: string, private botToken?: string) {
    if (this.appToken) {
      this.socketClient = new SocketModeClient({ appToken: this.appToken });
    }
    if (this.botToken) {
      this.web = new WebClient(this.botToken);
    }
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

    // Listen for Events API envelopes
    this.socketClient.on('events_api', async (args: any) => {
      try {
        const { body, ack } = args;
        await ack();
        const ev = SlackSocketModeClient.parseEventObject(body);
        if (!ev) return;

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
