// 네트워크 없이 정규화/저장/dedup/전일대비 로직만 검증하는 로컬 자체 테스트.
// (실제 USNO 호출은 이 샌드박스 네트워크에서 막혀 있어 이 스크립트로는 확인 불가 — GitHub Actions에서
// scripts/collect.mjs를 직접 실행해 실제 호출을 검증해야 함)
import assert from "node:assert/strict";
import {
  normalizeUsnoReading,
  upsertDailyReading,
  markFailure,
  emptyStore,
  recomputeDelta,
} from "../app/public/shared/normalize.mjs";

const rawDay1 = {
  properties: {
    data: {
      curphase: "Waning Gibbous",
      fracillum: "68%",
      moondata: [
        { phen: "Rise", time: "20:11" },
        { phen: "Set", time: "09:03" },
      ],
      closestphase: { phase: "Last Quarter", year: 2026, month: 9, day: 15, time: "12:00" },
    },
  },
};
const rawDay2 = {
  properties: {
    data: {
      curphase: "Waning Gibbous",
      fracillum: "72%",
      moondata: [
        { phen: "Rise", time: "20:55" },
        { phen: "Set", time: "09:41" },
      ],
      closestphase: { phase: "Last Quarter", year: 2026, month: 9, day: 15, time: "12:00" },
    },
  },
};

let store = emptyStore();

// 1) 첫날 정상 저장
const r1 = normalizeUsnoReading(rawDay1, {
  sourceUrl: "https://aa.usno.navy.mil/api/rstt/oneday?date=2026-09-14&coords=35.8714,128.6014&tz=9",
  sourceObservedAt: "2026-09-14T00:10:00.000Z",
  recordDate: "2026-09-14",
});
store = upsertDailyReading(store, r1);
assert.equal(store.daily.length, 1);
assert.equal(store.last_good.value, 68);
assert.equal(store.last_status.status, "fresh");

// 2) 같은 날 재실행 → 행 개수 그대로 (값만 갱신), C20
const r1b = normalizeUsnoReading(rawDay1, {
  sourceUrl: "https://aa.usno.navy.mil/api/rstt/oneday?date=2026-09-14&coords=35.8714,128.6014&tz=9",
  sourceObservedAt: "2026-09-14T09:00:00.000Z",
  recordDate: "2026-09-14",
});
store = upsertDailyReading(store, r1b);
assert.equal(store.daily.length, 1, "같은 날짜 재실행은 새 행을 만들면 안 됨 (C20)");

// 3) 실패 → last_good/daily 안 건드림, stale 표시 (C17/C18)
store = markFailure(store, "timeout");
assert.equal(store.daily.length, 1);
assert.equal(store.last_good.value, 68, "실패 후에도 마지막 정상값 보존 (C17)");
assert.equal(store.last_status.status, "stale", "정상값이 있는 상태의 실패는 stale (C18)");
assert.equal(store.last_status.error_code, "timeout");

// 4) 다음 날짜 정상 → 새 행 추가 (C21)
const r2 = normalizeUsnoReading(rawDay2, {
  sourceUrl: "https://aa.usno.navy.mil/api/rstt/oneday?date=2026-09-15&coords=35.8714,128.6014&tz=9",
  sourceObservedAt: "2026-09-15T00:10:00.000Z",
  recordDate: "2026-09-15",
});
store = upsertDailyReading(store, r2);
assert.equal(store.daily.length, 2, "다음 날짜 성공은 새 행을 만들어야 함 (C21)");
assert.equal(store.last_status.status, "fresh", "복구 후 fresh (C19)");

// 5) 전일 대비 재계산 (C24)
const delta = recomputeDelta(store.daily[0], store.daily[1]);
assert.equal(delta.delta, 4, "68 -> 72 는 +4");

console.log("모든 self-test 통과:", JSON.stringify({ daily: store.daily.map((d) => [d.record_date, d.value]), delta }, null, 2));
