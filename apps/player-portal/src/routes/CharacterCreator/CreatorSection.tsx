import type { Step } from './types';

// Section shell used by the single-page creator layout. Each section
// gets an anchor id (so the StepNav pills can scroll to it) and a
// serif header matching the rest of the sheet. `scroll-mt` backs off
// the sticky nav so a jumped-to section doesn't hide under it.
export function CreatorSection({
  id,
  title,
  children,
}: {
  id: Step;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      id={`creator-section-${id}`}
      data-creator-section={id}
      className="mb-6 scroll-mt-20 rounded border border-pf-border bg-white p-4"
    >
      <h2 className="mb-3 border-b border-pf-border pb-1 font-serif text-base font-semibold uppercase tracking-widest text-pf-alt-dark">
        {title}
      </h2>
      {children}
    </section>
  );
}
