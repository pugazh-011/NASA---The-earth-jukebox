# Data → piano mapping (implemented in `frontend/js/mapping.js`)

This is a **design choice for sonification, not a physical conversion**.

| Step | Rule |
|---|---|
| Range | Fixed: `sonification.range_min/max` from `metadata.json`, else min/max of the **whole** dataset (not the visible window) |
| Normalise | `t = clamp((v - min) / (max - min), 0, 1)`; out-of-range values are clamped and flagged on screen |
| Pitch | `midi = round(48 + t × (72 − 48))` (C3–C5); optional snap to a scale (pentatonic, major) |
| Frequency | `f = 440 × 2^((midi − 69) / 12)` |
| Loudness | `velocity = 0.25 + 0.75 × min(1, |v − ref| / maxDistance)`; `ref` from metadata, else range midpoint |
| Timing | One note per observation at a fixed tempo (notes/second). Observation spacing is **not** encoded in time |

Why a fixed range: the original starter normalised to the *loaded* window, so the same value could sound different
depending on the dates selected. Fixed range makes periods comparable.

Not done on purpose: no wind/cloud/chlorophyll layers (each needs its own NASA source), no mapping of sign to
"El Niño/La Niña" (needs NASA's convention), no timbre changes before listening tests show listeners can tell
differences apart.

## Listening test (do this for the presentation)
Play three windows (e.g. a strong positive period, a strong negative period, a quiet period) to 3–5 people without
telling them which is which. Ask which sounds "highest" and "loudest". Record how many are right. That result is
your evidence that the sonification carries information.
