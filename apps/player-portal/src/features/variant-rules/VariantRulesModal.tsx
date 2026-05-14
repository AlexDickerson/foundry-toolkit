import { useEffect, useState } from 'react';
import { getVariantRules, putVariantRules } from './api';
import type { VariantRulesConfig } from './types';
import { DEFAULT_VARIANT_RULES } from './types';

interface RuleDescriptor {
  key: keyof VariantRulesConfig;
  label: string;
  description: string;
  implemented: boolean;
}

const RULES: RuleDescriptor[] = [
  {
    key: 'freeArchetype',
    label: 'Free Archetype',
    description:
      'Each character gains a free archetype feat at every even level, allowing them to multiclass without giving up their class feats.',
    implemented: true,
  },
  {
    key: 'ancestryParagon',
    label: 'Ancestry Paragon',
    description:
      "Characters gain an extra ancestry feat at every even level, deepening their connection to their ancestry's heritage.",
    implemented: false,
  },
  {
    key: 'dualClass',
    label: 'Dual Class',
    description: 'Characters gain the full benefits of two classes simultaneously, greatly increasing complexity and power.',
    implemented: false,
  },
  {
    key: 'automaticBonusProgression',
    label: 'Automatic Bonus Progression',
    description:
      'Characters gain attack, save, and skill bonuses automatically as they level up, replacing the need to buy certain magic items.',
    implemented: false,
  },
  {
    key: 'proficiencyWithoutLevel',
    label: 'Proficiency Without Level',
    description:
      "Proficiency bonuses don't include character level, reducing the power gap between characters of different levels.",
    implemented: false,
  },
  {
    key: 'gradualAbilityBoosts',
    label: 'Gradual Ability Boosts',
    description:
      'Characters gain one ability boost per level from 1–4 instead of four boosts at level 1, smoothing early-game progression.',
    implemented: false,
  },
];

export function VariantRulesModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [config, setConfig] = useState<VariantRulesConfig>(DEFAULT_VARIANT_RULES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<keyof VariantRulesConfig | null>(null);

  useEffect(() => {
    getVariantRules()
      .then((cfg) => {
        setConfig(cfg);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
        setLoading(false);
      });
  }, []);

  async function toggle(key: keyof VariantRulesConfig): Promise<void> {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    setSaving(key);
    setError(null);
    try {
      const saved = await putVariantRules({ [key]: next[key] });
      setConfig(saved);
    } catch (err: unknown) {
      // Revert optimistic update on failure
      setConfig((c) => ({ ...c, [key]: !next[key] }));
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="house-rules-title"
      onClick={(e): void => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-portal-border bg-portal-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-portal-border px-5 py-4">
          <h2 id="house-rules-title" className="text-base font-semibold text-portal-text">
            House Rules
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-portal-text-muted transition-colors hover:text-portal-text"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <p className="text-sm italic text-portal-text-muted">Loading…</p>
          ) : (
            <>
              {error !== null && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
              )}
              <p className="mb-4 text-xs text-portal-text-muted">
                Variant rules are world-wide settings. Toggling a rule affects all characters in the next creator session.
              </p>
              <ul className="space-y-4">
                {RULES.map((rule) => (
                  <li key={rule.key} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config[rule.key]}
                        aria-label={rule.label}
                        disabled={saving !== null}
                        onClick={(): void => {
                          void toggle(rule.key);
                        }}
                        className={[
                          'relative h-5 w-9 rounded-full transition-colors',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-accent',
                          'disabled:opacity-50',
                          config[rule.key]
                            ? 'bg-portal-accent'
                            : 'bg-portal-border',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                            config[rule.key] ? 'left-[18px]' : 'left-0.5',
                          ].join(' ')}
                        />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-portal-text">{rule.label}</span>
                        {!rule.implemented && (
                          <span className="rounded-full bg-portal-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-portal-text-muted">
                            coming soon
                          </span>
                        )}
                        {saving === rule.key && (
                          <span className="text-[10px] italic text-portal-text-muted">saving…</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-portal-text-muted">{rule.description}</p>
                      {!rule.implemented && config[rule.key] && (
                        <p className="mt-1 text-[10px] italic text-portal-text-muted">
                          Wiring still in progress — this toggle saves but has no effect in the creator yet.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
