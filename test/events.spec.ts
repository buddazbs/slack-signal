import { strict as assert } from 'assert';
import events from '../srs/core/events';
import espSender from '../srs/senders/espSender';

describe('Events -> ESP sender', () => {
  it('espSender receives dm_received events and broadcast is called', (done) => {
    // monkeypatch broadcast
    const orig = (espSender as any).broadcast;
    (espSender as any).broadcast = function (payload: any) {
      try {
        assert.equal(payload.type, 'dm_received');
        assert.equal(payload.fromUserId, 'U1');
        done();
      } catch (e) {
        done(e as Error);
      } finally {
        (espSender as any).broadcast = orig;
      }
    };

    events.emit('dm_received', { fromUserId: 'U1', text: 'hi', messageId: 'm1' });
  });
});
