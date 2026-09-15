// 네트워크 없이 store.mjs(공식 참조 어댑터 포팅본)의 상태 전이를 검증하는 로컬 자체 테스트.
// 여기 쓰인 fixture 형태 값(100/105/120, timeout→recover)은 criterion-registry.json의
// expected_recovery_transition과 원본 README 설명을 참고해 "같은 모양"으로 직접 구성한 테스트용
// 데이터다 — 과제가 제공하는 진짜 fixtures/*.json 원본 파일이 아니다 (해시 대조는 원본 파일로만 가능).
// 실제 USNO 호출 자체는 이 샌드박스 네트워크에서 막혀 있어 이 스크립트로는 확인 불가 —
// GitHub Actions에서 scripts/collect.mjs를 실행해 실제 호출을 검증해야 함.

import assert from "node:assert/strict";
import { resetEvaluationState, runFixture, recomputeDelta } from "../app/public/shared/store.mjs";

const FETCHED_AT_D1 = "2026-08-24T03:00:00.000Z"; // KST 2026-08-24 12:00
const FETCHED_AT_D2 = "2026-08-25T03:00:00.000Z"; // KST 2026-08-25 12:00

function payload(value, fetchedAt, recordDate) {
  return {
    signal_id: "t04-demo-signal",
    normalized_value: value,
    unit: "pt",
    source_name: "ALEPH Demo Source",
    source_url: "https://example.invalid/demo",
    source_time: fetchedAt,
    fetched_at: fetchedAt,
    record_timezone: "Asia/Seoul",
    record_date: recordDate,
  };
}

const fx = (id, transport, payloadObj) => ({
  fixture_id: id,
  contract_version: "1.1.0",
  description_ko: "self-test 용 fixture",
  virtual_now: payloadObj?.fetched_at ?? FETCHED_AT_D1,
  transport,
  payload: payloadObj ?? null,
  expected: { freshness: "fresh", error_code: "none", row_count: 0, stored_value: null, delta: null, preserve_last_good: true },
});

let state = resetEvaluationState();

// D1-A: 100
state = runFixture(state, fx("T04-NORMAL-D1-A", { mode: "http", status: 200, delay_ms: 0, deadline_ms: 5000, headers: {} }, payload(100, FETCHED_AT_D1, "2026-08-24")));
assert.equal(state.daily_readings.length, 1);
assert.equal(state.current_reading.normalized_value, 100);
assert.equal(state.status.freshness, "fresh");

// D1-B: 같은 날짜, 값 105 → 행 개수 그대로 (C20)
state = runFixture(state, fx("T04-NORMAL-D1-B", { mode: "http", status: 200, delay_ms: 0, deadline_ms: 5000, headers: {} }, payload(105, FETCHED_AT_D1, "2026-08-24")));
assert.equal(state.daily_readings.length, 1, "같은 날짜 재실행은 새 행을 만들면 안 됨 (C20)");
assert.equal(state.daily_readings[0].normalized_value, 105);

// TIMEOUT: last_good(105)/행 수 보존, stale (C17/C18)
state = runFixture(state, fx("T04-TIMEOUT", { mode: "timeout", status: null, delay_ms: 30000, deadline_ms: 5000, headers: {} }));
assert.equal(state.daily_readings.length, 1);
assert.equal(state.daily_readings[0].normalized_value, 105, "실패 후에도 마지막 정상값 보존 (C17)");
assert.equal(state.status.freshness, "stale", "정상값이 있는 상태의 실패는 stale (C18)");
assert.equal(state.status.error_code, "timeout");
// criterion-registry.json expected_recovery_transition.before_retry 와 대조
assert.deepEqual(
  { freshness: state.status.freshness, error_code: state.status.error_code, daily_row_count: state.daily_readings.length, last_good_value: state.daily_readings[0].normalized_value, record_date: state.daily_readings[0].record_date },
  { freshness: "stale", error_code: "timeout", daily_row_count: 1, last_good_value: 105, record_date: "2026-08-24" }
);

// RECOVER-D2: 다음 날짜, 값 120 → 새 행 추가, fresh/none (C19, C21)
state = runFixture(state, fx("T04-RECOVER-D2", { mode: "http", status: 200, delay_ms: 0, deadline_ms: 5000, headers: {} }, payload(120, FETCHED_AT_D2, "2026-08-25")));
assert.equal(state.daily_readings.length, 2, "다음 날짜 성공은 새 행을 만들어야 함 (C21)");
assert.equal(state.status.freshness, "fresh", "복구 후 fresh (C19)");
assert.equal(state.status.error_code, "none");
// criterion-registry.json expected_recovery_transition.after_retry 와 대조
assert.deepEqual(
  { freshness: state.status.freshness, error_code: state.status.error_code, daily_row_count: state.daily_readings.length, stored_value: state.daily_readings[1].normalized_value, record_date: state.daily_readings[1].record_date },
  { freshness: "fresh", error_code: "none", daily_row_count: 2, stored_value: 120, record_date: "2026-08-25" }
);

// 전일 대비 재계산 (C24): 105 -> 120 = +15
const delta = recomputeDelta(state.daily_readings[0], state.daily_readings[1]);
assert.equal(delta.delta, 15, "105 -> 120 은 +15 (README 3번 fixture 설명과 일치)");

console.log("모든 self-test 통과 — criterion-registry.json의 expected_recovery_transition과 값 일치 확인됨");
console.log(JSON.stringify({ daily: state.daily_readings.map((d) => [d.record_date, d.normalized_value]), delta }, null, 2));
