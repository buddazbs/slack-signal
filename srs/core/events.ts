import { EventEmitter } from 'events';

export type SlackDMEvent = {
  type: 'message';
  subtype?: string;
  user?: string; // user id
  text?: string;
  channel?: string;
  ts?: string;
};

class AppEvents extends EventEmitter {}

const events = new AppEvents();

export default events;
