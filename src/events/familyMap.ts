// YAMNet category name → ghost family (or speech) — the single mapping table
// (Requirement 3.1, 3.2; task 2.3, updated for the 20-family set in task 16.1).
// One file, reviewed by the task-12 hook.
//
// Keys are YAMNet `display_name` values exactly as they appear in the bundled
// label list (test/fixtures/yamnet_class_map.csv). Any name NOT present here
// falls back to `unknown` via familyFor(), so the table only needs the names
// that carry a confident family.
//
// The 20 families (task 16.1) split the old broad ones into the specific sounds
// a viewer most wants to tell apart:
// - voice & scream → `scream` (screams/shouts/yells), `laughter`, `crying`,
//   `singing`; plain spoken words stay `speech` (ordinary captions, Req 3.2);
// - weather → `wind`, `rain`, `thunder`, `fire` (each its own ambient ghost);
// - impact & explosion → `impact` (thuds/booms/breaking-force) vs `gunshot`
//   (gunfire/artillery), so a gunshot is never softened into a generic thump;
// - door & knock → `door` (doors/slams/squeaks) vs `knock` (knock/tap);
// - alarm & siren → `siren`.
// Pure music still splits into `tenseMusic` (scary/sad/angry) and `calmMusic`.
//
// Choices worth stating:
// - Spoken-word categories (Speech, Conversation, Narration, Babbling,
//   Whispering, Speech synthesizer) map to 'speech': they belong to ordinary
//   captions, not ghosts (Req 3.2).
// - Non-speech human vocal sounds that are not a scream/laugh/cry/song (Sigh,
//   Groan, Breathing, Cough, Cheering, applause, crowd...) map to the nearest
//   of the four vocal families, or to `unknown` when they carry no clear
//   emotional read, keeping "measured, not invented" (honesty over spectacle).

import type { Family, FamilyOrSpeech } from '../shared/types.ts';

export const familyMap: Record<string, FamilyOrSpeech> = {
  // --- speech: spoken words, handled by ordinary captions (Req 3.2) ---
  'Speech': 'speech',
  'Child speech, kid speaking': 'speech',
  'Conversation': 'speech',
  'Narration, monologue': 'speech',
  'Babbling': 'speech',
  'Speech synthesizer': 'speech',
  'Whispering': 'speech',

  // --- scream: screams, shouts, yells (voice & scream) ---
  'Shout': 'scream',
  'Bellow': 'scream',
  'Whoop': 'scream',
  'Yell': 'scream',
  'Children shouting': 'scream',
  'Screaming': 'scream',
  'Groan': 'scream',
  'Grunt': 'scream',
  'Roar': 'scream',

  // --- laughter ---
  'Laughter': 'laughter',
  'Baby laughter': 'laughter',
  'Giggle': 'laughter',
  'Snicker': 'laughter',
  'Belly laugh': 'laughter',
  'Chuckle, chortle': 'laughter',

  // --- crying ---
  'Crying, sobbing': 'crying',
  'Baby cry, infant cry': 'crying',
  'Whimper': 'crying',
  'Wail, moan': 'crying',
  'Sigh': 'crying',

  // --- singing: sung voice (voice music) ---
  'Singing': 'singing',
  'Choir': 'singing',
  'Yodeling': 'singing',
  'Chant': 'singing',
  'Mantra': 'singing',
  'Child singing': 'singing',
  'Synthetic singing': 'singing',
  'Rapping': 'singing',
  'Humming': 'singing',
  'Vocal music': 'singing',
  'A capella': 'singing',
  'Lullaby': 'singing',

  // --- footsteps ---
  'Run': 'footsteps',
  'Shuffle': 'footsteps',
  'Walk, footsteps': 'footsteps',

  // --- animal ---
  'Animal': 'animal',
  'Domestic animals, pets': 'animal',
  'Dog': 'animal',
  'Bark': 'animal',
  'Yip': 'animal',
  'Howl': 'animal',
  'Bow-wow': 'animal',
  'Growling': 'animal',
  'Whimper (dog)': 'animal',
  'Cat': 'animal',
  'Purr': 'animal',
  'Meow': 'animal',
  'Hiss': 'animal',
  'Caterwaul': 'animal',
  'Livestock, farm animals, working animals': 'animal',
  'Horse': 'animal',
  'Clip-clop': 'animal',
  'Neigh, whinny': 'animal',
  'Cattle, bovinae': 'animal',
  'Moo': 'animal',
  'Cowbell': 'animal',
  'Pig': 'animal',
  'Oink': 'animal',
  'Goat': 'animal',
  'Bleat': 'animal',
  'Sheep': 'animal',
  'Fowl': 'animal',
  'Chicken, rooster': 'animal',
  'Cluck': 'animal',
  'Crowing, cock-a-doodle-doo': 'animal',
  'Turkey': 'animal',
  'Gobble': 'animal',
  'Duck': 'animal',
  'Quack': 'animal',
  'Goose': 'animal',
  'Honk': 'animal',
  'Wild animals': 'animal',
  'Roaring cats (lions, tigers)': 'animal',
  'Bird': 'animal',
  'Bird vocalization, bird call, bird song': 'animal',
  'Chirp, tweet': 'animal',
  'Squawk': 'animal',
  'Pigeon, dove': 'animal',
  'Coo': 'animal',
  'Crow': 'animal',
  'Caw': 'animal',
  'Owl': 'animal',
  'Hoot': 'animal',
  'Bird flight, flapping wings': 'animal',
  'Canidae, dogs, wolves': 'animal',
  'Rodents, rats, mice': 'animal',
  'Mouse': 'animal',
  'Patter': 'animal',
  'Insect': 'animal',
  'Cricket': 'animal',
  'Mosquito': 'animal',
  'Fly, housefly': 'animal',
  'Buzz': 'animal',
  'Bee, wasp, etc.': 'animal',
  'Frog': 'animal',
  'Croak': 'animal',
  'Snake': 'animal',
  'Rattle': 'animal',
  'Whale vocalization': 'animal',

  // --- calmMusic: music/instruments/genres with no tense mood by default ---
  'Music': 'calmMusic',
  'Musical instrument': 'calmMusic',
  'Plucked string instrument': 'calmMusic',
  'Guitar': 'calmMusic',
  'Electric guitar': 'calmMusic',
  'Bass guitar': 'calmMusic',
  'Acoustic guitar': 'calmMusic',
  'Steel guitar, slide guitar': 'calmMusic',
  'Tapping (guitar technique)': 'calmMusic',
  'Strum': 'calmMusic',
  'Banjo': 'calmMusic',
  'Sitar': 'calmMusic',
  'Mandolin': 'calmMusic',
  'Zither': 'calmMusic',
  'Ukulele': 'calmMusic',
  'Keyboard (musical)': 'calmMusic',
  'Piano': 'calmMusic',
  'Electric piano': 'calmMusic',
  'Organ': 'calmMusic',
  'Electronic organ': 'calmMusic',
  'Hammond organ': 'calmMusic',
  'Synthesizer': 'calmMusic',
  'Sampler': 'calmMusic',
  'Harpsichord': 'calmMusic',
  'Percussion': 'calmMusic',
  'Drum kit': 'calmMusic',
  'Drum machine': 'calmMusic',
  'Drum': 'calmMusic',
  'Snare drum': 'calmMusic',
  'Rimshot': 'calmMusic',
  'Drum roll': 'calmMusic',
  'Bass drum': 'calmMusic',
  'Timpani': 'calmMusic',
  'Tabla': 'calmMusic',
  'Cymbal': 'calmMusic',
  'Hi-hat': 'calmMusic',
  'Wood block': 'calmMusic',
  'Tambourine': 'calmMusic',
  'Rattle (instrument)': 'calmMusic',
  'Maraca': 'calmMusic',
  'Gong': 'calmMusic',
  'Tubular bells': 'calmMusic',
  'Mallet percussion': 'calmMusic',
  'Marimba, xylophone': 'calmMusic',
  'Glockenspiel': 'calmMusic',
  'Vibraphone': 'calmMusic',
  'Steelpan': 'calmMusic',
  'Orchestra': 'calmMusic',
  'Brass instrument': 'calmMusic',
  'French horn': 'calmMusic',
  'Trumpet': 'calmMusic',
  'Trombone': 'calmMusic',
  'Bowed string instrument': 'calmMusic',
  'String section': 'calmMusic',
  'Violin, fiddle': 'calmMusic',
  'Pizzicato': 'calmMusic',
  'Cello': 'calmMusic',
  'Double bass': 'calmMusic',
  'Wind instrument, woodwind instrument': 'calmMusic',
  'Flute': 'calmMusic',
  'Saxophone': 'calmMusic',
  'Clarinet': 'calmMusic',
  'Harp': 'calmMusic',
  'Harmonica': 'calmMusic',
  'Accordion': 'calmMusic',
  'Bagpipes': 'calmMusic',
  'Didgeridoo': 'calmMusic',
  'Shofar': 'calmMusic',
  'Theremin': 'calmMusic',
  'Singing bowl': 'calmMusic',
  'Scratching (performance technique)': 'calmMusic',
  'Pop music': 'calmMusic',
  'Hip hop music': 'calmMusic',
  'Beatboxing': 'calmMusic',
  'Rock music': 'calmMusic',
  'Heavy metal': 'calmMusic',
  'Punk rock': 'calmMusic',
  'Grunge': 'calmMusic',
  'Progressive rock': 'calmMusic',
  'Rock and roll': 'calmMusic',
  'Psychedelic rock': 'calmMusic',
  'Rhythm and blues': 'calmMusic',
  'Soul music': 'calmMusic',
  'Reggae': 'calmMusic',
  'Country': 'calmMusic',
  'Swing music': 'calmMusic',
  'Bluegrass': 'calmMusic',
  'Funk': 'calmMusic',
  'Folk music': 'calmMusic',
  'Middle Eastern music': 'calmMusic',
  'Jazz': 'calmMusic',
  'Disco': 'calmMusic',
  'Classical music': 'calmMusic',
  'Opera': 'calmMusic',
  'Electronic music': 'calmMusic',
  'House music': 'calmMusic',
  'Techno': 'calmMusic',
  'Dubstep': 'calmMusic',
  'Drum and bass': 'calmMusic',
  'Electronica': 'calmMusic',
  'Electronic dance music': 'calmMusic',
  'Ambient music': 'calmMusic',
  'Trance music': 'calmMusic',
  'Music of Latin America': 'calmMusic',
  'Salsa music': 'calmMusic',
  'Flamenco': 'calmMusic',
  'Blues': 'calmMusic',
  'Music for children': 'calmMusic',
  'New-age music': 'calmMusic',
  'Music of Africa': 'calmMusic',
  'Afrobeat': 'calmMusic',
  'Christian music': 'calmMusic',
  'Gospel music': 'calmMusic',
  'Music of Asia': 'calmMusic',
  'Carnatic music': 'calmMusic',
  'Music of Bollywood': 'calmMusic',
  'Ska': 'calmMusic',
  'Traditional music': 'calmMusic',
  'Independent music': 'calmMusic',
  'Song': 'calmMusic',
  'Background music': 'calmMusic',
  'Theme music': 'calmMusic',
  'Jingle (music)': 'calmMusic',
  'Soundtrack music': 'calmMusic',
  'Video game music': 'calmMusic',
  'Christmas music': 'calmMusic',
  'Dance music': 'calmMusic',
  'Wedding music': 'calmMusic',
  'Happy music': 'calmMusic',
  'Tender music': 'calmMusic',
  'Exciting music': 'calmMusic',

  // --- tenseMusic: mood categories that read as suspense/dread ---
  'Sad music': 'tenseMusic',
  'Angry music': 'tenseMusic',
  'Scary music': 'tenseMusic',

  // --- wind ---
  'Wind': 'wind',
  'Rustling leaves': 'wind',
  'Wind noise (microphone)': 'wind',

  // --- rain & water ---
  'Water': 'rain',
  'Rain': 'rain',
  'Raindrop': 'rain',
  'Rain on surface': 'rain',
  'Stream': 'rain',
  'Waterfall': 'rain',
  'Ocean': 'rain',
  'Waves, surf': 'rain',
  'Steam': 'rain',
  'Gurgling': 'rain',

  // --- thunder ---
  'Thunderstorm': 'thunder',
  'Thunder': 'thunder',

  // --- fire ---
  'Fire': 'fire',
  'Crackle': 'fire',

  // --- vehicle ---
  'Vehicle': 'vehicle',
  'Boat, Water vehicle': 'vehicle',
  'Sailboat, sailing ship': 'vehicle',
  'Rowboat, canoe, kayak': 'vehicle',
  'Motorboat, speedboat': 'vehicle',
  'Ship': 'vehicle',
  'Motor vehicle (road)': 'vehicle',
  'Car': 'vehicle',
  'Vehicle horn, car horn, honking': 'vehicle',
  'Toot': 'vehicle',
  'Car alarm': 'siren',
  'Power windows, electric windows': 'vehicle',
  'Skidding': 'vehicle',
  'Tire squeal': 'vehicle',
  'Car passing by': 'vehicle',
  'Race car, auto racing': 'vehicle',
  'Truck': 'vehicle',
  'Air brake': 'vehicle',
  'Air horn, truck horn': 'vehicle',
  'Reversing beeps': 'vehicle',
  'Ice cream truck, ice cream van': 'vehicle',
  'Bus': 'vehicle',
  'Emergency vehicle': 'siren',
  'Police car (siren)': 'siren',
  'Ambulance (siren)': 'siren',
  'Fire engine, fire truck (siren)': 'siren',
  'Motorcycle': 'vehicle',
  'Traffic noise, roadway noise': 'vehicle',
  'Rail transport': 'vehicle',
  'Train': 'vehicle',
  'Train whistle': 'vehicle',
  'Train horn': 'vehicle',
  'Railroad car, train wagon': 'vehicle',
  'Train wheels squealing': 'vehicle',
  'Subway, metro, underground': 'vehicle',
  'Aircraft': 'vehicle',
  'Aircraft engine': 'vehicle',
  'Jet engine': 'vehicle',
  'Propeller, airscrew': 'vehicle',
  'Helicopter': 'vehicle',
  'Fixed-wing aircraft, airplane': 'vehicle',
  'Bicycle': 'vehicle',
  'Skateboard': 'vehicle',
  'Engine': 'vehicle',
  'Light engine (high frequency)': 'vehicle',
  "Dental drill, dentist's drill": 'vehicle',
  'Lawn mower': 'vehicle',
  'Chainsaw': 'vehicle',
  'Medium engine (mid frequency)': 'vehicle',
  'Heavy engine (low frequency)': 'vehicle',
  'Engine knocking': 'vehicle',
  'Engine starting': 'vehicle',
  'Idling': 'vehicle',
  'Accelerating, revving, vroom': 'vehicle',

  // --- door ---
  'Door': 'door',
  'Doorbell': 'door',
  'Ding-dong': 'door',
  'Sliding door': 'door',
  'Slam': 'door',
  'Squeak': 'door',
  'Cupboard open or close': 'door',
  'Drawer open or close': 'door',

  // --- knock ---
  'Knock': 'knock',
  'Tap': 'knock',

  // --- siren & alarm ---
  'Alarm': 'siren',
  'Telephone': 'siren',
  'Telephone bell ringing': 'siren',
  'Ringtone': 'siren',
  'Telephone dialing, DTMF': 'siren',
  'Dial tone': 'siren',
  'Busy signal': 'siren',
  'Alarm clock': 'siren',
  'Siren': 'siren',
  'Civil defense siren': 'siren',
  'Buzzer': 'siren',
  'Smoke detector, smoke alarm': 'siren',
  'Fire alarm': 'siren',
  'Foghorn': 'siren',
  'Whistle': 'siren',
  'Steam whistle': 'siren',
  // Bells and chimes: ringing/signalling sounds, closest to siren & alarm.
  'Bell': 'siren',
  'Church bell': 'siren',
  'Jingle bell': 'siren',
  'Bicycle bell': 'siren',
  'Tuning fork': 'siren',
  'Chime': 'siren',
  'Wind chime': 'siren',
  'Change ringing (campanology)': 'siren',
  'Jingle, tinkle': 'siren',

  // --- gunshot: gunfire and artillery ---
  'Gunshot, gunfire': 'gunshot',
  'Machine gun': 'gunshot',
  'Fusillade': 'gunshot',
  'Artillery fire': 'gunshot',
  'Cap gun': 'gunshot',

  // --- impact & explosion ---
  'Explosion': 'impact',
  'Fireworks': 'impact',
  'Firecracker': 'impact',
  'Burst, pop': 'impact',
  'Eruption': 'impact',
  'Boom': 'impact',
  'Thump, thud': 'impact',
  'Thunk': 'impact',
  'Bang': 'impact',
  'Slap, smack': 'impact',
  'Whack, thwack': 'impact',
  'Smash, crash': 'impact',
  'Bouncing': 'impact',
  'Basketball bounce': 'impact',
  'Boing': 'impact',

  // --- glass & breaking ---
  'Glass': 'glass',
  'Chink, clink': 'glass',
  'Shatter': 'glass',
  'Breaking': 'glass',

  // --- silence: "no sound" categories that must never create an event ---
  // (task 20.1). Silence is the absence of sound, so it can never be a ghost;
  // mapping it explicitly keeps it out of the unknown-event path entirely.
  'Silence': 'silence',
};

/**
 * The family for a classifier category name. Unmapped names fall back to
 * `unknown` (Req 3.5), and `familyFor` is what the rest of the pipeline calls.
 * Speech and silence are reported separately via {@link isSpeechCategory} and
 * {@link isSilenceCategory}; `familyFor` never returns a ghost family for them.
 */
export function familyFor(name: string): Family {
  const mapped = familyMap[name];
  if (mapped === undefined || mapped === 'speech' || mapped === 'silence') return 'unknown';
  return mapped;
}

/** True when the category is spoken words (shown as a speech marker, Req 3.2). */
export function isSpeechCategory(name: string): boolean {
  return familyMap[name] === 'speech';
}

/**
 * True when the category is a "no sound" category (Silence) that must never
 * create an event (task 20.1). A window whose best cleared category is silence
 * carries no ghost and no unknown event.
 */
export function isSilenceCategory(name: string): boolean {
  return familyMap[name] === 'silence';
}
