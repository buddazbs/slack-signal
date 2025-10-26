// src/clients/slackClient.ts
import events, { SlackDMEvent, SlackReadEvent } from '../core/events';
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { formatEventBox } from '../utils/formatEventBox';
import { log } from '../core/logger';

type Envelope = any;

export class SlackSocketModeClient {
  private socketClient?: SocketModeClient;
  private userWeb?: WebClient;
  private botWeb?: WebClient;
  private recentEventIds = new Map<string, number>();
  private readonly DEDUPE_TTL_MS = 5 * 60 * 1000;
  private pruneInterval?: NodeJS.Timeout;

  constructor(private appToken?: string, private userToken?: string, private botToken?: string) {
    if (appToken) this.socketClient = new SocketModeClient({ appToken });
    if (userToken) this.userWeb = new WebClient(userToken);
    if (botToken) this.botWeb = new WebClient(botToken);
  }

  private isDuplicate(evtId?: string): boolean {
    if (!evtId) return false;
    const now = Date.now();
    // prune
    for (const [k, ts] of this.recentEventIds) {
      if (now - ts > this.DEDUPE_TTL_MS) this.recentEventIds.delete(k);
    }
    if (this.recentEventIds.has(evtId)) return true;
    this.recentEventIds.set(evtId, now);
    return false;
  }

  private ensurePrune() {
    if (this.pruneInterval) return;
    this.pruneInterval = setInterval(() => {
      const now = Date.now();
      for (const [k, ts] of this.recentEventIds) {
        if (now - ts > this.DEDUPE_TTL_MS) this.recentEventIds.delete(k);
      }
    }, this.DEDUPE_TTL_MS);
  }

  public async start() {
    if (!this.socketClient) {
      log.info('SocketMode disabled: no SLACK_APP_TOKEN');
      return;
    }
    this.ensurePrune();

    this.socketClient.on('message', (evt: any) => {
      try {
        const body = evt?.body ?? evt;
        log.debug(formatEventBox(body));
      } catch {
        log.debug('Raw socket message fallback', evt);
      }
    });

    this.socketClient.on('connecting', () => log.info('Slack SocketMode connecting...'));
    this.socketClient.on('connected', () => log.info('Slack SocketMode connected'));
    this.socketClient.on('disconnecting', () => log.warn('Slack SocketMode disconnecting'));
    this.socketClient.on('disconnect', () => log.warn('Slack SocketMode disconnected'));
    this.socketClient.on('error', (e: Error) => log.error('SocketMode error', e));

    this.socketClient.on('events_api', async (args: any) => {
      const { body, ack } = args as { body: Envelope; ack: () => Promise<void> };

      // ack ASAP
      try {
        await ack();
      } catch (ackErr) {
        log.warn('Failed to ack envelope quickly', ackErr);
      }

      const envelopeId = body?.envelope_id ?? body?.event_id;
      if (this.isDuplicate(envelopeId)) {
        log.debug('Duplicate envelope, skipping', envelopeId);
        return;
      }

      const ev = body?.payload ?? body;
      const event = ev?.event ?? ev;
      if (!event || !event.type) {
        log.debug('Unknown envelope shape', body);
        return;
      }

      try {
        if (event.type === 'message') {
          // ignore messages with subtype (edits, bots, etc.) unless explicitly wanted
          if (event.subtype) {
            log.debug('Ignoring message with subtype', event.subtype);
            return;
          }
          const payload: SlackDMEvent = {
            type: 'message',
            user: event.user,
            text: event.text,
            channel: event.channel,
            ts: event.ts,
            envelopeId,
          };

          // optionally resolve user name
          if (payload.user && this.userWeb) {
            try {
              const info = await this.userWeb.users.info({ user: payload.user });
              // @ts-ignore
              payload.user = info?.user?.profile?.display_name || info?.user?.real_name || payload.user;
            } catch (e) {
              log.warn('users.info failed', e);
            }
          }

          events.emitDmReceived(payload);
          return;
        }

        if (event.type === 'im_marked' || event.type === 'channel_marked') {
          const payload: SlackReadEvent = {
            type: 'im_marked',
            channel: event.channel,
            ts: event.ts,
            envelopeId,
          };
          events.emitDmRead(payload);
          return;
        }

        log.debug('Unhandled Slack event type', event.type);
      } catch (err) {
        log.error('Error processing Slack event', err);
      }
    });

    await this.socketClient.start();
    log.info('SocketMode client started');
  }

  public async markMessageRead(channel?: string, ts?: string): Promise<boolean> {
    const client = this.botWeb ?? this.userWeb;
    if (!client) {
      log.warn('No web client available for conversations.mark');
      return false;
    }
    if (!channel || !ts) {
      log.warn('markMessageRead missing channel or ts');
      return false;
    }
    try {
      const res = await client.conversations.mark({ channel, ts });
      // @ts-ignore
      return res?.ok === true;
    } catch (err: any) {
      log.error('conversations.mark failed', err);
      return false;
    }
  }

  public async sendTestMessage(text: string, targetUserId?: string) {
    if (!this.botWeb && !this.userWeb) throw new Error('No web client available');

    try {
      let userId = targetUserId;
      if (!userId && this.userWeb) {
        const auth = await this.userWeb.auth.test();
        userId = auth.user_id;
      }
      if (!userId) throw new Error('No user id available');

      const opener = this.botWeb ?? this.userWeb!;
      const conv = await opener.conversations.open({ users: userId });
      if (!conv?.ok || !conv?.channel?.id) throw new Error('Failed to open conversation');

      const poster = this.botWeb ?? this.userWeb!;
      const result = await poster.chat.postMessage({ channel: conv.channel.id, text });
      return result;
    } catch (err) {
      log.error('sendTestMessage failed', err);
      throw err;
    }
  }

  public async stop() {
    try {
      await this.socketClient?.disconnect?.();
    } finally {
      if (this.pruneInterval) clearInterval(this.pruneInterval);
    }
  }

  public static parseEventObject(obj: any): SlackDMEvent | SlackReadEvent | null {
    const inner = obj.payload ?? obj;
    const event = inner.event ?? inner;
    if (!event || !event.type) return null;
    const envelopeId = inner?.envelope_id ?? inner?.event_id;

    if (event.type === 'message' && !event.subtype) {
      return {
        type: 'message',
        user: event.user,
        text: event.text,
        channel: event.channel,
        ts: event.ts,
        envelopeId,
      } as SlackDMEvent;
    }
    if (event.type === 'im_marked' || event.type === 'channel_marked') {
      return {
        type: 'im_marked',
        channel: event.channel,
        ts: event.ts,
        envelopeId,
      } as SlackReadEvent;
    }
    return null;
  }
}

export default SlackSocketModeClient;
