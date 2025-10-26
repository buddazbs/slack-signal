import { strict as assert } from 'assert';
import SlackClient from '../srs/clients/slackClient';

describe('SlackSocketModeClient.parseEventObject', () => {
  it('parses socket mode envelope', () => {
    const envelope = {
      envelope_id: 'e1',
      payload: {
        event: { type: 'message', user: 'U123', text: 'hello', ts: '123.45' },
      },
    };
    const parsed = SlackClient.parseEventObject(envelope);
    assert(parsed !== null);
    assert.equal(parsed!.user, 'U123');
    assert.equal(parsed!.text, 'hello');
  });

  it('returns null for non-message', () => {
    const e = { payload: { event: { type: 'reaction_added' } } };
    const parsed = SlackClient.parseEventObject(e);
    assert.equal(parsed, null);
  });
});
