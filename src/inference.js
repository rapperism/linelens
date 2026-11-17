// One API for both inference paths. The UI only ever calls these two functions,
// and each answer carries the path that actually produced it.

import {
  analysisSchema,
  analysisConstraint,
  reportSchema,
  buildAnalysisPrompt,
  buildReportPrompt,
  CATEGORIES,
  SEVERITIES,
} from './prompts.js';
import { mockAnalyze, mockReport } from './mock.js';

const MODE_BY_KEY = {
  prefer_on_device: 'PREFER_ON_DEVICE',
  only_on_device: 'ONLY_ON_DEVICE',
  only_in_cloud: 'ONLY_IN_CLOUD',
};

function parseJsonObject(text) {
  let s = String(text ?? '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model returned no JSON object');
  return JSON.parse(s.slice(start, end + 1));
}

function asText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeAnalysis(raw) {
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'Other';
  const severity = SEVERITIES.includes(raw.severity) ? raw.severity : 'Major';
  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  if (confidence > 1) confidence = confidence > 100 ? 1 : confidence / 100;
  return {
    part: asText(raw.part, 'Unidentified part'),
    defect_type: asText(raw.defect_type, 'Unclassified defect'),
    category,
    severity,
    location: asText(raw.location, '—'),
    estimated_cause: asText(raw.estimated_cause, '—'),
    immediate_action: asText(raw.immediate_action, '—'),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

const STEPS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

function normalizeReport(raw) {
  const eight = Array.isArray(raw.eight_d) ? raw.eight_d : [];
  const byStep = new Map();
  for (const item of eight) {
    const step = asText(item?.step).toUpperCase().slice(0, 2);
    if (STEPS.includes(step)) byStep.set(step, { step, title: asText(item.title, step), finding: asText(item.finding, '—') });
  }
  const eight_d = STEPS.map((step) => byStep.get(step) || { step, title: step, finding: 'Not drafted — add by hand.' });
  return {
    summary: asText(raw.summary, ''),
    trend_note: asText(raw.trend_note, ''),
    key_driver: asText(raw.key_driver, ''),
    eight_d,
  };
}

/**
 * Analyze one photo.
 * @returns {{analysis?:object, source?:string, latencyMs:number, model?:string, error?:object, simulated?:boolean}}
 */
export async function analyzeDefect({ runtime, mode, image, memo, meta, lang = 'en', onProgress }) {
  const started = performance.now();
  const requested = runtime?.live ? mode || runtime.remote.analysis_mode : mode || 'prefer_on_device';

  if (!runtime?.live) {
    const analysis = await mockAnalyze({ sampleId: image?.sampleId, memo, lang });
    return {
      analysis,
      source: requested === 'only_in_cloud' ? 'SIMULATED_CLOUD' : 'SIMULATED_ON_DEVICE',
      simulated: true,
      latencyMs: Math.round(performance.now() - started),
      model: 'built-in sample',
      requestedMode: requested,
    };
  }

  try {
    const { getGenerativeModel, InferenceMode } = runtime.aiMod;
    const prompt = buildAnalysisPrompt({ memo, ...meta });
    const model = getGenerativeModel(runtime.ai, {
      mode: InferenceMode[MODE_BY_KEY[requested] || 'PREFER_ON_DEVICE'],
      inCloudParams: {
        model: runtime.remote.fallback_model,
        generationConfig: { responseMimeType: 'application/json', responseSchema: analysisSchema, temperature: 0.2 },
        systemInstruction: 'You are a line-side quality inspection assistant. Answer with JSON only.',
      },
      onDeviceParams: {
        createOptions: { temperature: 0.2 },
        promptOptions: { responseConstraint: analysisConstraint },
      },
    });

    // Chrome requires the device model to be initialised after a user gesture.
    if (requested !== 'only_in_cloud') {
      try {
        await model.initializeDeviceModel((loaded) => onProgress?.({ phase: 'download', loaded }));
      } catch (err) {
        onProgress?.({ phase: 'device-init-failed', error: String(err?.message || err) });
      }
    }

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.data } }, { text: prompt }],
        },
      ],
    });

    const inferenceSource = result.response.inferenceSource;
    const text = result.response.text();
    const analysis = normalizeAnalysis(parseJsonObject(text));
    return {
      analysis,
      source: inferenceSource === 'on_device' ? 'ON_DEVICE' : 'IN_CLOUD',
      latencyMs: Math.round(performance.now() - started),
      model:
        inferenceSource === 'on_device'
          ? 'Chrome built-in (Gemini Nano)'
          : runtime.remote.fallback_model,
      requestedMode: requested,
    };
  } catch (err) {
    return {
      error: {
        code: err?.code || 'ERROR',
        message: String(err?.message || err),
        deviceState: runtime.device?.state,
        requestedMode: requested,
      },
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

/**
 * Write the shift report from the text digest. Always the cloud path.
 */
export async function generateShiftReport({ runtime, digest, meta, stats, lang = 'en' }) {
  const started = performance.now();

  if (!runtime?.live) {
    const report = await mockReport({ stats: { ...stats, ...meta }, lang });
    return {
      report,
      source: 'SIMULATED_CLOUD',
      simulated: true,
      latencyMs: Math.round(performance.now() - started),
      model: 'built-in sample',
    };
  }

  try {
    const { getGenerativeModel, InferenceMode } = runtime.aiMod;
    const model = getGenerativeModel(runtime.ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: runtime.remote.report_model,
        generationConfig: { responseMimeType: 'application/json', responseSchema: reportSchema, temperature: 0.4 },
        systemInstruction: 'You write shift handovers for a plant quality room. Plain, specific, no filler.',
      },
    });
    const prompt = buildReportPrompt({ digest, ...meta });
    const result = await model.generateContent(prompt);
    const report = normalizeReport(parseJsonObject(result.response.text()));
    return {
      report,
      source: 'IN_CLOUD',
      latencyMs: Math.round(performance.now() - started),
      model: runtime.remote.report_model,
    };
  } catch (err) {
    return {
      error: { code: err?.code || 'ERROR', message: String(err?.message || err) },
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
