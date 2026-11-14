/** Thin fetch wrapper for the Flask API. */
async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

export const getMetadata = () => getJSON("/api/metadata");

export function getData({ start, end, resample } = {}) {
  const p = new URLSearchParams();
  if (start) p.set("start", start);
  if (end) p.set("end", end);
  if (resample && resample !== "none") p.set("resample", resample);
  const qs = p.toString();
  return getJSON(`/api/data${qs ? `?${qs}` : ""}`);
}
