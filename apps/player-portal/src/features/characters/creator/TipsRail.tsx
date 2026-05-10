// Left-rail tip cards shown alongside the character-creator wizard.
// The sheet uses the equivalent column for the party rail; the creator
// has nothing actor-specific to put there before the character exists,
// so we use the space to coach new players on PF2e conventions that
// affect their picks (rarity, key-attribute math, etc.).
//
// Tip definitions are plain data so adding a new card is a one-entry
// edit — no new component per tip. Cards stack vertically and the rail
// hides on viewports narrower than `lg` to match the sheet's rail.

interface CreatorTip {
  /** Heading shown at the top of the card. Keep short — one or two words. */
  title: string;
  /** Body paragraphs. Plain strings; rendered as <p> blocks. */
  body: string[];
}

const TIPS: readonly CreatorTip[] = [
  {
    title: 'Rarity',
    body: [
      'Elements in PF2e have a rarity value. It describes how frequently something appears in the world — not how strong it is. Rarity has no impact on a choice’s relative power.',
      'If you’re picking something that is not Common, please check with your GM first so they can ensure it fits in the game.',
    ],
  },
];

export function TipsRail(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Player tips</p>
      {TIPS.map((tip) => (
        <TipCard key={tip.title} tip={tip} />
      ))}
    </div>
  );
}

function TipCard({ tip }: { tip: CreatorTip }): React.ReactElement {
  return (
    <article
      className="rounded border border-pf-border bg-pf-bg-dark/40 px-3 py-3 text-xs text-pf-alt-dark"
      data-role="creator-tip"
      data-tip-title={tip.title}
    >
      <h3 className="mb-1.5 font-serif text-sm font-semibold text-pf-text">{tip.title}</h3>
      {tip.body.map((para, i) => (
        <p key={i.toString()} className={i > 0 ? 'mt-2' : undefined}>
          {para}
        </p>
      ))}
    </article>
  );
}
