/** UI orchestration: loads data, draws the chart, wires the controls to the player. */
import { getMetadata, getData } from "./api.js";
import { createChartView } from "./chartView.js";
import { createMapper } from "./mapping.js";
import { PianoSynth } from "./synth.js";
import { Player } from "./player.js";

const $ = (id) => document.getElementById(id);
const fmt = (x) => (Number.isFinite(x) ? Number(x).toPrecision(4) : "—");
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const state = {
  meta: null,
  observations: [],
  mapper: null,
  rangeSource: "",
  startIndex: 0,
  needsLoad: true,
  synth: null,
  player: null,
  ctx: null,
};

const chart = createChartView($("enso-chart"), {
  onSeek(index) {
    state.startIndex = index;
    chart.highlight(index);
    const o = state.observations[index];
    $("now-playing").textContent = `Start position: ${o.date} (click Play)`;
    if (state.player && state.player.state === "playing") state.player.play(index);
  },
});

/* ---------------------------------------------------------------- status */
function setStatus(text, ok = false) {
  const el = $("data-status");
  el.textContent = text;
  el.classList.toggle("ok", ok);
}

function setPlayable(enabled) {
  $("play-button").disabled = !enabled;
  $("stop-button").disabled = !enabled;
}

function renderWarnings(meta) {
  const box = $("meta-warnings");
  const list = $("meta-warnings-list");
  list.replaceChildren();
  const warnings = meta.metadata_warnings ?? [];
  for (const w of warnings) {
    const li = document.createElement("li");
    li.textContent = w;
    list.appendChild(li);
  }
  box.hidden = warnings.length === 0;
}

/* ------------------------------------------------------------- metadata */
function renderMetadata(meta) {
  $("source-name").textContent = meta.source_name || "NASA dataset (not configured)";
  $("source-detail").textContent = [meta.provider, meta.doi && `DOI ${meta.doi}`].filter(Boolean).join(" · ") || "Details not configured";
  $("variable-name").textContent = meta.variable || "Variable not configured";
  $("variable-unit").textContent = meta.unit ? `Unit: ${meta.unit}` : "Unit not yet confirmed from NASA documentation";
  $("observation-count").textContent = meta.rows ?? "—";
  $("date-range").textContent = meta.first_date ? `${meta.first_date} to ${meta.last_date}` : "Waiting for data";

  const linkBox = $("source-link");
  linkBox.replaceChildren();
  if (typeof meta.source_url === "string" && /^https:\/\//.test(meta.source_url)) {
    const a = document.createElement("a");
    a.href = meta.source_url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open NASA dataset page";
    linkBox.appendChild(a);
  }
  let citation = meta.citation || "";
  if (meta.accessed_on) citation = citation.replace("[YYYY-MM-DD]", meta.accessed_on);
  $("citation").textContent = citation;
  renderWarnings(meta);
}

/* ------------------------------------------------------------- mapping */
function buildMapper() {
  const s = state.meta?.sonification ?? {};
  const fixed = Number.isFinite(s.range_min) && Number.isFinite(s.range_max);
  const min = fixed ? s.range_min : state.meta.value_min;
  const max = fixed ? s.range_max : state.meta.value_max;
  state.rangeSource = fixed ? "fixed limits from metadata.json" : "full dataset range (all dates)";
  state.mapper = createMapper({
    min,
    max,
    reference: Number.isFinite(s.reference) ? s.reference : null,
    midiLow: s.midi_low ?? 48,
    midiHigh: s.midi_high ?? 72,
    scale: $("scale-select").value,
  });
  if (state.player) state.player.mapper = state.mapper;

  const d = state.mapper.describe();
  const unit = state.meta.unit ? ` ${state.meta.unit}` : "";
  $("mapping-text").textContent =
    `Pitch: ${fmt(d.min)}${unit} → ${d.lowNote}, ${fmt(d.max)}${unit} → ${d.highNote} ` +
    `(${state.rangeSource}; scale: ${d.scale.replace("_", " ")}). ` +
    `Loudness grows with distance from ${fmt(d.reference)}${unit}` +
    `${Number.isFinite(s.reference) ? " (reference from metadata)" : " (midpoint of the range)"}. ` +
    `The same value always plays the same note, whatever dates are selected.`;
}

function updateDuration() {
  const nps = Number($("tempo-control").value);
  $("tempo-value").textContent = `${nps} notes/s`;
  const n = state.observations.length;
  $("duration-estimate").textContent = n ? `≈ ${mmss(n / nps)} for ${n} notes` : "";
}

/* ----------------------------------------------------------------- data */
async function refresh() {
  if (state.player) state.player.stop();
  $("chart-message").textContent = "Loading…";
  try {
    const result = await getData({
      start: $("start-date").value,
      end: $("end-date").value,
      resample: $("resample-select").value,
    });
    state.observations = result.observations;
    if (!state.observations.length) throw new Error("No observations in the selected date range.");

    chart.setData(state.observations, {
      unit: state.meta.unit,
      reference: state.meta.sonification?.reference ?? null,
    });
    const s = result.summary;
    $("stat-min").textContent = fmt(s.minimum);
    $("stat-mean").textContent = fmt(s.mean);
    $("stat-max").textContent = fmt(s.maximum);
    $("chart-message").textContent = `${result.count} observations shown. ${result.query.note}`;
    state.startIndex = 0;
    state.needsLoad = true;
    $("progress").value = 0;
    $("now-playing").textContent = "No observation playing";
    setPlayable(true);
    updateDuration();
  } catch (err) {
    setPlayable(false);
    $("chart-message").textContent = err.message;
  }
}

/* ---------------------------------------------------------------- audio */
function ensureAudio() {
  if (state.player) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("This browser does not support Web Audio.");
  state.ctx = new Ctx();
  state.synth = new PianoSynth(state.ctx);
  state.synth.setVolume(Number($("volume-control").value));
  state.player = new Player({
    ctx: state.ctx,
    synth: state.synth,
    onNote(index, obs, m) {
      chart.highlight(index);
      state.startIndex = index;
      $("progress").value = (index + 1) / state.observations.length;
      const unit = state.meta.unit ? ` ${state.meta.unit}` : "";
      $("now-playing").textContent =
        `${obs.date} · value ${fmt(obs.value)}${unit} → ${m.noteName} (${m.frequency.toFixed(1)} Hz), loudness ${m.velocity.toFixed(2)}` +
        (m.outOfRange ? " · outside mapping range (clamped)" : "");
    },
    onEnd() {
      state.startIndex = 0;
      $("now-playing").textContent = "Sequence complete";
      $("progress").value = 1;
    },
    onState(s) {
      $("play-button").textContent = s === "playing" ? "❚❚ Pause" : s === "paused" ? "▶ Resume" : "▶ Play";
      $("play-button").setAttribute("aria-pressed", String(s === "playing"));
      if (s === "idle") chart.clearHighlight();
    },
  });
  state.player.setNotesPerSecond(Number($("tempo-control").value));
}

async function onPlayClick() {
  try {
    ensureAudio();
    const p = state.player;
    if (state.needsLoad) {
      p.load(state.observations, state.mapper);
      state.needsLoad = false;
    }
    if (p.state === "playing") p.pause();
    else if (p.state === "paused") await p.resume();
    else await p.play(state.startIndex);
  } catch (err) {
    $("audio-message").textContent = err.message;
  }
}

/* ----------------------------------------------------------------- boot */
function wireControls() {
  $("play-button").addEventListener("click", onPlayClick);
  $("stop-button").addEventListener("click", () => {
    state.player?.stop();
    state.startIndex = 0;
    $("progress").value = 0;
    $("now-playing").textContent = "Stopped";
  });
  $("apply-button").addEventListener("click", refresh);
  $("reload-button").addEventListener("click", boot);
  $("tempo-control").addEventListener("input", (e) => {
    state.player?.setNotesPerSecond(Number(e.target.value));
    updateDuration();
  });
  $("volume-control").addEventListener("input", (e) => state.synth?.setVolume(Number(e.target.value)));
  $("scale-select").addEventListener("change", () => state.meta?.dataset_loaded && buildMapper());
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body && !$("play-button").disabled) {
      e.preventDefault();
      onPlayClick();
    }
  });
}

async function boot() {
  setStatus("Checking dataset…");
  setPlayable(false);
  try {
    const meta = await getMetadata();
    state.meta = meta;
    renderMetadata(meta);
    if (!meta.dataset_loaded) {
      setStatus("Waiting for data");
      $("chart-message").textContent = meta.data_status || "Add a validated NASA CSV at data/nasa_enso.csv.";
      return;
    }
    $("start-date").min = $("end-date").min = meta.first_date;
    $("start-date").max = $("end-date").max = meta.last_date;
    if (!$("start-date").value) $("start-date").value = meta.first_date;
    if (!$("end-date").value) $("end-date").value = meta.last_date;
    buildMapper();
    await refresh();
    setStatus("NASA dataset loaded", true);
  } catch (err) {
    setStatus("Server not reachable");
    $("chart-message").textContent = err.message;
  }
}

wireControls();
boot();
