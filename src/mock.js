// Demo engine. Used only when firebase-config.js is absent (or Firebase fails to
// load). It is rule based and labelled "Sample" in the UI — it never pretends to
// be model output.

const ANALYSES = {
  'weld-porosity': {
    en: {
      part: 'Lower control arm bracket · BRK-1180 · 2.3 mm galvanized steel',
      defect_type: 'Weld porosity',
      category: 'Weld',
      severity: 'Major',
      location: 'Toe of the fillet weld on the inner flange, next to the locating hole',
      estimated_cause:
        'Shielding gas starvation after the cylinder swap — the flow meter sits below 12 L/min, so air reaches the arc and pores open along the bead.',
      immediate_action:
        'Hold the last 12 units from this cell, quarantine the pallet, and re-check gas flow and nozzle condition before restarting the bead.',
      confidence: 0.82,
    },
    ko: {
      part: '로어 컨트롤 암 브래킷 · BRK-1180 · 2.3 mm 아연도금강',
      defect_type: '용접 기공',
      category: 'Weld',
      severity: 'Major',
      location: '안쪽 플랜지 필릿 용접 토우, 위치결정 홀 옆',
      estimated_cause:
        '실린더 교체 후 실드 가스 부족 — 유량계가 12 L/min 아래로 내려가 아크에 공기가 섞였고 비드를 따라 기공이 열렸습니다.',
      immediate_action:
        '이 셀의 최근 12개 유닛 보류, 팔레트 격리, 비드 재시작 전 가스 유량과 노즐 상태 재확인.',
      confidence: 0.82,
    },
  },
  'paint-scratch': {
    en: {
      part: 'Tailgate inner panel · PNL-2042 · matte black painted steel',
      defect_type: 'Deep scratch through paint',
      category: 'Surface',
      severity: 'Major',
      location: 'Outer skin about 40 mm below the hem, along the bend line',
      estimated_cause:
        'Part rubbing on the transfer nest guide — the protective felt is worn through and the bare steel edge cuts the paint on every pass.',
      immediate_action:
        'Quarantine the panels from this hanger, replace the felt guide, and route the scratched skin to touch-up with the repair approval.',
      confidence: 0.76,
    },
    ko: {
      part: '테일게이트 내판 · PNL-2042 · 무광 흑색 도장 강판',
      defect_type: '도장 관통 스크래치',
      category: 'Surface',
      severity: 'Major',
      location: '헴 아래 약 40 mm, 절곡선을 따라',
      estimated_cause:
        '이송 네스트 가이드와 접촉 — 보호 펠트가 닳아 철판 모서리가 매 회차 도장을 긁고 있습니다.',
      immediate_action:
        '이 행거의 패널 격리, 펠트 가이드 교체, 긁힌 외판은 수정 승인 후 터치업으로 보냅니다.',
      confidence: 0.76,
    },
  },
  'edge-crack': {
    en: {
      part: 'Die-cast housing · HSG-3301 · aluminium ADC12',
      defect_type: 'Edge crack at hemmed rim',
      category: 'Material',
      severity: 'Critical',
      location: 'Rim edge 8 mm from the M6 clinch nut seat',
      estimated_cause:
        'Cold shut from an under-filled die corner near the overflow; pressing the clinch nut then opened the crack to the surface.',
      immediate_action:
        'Stop the line, segregate the lot, and call the die-cast supplier for containment with X-ray on the last 50 pieces.',
      confidence: 0.88,
    },
    ko: {
      part: '다이캐스팅 하우징 · HSG-3301 · 알루미늄 ADC12',
      defect_type: '헴 림 엣지 크랙',
      category: 'Material',
      severity: 'Critical',
      location: 'M6 클린치 너트 시트에서 8 mm 떨어진 림 엣지',
      estimated_cause:
        '오버플로 근처 다이 모서리 미충전으로 생긴 콜드 셧 — 클린치 너트 압입 시 크랙이 표면까지 열렸습니다.',
      immediate_action:
        '라인 정지, 해당 로트 격리, 다이캐스트 협력사에 최근 50개 X-ray 격리 요청.',
      confidence: 0.88,
    },
  },
};

const GENERIC = {
  en: {
    part: 'Unidentified stamped part',
    defect_type: 'Surface irregularity',
    category: 'Other',
    severity: 'Minor',
    location: 'Visible face of the part in the photo',
    estimated_cause: 'Cannot be pinned down from this photo alone — needs a second angle or the station record.',
    immediate_action: 'Keep the part in the hold area and show it to the cell leader at the next check.',
    confidence: 0.41,
  },
  ko: {
    part: '미확인 프레스 부품',
    defect_type: '표면 이상',
    category: 'Other',
    severity: 'Minor',
    location: '사진에 보이는 부품 표면',
    estimated_cause: '이 사진만으로는 단정하기 어렵습니다 — 다른 각도나 공정 기록이 필요합니다.',
    immediate_action: '보류 구역에 두고 다음 점검 때 셀 리더에게 보여 주세요.',
    confidence: 0.41,
  },
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mockAnalyze({ sampleId, memo, lang = 'en' }) {
  await delay(900 + Math.random() * 700);
  let base = sampleId && ANALYSES[sampleId] ? ANALYSES[sampleId][lang] || ANALYSES[sampleId].en : null;
  if (!base) {
    const text = (memo || '').toLowerCase();
    if (text.includes('weld') || text.includes('용접') || text.includes('poros')) base = ANALYSES['weld-porosity'][lang];
    else if (text.includes('scratch') || text.includes('paint') || text.includes('도장') || text.includes('긁'))
      base = ANALYSES['paint-scratch'][lang];
    else if (text.includes('crack') || text.includes('크랙') || text.includes('균열')) base = ANALYSES['edge-crack'][lang];
    else base = GENERIC[lang] || GENERIC.en;
  }
  return { ...base };
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export async function mockReport({ stats, lang = 'en' }) {
  await delay(1200 + Math.random() * 600);
  const { total, critical, major, topType, topCount, topPart, topCause, shift, line } = stats;
  const share = pct(topCount, total);

  if (lang === 'ko') {
    return {
      summary: `${shift} 교대 라인 ${line}에서 불량 ${total}건을 기록했습니다. 최다 유형은 ${topType}(${topCount}건, ${share}%)이며 치명 ${critical}건·중대 ${major}건이 포함됩니다. 기록은 ${topPart}에 집중돼 있습니다.`,
      trend_note: `${topType}이(가) 교대 전반에 걸쳐 반복됐습니다. 초반 3건은 같은 공정에서 나왔으므로, 다음 교대는 해당 공정 시작 시점의 조건을 먼저 확인해야 합니다.`,
      key_driver: topCause
        ? `${topCause}`
        : '공정 조건 편차가 주 원인으로 보이며, 설비 파라미터 기록과 함께 확인이 필요합니다.',
      eight_d: [
        { step: 'D1', title: '팀 구성', finding: '품질 리드(책임), 해당 공정 셀 리더, 설비 보전, 협력사 SQE로 구성합니다.' },
        {
          step: 'D2',
          title: '문제 정의',
          finding: `${topPart} 중심으로 ${total}건 중 ${topCount}건(${share}%)이 ${topType}입니다. 치명 ${critical}건은 고객 유출 가능성이 있어 우선 격리 대상입니다.`,
        },
        {
          step: 'D3',
          title: '봉쇄 조치',
          finding: '첫 불량 이후 생산분 전체 보류, 해당 공정 100% 육안 검사, 격리 팔레트를 적색 구역으로 이동합니다.',
        },
        { step: 'D4', title: '근본 원인', finding: topCause || '공정 조건 편차 — 설비 로그와 재현 시험으로 확인이 필요합니다.' },
        {
          step: 'D5',
          title: '시정 조치',
          finding: '해당 공정의 조건을 규정값으로 되돌리고, 시작 점검 항목에 확인 절차를 추가합니다.',
        },
        {
          step: 'D6',
          title: '조치 실행',
          finding: '다음 교대부터 적용. 셀 리더가 연속 10개 유닛을 확인해 결과를 품질실에 기록합니다.',
        },
        {
          step: 'D7',
          title: '재발 방지',
          finding: 'MES 교대 시작 점검에 항목을 반영하고, 현장에 판정 기준 사진을 게시합니다.',
        },
        { step: 'D8', title: '인정 · 인계', finding: '불량을 처음 발견한 작업자에게 피드백하고, 교대 인계 보드에 이 보고서를 첨부합니다.' },
      ],
      simulated: true,
    };
  }

  return {
    summary: `${total} defects were logged on line ${line} this shift (${shift}). ${topType} is the largest contributor at ${count(topCount, 'record', 'records')} (${share}%), with ${count(critical, 'critical', 'critical')} and ${count(major, 'major', 'major')} findings. Most of them sit on ${topPart}.`,
    trend_note: `${topType} repeats across the shift rather than clustering at one unit, so it reads as a process condition, not an isolated part. Three of the first records came from the same station — check that station's start-of-shift conditions first.`,
    key_driver: topCause || 'Process condition drift is the likely driver; confirm it against the equipment parameters for the same window.',
    eight_d: [
      { step: 'D1', title: 'Team', finding: 'Quality lead (owner), cell leader of the affected station, maintenance, and the supplier SQE.' },
      {
        step: 'D2',
        title: 'Problem',
        finding: `${topCount} of ${total} records are ${topType} (${share}%), concentrated on ${topPart}. ${count(critical, 'critical finding', 'critical findings')} could reach the customer, so they lead the containment list.`,
      },
      {
        step: 'D3',
        title: 'Containment',
        finding: 'Hold everything produced since the first flagged part, run a 100% visual check at the station, and move the pallet to the red quarantine area.',
      },
      { step: 'D4', title: 'Root cause', finding: topCause || 'Process condition drift — confirm with equipment logs and a reproduction run.' },
      {
        step: 'D5',
        title: 'Corrective action',
        finding: 'Restore the affected station to its specified conditions and add the check that would have caught it to the start-up routine.',
      },
      {
        step: 'D6',
        title: 'Implementation',
        finding: 'In effect from the next shift. The cell leader verifies 10 consecutive units and writes the result into the quality room log.',
      },
      {
        step: 'D7',
        title: 'Prevention',
        finding: 'Put the check into the MES start-up checklist and post a photo standard of the accepted condition at the station.',
      },
      { step: 'D8', title: 'Recognition · handover', finding: 'Close the loop with the operator who flagged the first part, and attach this report to the shift handover board.' },
    ],
    simulated: true,
  };
}
