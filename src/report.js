// Shift report rendering: Pareto chart (SVG, no chart library) and the 8D cards.

const SEV_COLOR = {
  Critical: 'var(--crit)',
  Major: 'var(--major)',
  Minor: 'var(--minor)',
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dominantSeverity(entry) {
  if (entry.severities.Critical) return 'Critical';
  if (entry.severities.Major) return 'Major';
  return 'Minor';
}

export function renderPareto(container, stats) {
  const types = stats.types;
  if (!types.length) {
    container.innerHTML = '';
    return;
  }

  const W = 760;
  const H = 320;
  const m = { top: 26, right: 52, bottom: 74, left: 44 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const maxCount = Math.max(...types.map((t) => t.count), 1);
  const tickStep = Math.max(1, Math.ceil(maxCount / 4));
  const scaleMax = Math.ceil(maxCount / tickStep) * tickStep;
  const gap = pw / types.length;
  const barW = Math.min(gap * 0.58, 78);

  const grid = [];
  for (let value = 0; value <= scaleMax; value += tickStep) {
    const y = m.top + ph - (ph * value) / scaleMax;
    grid.push(
      `<line x1="${m.left}" y1="${y.toFixed(1)}" x2="${m.left + pw}" y2="${y.toFixed(1)}" class="grid" />` +
        `<text x="${m.left - 10}" y="${(y + 4).toFixed(1)}" class="axis" text-anchor="end">${value}</text>`,
    );
  }

  const bars = types
    .map((t, i) => {
      const x = m.left + gap * i + (gap - barW) / 2;
      const h = (t.count / scaleMax) * ph;
      const y = m.top + ph - h;
      const color = SEV_COLOR[dominantSeverity(t)];
      const label = t.type.length > 16 ? `${t.type.slice(0, 15)}…` : t.type;
      return (
        `<g class="bar"><title>${esc(t.type)} — ${t.count} (${Math.round(t.share * 100)}%)</title>` +
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="3" fill="${color}" />` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" class="barval" text-anchor="middle">${t.count}</text>` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(m.top + ph + 18).toFixed(1)}" class="axis" text-anchor="middle">${esc(label)}</text>` +
        `</g>`
      );
    })
    .join('');

  const points = types
    .map((t, i) => {
      const cx = m.left + gap * i + gap / 2;
      const cy = m.top + ph - t.cumulative * ph;
      return { cx, cy };
    });
  const line = points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="3.5" class="dot" />` +
        `<text x="${(p.cx + 9).toFixed(1)}" y="${(p.cy - 6).toFixed(1)}" class="axis cum">${Math.round(types[i].cumulative * 100)}%</text>`,
    )
    .join('');

  const pctTicks = [0, 25, 50, 75, 100]
    .map((v) => {
      const y = m.top + ph - (v / 100) * ph;
      return `<text x="${m.left + pw + 12}" y="${(y + 4).toFixed(1)}" class="axis" text-anchor="start">${v}%</text>`;
    })
    .join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pareto chart of defects by type">${grid.join('')}
    ${pctTicks}
    <line x1="${m.left}" y1="${m.top + ph}" x2="${m.left + pw}" y2="${m.top + ph}" class="baseline" />
    ${bars}
    <polyline points="${line}" class="cumline" />
    ${dots}
  </svg>
  <div class="pareto-legend">
    <span><i style="background:var(--crit)"></i>Critical</span>
    <span><i style="background:var(--major)"></i>Major</span>
    <span><i style="background:var(--minor)"></i>Minor</span>
  </div>`;
}

const STEP_TITLES = [
  ['D1', 'Team'],
  ['D2', 'Problem'],
  ['D3', 'Containment'],
  ['D4', 'Root cause'],
  ['D5', 'Corrective action'],
  ['D6', 'Implementation'],
  ['D7', 'Prevention'],
  ['D8', 'Recognition · handover'],
];

export function render8DSkeleton(container, hint) {
  container.innerHTML = STEP_TITLES.map(
    ([step, title]) => `<article class="d-card is-skeleton">
      <div class="d-step">${step}</div>
      <div class="d-body"><h4>${esc(title)}</h4><p class="muted">${esc(hint)}</p></div>
    </article>`,
  ).join('');
}

export function render8D(container, report) {
  if (!report?.eight_d?.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = report.eight_d
    .map(
      (d) => `<article class="d-card">
        <div class="d-step">${esc(d.step)}</div>
        <div class="d-body">
          <h4>${esc(d.title)}</h4>
          <p>${esc(d.finding)}</p>
        </div>
      </article>`,
    )
    .join('');
}
