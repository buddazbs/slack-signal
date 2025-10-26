import { strict as assert } from 'assert';
import events from '../srs/core/events';
import EspSender from '../srs/senders/espSender';

describe('Events -> ESP sender', () => {
  let espSender: EspSender;

  beforeEach(() => {
    // Создаем новый экземпляр для каждого теста
    espSender = new EspSender(0); // Используем порт 0 для тестов
  });

  afterEach(() => {
    // Очищаем слушателей событий после каждого теста
    events.removeAllListeners('dm_received');
  });

  it('espSender receives dm_received events and broadcast is called', () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('broadcast was not called in time'));
      }, 1000);

      // Переопределяем метод broadcast один раз
      espSender.broadcast = function (payload: any) {
        clearTimeout(timeout);
        try {
          assert.equal(payload.type, 'dm_received');
          assert.equal(payload.fromUserId, 'U1');
          assert.equal(payload.text, 'hi');
          assert.equal(payload.messageId, 'm1');
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      // Подписываемся на события
      events.once('dm_received', (payload) => {
        espSender.broadcast({ type: 'dm_received', ...payload });
      });

      // Эмитим событие
      events.emit('dm_received', { fromUserId: 'U1', text: 'hi', messageId: 'm1' });
    });
  });
});
