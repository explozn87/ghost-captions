import { describe, it, expect } from 'vitest';
// Vite serves the fixture as a raw string (?raw), so the test needs no Node
// type declarations — it stays in the jsdom/browser-shaped environment.
import csvText from './fixtures/yamnet_class_map.csv?raw';
import { familyFor, isSpeechCategory, familyMap } from '../src/events/familyMap.ts';
import type { Family } from '../src/shared/types.ts';

// Task 2.3: every name in the bundled YAMNet label list must be mapped — i.e.
// resolve to a valid ghost family or the speech marker, with no name silently
// forgotten. The full list is the fixture's `display_name` column.

/** The valid ghost families, used to check familyFor's output stays in-range. */
const FAMILIES: ReadonlySet<Family> = new Set<Family>([
  'footsteps', 'door', 'knock', 'scream', 'laughter', 'crying',
  'tenseMusic', 'calmMusic', 'singing', 'impact', 'gunshot',
  'vehicle', 'siren', 'animal', 'wind', 'rain', 'thunder',
  'fire', 'glass', 'unknown',
]);

/** Parse the `display_name` column, honouring quoted fields that contain commas. */
function readDisplayNames(): string[] {
  const lines = csvText.trim().split(/\r?\n/).slice(1); // drop header
  return lines.map((line: string) => {
    // columns: index,mid,display_name  — display_name may be quoted.
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    let name = line.slice(secondComma + 1);
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1);
    }
    return name;
  });
}

// Names we deliberately leave to the `unknown` family because they do not fit
// the fixed family set (tools, household/kitchen, liquids, mechanisms, generic
// sound effects, acoustic environments, noise). Pinned so a regression that
// drops a real mapping is caught. "Measured, not invented": an unclassifiable
// sound is an honest unknown, never a guessed label.
const INTENTIONAL_UNKNOWN: ReadonlySet<string> = new Set<string>([
  // Non-speech vocal sounds that carry no clear scream/laugh/cry/song read, so
  // they are an honest unknown rather than forced into a vocal family (task
  // 16.1): breaths, coughs, body noises, and crowd/applause ambience.
  'Whistling', 'Breathing', 'Wheeze', 'Snoring', 'Gasp', 'Pant', 'Snort',
  'Cough', 'Throat clearing', 'Sneeze', 'Sniff', 'Chewing, mastication',
  'Biting', 'Gargling', 'Stomach rumble', 'Burping, eructation', 'Hiccup',
  'Fart', 'Hands', 'Finger snapping', 'Clapping', 'Heart sounds, heartbeat',
  'Heart murmur', 'Cheering', 'Applause', 'Chatter', 'Crowd',
  'Hubbub, speech noise, speech babble', 'Children playing',
  // Household/kitchen, mechanisms, tools, liquids, generic effects, acoustic
  // environments and noise: not in the fixed family set.
  'Dishes, pots, and pans', 'Cutlery, silverware', 'Chopping (food)',
  'Frying (food)', 'Microwave oven', 'Blender', 'Water tap, faucet',
  'Sink (filling or washing)', 'Bathtub (filling or washing)', 'Hair dryer',
  'Toilet flush', 'Toothbrush', 'Electric toothbrush', 'Vacuum cleaner',
  'Zipper (clothing)', 'Keys jangling', 'Coin (dropping)', 'Scissors',
  'Electric shaver, electric razor', 'Shuffling cards', 'Typing', 'Typewriter',
  'Computer keyboard', 'Writing',
  'Mechanisms', 'Ratchet, pawl', 'Clock', 'Tick', 'Tick-tock', 'Gears',
  'Pulleys', 'Sewing machine', 'Mechanical fan', 'Air conditioning',
  'Cash register', 'Printer', 'Camera', 'Single-lens reflex camera',
  'Tools', 'Hammer', 'Jackhammer', 'Sawing', 'Filing (rasp)', 'Sanding',
  'Power tool', 'Drill', 'Wood', 'Chop', 'Splinter', 'Crack',
  'Liquid', 'Splash, splatter', 'Slosh', 'Squish', 'Drip', 'Pour',
  'Trickle, dribble', 'Gush', 'Fill (with liquid)', 'Spray', 'Pump (liquid)',
  'Stir', 'Boiling', 'Sonar', 'Arrow', 'Whoosh, swoosh, swish',
  'Electronic tuner', 'Effects unit', 'Chorus effect', 'Whip', 'Flap',
  'Scratch', 'Scrape', 'Rub', 'Roll', 'Crushing', 'Crumpling, crinkling',
  'Tearing', 'Beep, bleep', 'Ping', 'Ding', 'Clang', 'Squeal', 'Creak',
  'Rustle', 'Whir', 'Clatter', 'Sizzle', 'Clicking', 'Clickety-clack',
  'Rumble', 'Plop', 'Hum', 'Zing', 'Crunch', 'Silence', 'Sine wave',
  'Harmonic', 'Chirp tone', 'Sound effect', 'Pulse', 'Inside, small room',
  'Inside, large room or hall', 'Inside, public space', 'Outside, urban or manmade',
  'Outside, rural or natural', 'Reverberation', 'Echo', 'Noise',
  'Environmental noise', 'Static', 'Mains hum', 'Distortion', 'Sidetone',
  'Cacophony', 'White noise', 'Pink noise', 'Throbbing', 'Vibration',
  'Television', 'Radio', 'Field recording',
]);

describe('familyMap coverage (task 2.3)', () => {
  const names = readDisplayNames();

  it('reads all 521 YAMNet display names from the fixture', () => {
    expect(names).toHaveLength(521);
    expect(new Set(names).size).toBe(521); // no duplicates
  });

  it('resolves every name to a valid family or the speech marker', () => {
    for (const name of names) {
      if (isSpeechCategory(name)) continue; // speech is a valid resolution
      expect(FAMILIES.has(familyFor(name))).toBe(true);
    }
  });

  it('leaves only the intentionally-unknown names as unknown', () => {
    const unexpectedUnknown = names.filter(
      (n) => !isSpeechCategory(n) && familyFor(n) === 'unknown' && !INTENTIONAL_UNKNOWN.has(n),
    );
    expect(unexpectedUnknown).toEqual([]);
  });

  it('does not list a name as intentionally-unknown that is actually mapped', () => {
    const wrongly = [...INTENTIONAL_UNKNOWN].filter(
      (n) => familyFor(n) !== 'unknown' || isSpeechCategory(n),
    );
    expect(wrongly).toEqual([]);
  });

  it('every mapped name in the table belongs to the fixture list', () => {
    const fixture = new Set(names);
    const stray = Object.keys(familyMap).filter((n) => !fixture.has(n));
    expect(stray).toEqual([]);
  });

  it('treats spoken-word categories as speech, not a ghost family (Req 3.2)', () => {
    for (const n of ['Speech', 'Conversation', 'Narration, monologue', 'Whispering']) {
      expect(isSpeechCategory(n)).toBe(true);
      expect(familyFor(n)).toBe('unknown'); // familyFor never returns a ghost for speech
    }
  });

  it('maps screams and shouts to the scream family (Req 5.2, task 16.1)', () => {
    expect(familyFor('Screaming')).toBe('scream');
    expect(familyFor('Shout')).toBe('scream');
    expect(isSpeechCategory('Screaming')).toBe(false);
  });

  it('splits the weather categories into wind, rain, thunder and fire (task 16.1)', () => {
    expect(familyFor('Wind')).toBe('wind');
    expect(familyFor('Rustling leaves')).toBe('wind');
    expect(familyFor('Rain')).toBe('rain');
    expect(familyFor('Raindrop')).toBe('rain');
    expect(familyFor('Water')).toBe('rain');
    expect(familyFor('Thunder')).toBe('thunder');
    expect(familyFor('Thunderstorm')).toBe('thunder');
    expect(familyFor('Fire')).toBe('fire');
    expect(familyFor('Crackle')).toBe('fire');
  });

  it('splits gunfire into gunshot and keeps blasts/thuds as impact (task 16.1)', () => {
    expect(familyFor('Gunshot, gunfire')).toBe('gunshot');
    expect(familyFor('Machine gun')).toBe('gunshot');
    expect(familyFor('Artillery fire')).toBe('gunshot');
    expect(familyFor('Explosion')).toBe('impact');
    expect(familyFor('Boom')).toBe('impact');
    expect(familyFor('Thump, thud')).toBe('impact');
  });

  it('splits door from knock and routes sirens/bells to siren (task 16.1)', () => {
    expect(familyFor('Door')).toBe('door');
    expect(familyFor('Slam')).toBe('door');
    expect(familyFor('Squeak')).toBe('door');
    expect(familyFor('Knock')).toBe('knock');
    expect(familyFor('Tap')).toBe('knock');
    expect(familyFor('Siren')).toBe('siren');
    expect(familyFor('Alarm')).toBe('siren');
    expect(familyFor('Bell')).toBe('siren');
    expect(familyFor('Buzzer')).toBe('siren');
  });

  it('routes the vocal families: laughter, crying and singing (task 16.1)', () => {
    expect(familyFor('Laughter')).toBe('laughter');
    expect(familyFor('Crying, sobbing')).toBe('crying');
    expect(familyFor('Choir')).toBe('singing');
    expect(familyFor('Singing')).toBe('singing');
  });

  it('falls back to unknown for a name that is not a category at all', () => {
    expect(familyFor('not a real yamnet category')).toBe('unknown');
    expect(isSpeechCategory('not a real yamnet category')).toBe(false);
  });
});
