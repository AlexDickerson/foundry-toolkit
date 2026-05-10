export interface BiographyVisibility {
  appearance: boolean;
  backstory: boolean;
  personality: boolean;
  campaign: boolean;
}

// pf2e actor biography block (system.details.biography). HTML fields
// (appearance, backstory, campaignNotes) are raw HTML strings as stored
// in Foundry; we render them via dangerouslySetInnerHTML because the
// source is our own self-hosted Foundry instance.
export interface CharacterBiography {
  appearance: string;
  backstory: string;
  birthPlace: string;
  attitude: string;
  beliefs: string;
  anathema: string[];
  edicts: string[];
  likes: string;
  dislikes: string;
  catchphrases: string;
  campaignNotes: string;
  allies: string;
  enemies: string;
  organizations: string;
  visibility: BiographyVisibility;
}

export interface DemographicField {
  value: string;
}
