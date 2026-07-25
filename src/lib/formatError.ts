export function formatError(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    if ('message' in e && typeof e.message === 'string') return e.message;
    if ('error' in e && typeof e.error === 'string') return e.error;
    try { return JSON.stringify(e); } catch { return 'Object error'; }
  }
  try { return String(e); } catch { return 'Unknown error'; }
}
