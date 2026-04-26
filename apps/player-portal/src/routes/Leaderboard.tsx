// Aurus leaderboard view for players. Subscribes to the sidecar's aurus
// stream via WebSocket; the DM's edits land here live. The player party is
// highlighted and pinned to the top of the ranked list.

import { useMemo } from 'react';
import { ConnectionIndicator } from '../components/ConnectionIndicator';
import { useLiveStream } from '../lib/live';
import type { AurusTeam } from '@foundry-toolkit/shared/types';

interface AurusSnapshot {
  teams: AurusTeam[];
  updatedAt: string;
}

function cpToGp(cp: number): string {
  return (cp / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function scoreOf(team: AurusTeam): number {
  // Combat power (raw) plus value-reclaimed in gp. Same formula as the DM
  // leaderboard view — any change there must be mirrored here.
  return team.combatPower + team.valueReclaimedCp / 100;
}

export function Leaderboard() {
  const { data, status, lastUpdated } = useLiveStream<AurusSnapshot>('/api/live/aurus/stream');

  const ranked = useMemo(() => {
    return [...(data?.teams ?? [])].sort((a, b) => scoreOf(b) - scoreOf(a));
  }, [data]);

  const playerParty = ranked.find((t) => t.isPlayerParty);
  const playerRank = playerParty ? ranked.indexOf(playerParty) + 1 : null;

  const stale = status === 'disconnected' || (lastUpdated !== null && Date.now() - lastUpdated > 60_000);

  return (
    <div className="h-full overflow-y-auto bg-portal-bg text-portal-text">
      <div className="mx-auto max-w-3xl px-8 py-6">
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Aurus Standings</h1>
            {playerParty && playerRank !== null && (
              <p className="mt-1 text-sm text-portal-text-muted">
                {playerParty.name}: rank #{playerRank} of {ranked.length}
              </p>
            )}
          </div>
          <ConnectionIndicator status={status} stale={stale} />
        </header>

        {!data ? (
          <p className="text-sm text-portal-text-muted">Connecting…</p>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-portal-text-muted">No teams have been registered yet.</p>
        ) : (
          <ol className="m-0 list-none space-y-2 p-0">
            {ranked.map((team, idx) => (
              <li
                key={team.id}
                className={[
                  'grid items-center gap-4 rounded-lg border px-4 py-3.5 [grid-template-columns:50px_1fr_auto]',
                  team.isPlayerParty
                    ? 'border-portal-accent-dim bg-portal-accent-subtle'
                    : 'border-portal-border bg-portal-surface',
                ].join(' ')}
              >
                {/* Rank */}
                <div
                  className={[
                    'text-center text-2xl font-bold',
                    idx < 3 ? 'text-portal-accent' : 'text-portal-text-muted',
                  ].join(' ')}
                >
                  #{idx + 1}
                </div>

                {/* Team name + badge */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="text-[17px] font-medium">{team.name}</span>
                    {team.isPlayerParty && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest bg-portal-accent-subtle text-portal-accent">
                        Your party
                      </span>
                    )}
                  </div>
                  {team.note && (
                    <div className="mt-1 text-xs italic text-portal-text-muted">{team.note}</div>
                  )}
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="text-lg font-semibold">{team.combatPower.toLocaleString()}</div>
                  <div className="text-[11px] text-portal-text-muted">Combat</div>
                  <div className="mt-1 text-sm text-portal-text-muted">{cpToGp(team.valueReclaimedCp)} gp</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
