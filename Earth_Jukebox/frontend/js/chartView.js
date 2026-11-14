/** Chart.js wrapper: time series + reference line + a cursor synced to audio. */

export function createChartView(canvas, { onSeek } = {}) {
  let chart = null;
  let cursorIndex = null;

  const cursorPlugin = {
    id: "cursorLine",
    afterDatasetsDraw(c) {
      if (cursorIndex === null) return;
      const el = c.getDatasetMeta(0).data[cursorIndex];
      if (!el) return;
      const { ctx, chartArea } = c;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 189, 120, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(el.x, chartArea.top);
      ctx.lineTo(el.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  function setData(observations, { unit, reference = null, label = "NASA observation" } = {}) {
    if (typeof Chart === "undefined") {
      throw new Error("Chart.js did not load (check your internet connection).");
    }
    cursorIndex = null;
    if (chart) chart.destroy();

    const labels = observations.map((o) => o.date);
    const datasets = [
      {
        label,
        data: observations.map((o) => o.value),
        borderColor: "#64e5df",
        backgroundColor: "rgba(100,229,223,.10)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
        fill: true,
      },
    ];
    if (Number.isFinite(reference)) {
      datasets.push({
        label: "Reference",
        data: labels.map(() => reference),
        borderColor: "rgba(145,166,184,.6)",
        borderDash: [6, 6],
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
      });
    }

    chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      plugins: [cursorPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: {
          legend: { labels: { color: "#a9bdcb" } },
          tooltip: { callbacks: { label: (c) => `${c.parsed.y}${unit ? " " + unit : ""}` } },
        },
        scales: {
          x: { ticks: { color: "#8299aa", maxTicksLimit: 8 }, grid: { color: "rgba(175,210,230,.08)" } },
          y: {
            ticks: { color: "#8299aa" },
            grid: { color: "rgba(175,210,230,.08)" },
            title: { display: true, text: unit ? `Value (${unit})` : "Value (unit not confirmed)", color: "#a9bdcb" },
          },
        },
        onClick: (evt) => {
          const hits = chart.getElementsAtEventForMode(evt, "nearest", { intersect: false, axis: "x" }, true);
          if (hits.length && onSeek) onSeek(hits[0].index);
        },
      },
    });
  }

  function highlight(index) {
    if (!chart) return;
    cursorIndex = index;
    const el = chart.getDatasetMeta(0).data[index];
    if (el) {
      chart.setActiveElements([{ datasetIndex: 0, index }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index }], { x: el.x, y: el.y });
    }
    chart.update("none");
  }

  function clearHighlight() {
    if (!chart) return;
    cursorIndex = null;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update("none");
  }

  return { setData, highlight, clearHighlight };
}
