// T05: 저장된 일별 조명률(daily_readings)을 읽기 전용으로 사용해 "최근 달 조명률 변화" 그래프를 만든다.
// 이 모듈은 순수 변환/문자열 생성만 하며, API를 다시 호출하거나 원본 reading 값을 재계산하지 않는다.
// DOM에 의존하지 않으므로 Node에서도 그대로 단위 테스트할 수 있다 (scripts/t05-graph-test.mjs).

// AI A가 남긴 함수 그대로 유지 — daily_readings에서 날짜·조명률·단위만 읽어 날짜순으로 정렬한다.
// 같은 record_date가 두 번 들어오면(T05-G04) 마지막 값으로 병합해 한 점만 남긴다.
export function prepareIlluminationChartData(state) {
  const rows = state?.daily_readings ?? [];
  const byDate = new Map();
  for (const row of rows) {
    byDate.set(row.record_date, { date: row.record_date, value: row.normalized_value, unit: row.unit });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 160;
const PAD_X = 30;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const PLOT_W = CHART_WIDTH - PAD_X * 2;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

function xFor(i, n) {
  return n <= 1 ? PAD_X + PLOT_W / 2 : PAD_X + (PLOT_W * i) / (n - 1);
}

// 값은 항상 0~100% 조명 비율이므로 y축 범위는 0~100으로 고정한다 (0%/100% 경계값이 그래프 밖으로 밀려나지 않도록).
function yFor(value) {
  return PAD_TOP + PLOT_H * (1 - clamp(value, 0, 100) / 100);
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortDate(iso) {
  return iso.length >= 10 ? iso.slice(5) : iso;
}

/** points: prepareIlluminationChartData()의 결과. 좌표만 계산하며 그리기(문자열 생성)와 분리해 테스트하기 쉽게 한다. */
export function layoutChartPoints(points) {
  const n = points.length;
  return points.map((p, i) => ({ x: xFor(i, n), y: yFor(p.value), point: p }));
}

/** 그래프 영역에 넣을 HTML(빈 상태 안내 또는 SVG 마크업)을 문자열로만 만든다 — DOM을 건드리지 않는다. */
export function renderChartMarkup(points) {
  if (!points.length) {
    return `<p class="pending">아직 저장된 일별 기록이 없습니다.</p>`;
  }

  const coords = layoutChartPoints(points);
  const n = coords.length;

  const gridLines = [0, 50, 100]
    .map((v) => {
      const y = yFor(v).toFixed(1);
      return (
        `<line x1="${PAD_X}" y1="${y}" x2="${CHART_WIDTH - PAD_X}" y2="${y}" class="chart-grid" />` +
        `<text x="${PAD_X - 6}" y="${Number(y) + 3}" class="chart-axis-label" text-anchor="end">${v}%</text>`
      );
    })
    .join("");

  const everyNth = Math.max(1, Math.ceil(n / 6));
  const dateLabels = coords
    .map((c, i) => {
      if (i % everyNth !== 0 && i !== n - 1) return "";
      return `<text x="${c.x.toFixed(1)}" y="${CHART_HEIGHT - 6}" class="chart-axis-label" text-anchor="middle">${escapeXml(shortDate(c.point.date))}</text>`;
    })
    .join("");

  const line =
    n > 1
      ? `<polyline points="${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")}" class="chart-line" fill="none" />`
      : "";

  const dots = coords
    .map(
      (c) =>
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" class="chart-dot"><title>${escapeXml(c.point.date)} · ${escapeXml(String(c.point.value))}${escapeXml(c.point.unit)}</title></circle>`
    )
    .join("");

  const fallbackText = points.map((p) => `${p.date} ${p.value}${p.unit}`).join(" · ");

  return (
    `<svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="일별 달 조명률 변화, 총 ${n}건: ${escapeXml(fallbackText)}">` +
    gridLines +
    line +
    dots +
    dateLabels +
    `</svg>` +
    `<p class="hint chart-fallback-text">${escapeXml(fallbackText)}</p>`
  );
}
