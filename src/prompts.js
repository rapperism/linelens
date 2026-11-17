// Prompt + response schema definitions shared by the on-device and cloud paths.

export const CATEGORIES = ['Weld', 'Surface', 'Forming', 'Assembly', 'Material', 'Other'];
export const SEVERITIES = ['Critical', 'Major', 'Minor'];

export const analysisSchema = {
  type: 'object',
  description: 'Structured defect card for one photographed part.',
  properties: {
    part: {
      type: 'string',
      description: 'Part or assembly seen in the photo, with the part number when it is legible.',
    },
    defect_type: {
      type: 'string',
      description: 'Short defect name a quality engineer would use, 2 to 5 words.',
    },
    category: { type: 'string', enum: CATEGORIES },
    severity: {
      type: 'string',
      enum: SEVERITIES,
      description:
        'Critical if it could reach a customer or fail safety/function, Major if it must be reworked or scrapped, Minor if it is cosmetic and sortable.',
    },
    location: { type: 'string', description: 'Where on the part the defect sits, in one line.' },
    estimated_cause: {
      type: 'string',
      description: 'Most likely process cause, 1 to 2 sentences, naming the station or tool if visible.',
    },
    immediate_action: {
      type: 'string',
      description: 'What the operator should do in the next few minutes: hold, segregate, re-check, call.',
    },
    confidence: { type: 'number', description: 'Confidence between 0 and 1.' },
  },
  required: [
    'part',
    'defect_type',
    'category',
    'severity',
    'location',
    'estimated_cause',
    'immediate_action',
    'confidence',
  ],
};

// Chrome accepts a JSON-schema subset for on-device structured output and throws
// on keywords it does not implement, so the constraint is kept to the bare
// minimum: types, enums and required fields.
export const analysisConstraint = {
  type: 'object',
  properties: {
    part: { type: 'string' },
    defect_type: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    severity: { type: 'string', enum: SEVERITIES },
    location: { type: 'string' },
    estimated_cause: { type: 'string' },
    immediate_action: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'part',
    'defect_type',
    'category',
    'severity',
    'location',
    'estimated_cause',
    'immediate_action',
    'confidence',
  ],
};

export const reportSchema = {
  type: 'object',
  description: 'Shift report narrative for the quality lead.',
  properties: {
    summary: {
      type: 'string',
      description: 'Three sentences on what this shift looks like, grounded in the counts given.',
    },
    trend_note: {
      type: 'string',
      description: 'What changed compared with the previous shift, if the data hints at it; otherwise what to watch.',
    },
    key_driver: {
      type: 'string',
      description: 'The single process driver that explains most of the shift, one sentence.',
    },
    eight_d: {
      type: 'array',
      description: 'The eight disciplines, in order D1 to D8.',
      items: {
        type: 'object',
        properties: {
          step: { type: 'string', description: 'D1 through D8.' },
          title: { type: 'string', description: 'Discipline name, two or three words.' },
          finding: {
            type: 'string',
            description: 'Draft content for this discipline, written from the card data only.',
          },
        },
        required: ['step', 'title', 'finding'],
      },
    },
  },
  required: ['summary', 'trend_note', 'key_driver', 'eight_d'],
};

const ANALYSIS_RULES = `You are LineLens, the inspection assistant of a quality room on an automotive parts line.
You are shown one photo of a defective part, plus a short note the operator typed.
Return ONE JSON object with exactly these keys: part, defect_type, category, severity, location,
estimated_cause, immediate_action, confidence.

Rules:
- Describe only what the photo supports. If the part number is not readable, name the part type instead.
- category must be one of: ${CATEGORIES.join(', ')}.
- severity must be one of: ${SEVERITIES.join(', ')}.
- You are drafting for a human who decides. Write "likely" causes as likely, never as certain.
- immediate_action is what happens on the line in the next few minutes.
- No markdown, no code fences, no text outside the JSON object.`;

export function buildAnalysisPrompt({ memo, line, station, shift }) {
  return `${ANALYSIS_RULES}

Context: line ${line}, station ${station}, shift ${shift}.
Operator note: ${memo ? `"${memo.trim().slice(0, 500)}"` : '(none — rely on the photo)'}

Return the JSON object now.`;
}

const REPORT_RULES = `You are LineLens, writing the shift handover for a quality lead in an automotive parts plant.
You receive a text-only digest of this shift's defect cards. No photos are available to you, by design.
Write in plain plant English: short sentences, no marketing tone, no emoji, no markdown.

Return ONE JSON object with keys: summary, trend_note, key_driver, eight_d.
- summary: three sentences grounded in the counts you were given.
- trend_note: one or two sentences on what moved, using only what the digest supports.
- key_driver: one sentence naming the process driver behind the biggest contributor.
- eight_d: exactly eight objects, step D1..D8, title, finding. D1 team, D2 problem, D3 containment,
  D4 root cause, D5 corrective action, D6 implementation, D7 prevention, D8 recognition/handover.
  Each finding is a draft the lead will edit: concrete, referencing the counts, no invented numbers.`;

export function buildReportPrompt({ digest, shift, line, dateLabel }) {
  return `${REPORT_RULES}

Shift: ${shift} · Line ${line} · ${dateLabel}
Digest of this shift's cards (text only):
${digest}

Return the JSON object now.`;
}
