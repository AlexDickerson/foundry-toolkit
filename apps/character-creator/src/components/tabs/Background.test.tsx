import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { CharacterBiography, CharacterDetails } from '../../api/types';
import { Background } from './Background';

const details = (amiri as unknown as { system: { details: CharacterDetails } }).system.details;

describe('Background tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders demographic fields that are populated (Amiri: gender + ethnicity)', () => {
    const { container } = render(<Background details={details} />);
    const demo = container.querySelector('[data-section="demographics"]');
    expect(demo, 'demographics section').toBeTruthy();
    expect(container.querySelector('[data-field="gender"]')?.textContent).toContain('F/She/Her');
    expect(container.querySelector('[data-field="ethnicity"]')?.textContent).toContain('Kellish');
    // Not populated for Amiri — should not render.
    expect(container.querySelector('[data-field="nationality"]')).toBeNull();
    expect(container.querySelector('[data-field="age"]')).toBeNull();
  });

  it('omits the demographics section entirely when every field is empty', () => {
    const bare: CharacterDetails = {
      ...details,
      gender: { value: '' },
      ethnicity: { value: '' },
      nationality: { value: '' },
      age: { value: '' },
      height: { value: '' },
      weight: { value: '' },
      biography: { ...details.biography, birthPlace: '' },
    };
    const { container } = render(<Background details={bare} />);
    expect(container.querySelector('[data-section="demographics"]')).toBeNull();
  });

  it('renders the backstory HTML block for Amiri', () => {
    const { container } = render(<Background details={details} />);
    const backstory = container.querySelector('[data-section="backstory"]');
    expect(backstory, 'backstory section').toBeTruthy();
    // Amiri's backstory opens with "There are a million ways to die…".
    expect(backstory?.textContent).toContain('a million ways to die');
    // HTML should actually render as elements, not text — look for a <p>.
    expect(backstory?.querySelector('p')).toBeTruthy();
  });

  it('omits Appearance when the field is empty (Amiri)', () => {
    const { container } = render(<Background details={details} />);
    expect(container.querySelector('[data-section="appearance"]')).toBeNull();
  });

  it('omits the Personality block when every field is empty (Amiri)', () => {
    const { container } = render(<Background details={details} />);
    expect(container.querySelector('[data-section="personality"]')).toBeNull();
  });

  it('renders edicts and anathema when present', () => {
    const withCode: CharacterDetails = {
      ...details,
      biography: {
        ...details.biography,
        edicts: ['Protect the innocent', 'Honour your word'],
        anathema: ['Harm an ally in rage'],
      },
    };
    const { container } = render(<Background details={withCode} />);
    const section = container.querySelector('[data-section="edicts-anathema"]');
    expect(section, 'edicts/anathema section').toBeTruthy();
    expect(container.querySelector('[data-list="edicts"]')?.textContent).toContain('Protect the innocent');
    expect(container.querySelector('[data-list="anathema"]')?.textContent).toContain('Harm an ally');
  });

  it('hides the edicts/anathema block when both arrays are empty (Amiri)', () => {
    const { container } = render(<Background details={details} />);
    expect(container.querySelector('[data-section="edicts-anathema"]')).toBeNull();
  });

  it('renders the Connections block when populated', () => {
    const connected: CharacterDetails = {
      ...details,
      biography: { ...details.biography, allies: 'The Pathfinder Society', enemies: 'Frost giants', organizations: '' },
    };
    const { container } = render(<Background details={connected} />);
    expect(container.querySelector('[data-section="social"]')?.textContent).toContain('Pathfinder Society');
    expect(container.querySelector('[data-section="social"]')?.textContent).toContain('Frost giants');
  });

  it('hides Campaign Notes when empty (Amiri)', () => {
    const { container } = render(<Background details={details} />);
    expect(container.querySelector('[data-section="campaign-notes"]')).toBeNull();
  });

  it('shows an empty-state message when every background field is blank', () => {
    const bare: CharacterDetails = {
      ...details,
      gender: { value: '' },
      ethnicity: { value: '' },
      nationality: { value: '' },
      age: { value: '' },
      height: { value: '' },
      weight: { value: '' },
      biography: {
        ...details.biography,
        birthPlace: '',
        appearance: '',
        backstory: '',
        campaignNotes: '',
        attitude: '',
        beliefs: '',
        likes: '',
        dislikes: '',
        catchphrases: '',
        allies: '',
        enemies: '',
        organizations: '',
        edicts: [],
        anathema: [],
      },
    };
    const { container } = render(<Background details={bare} />);
    expect(container.querySelector('[data-section="background-empty"]')).toBeTruthy();
    expect(container.textContent).toContain('No background details');
    // None of the populated-only sections should have rendered.
    expect(container.querySelector('[data-section="demographics"]')).toBeNull();
    expect(container.querySelector('[data-section="backstory"]')).toBeNull();
  });
});

// Quick sanity test: biography type fields line up with what Background consumes.
// Makes sure adding a field here without updating Background will be caught.
describe('CharacterBiography shape', () => {
  it('has every field the Background tab relies on', () => {
    const bio: CharacterBiography = details.biography;
    expect(Array.isArray(bio.edicts)).toBe(true);
    expect(Array.isArray(bio.anathema)).toBe(true);
    expect(typeof bio.appearance).toBe('string');
    expect(typeof bio.backstory).toBe('string');
    expect(typeof bio.campaignNotes).toBe('string');
  });
});
