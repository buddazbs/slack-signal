// src/core/events.ts
import { EventEmitter } from 'events';

/**
 * Slack DM event (new message)
 */
export type SlackDMEvent = {
  type: 'message';
  subtype?: string;
  user?: string;       // user id or resolved display name
  text?: string;
  channel?: string;    // Dxxxxx
  ts?: string;
  envelopeId?: string;
  receivedAt?: string;
};

/**
 * Slack read cursor event (im_marked / channel_marked)
 */
export type SlackReadEvent = {
  type: 'im_marked';
  channel?: string;
  ts?: string;
  envelopeId?: string;
  receivedAt?: string;
};

/**
 * Typed EventEmitter wrapper:
 * - сохраняет все методы EventEmitter (setMaxListeners, listenerCount и т.д.)
 * - добавляет типизированные wrapper'ы для emit/on конкретных событий
 */
export class TypedAppEvents extends EventEmitter {
  constructor() {
    super();
    // защита от утечек слушателей
    this.setMaxListeners(50);

    // логируем рост слушателей (если нужно)
    this.on('newListener', (name: string | symbol) => {
      const count = this.listenerCount(name as string);
      if (count > 40) {
        // eslint-disable-next-line no-console
        console.warn(`[events] high listener count for ${String(name)}: ${count}`);
      }
    });
  }

  // emit + helpers
  public emitDmReceived(payload: SlackDMEvent): boolean {
    if (!payload.receivedAt) payload.receivedAt = new Date().toISOString();
    return this.emit('dm_received', payload);
  }

  public emitDmRead(payload: SlackReadEvent): boolean {
    if (!payload.receivedAt) payload.receivedAt = new Date().toISOString();
    return this.emit('dm_read', payload);
  }

  // typed subscription helpers (preferred usage)
  public onDmReceived(cb: (p: SlackDMEvent) => void): this {
    return this.on('dm_received', cb);
  }

  public onceDmReceived(cb: (p: SlackDMEvent) => void): this {
    return this.once('dm_received', cb);
  }

  public onDmRead(cb: (p: SlackReadEvent) => void): this {
    return this.on('dm_read', cb);
  }

  public onceDmRead(cb: (p: SlackReadEvent) => void): this {
    return this.once('dm_read', cb);
  }

  // Для backward-compatibility: если где-то в проекте уже используется
  // events.on('dm_received', ...) — это всё ещё работает, поскольку наследуем EventEmitter.
}

const events = new TypedAppEvents();
export default events;
