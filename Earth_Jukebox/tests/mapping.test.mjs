import test from "node:test";
import assert from "node:assert/strict";
import { createMapper, midiToFrequency, midiToNoteName, SCALES } from "../frontend/js/mapping.js";

test("A4 is 440 Hz and C4 is ~261.63 Hz", () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(60) - 261.6256) < 1e-3);
});

test("note names", () => {
  assert.equal(midiToNoteName(60), "C4");
  assert.equal(midiToNoteName(48), "C3");
  assert.equal(midiToNoteName(69), "A4");
  assert.equal(midiToNoteName(61), "C#4");
});

test("range endpoints map to the configured notes", () => {
  const m = createMapper({ min: -10, max: 30 });
  assert.equal(m.map(-10).midi, 48);
  assert.equal(m.map(30).midi, 72);
  assert.equal(m.map(10).midi, 60);
});

test("mapping is monotonic (higher value never gives a lower note)", () => {
  const m = createMapper({ min: -5, max: 5 });
  let prev = -Infinity;
  for (let v = -5; v <= 5; v += 0.1) {
    const midi = m.map(v).midi;
    assert.ok(midi >= prev);
    prev = midi;
  }
});

test("same value -> same note regardless of what window is displayed (fixed range)", () => {
  const m = createMapper({ min: -10, max: 10 });
  assert.equal(m.map(3.3).midi, m.map(3.3).midi);
});

test("out-of-range values are clamped and flagged, not extrapolated", () => {
  const m = createMapper({ min: 0, max: 10 });
  const hi = m.map(50);
  assert.equal(hi.midi, 72);
  assert.equal(hi.outOfRange, true);
  assert.equal(m.map(5).outOfRange, false);
});

test("scale snapping only produces notes of the chosen scale, within range", () => {
  const m = createMapper({ min: 0, max: 1, scale: "major_pentatonic" });
  for (let v = 0; v <= 1; v += 0.01) {
    const { midi } = m.map(v);
    assert.ok(SCALES.major_pentatonic.includes(midi % 12), `midi ${midi}`);
    assert.ok(midi >= 48 && midi <= 72);
  }
});

test("velocity grows with distance from the reference and stays in 0.25..1", () => {
  const m = createMapper({ min: -4, max: 4, reference: 0 });
  assert.equal(m.map(0).velocity, 0.25);
  assert.equal(m.map(4).velocity, 1);
  assert.equal(m.map(-4).velocity, 1);
  assert.ok(m.map(2).velocity > m.map(1).velocity);
});

test("constant range does not divide by zero", () => {
  const m = createMapper({ min: 2, max: 2 });
  const r = m.map(2);
  assert.ok(Number.isFinite(r.frequency));
});

test("invalid input is rejected loudly", () => {
  assert.throws(() => createMapper({ min: 1, max: 0 }));
  assert.throws(() => createMapper({ min: NaN, max: 1 }));
  assert.throws(() => createMapper({ min: 0, max: 1, scale: "nope" }));
  assert.throws(() => createMapper({ min: 0, max: 1 }).map(NaN));
});
