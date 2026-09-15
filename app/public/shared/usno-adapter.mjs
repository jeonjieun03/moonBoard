// 실제 조회("live adapter"): USNO 원본 JSON → normalized-reading.schema.json 형태로 변환.
// store.mjs의 applySuccessfulReading/runFixture가 기대하는 정확히 9개 필드만 담은 순수 객체를 만든다.
// 화면에 더 보여주고 싶은 부가정보(위상, 월출월몰, 원자료)는 별도 `display` 객체로 분리해서 반환한다
// (normalized-reading.schema.json은 additionalProperties:false라 reading 안에 못 넣음).

export const SIGNAL_ID = "moon-illumination-daegu";
export const SOURCE_NAME = "U.S. Naval Observatory — Astronomical Applications API";
export const LOCATION = { label: "대구", lat: 35.8714, lon: 128.6014 };
export const TIMEZONE = "Asia/Seoul";
export const TZ_OFFSET_HOURS = 9;

function kstDate(isoString) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoString));
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/**
 * @param {object} raw - USNO /api/rstt/oneday 응답 (GeoJSON Feature)
 * @param {object} ctx
 * @param {string} ctx.sourceUrl - 실제 호출한 URL
 * @param {string} ctx.fetchedAt - ISO8601. 이 값을 "조회 시각"으로 쓰고, record_date는 이 값에서 파생한다.
 * @returns {{reading: object, display: object}}
 */
export function adaptUsnoReading(raw, ctx) {
  const data = raw?.properties?.data;
  if (!data || typeof data.fracillum !== "string" || typeof data.curphase !== "string") {
    const err = new Error("USNO 응답 스키마가 예상과 다릅니다 (fracillum/curphase 없음)");
    err.code = "schema_error";
    throw err;
  }

  const normalizedValue = Number(String(data.fracillum).replace("%", "").trim());
  if (!Number.isFinite(normalizedValue)) {
    const err = new Error(`fracillum 파싱 실패: ${data.fracillum}`);
    err.code = "schema_error";
    throw err;
  }

  const recordDate = kstDate(ctx.fetchedAt);
  // USNO는 초 단위 관측이 아니라 요청한 날짜 하루 단위로 계산한 값을 준다 (source_time에
  // 없는 정밀도를 지어내지 않기 위해, 해당 날짜의 KST 자정을 "출처 시각"으로 삼고 화면에는
  // "일 단위 계산값"이라고 분명히 표시한다).
  const sourceTime = `${recordDate}T00:00:00+09:00`;

  const reading = {
    signal_id: SIGNAL_ID,
    normalized_value: normalizedValue,
    unit: "%",
    source_name: SOURCE_NAME,
    source_url: ctx.sourceUrl,
    source_time: new Date(sourceTime).toISOString(),
    fetched_at: ctx.fetchedAt,
    record_timezone: TIMEZONE,
    record_date: recordDate,
  };

  const findPhen = (arr, phen) => (Array.isArray(arr) ? arr.find((x) => x && x.phen === phen)?.time ?? null : null);

  const display = {
    phase_name: data.curphase,
    moonrise: findPhen(data.moondata, "Rise"),
    moonset: findPhen(data.moondata, "Set"),
    source_time_granularity: "day", // 출처가 날짜 단위로만 계산한다는 사실을 화면에서 숨기지 않기 위한 표시
    closest_phase: data.closestphase
      ? {
          phase: data.closestphase.phase,
          date: `${data.closestphase.year}-${String(data.closestphase.month).padStart(2, "0")}-${String(data.closestphase.day).padStart(2, "0")}`,
          time: data.closestphase.time,
        }
      : null,
    location: LOCATION,
    raw,
  };

  return { reading, display };
}
