export interface Speed {
  type: string;
  slug: string;
  label: string;
  value: number;
  base: number;
  breakdown: string;
}

// Foundry ships every speed slot; unpopulated ones are null.
export interface Movement {
  speeds: {
    land: Speed | null;
    burrow: Speed | null;
    climb: Speed | null;
    fly: Speed | null;
    swim: Speed | null;
    travel?: Speed | null;
  };
}
