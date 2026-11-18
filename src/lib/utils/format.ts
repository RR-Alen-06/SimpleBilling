/**
 * Currency and date formatting utilities
 */

export function formatCurrency(
  amount: number | string | null | undefined,
  symbol = '₹',
  precision = 2
): string {
  const numericVal = Number(amount || 0);
  return `${symbol}${numericVal.toFixed(precision)}`;
}

export function formatDateIndian(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a sequence number with auto-expanding zero-padding:
 * - 1..9,999        -> min 4 digits (0001–9999)
 * - 10,000..999,999 -> min 6 digits (010000–999999)
 * - 1,000,000+      -> min 8 digits (01000000–99999999), never truncating larger values
 * Respects any larger configured minPadding (e.g. 6 or 8).
 */
export function formatSequenceNumber(
  prefix: string,
  value: number,
  minPadding: number = 4
): string {
  const safeVal = Math.max(0, Math.trunc(Number(value) || 0));
  const valStr = String(safeVal);
  const basePadding = Math.max(4, Math.trunc(Number(minPadding) || 4));

  let targetWidth = basePadding;
  if (safeVal >= 1_000_000) {
    targetWidth = Math.max(basePadding, 8, valStr.length);
  } else if (safeVal >= 10_000) {
    targetWidth = Math.max(basePadding, 6, valStr.length);
  } else {
    targetWidth = Math.max(basePadding, valStr.length);
  }

  return `${prefix}-${valStr.padStart(targetWidth, '0')}`;
}
