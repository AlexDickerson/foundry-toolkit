const MAX_ENTRIES = 500;

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const buffer: LogEntry[] = [];

function push(level: LogEntry['level'], msg: string): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  const prefix = level === 'error' ? '!!' : level === 'warn' ? '??' : '::';
  console.log(`${prefix} ${entry.ts} ${msg}`);
}

export const log = {
  info: (msg: string) => push('info', msg),
  warn: (msg: string) => push('warn', msg),
  error: (msg: string) => push('error', msg),
  /** Return the last `n` entries (default 50). */
  tail(n = 50): LogEntry[] {
    return buffer.slice(-n);
  },
};
