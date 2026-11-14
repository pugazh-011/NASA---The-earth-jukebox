/**
 * Playback engine.
 *  - Audio is scheduled on the AudioContext clock (sample-accurate), using a
 *    short look-ahead, instead of setTimeout (which drifts and stutters).
 *  - The visual cursor is driven from the SAME clock, so chart and sound
 *    cannot drift apart.
 *  - Pause = AudioContext.suspend(); Stop fades a per-playback bus so notes
 *    that were already scheduled do not leak out afterwards.
 */

const defaultTimers = () => ({
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
  raf: (fn) => globalThis.requestAnimationFrame(fn),
  caf: (id) => globalThis.cancelAnimationFrame(id),
});

export class Player {
  constructor({
    ctx,
    synth,
    onNote = () => {},
    onEnd = () => {},
    onState = () => {},
    timers = defaultTimers(),
    lookahead = 0.3,
    tickMs = 40,
    noteDuration = 1.6,
  }) {
    Object.assign(this, { ctx, synth, onNote, onEnd, onState, timers, lookahead, tickMs, noteDuration });
    this.observations = [];
    this.mapper = null;
    this.notesPerSecond = 6;
    this.state = "idle"; // idle | playing | paused
    this._queue = [];
    this._index = 0;
    this._nextTime = 0;
    this._endTime = null;
    this._bus = null;
    this._timerId = null;
    this._rafId = null;
  }

  load(observations, mapper) {
    this.stop();
    this.observations = observations;
    this.mapper = mapper;
  }

  setNotesPerSecond(n) {
    const v = Number(n);
    this.notesPerSecond = Number.isFinite(v) ? Math.min(30, Math.max(0.5, v)) : 6;
  }

  async play(fromIndex = 0) {
    const n = this.observations.length;
    if (!n || !this.mapper) return;
    this._teardown();
    if (this.ctx.state === "suspended") await this.ctx.resume(); // needs a user gesture
    this._bus = this.synth.createBus();
    this._index = Math.min(n - 1, Math.max(0, Math.floor(fromIndex)));
    this._nextTime = this.ctx.currentTime + 0.08;
    this._endTime = null;
    this._queue = [];
    this._setState("playing");
    this._startLoops();
  }

  pause() {
    if (this.state !== "playing") return;
    this._stopLoops();
    this.ctx.suspend();
    this._setState("paused");
  }

  async resume() {
    if (this.state !== "paused") return;
    await this.ctx.resume();
    this._startLoops();
    this._setState("playing");
  }

  stop() {
    if (this.state === "idle" && !this._bus) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._teardown();
    this._setState("idle");
  }

  /** Schedule notes that fall inside the look-ahead window. */
  tick() {
    if (this.state !== "playing") return;
    const n = this.observations.length;
    const horizon = this.ctx.currentTime + this.lookahead;
    while (this._index < n && this._nextTime < horizon) {
      const obs = this.observations[this._index];
      const mapped = this.mapper.map(obs.value);
      this.synth.noteOn(mapped.frequency, mapped.velocity, this._nextTime, this.noteDuration, this._bus);
      this._queue.push({ time: this._nextTime, index: this._index, mapped });
      this._nextTime += 1 / this.notesPerSecond;
      this._index += 1;
    }
    if (this._index >= n && this._endTime === null) this._endTime = this._nextTime + 0.4;
  }

  /** Called every animation frame: report the note that is sounding now. */
  frame() {
    if (this.state !== "playing") return;
    const now = this.ctx.currentTime;
    let latest = null;
    while (this._queue.length && this._queue[0].time <= now) latest = this._queue.shift();
    if (latest) this.onNote(latest.index, this.observations[latest.index], latest.mapped);

    if (this._endTime !== null && now >= this._endTime && !this._queue.length) {
      this._teardown();
      this._setState("idle");
      this.onEnd();
      return;
    }
    this._rafId = this.timers.raf(() => this.frame());
  }

  _startLoops() {
    this._stopLoops();
    this._timerId = this.timers.setInterval(() => this.tick(), this.tickMs);
    this.tick();
    this._rafId = this.timers.raf(() => this.frame());
  }

  _stopLoops() {
    if (this._timerId !== null) this.timers.clearInterval(this._timerId);
    if (this._rafId !== null) this.timers.caf(this._rafId);
    this._timerId = this._rafId = null;
  }

  _teardown() {
    this._stopLoops();
    if (this._bus) {
      const bus = this._bus;
      const now = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.015);
      globalThis.setTimeout(() => bus.disconnect(), 400);
      this._bus = null;
    }
    this._queue = [];
    this._endTime = null;
  }

  _setState(s) {
    this.state = s;
    this.onState(s);
  }
}
