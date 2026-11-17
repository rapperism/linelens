// Aggregation of the shift log: counts, Pareto data, and the text-only digest
// that is the only thing the cloud model ever receives.

export function summarize(records) {
  const total = records.length;
  const byType = new Map();
  const bySeverity = { Critical: 0, Major: 0, Minor: 0 };
  const byPart = new Map();
  const byPath = { ON_DEVICE: 0, IN_CLOUD: 0, SIMULATED: 0 };

  for (const r of records) {
    const a = r.analysis || {};
    const type = a.defect_type || 'Unclassified';
    const entry = byType.get(type) || { type, count: 0, severities: { Critical: 0, Major: 0, Minor: 0 }, causes: [] };
    entry.count += 1;
    if (entry.severities[a.severity] !== undefined) entry.severities[a.severity] += 1;
    if (a.estimated_cause) entry.causes.push(a.estimated_cause);
    byType.set(type, entry);

    if (bySeverity[a.severity] !== undefined) bySeverity[a.severity] += 1;
    const part = (a.part || '').split('·')[0].trim() || 'Unknown part';
    byPart.set(part, (byPart.get(part) || 0) + 1);
    if (byPath[r.source] !== undefined) byPath[r.source] += 1;
  }

  const types = [...byType.values()].sort((a, b) => b.count - a.count);
  let running = 0;
  for (const item of types) {
    item.share = total ? item.count / total : 0;
    running += item.count;
    item.cumulative = total ? running / total : 0;
  }
  const topPartEntry = [...byPart.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  return {
    total,
    critical: bySeverity.Critical,
    major: bySeverity.Major,
    minor: bySeverity.Minor,
    types,
    byPath,
    topType: types[0]?.type || '—',
    topCount: types[0]?.count || 0,
    topPart: topPartEntry[0],
    topCause: types[0]?.causes[0] || '',
  };
}

export function buildDigest(records, max = 60) {
  const used = records.slice(-max);
  const s = summarize(used);
  const lines = [];
  lines.push(`Records: ${s.total} (Critical ${s.critical}, Major ${s.major}, Minor ${s.minor})`);
  lines.push(`By type: ${s.types.map((t) => `${t.type} ${t.count}`).join(' · ')}`);
  const parts = new Map();
  for (const r of used) {
    const p = (r.analysis?.part || '').split('·')[0].trim() || 'Unknown';
    parts.set(p, (parts.get(p) || 0) + 1);
  }
  lines.push(`By part: ${[...parts.entries()].map(([p, n]) => `${p} ${n}`).join(' · ')}`);
  const stations = new Map();
  for (const r of used) {
    const st = r.station || 'unknown station';
    stations.set(st, (stations.get(st) || 0) + 1);
  }
  lines.push(`By station: ${[...stations.entries()].map(([st, n]) => `${st} ${n}`).join(' · ')}`);
  lines.push('Individual cards:');
  for (const r of used.slice(-18)) {
    const a = r.analysis || {};
    lines.push(
      `- ${new Date(r.createdAt).toISOString().slice(11, 16)} ${r.station || ''} | ${a.part || ''} | ${a.defect_type || ''} (${a.severity || ''}) | ${a.estimated_cause || ''}`,
    );
  }
  if (records.length > used.length) lines.push(`(older ${records.length - used.length} cards summarised in the counts only)`);
  return lines.join('\n');
}

export function digestSize(records, max = 60) {
  const digest = buildDigest(records, max);
  return { chars: digest.length, records: Math.min(records.length, max), digest };
}
