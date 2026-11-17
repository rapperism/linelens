const KEY = 'linelens.shift.v1';

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecords(records) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch (err) {
    // A full quota only costs the persisted copy, never the current shift.
    console.warn('[LineLens] could not persist shift log', err);
  }
}

export function newId() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
