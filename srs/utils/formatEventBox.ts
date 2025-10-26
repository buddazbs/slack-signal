// src/utils/formatEventBox.ts
export function formatEventBox(body: any): string {
  const ev = body?.event ?? body;
  const id = body?.envelope_id ?? body?.event_id ?? '';
  const type = ev?.type ?? '';
  const user = ev?.user ?? '';
  const rawText = ev?.text ?? '';
  const text = rawText.toString().replace(/\s+/g, ' ').trim();

  const headerLines = [
    `Событие: ${id}`,
    `Тип: ${type}`,
    `Пользователь: ${user}`,
    `Сообщение:`
  ];
  const msgLines = text ? text.split('\n') : [''];
  const allLines = [...headerLines, ...msgLines];
  const width = Math.max(...allLines.map((l) => [...l].length));
  const pad = (s: string) => s + ' '.repeat(width - [...s].length);
  const top = '┌' + '─'.repeat(width + 2) + '┐';
  const bottom = '└' + '─'.repeat(width + 2) + '┘';
  const middle = allLines.map((l) => `│ ${pad(l)} │`).join('\n');
  return `\n${top}\n${middle}\n${bottom}`;
}
