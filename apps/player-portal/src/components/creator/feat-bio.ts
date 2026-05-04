import type { CompendiumDocument } from '../../api/types';

interface DetailBio {
  description?: string;
  prerequisites?: string[];
  actions?: string;
  trigger?: string;
  frequency?: string;
  requirements?: string;
}

/**
 * Defensive poly-type extractor for fields used in the feat detail pane.
 * The server returns raw `system` from toObject() so we can't lock this
 * to one PF2e item schema.
 */
export function extractDetailBio(doc: CompendiumDocument | null): DetailBio {
  if (!doc) return {};
  const sys = doc.system;
  const bio: DetailBio = {};

  const description = (sys['description'] as { value?: unknown } | undefined)?.value;
  if (typeof description === 'string' && description.length > 0) bio.description = description;

  const prereq = (sys['prerequisites'] as { value?: unknown } | undefined)?.value;
  if (Array.isArray(prereq)) {
    const entries = prereq
      .map((p) => (typeof p === 'string' ? p : (p as { value?: unknown } | undefined)?.value))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (entries.length > 0) bio.prerequisites = entries;
  }

  const actions = (sys['actions'] as { value?: unknown } | undefined)?.value;
  if (typeof actions === 'number') bio.actions = `${actions.toString()} action${actions === 1 ? '' : 's'}`;
  else if (typeof actions === 'string' && actions.length > 0) bio.actions = actions;

  const actionType = (sys['actionType'] as { value?: unknown } | undefined)?.value;
  if (typeof actionType === 'string' && actionType.length > 0 && bio.actions === undefined) {
    bio.actions = actionType.charAt(0).toUpperCase() + actionType.slice(1);
  }

  const trigger = sys['trigger'];
  if (typeof trigger === 'string' && trigger.length > 0) bio.trigger = trigger;

  const frequency = (sys['frequency'] as { value?: unknown } | undefined)?.value;
  if (typeof frequency === 'string' && frequency.length > 0) bio.frequency = frequency;

  const requirements = sys['requirements'];
  if (typeof requirements === 'string' && requirements.length > 0) bio.requirements = requirements;

  return bio;
}
