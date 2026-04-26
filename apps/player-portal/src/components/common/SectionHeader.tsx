interface Props {
  children: React.ReactNode;
}

// Display-serif section header used across every tab. The family + colour
// come from the pf2e-derived design tokens (src/styles/pf2e/tokens.css).
export function SectionHeader({ children }: Props): React.ReactElement {
  return (
    <h2 className="mb-3 border-l-2 border-pf-primary pl-3 font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
      {children}
    </h2>
  );
}
