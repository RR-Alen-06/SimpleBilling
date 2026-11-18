import { AccountingClosing, DateFilterOption } from '../types';

export interface SessionFilterOptions {
  closings: AccountingClosing[];
  selectedClosingId?: string;
  customFrom?: string;
  customTo?: string;
}

export interface BillSessionInfo {
  isClosed: boolean;
  label: string;
  closingNumber: string | null;
}

/**
 * Parses YYYY-MM-DD (or ISO) date strings into local start-of-day and end-of-day timestamps.
 */
export function parseCustomDateBounds(from?: string, to?: string): { startMs?: number; endMs?: number } {
  let startMs: number | undefined;
  let endMs: number | undefined;

  if (from) {
    const start = from.includes('T') ? new Date(from) : new Date(`${from}T00:00:00.000`);
    if (!isNaN(start.getTime())) {
      if (!from.includes('T')) start.setHours(0, 0, 0, 0);
      startMs = start.getTime();
    }
  }

  if (to) {
    const end = to.includes('T') ? new Date(to) : new Date(`${to}T23:59:59.999`);
    if (!isNaN(end.getTime())) {
      if (!to.includes('T')) end.setHours(23, 59, 59, 999);
      endMs = end.getTime();
    }
  }

  return { startMs, endMs };
}

function getLatestClosing(closings: AccountingClosing[]): AccountingClosing | null {
  let latest: AccountingClosing | null = null;
  let latestMs = -Infinity;
  for (const c of closings) {
    const ms = c.to_date ? new Date(c.to_date).getTime() : NaN;
    if (!isNaN(ms) && ms >= latestMs) {
      latestMs = ms;
      latest = c;
    }
  }
  return latest || closings[0] || null;
}

/**
 * Returns whether a timestamped record matches the selected session/date filter.
 */
export function matchesSessionOrDateFilter(
  createdAt: string,
  filter: DateFilterOption,
  options: SessionFilterOptions
): boolean {
  if (filter === 'all_time') return true;

  const itemMs = new Date(createdAt).getTime();
  if (isNaN(itemMs)) return false;

  const { closings, selectedClosingId, customFrom, customTo } = options;
  const latestClosing = getLatestClosing(closings);

  if (filter === 'current_session') {
    if (!latestClosing?.to_date) return true;
    const cutoffMs = new Date(latestClosing.to_date).getTime();
    return isNaN(cutoffMs) ? true : itemMs > cutoffMs;
  }

  if (filter === 'closed_sessions') {
    if (closings.length === 0) return false;
    if (selectedClosingId) {
      const target = closings.find(c => c.id === selectedClosingId || c.closing_number === selectedClosingId);
      if (!target) return false;
      const fromMs = new Date(target.from_date).getTime();
      const toMs = new Date(target.to_date).getTime();
      return !isNaN(fromMs) && !isNaN(toMs) && itemMs >= fromMs && itemMs <= toMs;
    }
    return closings.some(c => {
      const fromMs = c.from_date ? new Date(c.from_date).getTime() : -Infinity;
      const toMs = c.to_date ? new Date(c.to_date).getTime() : NaN;
      return !isNaN(toMs) && itemMs >= fromMs && itemMs <= toMs;
    });
  }

  if (filter === 'custom') {
    if (!customFrom || !customTo) return true;
    const { startMs, endMs } = parseCustomDateBounds(customFrom, customTo);
    if (startMs !== undefined && itemMs < startMs) return false;
    if (endMs !== undefined && itemMs > endMs) return false;
    return true;
  }

  const d = new Date(itemMs);
  const now = new Date();

  if (filter === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (filter === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return d.toDateString() === y.toDateString();
  }
  if (filter === 'weekly') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= sevenDaysAgo && d <= now;
  }
  if (filter === 'monthly') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (filter === 'quarterly') {
    const curQ = Math.floor(now.getMonth() / 3);
    const expQ = Math.floor(d.getMonth() / 3);
    return curQ === expQ && d.getFullYear() === now.getFullYear();
  }
  if (filter === 'yearly') {
    return d.getFullYear() === now.getFullYear();
  }
  if (filter === 'financial_year') {
    const curM = now.getMonth();
    const curY = now.getFullYear();
    const fyStartY = curM >= 3 ? curY : curY - 1;
    const start = new Date(fyStartY, 3, 1);
    const end = new Date(fyStartY + 1, 2, 31, 23, 59, 59, 999);
    return d >= start && d <= end;
  }

  return true;
}

/**
 * Determines whether a bill belongs to the Current Session or a Closed Session.
 */
export function getBillSessionInfo(createdAt: string, closings: AccountingClosing[]): BillSessionInfo {
  const latestClosing = getLatestClosing(closings);
  if (!latestClosing?.to_date) {
    return { isClosed: false, label: 'Current Session', closingNumber: null };
  }

  const itemMs = new Date(createdAt).getTime();
  const latestToMs = new Date(latestClosing.to_date).getTime();

  if (isNaN(itemMs) || isNaN(latestToMs) || itemMs > latestToMs) {
    return { isClosed: false, label: 'Current Session', closingNumber: null };
  }

  const matched = closings.find(c => {
    const fromMs = new Date(c.from_date).getTime();
    const toMs = new Date(c.to_date).getTime();
    return itemMs >= fromMs && itemMs <= toMs;
  });

  if (matched) {
    return {
      isClosed: true,
      label: matched.closing_number || 'Closed',
      closingNumber: matched.closing_number || null,
    };
  }

  return { isClosed: true, label: 'Closed', closingNumber: null };
}

/**
 * Formats a closing record for dropdown options.
 */
export function formatClosingOptionLabel(closing: AccountingClosing): string {
  const fromStr = new Date(closing.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const toStr = new Date(closing.to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${closing.closing_number} (${fromStr} – ${toStr})`;
}

/**
 * Builds a human-readable period label for PDF/CSV headers and summaries.
 */
export function getPeriodDisplayLabel(filter: DateFilterOption, options: SessionFilterOptions): string {
  const { closings, selectedClosingId, customFrom, customTo } = options;

  if (filter === 'current_session') {
    const latest = closings[0];
    if (latest?.to_date) {
      const sinceStr = new Date(latest.to_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      return `Current Session (Since ${sinceStr})`;
    }
    return 'Current Session';
  }

  if (filter === 'closed_sessions') {
    if (selectedClosingId) {
      const target = closings.find(c => c.id === selectedClosingId || c.closing_number === selectedClosingId);
      if (target) return `Closed Session: ${formatClosingOptionLabel(target)}`;
    }
    return 'All Closed Sessions';
  }

  if (filter === 'all_time') return 'All Time';
  if (filter === 'custom' && customFrom && customTo) return `${customFrom} to ${customTo}`;

  return filter.replace(/_/g, ' ').toUpperCase();
}

