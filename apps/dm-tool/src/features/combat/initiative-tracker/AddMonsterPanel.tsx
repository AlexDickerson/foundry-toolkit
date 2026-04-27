import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { Combatant, MonsterDetail, MonsterSummary } from '@foundry-toolkit/shared/types';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface Props {
  existing: Combatant[];
  onAdd: (m: MonsterSummary, d: MonsterDetail) => void;
  onClose: () => void;
}

export function AddMonsterPanel({ existing, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MonsterSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    try {
      const rows = await api.monstersSearch({ keywords: q, limit: 12 });
      setResults(rows);
    } catch (e) {
      console.error('monstersSearch failed:', e);
    }
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    void runSearch(v);
  };

  const handlePick = async (m: MonsterSummary) => {
    setBusy(true);
    try {
      const detail = await api.monstersGetDetail(m.name);
      if (detail) onAdd(m, detail);
    } finally {
      setBusy(false);
    }
  };

  const monsterCount = (name: string) => existing.filter((c) => c.monsterName === name).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Input
          autoFocus
          placeholder="Search monsters by name…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {results.length > 0 && (
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
          }}
        >
          {results.map((m) => {
            const count = monsterCount(m.name);
            return (
              <button
                key={m.name}
                type="button"
                disabled={busy}
                onClick={() => void handlePick(m)}
                className="flex w-full items-center justify-between gap-2 border-b border-border/40 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-accent/40 disabled:opacity-50"
              >
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  Lvl {m.level} · HP {m.hp} · AC {m.ac}
                  {count > 0 && <span className="ml-2 text-primary">×{count}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
