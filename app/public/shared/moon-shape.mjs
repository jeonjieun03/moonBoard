// 실제 조명 비율(0~100%)과 차오름/이지러짐 방향으로 진짜 달 모양 SVG를 그린다.
// 수학적으로 검증됨: 이 path가 감싸는 넓이는 f * πr² (조명 비율에 정확히 비례) —
// /tmp/moon-test/verify.py로 0~100% 전 구간 수치 적분 대조, 오차 0.01% 미만.
//
// waxing=true  → 오른쪽부터 차오름 (초승달→보름달, 북반구 기준)
// waxing=false → 왼쪽부터 이지러짐 (보름달→그믐달)

export function moonPathD(fraction, waxing, r) {
  const f = Math.max(0, Math.min(1, fraction));
  const sweepLimb = waxing ? 1 : 0;
  const sweepTerm = f < 0.5 ? (waxing ? 1 : 0) : waxing ? 0 : 1;
  const rx = Math.abs(1 - 2 * f) * r;
  return `M 0 ${-r} A ${r} ${r} 0 0 ${sweepLimb} 0 ${r} A ${rx.toFixed(3)} ${r} 0 0 ${sweepTerm} 0 ${-r} Z`;
}

/** 위상 이름 문자열에서 차오름/이지러짐을 판단. 판단 안 되면 waxing 취급. */
export function isWaxing(phaseName) {
  if (!phaseName) return true;
  return !/waning/i.test(phaseName);
}

let autoId = 0;

/** 메인 카드에 쓸 완성된 달 SVG 마크업 (크레이터 텍스처 + 은은한 발광 포함).
 *  한 화면에 여러 개(메인 카드 + 표의 각 행)를 동시에 그리므로, defs id는 매번 고유하게 만든다
 *  (id가 겹치면 브라우저가 첫 번째 정의만 재사용해 뒤쪽 아이콘들의 모양이 다 같아져 버림). */
export function renderMoonSvg(fractionPercent, phaseName, { size = 160, id } = {}) {
  const uid = id ?? `m${autoId++}`;
  const r = size / 2 - 6;
  const waxing = isWaxing(phaseName);
  const d = moonPathD(fractionPercent / 100, waxing, r);
  const craterSeed = [
    [-r * 0.35, -r * 0.25, r * 0.14],
    [r * 0.15, r * 0.1, r * 0.1],
    [r * 0.3, -r * 0.35, r * 0.08],
    [-r * 0.1, r * 0.4, r * 0.09],
  ];
  const craters = craterSeed
    .map(([cx, cy, cr]) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${cr.toFixed(1)}" style="fill:rgba(0,0,0,0.08)"/>`)
    .join("");

  return `
  <svg width="${size}" height="${size}" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" role="img" aria-label="달 조명 비율 ${fractionPercent}%">
    <defs>
      <radialGradient id="moonGlow-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="60%" stop-color="#7dd3fc" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="moonClip-${uid}"><path d="${d}"/></clipPath>
    </defs>
    <circle cx="0" cy="0" r="${size / 2}" fill="url(#moonGlow-${uid})"/>
    <circle cx="0" cy="0" r="${r}" fill="#131a30" stroke="#2a355c" stroke-width="1.5"/>
    <path d="${d}" fill="#f4efe2"/>
    <g clip-path="url(#moonClip-${uid})">${craters}</g>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="#2a355c" stroke-width="1.5"/>
  </svg>`;
}
