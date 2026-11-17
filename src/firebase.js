// Firebase runtime. Loaded lazily: with no firebase-config.js the whole app runs
// in demo mode and never touches the network.

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0/';

export const DEFAULT_REMOTE = {
  report_model: 'gemini-3.8-flash',
  fallback_model: 'gemini-3.5-flash-lite',
  analysis_mode: 'prefer_on_device',
  max_records_per_report: '60',
};

const ON_DEVICE_STATES = ['available', 'downloadable', 'downloading', 'unavailable'];

async function probeOnDevice() {
  if (typeof window.LanguageModel === 'undefined') return { state: 'absent' };
  try {
    const availability = await Promise.race([
      window.LanguageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 8000)),
    ]);
    if (availability === 'timeout') return { state: 'unknown', error: 'availability() timed out' };
    return { state: ON_DEVICE_STATES.includes(availability) ? availability : String(availability) };
  } catch (err) {
    return { state: 'unknown', error: String(err?.message || err) };
  }
}

function looksPlaceholder(value) {
  return !value || /YOUR_|REPLACE|xxxx/i.test(String(value));
}

export async function initRuntime() {
  const cfg = window.LINELENS_FIREBASE_CONFIG || null;
  const runtime = {
    live: false,
    reason: 'no-config',
    remote: { ...DEFAULT_REMOTE },
    appCheck: false,
    rc: false,
    db: null,
    ai: null,
    aiMod: null,
    app: null,
    error: null,
    device: { state: 'unknown' },
  };

  runtime.device = await probeOnDevice();

  if (!cfg || looksPlaceholder(cfg.apiKey)) return runtime;

  try {
    const [{ initializeApp }, aiMod] = await Promise.all([
      import(`${SDK}firebase-app.js`),
      import(`${SDK}firebase-ai.js`),
    ]);
    runtime.app = initializeApp(cfg);
    runtime.aiMod = aiMod;
    runtime.ai = aiMod.getAI(runtime.app);

    if (cfg.appCheckSiteKey && !looksPlaceholder(cfg.appCheckSiteKey)) {
      try {
        const ac = await import(`${SDK}firebase-app-check.js`);
        ac.initializeAppCheck(runtime.app, {
          provider: new ac.ReCaptchaEnterpriseProvider(cfg.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
        runtime.appCheck = true;
      } catch (err) {
        runtime.appCheckError = String(err?.message || err);
      }
    }

    try {
      const rcMod = await import(`${SDK}firebase-remote-config.js`);
      const rc = rcMod.getRemoteConfig(runtime.app);
      rc.settings.minimumFetchIntervalMillis = 60000;
      await rcMod.fetchAndActivate(rc);
      for (const key of Object.keys(DEFAULT_REMOTE)) {
        const value = rcMod.getValue(rc, key).asString();
        if (value) runtime.remote[key] = value;
      }
      runtime.rc = true;
    } catch (err) {
      runtime.rcError = String(err?.message || err);
    }

    if (cfg.projectId) {
      try {
        const fsMod = await import(`${SDK}firebase-firestore.js`);
        runtime.fsMod = fsMod;
        runtime.db = fsMod.getFirestore(runtime.app);
      } catch (err) {
        runtime.dbError = String(err?.message || err);
      }
    }

    runtime.live = true;
    runtime.reason = 'connected';
  } catch (err) {
    runtime.reason = 'error';
    runtime.error = String(err?.message || err);
  }
  return runtime;
}

export async function mirrorRecord(runtime, record) {
  if (!runtime?.live || !runtime.db || !runtime.fsMod) return false;
  try {
    const { addDoc, collection } = runtime.fsMod;
    await addDoc(collection(runtime.db, 'defect_records'), {
      createdAt: record.createdAt,
      line: record.line,
      station: record.station,
      shift: record.shift,
      part: record.analysis?.part || '',
      defectType: record.analysis?.defect_type || '',
      severity: record.analysis?.severity || '',
      category: record.analysis?.category || '',
      estimatedCause: record.analysis?.estimated_cause || '',
      immediateAction: record.analysis?.immediate_action || '',
      source: record.source,
      latencyMs: record.latencyMs,
      // No image is stored, on purpose: the card is the record.
      memo: record.memo || '',
    });
    return true;
  } catch (err) {
    runtime.fsWriteError = String(err?.message || err);
    return false;
  }
}
