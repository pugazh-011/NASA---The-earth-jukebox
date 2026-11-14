/**
 * Small additive "piano-like" synthesiser built on the Web Audio API.
 * Honest label: this is a synthesised approximation, not a sampled piano.
 * To upgrade later, swap this class for a sampler (e.g. Tone.Sampler) that
 * exposes the same two methods: createBus() and noteOn().
 */

const PARTIALS = [
  { n: 1, amp: 1.0 },
  { n: 2, amp: 0.45 },
  { n: 3, amp: 0.22 },
  { n: 4, amp: 0.1 },
];
const INHARMONICITY = 0.0004; // slight stretch of upper partials, like real strings

export class PianoSynth {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.limiter = ctx.createDynamicsCompressor();
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  /** Master volume, 0..1 (kept modest by design: safe listening levels). */
  setVolume(v) {
    const g = Math.min(1, Math.max(0, v));
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }

  /** A per-playback gain node, so Stop can silence already-scheduled notes. */
  createBus() {
    const bus = this.ctx.createGain();
    bus.connect(this.master);
    return bus;
  }

  /**
   * @param {number} frequency Hz
   * @param {number} velocity  0..1
   * @param {number} when      AudioContext time to start
   * @param {number} duration  seconds (upper bound; high notes decay faster)
   * @param {AudioNode} destination
   */
  noteOn(frequency, velocity, when, duration, destination = this.master) {
    const ctx = this.ctx;
    const decay = Math.min(duration, 2.4 * Math.sqrt(261.63 / frequency), 2.2);

    const noteGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(12000, 900 + velocity * 5200 + frequency * 2);
    filter.Q.value = 0.4;
    noteGain.connect(filter);
    filter.connect(destination);

    const peak = 0.22 * velocity;
    noteGain.gain.setValueAtTime(0.0001, when);
    noteGain.gain.linearRampToValueAtTime(peak, when + 0.006);
    noteGain.gain.setTargetAtTime(0.0001, when + 0.006, decay / 4);

    const stopAt = when + decay + 0.15;
    let remaining = PARTIALS.length;
    for (const { n, amp } of PARTIALS) {
      const f = frequency * n * Math.sqrt(1 + INHARMONICITY * n * n);
      if (f > 14000) {
        remaining -= 1;
        continue;
      }
      const osc = ctx.createOscillator();
      const pg = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, when);
      pg.gain.value = amp;
      osc.connect(pg);
      pg.connect(noteGain);
      osc.start(when);
      osc.stop(stopAt);
      osc.onended = () => {
        osc.disconnect();
        pg.disconnect();
        remaining -= 1;
        if (remaining <= 0) {
          noteGain.disconnect();
          filter.disconnect();
        }
      };
    }
  }
}
