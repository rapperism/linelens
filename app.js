import { t, getLang, toggleLang, applyTranslations } from './src/i18n.js';
import { SAMPLES } from './src/samples.js';
import { initRuntime, mirrorRecord } from './src/firebase.js';
import { analyzeDefect, generateShiftReport } from './src/inference.js';
import { summarize, digestSize } from './src/aggregate.js';
import { loadRecords, saveRecords, newId } from './src/store.js';
import { renderPareto, render8D, render8DSkeleton } from './src/report.js';
import { DemoRecorder } from './src/recorder.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  offline: $('#offline-banner'),
  demoPill: $('#demo-pill'),
  rtFirebase: $('#rt-firebase'),
  rtAppCheck: $('#rt-appcheck'),
  rtOnDevice: $('#rt-ondevice'),
  rtRc: $('#rt-rc'),
  views: { capture: $('#view-capture'), log: $('#view-log'), report: $('#view-report') },
  navItems: [...document.querySelectorAll('.nav-item')],
  navCount: $('#nav-log-count'),
  line: $('#ctx-line'),
  station: $('#ctx-station'),
  shift: $('#ctx-shift'),
  mode: $('#mode'),
  langBtn: $('#lang-toggle'),
  recordBtn: $('#record-btn'),
  dropzone: $('#dropzone'),
  preview: $('#preview'),
  file: $('#file'),
  pick: $('#pick-btn'),
  photoName: $('#photo-name'),
  sampleList: $('#sample-list'),
  memo: $('#memo'),
  analyzeBtn: $('#analyze-btn'),
  analyzeStatus: $('#analyze-status'),
  resultEmpty: $('#result-empty'),
  resultCard: $('#result-card'),
  rType: $('#r-type'),
  rBadge: $('#r-badge'),
  rSev: $('#r-sev'),
  rCat: $('#r-cat'),
  rConf: $('#r-conf'),
  rPart: $('#r-part'),
  rLocation: $('#r-location'),
  rCause: $('#r-cause'),
  rAction: $('#r-action'),
  rLatency: $('#r-latency'),
  rModel: $('#r-model'),
  saveBtn: $('#save-btn'),
  logEmpty: $('#log-empty'),
  logWrap: $('#log-table-wrap'),
  logBody: $('#log-body'),
  logCount: $('#log-count'),
  clearLog: $('#clear-log-btn'),
  reportEmpty: $('#report-empty'),
  reportBody: $('#report-body'),
  reportStatus: $('#report-status'),
  reportBtn: $('#report-generate-btn'),
  statTotal: $('#stat-total'),
  statCritical: $('#stat-critical'),
  statProfile: $('#stat-profile'),
  reportBadge: $('#report-badge'),
  pareto: $('#pareto'),
  eightd: $('#eightd'),
  reportTrend: $('#report-trend'),
  reportDriver: $('#report-driver'),
  reportSummary: $('#report-summary'),
  hud: $('#record-hud'),
  recTimer: $('#rec-timer'),
  recStop: $('#rec-stop'),
  recScenario: $('#rec-scenario'),
  consent: $('#consent'),
  consentImages: $('#consent-images'),
  consentRecords: $('#consent-records'),
  consentPayload: $('#consent-payload'),
  consentSend: $('#consent-send'),
  consentCancel: $('#consent-cancel'),
  toast: $('#toast'),
};

const runtimeCfg = {
  live: false,
  reason: 'loading',
  remote: { report_model: 'gemini-3.8-flash', max_records_per_report: '60' },
  device: { state: 'unknown' },
};

const state = {
  runtime: runtimeCfg,
  photo: null,
  analysis: null,
  lastResult: null,
  records: loadRecords(),
  report: null,
  reportSimulated: false,
  busy: false,
  view: 'capture',
  recording: false,
};

const recorder = new DemoRecorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let runtimePromise = null;

/* ── helpers ──────────────────────────────────────────────────── */

function setStatus(message = '', kind = 'busy') {
  const box = el.analyzeStatus;
  if (!message) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.className = `analyze-status${kind === 'error' ? ' is-error' : ''}`;
  box.innerHTML = '';
  if (kind === 'busy') {
    const spin = document.createElement('span');
    spin.className = 'spinner';
    box.appendChild(spin);
  }
  const text = document.createElement('span');
  text.textContent = message;
  box.appendChild(text);
}

function setReportStatus(message = '', kind = 'busy') {
  const box = el.reportStatus;
  if (!message) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.className = `analyze-status${kind === 'error' ? ' is-error' : ''}`;
  box.innerHTML = '';
  if (kind === 'busy') {
    const spin = document.createElement('span');
    spin.className = 'spinner';
    box.appendChild(spin);
  }
  const span = document.createElement('span');
  span.textContent = message;
  box.appendChild(span);
}

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

function badgeFor(source, requestedMode) {
  switch (source) {
    case 'ON_DEVICE':
      return { cls: 'ondevice', key: 'path.ondevice' };
    case 'IN_CLOUD':
      return requestedMode === 'only_in_cloud'
        ? { cls: 'cloud', key: 'path.cloud' }
        : { cls: 'fallback', key: 'path.fallback' };
    case 'SIMULATED_CLOUD':
      return { cls: 'sim', key: 'path.sim.cloud' };
    case 'SIMULATED_ON_DEVICE':
    default:
      return { cls: 'sim', key: 'path.sim.ondevice' };
  }
}

function makeBadge(container, source, requestedMode) {
  const { cls, key } = badgeFor(source, requestedMode);
  container.className = `badge ${cls}`;
  container.textContent = t(key);
}

function severityChip(node, severity) {
  node.className = `sev ${severity}`;
  node.textContent = t(`sev.${severity}`);
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── runtime ──────────────────────────────────────────────────── */

async function loadConfig() {
  if (window.LINELENS_FIREBASE_CONFIG) return window.LINELENS_FIREBASE_CONFIG;
  try {
    const mod = await import('./firebase-config.js');
    return mod.default || window.LINELENS_FIREBASE_CONFIG || null;
  } catch {
    return null;
  }
}

function renderRuntime() {
  const rt = state.runtime;
  el.demoPill.hidden = Boolean(rt.live);
  if (rt.live) {
    el.rtFirebase.textContent = t('runtime.firebase.live');
    el.rtFirebase.className = 'ok';
  } else {
    el.rtFirebase.textContent = rt.reason === 'error' ? 'error' : t('runtime.firebase.demo');
    el.rtFirebase.className = 'warn';
    el.rtFirebase.title = rt.error || '';
  }
  el.rtAppCheck.textContent = rt.appCheck ? t('runtime.on') : t('runtime.off');
  el.rtAppCheck.className = rt.appCheck ? 'ok' : '';
  const deviceKey = {
    available: 'runtime.device.ready',
    downloadable: 'runtime.device.downloadable',
    downloading: 'runtime.device.downloading',
    unavailable: 'runtime.device.unavailable',
    absent: 'runtime.device.absent',
    unknown: 'runtime.device.unknown',
  }[rt.device?.state] || 'runtime.device.unknown';
  el.rtOnDevice.textContent = t(deviceKey);
  el.rtOnDevice.className = rt.device?.state === 'available' ? 'ok' : 'warn';
  el.rtOnDevice.title = rt.device?.error || '';
  el.rtRc.textContent = rt.rc ? (rt.remote.report_model || t('runtime.on')) : t('runtime.rc.defaults');
  el.rtRc.className = rt.rc ? 'ok' : '';
}

/* ── images ──────────────────────────────────────────────────── */

async function bitmapFrom(src) {
  if (typeof src === 'string') {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`image ${res.status}`);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
  return createImageBitmap(src);
}

async function prepareImage(src) {
  const bitmap = await bitmapFrom(src);
  const max = 1024;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

  const tw = 120;
  const th = Math.max(1, Math.round((h / w) * tw));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = tw;
  thumbCanvas.height = th;
  thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, tw, th);

  return {
    dataUrl,
    data: dataUrl.split(',')[1],
    mimeType: 'image/jpeg',
    thumb: thumbCanvas.toDataURL('image/jpeg', 0.7),
    width: w,
    height: h,
  };
}

async function setPhotoFromSample(sample) {
  try {
    const prepared = await prepareImage(sample.file);
    state.photo = { ...prepared, sampleId: sample.id, name: sample.file.split('/').pop() };
    state.analysis = null;
    showPreview();
    el.memo.value = sample.memo[getLang()] || sample.memo.en;
    el.photoName.textContent = `${sample.label[getLang()] || sample.label.en} · sample`;
    el.station.value = sample.station;
    markSample(sample.id);
    clearResultCard();
  } catch (err) {
    setStatus(String(err.message || err), 'error');
  }
}

async function setPhotoFromFile(file) {
  if (!file || !/^image\/(jpeg|png)$/.test(file.type)) {
    setStatus('JPEG or PNG only.', 'error');
    return;
  }
  const prepared = await prepareImage(file);
  state.photo = { ...prepared, sampleId: null, name: file.name };
  state.analysis = null;
  showPreview();
  el.photoName.textContent = file.name;
  markSample(null);
  clearResultCard();
}

function showPreview() {
  if (!state.photo) return;
  el.preview.src = state.photo.dataUrl;
  el.preview.hidden = false;
  el.dropzone.classList.add('has-photo');
}

function markSample(id) {
  el.sampleList.querySelectorAll('.sample').forEach((node) => {
    node.classList.toggle('is-on', node.dataset.sample === id);
  });
}

/* ── result card ─────────────────────────────────────────────── */

function clearResultCard() {
  el.resultCard.hidden = true;
  el.resultEmpty.hidden = false;
  el.saveBtn.disabled = true;
}

function renderResult(res) {
  const a = res.analysis;
  state.analysis = a;
  state.lastResult = res;
  el.resultEmpty.hidden = true;
  el.resultCard.hidden = false;
  el.rType.textContent = a.defect_type;
  makeBadge(el.rBadge, res.source, res.requestedMode);
  severityChip(el.rSev, a.severity);
  el.rSev.title = t('result.severity');
  el.rCat.textContent = a.category;
  el.rCat.title = t('result.category');
  el.rBadge.title = t('result.source');
  el.rConf.textContent = `conf ${a.confidence.toFixed(2)}`;
  el.rConf.title = t('result.confidence');
  el.rPart.textContent = a.part;
  el.rLocation.textContent = a.location;
  el.rCause.textContent = a.estimated_cause;
  el.rAction.textContent = a.immediate_action;
  el.rLatency.textContent = `${(res.latencyMs / 1000).toFixed(1)} s`;
  el.rModel.textContent = res.model || '—';
  el.saveBtn.disabled = false;
  el.saveBtn.textContent = t('result.save');
}

/* ── analysis ────────────────────────────────────────────────── */

async function runAnalysis() {
  if (state.busy) return;
  if (runtimePromise) await runtimePromise;
  if (!state.photo) {
    setStatus(t('capture.needPhoto'), 'error');
    return;
  }
  state.busy = true;
  el.analyzeBtn.disabled = true;
  el.saveBtn.disabled = true;
  setStatus(state.runtime.live ? t('capture.analyzing') : t('capture.analyzingSample'), 'busy');

  const meta = {
    line: el.line.value.trim() || '2',
    station: el.station.value,
    shift: el.shift.value,
  };

  const res = await analyzeDefect({
    runtime: state.runtime,
    mode: el.mode.value,
    image: state.photo,
    memo: el.memo.value,
    meta,
    lang: getLang(),
    onProgress: (p) => {
      if (p.phase === 'download') {
        setStatus(`${t('runtime.device.downloading')}… ${(p.loaded / 1e6).toFixed(1)} MB`, 'busy');
      }
    },
  });

  state.busy = false;
  el.analyzeBtn.disabled = false;

  if (res.error) {
    const box = el.analyzeStatus;
    box.hidden = false;
    box.className = 'analyze-status is-error';
    box.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = `${res.error.message} (${t('runtime.ondevice')}: ${t(
      { available: 'runtime.device.ready', downloadable: 'runtime.device.downloadable', absent: 'runtime.device.absent' }[
        res.error.deviceState
      ] || 'runtime.device.unknown',
    )})`;
    box.appendChild(span);
    if (res.error.requestedMode !== 'only_in_cloud') {
      const retry = document.createElement('button');
      retry.className = 'btn btn-outline btn-sm';
      retry.type = 'button';
      retry.textContent = t('btn.retryCloud');
      retry.addEventListener('click', () => {
        el.mode.value = 'only_in_cloud';
        runAnalysis();
      });
      box.appendChild(retry);
    }
    return;
  }

  setStatus('');
  renderResult(res);
  el.saveBtn.textContent = t('result.save');
}

/* ── shift log ───────────────────────────────────────────────── */

function renderLog() {
  const records = state.records;
  el.navCount.textContent = String(records.length);
  el.logCount.textContent = `${records.length} ${t('log.count')}`;
  el.logEmpty.hidden = records.length > 0;
  el.logWrap.hidden = records.length === 0;
  el.clearLog.disabled = records.length === 0;

  el.logBody.innerHTML = '';
  for (const r of [...records].reverse()) {
    const tr = document.createElement('tr');

    const tdPhoto = document.createElement('td');
    if (r.thumb) {
      const img = document.createElement('img');
      img.className = 'log-thumb';
      img.src = r.thumb;
      img.alt = '';
      tdPhoto.appendChild(img);
    }
    tr.appendChild(tdPhoto);

    const tdTime = document.createElement('td');
    tdTime.className = 'log-time';
    tdTime.textContent = fmtTime(r.createdAt);
    tr.appendChild(tdTime);

    const tdPart = document.createElement('td');
    tdPart.className = 'log-part';
    tdPart.textContent = (r.analysis?.part || '—').split('·')[0].trim();
    tr.appendChild(tdPart);

    const tdType = document.createElement('td');
    tdType.className = 'log-type';
    tdType.textContent = r.analysis?.defect_type || '—';
    tr.appendChild(tdType);

    const tdSev = document.createElement('td');
    const sev = document.createElement('span');
    sev.className = `sev ${r.analysis?.severity || 'Minor'}`;
    sev.textContent = t(`sev.${r.analysis?.severity || 'Minor'}`);
    tdSev.appendChild(sev);
    tr.appendChild(tdSev);

    const tdPath = document.createElement('td');
    const badge = document.createElement('span');
    makeBadge(badge, r.source, r.requestedMode);
    tdPath.appendChild(badge);
    tr.appendChild(tdPath);

    el.logBody.appendChild(tr);
  }

  const hasRecords = records.length > 0;
  el.reportEmpty.hidden = hasRecords;
  el.reportBody.hidden = !hasRecords;
  el.reportBtn.disabled = !hasRecords;
  if (hasRecords) renderReportFrame();
}

function saveRecord() {
  if (!state.analysis || !state.lastResult) {
    showToast(t('result.saveFirst'));
    return;
  }
  const res = state.lastResult;
  const record = {
    id: newId(),
    createdAt: new Date().toISOString(),
    line: el.line.value.trim() || '2',
    station: el.station.value,
    shift: el.shift.value,
    memo: el.memo.value.trim(),
    thumb: state.photo?.thumb || '',
    analysis: state.analysis,
    source: res.source,
    requestedMode: res.requestedMode,
    latencyMs: res.latencyMs,
    model: res.model,
  };
  state.records.push(record);
  saveRecords(state.records);
  renderLog();
  showToast(t('toast.saved'));
  el.saveBtn.disabled = true;
  el.saveBtn.textContent = t('result.saved');
  mirrorRecord(state.runtime, record).catch(() => {});
}

/* ── report ──────────────────────────────────────────────────── */

function renderReportFrame() {
  const stats = summarize(state.records);
  el.statTotal.textContent = String(stats.total);
  el.statCritical.textContent = String(stats.critical);
  el.statProfile.textContent = stats.topType === '—' ? '—' : `${stats.topType} · ${stats.topCount}`;
  renderPareto(el.pareto, stats);
  if (!state.report) {
    el.reportBadge.textContent = '—';
  } else {
    el.reportBadge.textContent = state.reportSimulated ? t('path.sim.cloud') : t('path.cloud');
  }
  if (state.report) {
    el.reportTrend.textContent = state.report.trend_note || '—';
    el.reportDriver.textContent = state.report.key_driver || '—';
    el.reportSummary.textContent = state.report.summary || '—';
    render8D(el.eightd, state.report);
  } else {
    el.reportTrend.textContent = '—';
    el.reportDriver.textContent = '—';
    el.reportSummary.textContent = t('report.pending');
    render8DSkeleton(el.eightd, t('report.pending'));
  }
}

function openConsent() {
  const { records, chars } = digestSize(state.records, Number(state.runtime.remote.max_records_per_report) || 60);
  el.consentImages.textContent = '0';
  el.consentRecords.textContent = String(records);
  el.consentPayload.textContent =
    `// cloud request · ${chars} characters · 0 images\n` +
    recordTextPreview();
  el.consent.hidden = false;
  el.consentSend.focus();
}

function recordTextPreview() {
  return summarize(state.records).types
    .slice(0, 6)
    .map((t2) => `${t2.type} × ${t2.count}`)
    .join('\n');
}

async function runReport() {
  if (state.busy || !state.records.length) return;
  if (runtimePromise) await runtimePromise;
  if (state.runtime.live && !navigator.onLine) {
    setReportStatus(t('report.offline'), 'error');
    return;
  }
  state.busy = true;
  el.reportBtn.disabled = true;
  setReportStatus(state.runtime.live ? t('report.generating') : t('report.generatingSample'), 'busy');

  const stats = summarize(state.records);
  const meta = {
    shift: el.shift.value,
    line: el.line.value.trim() || '2',
    dateLabel: new Date().toISOString().slice(0, 10),
    stats,
  };
  const digest = digestSize(state.records, Number(state.runtime.remote.max_records_per_report) || 60).digest;

  const res = await generateShiftReport({ runtime: state.runtime, digest, meta, stats, lang: getLang() });

  state.busy = false;
  el.reportBtn.disabled = false;

  if (res.error) {
    setReportStatus(res.error.message, 'error');
    return;
  }
  state.report = res.report;
  state.reportSimulated = Boolean(res.simulated);
  setReportStatus('');
  renderReportFrame();
  showToast(t('toast.report'));
}

/* ── views ───────────────────────────────────────────────────── */

function switchView(view) {
  state.view = view;
  el.navItems.forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  Object.entries(el.views).forEach(([name, node]) => node.classList.toggle('is-active', name === view));
  if (view === 'log') renderLog();
  if (view === 'report' && state.records.length) renderReportFrame();
}

/* ── recording ───────────────────────────────────────────────── */

function paintRecording(active) {
  state.recording = active;
  el.hud.hidden = !active;
  el.recordBtn.disabled = active;
}

async function startRecording() {
  if (!recorder.supported) {
    showToast(t('rec.need'));
    return;
  }
  try {
    const info = await recorder.start({
      onTick: ({ seconds }) => {
        el.recTimer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      },
      onStop: () => {
        paintRecording(false);
        showToast(t('rec.saved'));
      },
    });
    paintRecording(true);
    if (info.surface && info.surface !== 'browser') showToast(t('rec.notTab'));
  } catch (err) {
    paintRecording(false);
    showToast(String(err?.message || t('rec.failed')));
  }
}

async function waitUntil(predicate, timeout = 30000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    if (predicate()) return true;
    await sleep(120);
  }
  return false;
}

// Scripted demo for the submission video: one button, ~40 seconds, ends on the report.
async function runScenario() {
  el.recScenario.disabled = true;
  try {
    switchView('capture');
    el.mode.value = 'prefer_on_device';
    await setPhotoFromSample(SAMPLES[0]);
    await sleep(1400);
    await runAnalysis();
    await waitUntil(() => !state.busy && (state.analysis || !el.analyzeStatus.hidden));
    await sleep(2200);
    saveRecord();
    await sleep(900);

    for (const idx of [2, 1]) {
      await setPhotoFromSample(SAMPLES[idx]);
      await sleep(700);
      await runAnalysis();
      await waitUntil(() => !state.busy && state.analysis);
      await sleep(1100);
      saveRecord();
      await sleep(700);
    }

    switchView('report');
    await sleep(1800);
    openConsent();
    await sleep(2200);
    el.consent.hidden = true;
    await runReport();
    await waitUntil(() => !state.busy && state.report, 20000);
    await sleep(3500);
    if (recorder.active) recorder.stop();
  } finally {
    el.recScenario.disabled = false;
  }
}

/* ── events ──────────────────────────────────────────────────── */

function bind() {
  el.navItems.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  el.langBtn.addEventListener('click', () => {
    const nextLang = toggleLang();
    renderSamples();
    if (state.photo?.sampleId) {
      const sample = SAMPLES.find((s) => s.id === state.photo.sampleId);
      if (sample) el.memo.value = sample.memo[nextLang] || sample.memo.en;
    }
    if (state.lastResult) renderResult(state.lastResult);
    renderRuntime();
    if (state.photo?.name) {
      const sample = SAMPLES.find((s) => s.id === state.photo.sampleId);
      el.photoName.textContent = sample
        ? `${sample.label[nextLang] || sample.label.en} · sample`
        : state.photo.name;
    }
    renderLog();
    if (state.report) renderReportFrame();
    updateOfflineBanner();
  });

  el.pick.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) setPhotoFromFile(file);
    e.target.value = '';
  });

  el.dropzone.addEventListener('click', () => el.file.click());
  el.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.file.click();
    }
  });
  ['dragenter', 'dragover'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('is-drag');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('is-drag');
    }),
  );
  el.dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) setPhotoFromFile(file);
  });

  el.analyzeBtn.addEventListener('click', runAnalysis);
  el.saveBtn.addEventListener('click', saveRecord);
  el.clearLog.addEventListener('click', () => {
    if (!state.records.length) return;
    if (!window.confirm(t('log.confirmClear'))) return;
    state.records = [];
    state.report = null;
    saveRecords(state.records);
    renderLog();
    renderReportFrame();
    showToast(t('toast.cleared'));
  });

  el.reportBtn.addEventListener('click', () => {
    if (!state.records.length) return;
    if (state.runtime.live && !navigator.onLine) {
      setReportStatus(t('report.offline'), 'error');
      return;
    }
    openConsent();
  });
  el.consentCancel.addEventListener('click', () => {
    el.consent.hidden = true;
  });
  el.consentSend.addEventListener('click', () => {
    el.consent.hidden = true;
    runReport();
  });
  el.consent.addEventListener('click', (e) => {
    if (e.target === el.consent) el.consent.hidden = true;
  });

  el.recordBtn.addEventListener('click', startRecording);
  el.recStop.addEventListener('click', () => recorder.stop());
  el.recScenario.addEventListener('click', runScenario);

  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.consent.hidden) el.consent.hidden = true;
  });
  window.addEventListener('linelens:lang', () => {
    if (state.records.length) renderLog();
  });
}

function updateOfflineBanner() {
  el.offline.hidden = navigator.onLine;
}

function renderSamples() {
  el.sampleList.innerHTML = '';
  for (const sample of SAMPLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sample';
    button.dataset.sample = sample.id;
    const img = document.createElement('img');
    img.src = sample.file;
    img.alt = '';
    img.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = sample.label[getLang()] || sample.label.en;
    button.append(img, label);
    button.addEventListener('click', () => setPhotoFromSample(sample));
    el.sampleList.appendChild(button);
  }
  if (state.photo?.sampleId) markSample(state.photo.sampleId);
}

async function init() {
  applyTranslations();
  bind();
  renderSamples();
  renderLog();
  updateOfflineBanner();
  el.recordBtn.disabled = !recorder.supported;
  el.recordBtn.title = recorder.supported ? t('btn.record.title') : t('rec.need');
  if (!recorder.supported) {
    el.recScenario.disabled = true;
  }

  const cfg = await loadConfig();
  if (cfg) window.LINELENS_FIREBASE_CONFIG = cfg;
  el.demoPill.hidden = Boolean(cfg && cfg.apiKey && !/YOUR_|REPLACE|xxxx/i.test(cfg.apiKey));
  runtimePromise = initRuntime().then((rt) => {
    state.runtime = rt;
    renderRuntime();
    return rt;
  });
  await runtimePromise;
  const preferredMode = state.runtime.remote?.analysis_mode;
  if (preferredMode && el.mode.querySelector(`option[value="${preferredMode}"]`)) {
    el.mode.value = preferredMode;
  }
  // expose for the Playwright checks and the console-based demo
  window.LineLens = { state, runAnalysis, runReport, setPhotoFromSample, saveRecord, switchView, runScenario, SAMPLES };
}

init();
