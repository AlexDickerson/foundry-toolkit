/** Live-connection status dot + label for pages that stream from the
 *  sidecar WebSocket. Colors are semantic (green/amber/red) and intentionally
 *  independent of the portal theme. */
export function ConnectionIndicator({ status, stale }: { status: string; stale: boolean }) {
  const dotColor =
    status === 'connected' ? (stale ? '#d19a3a' : '#4ade80') : '#ef4444';
  const label =
    status === 'connected'
      ? stale
        ? 'Stale'
        : 'Live'
      : status === 'connecting'
        ? 'Connecting…'
        : 'Offline';

  return (
    <div className="flex items-center gap-1.5 text-xs text-portal-text-muted">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </div>
  );
}
