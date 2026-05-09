export async function retry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; onError?: (e: unknown, attempt: number) => void } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onError?.(err, i + 1);
      if (i < attempts - 1) {
        const delay = base * 2 ** i + Math.random() * base;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
