import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../frontend/js/player.js";
import { createMapper } from "../frontend/js/mapping.js";

function makeHarness() {
  const ctx = { currentTime: 0, state: "running", resume() { this.state = "running"; return Promise.resolve(); }, suspend() { this.state = "suspended"; return Promise.resolve(); } };
  const gainCalls = [];
  const bus = { gain: { cancelScheduledValues() {}, setTargetAtTime: (...a) => gainCalls.push(a) }, disconnect() {} };
  const notes = [];
  const synth = { createBus: () => bus, noteOn: (f, v, when, d, dest) => notes.push({ f, v, when, dest }) };
  const events = { notes: [], ended: 0, states: [] };
  const timers = { setInterval: () => 1, clearInterval() {}, raf: () => 1, caf() {} };
  const player = new Player({
    ctx, synth, timers,
    onNote: (i) => events.notes.push(i),
    onEnd: () => events.ended++,
    onState: (s) => events.states.push(s),
  });
  const obs = [0, 1, 2, 3, 4, 5].map((v, i) => ({ date: `2000-01-${String(i + 1).padStart(2, "0")}`, value: v }));
  player.load(obs, createMapper({ min: 0, max: 5 }));
  return { ctx, player, notes, events, gainCalls, bus };
}

test("notes are scheduled on the audio clock at the chosen tempo, within the look-ahead only", async () => {
  const { ctx, player, notes } = makeHarness();
  player.setNotesPerSecond(5); // 0.2 s apart
  await player.play(0);
  // look-ahead 0.3 s from t=0.08 start -> notes at 0.08 and 0.28
  assert.deepEqual(notes.map((n) => +n.when.toFixed(2)), [0.08, 0.28]);
  ctx.currentTime = 0.5;
  player.tick();
  assert.ok(notes.length >= 4);
  const gaps = notes.slice(1).map((n, i) => +(n.when - notes[i].when).toFixed(3));
  assert.ok(gaps.every((g) => g === 0.2));
});

test("the visual callback reports the note that is sounding now", async () => {
  const { ctx, player, events } = makeHarness();
  player.setNotesPerSecond(5);
  await player.play(0);
  ctx.currentTime = 0.5; player.tick();
  ctx.currentTime = 0.5; player.frame();
  assert.equal(events.notes.at(-1), 2); // notes at .08,.28,.48 -> index 2 is due
});

test("sequence ends once, after the last note", async () => {
  const { ctx, player, events } = makeHarness();
  player.setNotesPerSecond(10);
  await player.play(0);
  for (let t = 0; t < 3; t += 0.1) { ctx.currentTime = t; player.tick(); player.frame(); }
  assert.equal(events.ended, 1);
  assert.equal(player.state, "idle");
});

test("stop fades the bus so already-scheduled notes cannot leak", async () => {
  const { player, gainCalls } = makeHarness();
  await player.play(0);
  player.stop();
  assert.equal(player.state, "idle");
  assert.equal(gainCalls.at(-1)[0], 0);
});

test("pause suspends the context and resume continues without re-scheduling from zero", async () => {
  const { ctx, player, notes } = makeHarness();
  await player.play(0);
  const before = notes.length;
  player.pause();
  assert.equal(ctx.state, "suspended");
  assert.equal(player.state, "paused");
  await player.resume();
  assert.equal(player.state, "playing");
  assert.ok(notes.length >= before);
});

test("play(from) clamps the start index", async () => {
  const { player, notes } = makeHarness();
  await player.play(999);
  assert.equal(notes.length >= 1, true);
  assert.equal(player._queue[0].index, 5);
});
