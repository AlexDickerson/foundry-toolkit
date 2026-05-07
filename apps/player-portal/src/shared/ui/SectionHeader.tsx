interface Props {
  children: React.ReactNode;
  /** When true, renders as a filled accent band spanning the top of a `p-4
   *  rounded-lg` card. Uses negative margins to break out of the card's
   *  padding so the band sits flush against all three top edges. */
  band?: boolean;
}

export function SectionHeader({ children, band = false }: Props): React.ReactElement {
  if (band) {
    return (
      <h2 className="-mx-4 -mt-4 mb-3 rounded-t-lg border-b border-pf-border bg-pf-bg px-4 pb-2.5 pt-3 font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
        {children}
      </h2>
    );
  }
  return (
    <h2 className="mb-3 border-l-2 border-pf-primary pl-3 font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
      {children}
    </h2>
  );
}
