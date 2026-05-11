// "Notes from Alex" blurbs surfaced on the class detail panel beneath
// the mechanical proficiencies block. Keyed by the class compendium
// document's display name (matching `CompendiumMatch.name`); a
// missing entry suppresses the section, so adding support for a new
// class is a one-line addition here.

export const CLASS_NOTES: Readonly<Record<string, string>> = {
  Alchemist:
    'A daily-prep support and weakness-abuse class. You brew alchemical items each morning (bombs, elixirs, mutagens, poisons) and distribute or throw them in combat. Research Field tilts the kit: Bomber leans striker via splash and persistent damage, Chirurgeon plays party medic, Mutagenist buffs a single frontline ally (often themselves), Toxicologist applies persistent poison damage.',
  Barbarian:
    'A melee striker with the deepest HP pool in the game. Rage trades a small amount of AC for a flat damage bonus on every Strike. Instinct (Animal, Dragon, Giant, Spirit, Fury) reskins damage type and flavor without changing the core role. Default kit is a two-handed weapon and forward movement.',
  Bard: 'An occult support caster. Composition cantrips (Courage, Defense) are sustained buffs that affect the whole party while you cast and skill-check around them. Muse tilts the class: Maestro for buff support, Polymath for utility and skills, Warrior for a martial dabble, Enigma for lore and recall.',
  Champion:
    "A heavily-armored defender. The class's Reaction triggers when an enemy hits an ally near you, allowing you to interrupt, redirect, or punish. Cause (Paladin, Redeemer, Liberator, and others) reshapes the Reaction and your behavioral edicts. Default kit is heavy armor, martial weapons, focus spells, and the staying power to stand next to vulnerable allies.",
  Cleric:
    'A divine caster with two default builds. Cloistered Doctrine leans caster-support: expert spellcasting and a divine focus spell from your Deity. Warpriest Doctrine leans frontline-support: medium armor, martial weapons, slower spell progression. Both get the Font feature, which grants a daily pool of dedicated heal-or-harm slots in addition to your normal slots. Deity dictates spells, weapons, and edicts.',
  Druid:
    'A primal caster who picks an Order at level 1. Orders steer the class significantly: Animal grants a pet, Leaf leans healing and plant support, Storm leans area damage and weather control, Untamed shapeshifts for melee, and so on. Default kit is light armor, a primal spell list with strong control and area options, and one focus spell from your Order.',
  Fighter:
    'The simplest martial and the most accurate one in the game. Weapon proficiency progresses faster than any other class, which translates to more hits and more critical hits. Class feats cover shield work, weapon maneuvers (Trip, Disarm, Power Attack, Sudden Charge), and Attack of Opportunity by default. Picks any weapon and excels with it.',
  Gunslinger:
    "A firearm-focused striker built around critical hits. Way (Pistolero, Sniper, Vanguard, Drifter) determines range, weapon style, and supporting feats. The class's math favors crit fishing, which compounds when allies stack buffs and debuffs on a target. Reload management is a real part of every turn.",
  Inventor:
    'A martial built around one signature Innovation: a Weapon, Armor, Construct, or Vehicle that you modify over time. Innovation type tilts the kit: Weapon is striker, Armor is defender, Construct is a pet/companion build, Vehicle is its own niche. Overdrive boosts your damage on demand; the Unstable trait gates the strongest options behind self-damage risk.',
  Investigator:
    'A skill-driven martial. Devise a Stratagem pre-rolls one attack die before you commit an action, letting you decide whether to attack now or do something else. Methodology (Alchemical Sciences, Empiricism, Forensic Medicine, Interrogation, and others) steers your skill focus. Lower damage than most martials but more consistent. Best at tables that engage meaningfully with investigation and exploration.',
  Kineticist:
    'An at-will elemental martial with no spell slots. You pick one or two of six elements (Air, Earth, Fire, Metal, Water, Wood) and gain Impulses: action-based elemental abilities. Element choice steers the class: Fire leans damage, Earth leans defense, Wood leans support, Water leans control, and so on. Highly modular within element constraints.',
  Magus:
    "A “spellstriker” hybrid. The class's signature is Spellstrike: a two-action combination of a weapon attack and a spell into a single attack roll. Hybrid Study (Inexorable Iron, Sparkling Targe, Starlit Span, Twisting Tree, Laughing Shadow, and others) tilts you toward two-handed, sword-and-shield, ranged, reach, or mobile builds. All are striker-leaning.",
  Monk: 'A mobile martial. Default kit is unarmed strikes, the fastest base speed in the game, and Flurry of Blows (two strikes for one action with a reduced multiple attack penalty). Stances reshape your damage profile: Mountain Stance hits heavy, Tiger and Stumbling enable trip and critical-effect builds, Crane is defensive and mobile. Strong at maneuvers and battlefield positioning.',
  Oracle:
    "A divine caster whose class identity is built around a Mystery (Battle, Bones, Cosmos, Flames, Life, Lore, Tempest, and others). Mystery determines themed focus spells, granted spells, and a Curse that escalates as you channel your Mystery's power. Default kit leans Leader or Controller; Life Mystery is the prototype healer.",
  Psychic:
    "An occult caster with fewer spell slots than other casters but stronger cantrips. The class's signature is the Amped cantrip, which can be supercharged for stronger effects. Conscious Mind (Distant Grasp, Oscillating Wave, Silent Whisper, Tangible Dream, etc.) determines theme. Low HP and armor proficiency mean stay-back play.",
  Ranger:
    "A single-target focused martial. Hunt Prey marks one enemy and grants tracking and perception benefits against them. Hunter's Edge tilts how you fight that prey: Flurry leans multi-attack output, Precision leans burst damage on the first hit, Outwit leans skill-based control. Strong with bows or two-weapon fighting.",
  Rogue:
    'A skill-rich martial built around Sneak Attack damage against off-guard enemies. Default kit excels at finesse weapons and out-of-combat utility (Thievery, Stealth, social skills). Racket (Ruffian, Scoundrel, Thief, Mastermind, Eldritch Trickster) tilts the class: Ruffian wields heavier weapons, Scoundrel and Mastermind lean on charisma and intelligence, Thief and Eldritch Trickster lean traditional dex-based sneaking.',
  Sorcerer:
    'A spontaneous spellcaster whose Bloodline determines spell tradition (arcane, divine, occult, or primal) and adds bloodline-specific spells. Bloodline choice is what shapes the class: picking the right one gives you a damage caster, a controller, a support caster, or a hybrid. Spontaneous casting means a smaller spell repertoire with more daily flexibility on which slot to spend.',
  Summoner:
    'A class split between the Summoner (caster chassis) and an Eidolon (a martial creature with its own stats and actions). The pair share HP, focus points, and action economy. Default kit is striker via the Eidolon, with the Summoner providing tactical support spells. Eidolon type (Angel, Beast, Construct, Dragon, Plant, and others) determines visual and mechanical theme.',
  Swashbuckler:
    "A charisma-driven mobile martial. The class's signature is the Panache and Finisher loop: gain Panache by performing flashy actions (Tumble Through, Feint, Demoralize, depending on Style), then spend it on a Finisher for a damage spike. Default kit emphasizes movement, single-target damage, and skill-based combat tricks.",
  Thaumaturge:
    'A martial whose power comes from a thematic Implement (Amulet, Bell, Chalice, Lantern, Mirror, Regalia, Tome, Wand, Weapon). Implement choice steers the class substantially. The signature ability, Exploit Vulnerability, identifies a creature and inflicts a personalized weakness on it, making Thaumaturges strong against single tough targets.',
  Witch:
    'A spellcaster whose Patron determines spell tradition (any of the four) and the theme of your class features. Your Familiar is the link between you and the Patron. Default kit centers on hexes (focus-spell debuffs and effects) and a spell list shaped by Patron type. Builds typically lean Controller; Resentment Patron is a frequently-cited strong option.',
  Wizard:
    'The default arcane caster. Largest base spell list and most spell slots in the game. Arcane School subclass tilts the kit toward a theme (battle magic, mentalism, illusion, etc.). Strong on battlefield control, area damage, and utility; weaker on healing and buffs compared to divine or occult casters.',
};

// Direct + case-insensitive name lookup. Returns null when no note has
// been written for the class; the detail panel suppresses the section
// in that case.
export function getClassNote(name: string): string | null {
  const direct = CLASS_NOTES[name];
  if (typeof direct === 'string') return direct;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(CLASS_NOTES)) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
}
