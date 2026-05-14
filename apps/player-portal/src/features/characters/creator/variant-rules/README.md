# Variant Rules — Creator Integration Pattern

Variant rules are world-wide PF2e optional rules (e.g. Free Archetype, Ancestry Paragon) that
change character creation. The infrastructure is designed so adding a new rule is additive —
no existing code needs to be touched beyond the registration points below.

## Where things live

| Layer | Location | What it does |
|---|---|---|
| DB / DAO | `packages/db/src/pf2e/variant-rules.ts` | `getVariantRules` / `setVariantRules` against the `settings` table |
| REST API | `apps/foundry-mcp/src/http/routes/variant-rules.ts` | `GET /api/variant-rules`, `PUT /api/variant-rules` |
| Client types | `apps/player-portal/src/features/variant-rules/types.ts` | `VariantRulesConfig` interface |
| Client API | `apps/player-portal/src/features/variant-rules/api.ts` | `getVariantRules()`, `putVariantRules()` |
| Settings UI | `apps/player-portal/src/features/variant-rules/VariantRulesModal.tsx` | Gear icon → "House Rules" modal |
| Creator step | `apps/player-portal/src/features/characters/creator/steps/ArchetypeStep.tsx` | Free Archetype-specific step |

## How to add a new variant rule

### 1. Register the config key (3 files)

**`packages/db/src/pf2e/variant-rules.ts`**
- Add the key to `KNOWN_VARIANT_RULE_KEYS`
- Add it to the `VariantRulesConfig` interface
- Add it to `DEFAULT_VARIANT_RULES` defaulting to `false`

**`apps/player-portal/src/features/variant-rules/types.ts`**
- Mirror the new field in the client-side `VariantRulesConfig`
- Add it to `DEFAULT_VARIANT_RULES`

**`apps/foundry-mcp/src/http/routes/variant-rules.ts`**
- Add the field to `variantRulesBody` Zod schema

### 2. Add the UI toggle

**`apps/player-portal/src/features/variant-rules/VariantRulesModal.tsx`** → `RULES` array:
```typescript
{
  key: 'ancestryParagon',
  label: 'Ancestry Paragon',
  description: '...',
  implemented: true,  // change from false when wired up
},
```

### 3. Add a wizard step (if the rule affects creation)

**`apps/player-portal/src/features/characters/creator/types.ts`**
- Add the step name to the `Step` union
- Add any new draft fields (e.g. `ancestryParagonFeat: Slot | null`)

**`apps/player-portal/src/features/characters/creator/constants.ts`**
- Add to `STEPS` at the right position
- Add to `STEP_LABEL` and `PICKER_LABEL` (if a picker is needed)
- Add to `EMPTY_DRAFT`

**`apps/player-portal/src/features/characters/creator/helpers.ts`**
- Add a case to `filtersForTarget` for the picker target
- Add a case to `featLocationFor` (if it grants a feat)
- Add cases to `previousItemIdFor`, `applyPickedSlot`, `isStepFilled`
- Add to the fallback hydration loop in `hydrateFromActor`

**`apps/player-portal/src/features/characters/creator/CharacterCreator.tsx`**
- Import the new step component
- Add a `useEffect` to fetch variant rules (already done — reuse `variantRules` state)
- Add `activeSteps` filter: `s !== 'ancestryParagon' || variantRules.ancestryParagon`
- Add the `{variantRules.ancestryParagon && <CreatorSection ...>}` block
- Pass the new step's props through

**`apps/player-portal/src/features/characters/creator/steps/ReviewStep.tsx`**
- Add a row for the new step's pick
- Add the "previously-active rule" note if the pick exists but the rule is off

### 4. Persist via existing mechanism

No new persistence code needed — feats are added to the actor immediately via
`api.addItemFromCompendium` with the appropriate `systemOverrides.location` string.
The `creatorDraft` flag in actor flags stores the full Draft JSON, so hydration
is automatic.

## Sketch: Ancestry Paragon

**Rule**: each character gains an extra ancestry feat at every even level.

Creator impact:
- No new step needed — the extra slot appears in the existing Ancestry step
- Extend `AncestryStep` to show an additional `FeatSlot` when `ancestryParagonEnabled`
- The slot uses `location: 'ancestry-2'` for the actor feat grant
- `Draft` gains `ancestryParagonFeat: Slot | null`
- `ReviewStep` shows "Ancestry Paragon Feat" row when the rule is on

This is roughly 2–3 hours of work: one afternoon session following the pattern above.
