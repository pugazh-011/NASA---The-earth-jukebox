/**
 * Data -> music mapping. PURE functions only (no DOM, no audio) so every rule
 * can be unit-tested and documented in docs/DATA_TO_PIANO.md.
 *
 * Design decisions
 *  - Normalisation uses a FIXED range (whole dataset, or limits set in
 *    metadata.json), never the currently visible window. The same value
 *    therefore always gives the same note, so different periods are comparable.
 *  - A piano plays semitones, so pitch is quantised to MIDI integers
 *    (optionally snapped to a scale).
 *  - Velocity (loudness) follows the distance from a reference value.
 *  - This is an artistic mapping, NOT a physical conversion.
 */

export const SCALES = Object.freeze({
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
});

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function snapToScale(midi, low, high, scaleDegrees, root) {
  let best = null;
  let bestDist = Infinity;
  for (let n = low; n <= high; n++) {
    const pc = (((n - root) % 12) + 12) % 12;
    if (!scaleDegrees.includes(pc)) continue;
    const dist = Math.abs(n - midi);
    if (dist < bestDist) {
      best = n;
      bestDist = dist;
    }
  }
  return best ?? Math.round(midi);
}

/**
 * @param {object} o
 * @param {number} o.min        lowest value of the FIXED range
 * @param {number} o.max        highest value of the FIXED range
 * @param {number|null} [o.reference]  neutral value for loudness (default: range midpoint)
 * @param {number} [o.midiLow=48]  C3
 * @param {number} [o.midiHigh=72] C5
 * @param {keyof SCALES} [o.scale='chromatic']
 * @param {number} [o.root=0]   pitch class of the scale root (0 = C)
 */
export function createMapper({
  min,
  max,
  reference = null,
  midiLow = 48,
  midiHigh = 72,
  scale = "chromatic",
  root = 0,
} = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error("createMapper: min and max must be finite numbers with min <= max.");
  }
  if (!(midiHigh > midiLow)) throw new Error("createMapper: midiHigh must be greater than midiLow.");
  const degrees = SCALES[scale];
  if (!degrees) throw new Error(`createMapper: unknown scale '${scale}'.`);

  const ref = Number.isFinite(reference) ? reference : (min + max) / 2;
  const span = Math.max(Math.abs(min - ref), Math.abs(max - ref)) || 1;
  const range = max - min;

  function map(value) {
    if (!Number.isFinite(value)) throw new Error("map: value must be a finite number.");
    const outOfRange = value < min || value > max;
    const normalized = range === 0 ? 0.5 : clamp((value - min) / range, 0, 1);
    const continuous = midiLow + normalized * (midiHigh - midiLow);
    const midi =
      scale === "chromatic"
        ? Math.round(continuous)
        : snapToScale(continuous, midiLow, midiHigh, degrees, root);
    const velocity = 0.25 + 0.75 * Math.min(1, Math.abs(value - ref) / span);
    return {
      value,
      normalized,
      midi,
      noteName: midiToNoteName(midi),
      frequency: midiToFrequency(midi),
      velocity,
      outOfRange,
    };
  }

  return Object.freeze({
    map,
    min,
    max,
    reference: ref,
    midiLow,
    midiHigh,
    scale,
    describe: () => ({
      lowNote: midiToNoteName(midiLow),
      highNote: midiToNoteName(midiHigh),
      min,
      max,
      reference: ref,
      scale,
    }),
  });
}
