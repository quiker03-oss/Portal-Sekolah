/**
 * Returns local date string (YYYY-MM-DD) in Asia/Jakarta (WIB) timezone.
 * Avoids UTC midnight shift from `new Date().toISOString().split('T')[0]`.
 */
export function getWibDateStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const offsetMs = 7 * 60 * 60 * 1000;
    return new Date(date.getTime() + offsetMs).toISOString().split('T')[0];
  }
}

/**
 * Returns local time string (HH:mm:ss) in Asia/Jakarta (WIB) timezone.
 */
export function getWibTimeStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleTimeString('id-ID', { hour12: false });
  }
}
