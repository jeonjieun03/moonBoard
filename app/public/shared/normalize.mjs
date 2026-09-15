// 공유 정규화 모듈 — 실제 조회(collect.mjs)와 브라우저 화면(app.js), 합성 fixture 재생이
// 전부 이 함수 하나를 통해서만 저장용 레코드를 만든다. (README 카드3: "실제 조회/수집/합성 재생에
// 같은 공통 저장 함수를 사용")
//
// Node(ESM)와 브라우저(<script type="module">) 양쪽에서 그대로 import 가능하도록
// 외부 의존성 없이 순수 함수로만 작성한다.

export const SIGNAL_ID = "moon-illumination-daegu";
export const LOCATION = { label: "대구", lat: 35.8714, lon: 128.6014 };
export const TIMEZONE = "Asia/Seoul";
export const TZ_OFFSET_HOURS = 9;

/**
 * USNO "Complete Sun and Moon Data for One Day" 응답을 정규화한다.
 * @param {object} raw - USNO API가 반환한 원본 JSON (GeoJSON Feature)
 * @param {object} ctx
 * @param {string} ctx.sourceUrl - 실제로 호출한 요청 URL
 * @param {string} ctx.sourceObservedAt - ISO8601. 이 값을 원천에서 읽어온(호출한) 시각
 * @param {string} ctx.recordDate - Asia/Seoul 기준 YYYY-MM-DD (일별 기록의 키)
 */
export function normalizeUsnoReading(raw, ctx) {
  const data = raw?.properties?.data;
  if (!data || typeof data.fracillum !== "string" || typeof data.curphase !== "string") {
    // 응답 형식이 기대와 다름 — 카드3의 "응답 형식 변경(schema-break)"과 같은 종류의 문제.
    const err = new Error("USNO 응답 스키마가 예상과 다릅니다 (fracillum/curphase 없음)");
    err.code = "schema_break";
    throw err;
  }

  const value = Number(String(data.fracillum).replace("%", "").trim());
  if (!Number.isFinite(value)) {
    const err = new Error(`fracillum 파싱 실패: ${data.fracillum}`);
    err.code = "schema_break";
    throw err;
  }

  const findPhen = (arr, phen) =>
    Array.isArray(arr) ? arr.find((x) => x && x.phen === phen)?.time ?? null : null;

  return {
    signal_id: SIGNAL_ID,
    record_date: ctx.recordDate,
    value,
    unit: "%",
    phase_name: data.curphase,
    moonrise: findPhen(data.moondata, "Rise"),
    moonset: findPhen(data.moondata, "Set"),
    closest_phase: data.closestphase
      ? {
          phase: data.closestphase.phase,
          date: `${data.closestphase.year}-${String(data.closestphase.month).padStart(2, "0")}-${String(
            data.closestphase.day
          ).padStart(2, "0")}`,
          time: data.closestphase.time,
        }
      : null,
    source_url: ctx.sourceUrl,
    source_observed_at: ctx.sourceObservedAt,
    timezone: TIMEZONE,
    location: LOCATION,
    raw,
  };
}

/** records.json 최상위 문서에 정상 reading 하나를 원자적으로 upsert한다 (같은 날짜 → 갱신, 새 날짜 → 추가). */
export function upsertDailyReading(store, reading, { fetchedAt } = {}) {
  const s = store ?? emptyStore();
  const idx = s.daily.findIndex((d) => d.record_date === reading.record_date);
  const row = { ...reading, updated_at: fetchedAt ?? new Date().toISOString() };
  if (idx >= 0) s.daily[idx] = row;
  else s.daily.push(row);
  s.daily.sort((a, b) => (a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0));
  s.last_good = row;
  s.last_status = { status: "fresh", error_code: "none", checked_at: fetchedAt ?? new Date().toISOString() };
  return s;
}

/** 실패를 기록한다. 마지막 정상값(last_good)과 daily[]는 절대 건드리지 않는다. */
export function markFailure(store, errorCode, { checkedAt } = {}) {
  const s = store ?? emptyStore();
  s.last_status = {
    status: s.last_good ? "stale" : "error",
    error_code: errorCode,
    checked_at: checkedAt ?? new Date().toISOString(),
  };
  return s;
}

export function emptyStore() {
  return { signal_id: SIGNAL_ID, timezone: TIMEZONE, daily: [], last_good: null, last_status: null };
}

/** 두 일별 값으로 전일 대비 변화를 다시 계산한다 (저장된 원본 값 기준, 화면 표시는 반올림만). */
export function recomputeDelta(earlier, later) {
  if (!earlier || !later) return null;
  return { from: earlier.record_date, to: later.record_date, delta: later.value - earlier.value, unit: later.unit };
}
