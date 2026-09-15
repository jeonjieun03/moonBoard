// 합성 fixture 재생. store.mjs와 완전히 같은 상태 전이 함수를 쓰되, 실제 records.json과는
// 별도의(브라우저 메모리에만 있는) state를 다룬다 — 실제 데이터를 절대 건드리지 않는다.
//
// public-contract.json의 fixture_contract에 정의된 순서를 그대로 따른다:
//   success_sequence: D1-A → D1-B → D2
//   failure_baseline_sequence + 실패 1개: D1-A → D1-B → (실패)
//   recovery_sequence: D1-A → D1-B → TIMEOUT → RECOVER-D2

import { resetEvaluationState, runFixture } from "./store.mjs";

export const FIXTURE_FILES = {
  "T04-NORMAL-D1-A": "normal-d1-a.json",
  "T04-NORMAL-D1-B": "normal-d1-b.json",
  "T04-NORMAL-D2": "normal-d2.json",
  "T04-TIMEOUT": "timeout.json",
  "T04-AUTH-401": "auth-401.json",
  "T04-RATE-429": "rate-429.json",
  "T04-OFFLINE": "offline.json",
  "T04-SCHEMA-BREAK": "schema-break.json",
  "T04-RECOVER-D2": "recover-d2.json",
};

const cache = new Map();

export async function loadFixture(id, { baseUrl = "fixtures/" } = {}) {
  if (cache.has(id)) return cache.get(id);
  const file = FIXTURE_FILES[id];
  if (!file) throw new Error(`알 수 없는 fixture id: ${id}`);
  const res = await fetch(baseUrl + file, { cache: "no-store" });
  if (!res.ok) throw new Error(`fixture 로드 실패: ${file} (HTTP ${res.status}) — 원본 zip의 fixtures/ 폴더를 app/public/fixtures/에 넣었는지 확인하세요.`);
  const json = await res.json();
  cache.set(id, json);
  return json;
}

/** 정상 저장 순서: reset → D1-A → D1-B → D2 */
export async function runSuccessSequence() {
  let state = resetEvaluationState();
  for (const id of ["T04-NORMAL-D1-A", "T04-NORMAL-D1-B", "T04-NORMAL-D2"]) {
    state = runFixture(state, await loadFixture(id));
  }
  return state;
}

/** 실패 재생: reset → D1-A → D1-B → 실패 fixture 1개 */
export async function runFailureSequence(failureId) {
  let state = resetEvaluationState();
  for (const id of ["T04-NORMAL-D1-A", "T04-NORMAL-D1-B", failureId]) {
    state = runFixture(state, await loadFixture(id));
  }
  return state;
}

/** 오류 뒤 회복: reset → D1-A → D1-B → TIMEOUT → RECOVER-D2 */
export async function runRecoverySequence() {
  let state = resetEvaluationState();
  for (const id of ["T04-NORMAL-D1-A", "T04-NORMAL-D1-B", "T04-TIMEOUT", "T04-RECOVER-D2"]) {
    state = runFixture(state, await loadFixture(id));
  }
  return state;
}

export const FAILURE_IDS = ["T04-TIMEOUT", "T04-AUTH-401", "T04-RATE-429", "T04-OFFLINE", "T04-SCHEMA-BREAK"];
