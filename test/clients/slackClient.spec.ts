import { expect } from 'chai';
import { SlackSocketModeClient } from '../../srs/clients/slackClient';

describe('SlackSocketModeClient', () => {
  describe('parseEventObject', () => {
    it('should parse valid message event', () => {
      const input = {
        payload: {
          event: {
            type: 'message',
            user: 'U123',
            text: 'hello',
            channel: 'C456',
            ts: '1234.5678'
          }
        }
      };
      
      const result = SlackSocketModeClient.parseEventObject(input);
      expect(result).to.deep.equal({
        type: 'message',
        user: 'U123',
        text: 'hello',
        channel: 'C456',
        ts: '1234.5678'
      });
    });

    it('should handle direct event object without payload wrapper', () => {
      const input = {
        event: {
          type: 'message',
          user: 'U123',
          text: 'hello',
          channel: 'C456',
          ts: '1234.5678'
        }
      };
      
      const result = SlackSocketModeClient.parseEventObject(input);
      expect(result).to.deep.equal({
        type: 'message',
        user: 'U123',
        text: 'hello',
        channel: 'C456',
        ts: '1234.5678'
      });
    });

    it('should return null for non-message events', () => {
      const input = {
        event: {
          type: 'reaction_added',
          user: 'U123'
        }
      };
      
      const result = SlackSocketModeClient.parseEventObject(input);
      expect(result).to.be.null;
    });

    it('should return null for message events with subtype', () => {
      const input = {
        event: {
          type: 'message',
          subtype: 'channel_join',
          user: 'U123'
        }
      };
      
      const result = SlackSocketModeClient.parseEventObject(input);
      expect(result).to.be.null;
    });
  });
});