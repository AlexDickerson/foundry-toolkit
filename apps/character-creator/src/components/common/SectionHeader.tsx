interface Props {
  children: React.ReactNode;
}

// Display-serif section header used across every tab. The family + colour
// come from the pf2e-derived design tokens (src/styles/pf2e/tokens.css).
export function SectionHeader({ children }: Props): React.ReactElement {
  return (
    <h2 className="mb-2 border-b border-pf-border pb-1 font-serif text-base font-semibold uppercase tracking-wide text-pf-alt-dark">
      {children}
    </h2>
  );
}
