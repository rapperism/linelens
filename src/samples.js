// Built-in sample defects. Photos were generated for this prototype (synthetic,
// not real customer parts) so the demo works without a camera or a plant network.

export const SAMPLES = [
  {
    id: 'weld-porosity',
    file: 'assets/samples/weld-porosity.jpg',
    label: { en: 'Weld porosity', ko: '용접 기공' },
    part: 'BRK-1180',
    station: 'Weld cell 3',
    memo: {
      en: 'Pinholes along the bead on unit 214. Gas flow looked low after the cylinder swap this morning.',
      ko: '214번 유닛 비드 따라 구멍이 보임. 오전 실린더 교체 후 가스 유량이 낮아 보임.',
    },
  },
  {
    id: 'paint-scratch',
    file: 'assets/samples/paint-scratch.jpg',
    label: { en: 'Paint scratch', ko: '도장 스크래치' },
    part: 'PNL-2042',
    station: 'Paint line — final',
    memo: {
      en: 'Scratch after the hemming station, feels rough to the fingernail. Same hanger as last week.',
      ko: '헤밍 공정 뒤 스크래치, 손톱에 걸림. 지난주와 같은 행거.',
    },
  },
  {
    id: 'edge-crack',
    file: 'assets/samples/edge-crack.jpg',
    label: { en: 'Edge crack', ko: '엣지 크랙' },
    part: 'HSG-3301',
    station: 'Machining — incoming',
    memo: {
      en: 'Crack at the rim right next to the clinch nut, and the nut felt loose on the torque gun.',
      ko: '클린치 너트 옆 림에 크랙, 토크 건에서 너트가 헐거웠음.',
    },
  },
];

export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}
