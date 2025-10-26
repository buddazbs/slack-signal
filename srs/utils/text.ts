// src/utils/text.ts
/**
 * Урезает текст до maxLength символов, добавляет trailing ellipsis.
 * Может также полностью редактировать текст при production (редактировать через ENV).
 *
 * @param s - исходный текст
 * @param maxLength - макс. длина (по умолчанию 200)
 * @param opts.redact - если true — возвращает '[REDACTED]' (например, для продакшн)
 */
export function shortText(s?: string, maxLength = 200, opts?: { redact?: boolean }): string {
  const REDACT_FLAG = process.env.LOG_FULL_TEXT === 'true' ? false : (opts?.redact ?? false);

  if (!s) return '';
  if (REDACT_FLAG) return '[REDACTED]';

  // корректно считаем длину для unicode (emoji и т.п.)
  const chars = [...s];
  if (chars.length <= maxLength) return s;
  return chars.slice(0, maxLength).join('') + '…';
}
