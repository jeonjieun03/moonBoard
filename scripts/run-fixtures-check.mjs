#!/usr/bin/env node
// 진짜 원본 fixtures/*.json 9개를 store.mjs로 공식 재생 순서대로 돌려서
// 각 fixture의 "expected" 블록과 실제 결과가 일치하는지 검증한다.
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resetEvaluationState, runFixture } from "../app/public/shared/store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = `${__dirname}/../reference/t04-real-information-board-public-v1/fixtures`;

async function load(id, file) {
  return JSON.parse(await readFile(`${FX}/${file}`, "utf8"));
}

const FILES = {
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

function checkExpected(label, state, fixture) {
  const exp = fixture.expected;
  const actual = {
    freshness: state.status.freshness,
    error_code: state.status.error_code,
    row_count: state.daily_readings.length,
    stored_value: state.status.freshness === "fresh" ? state.current_reading.normalized_value : state.daily_readings.at(-1)?.normalized_value ?? null,
    delta: state.last_comparison.state === "comparable" ? (state.last_comparison.direction === "decrease" ? -state.last_comparison.magnitude : state.last_comparison.magnitude) : null,
  };
  const fields = ["freshness", "error_code", "row_count", "stored_value"];
  if (exp.delta !== null) fields.push("delta");
  const mismatches = fields.filter((f) => actual[f] !== exp[f]);
  const ok = mismatches.length === 0;
  console.log(`${ok ? "✅" : "❌"} ${label} (${fixture.fixture_id})${ok ? "" : " MISMATCH: " + JSON.stringify({ expected: exp, actual })}`);
  return ok;
}

async function main() {
  let allOk = true;

  // 1) 정상 저장 순서: reset → D1-A → D1-B → D2
  {
    let state = resetEvaluationState();
    const a = await load("T04-NORMAL-D1-A", FILES["T04-NORMAL-D1-A"]);
    state = runFixture(state, a);
    allOk &= checkExpected("정상 D1-A", state, a);
    const b = await load("T04-NORMAL-D1-B", FILES["T04-NORMAL-D1-B"]);
    state = runFixture(state, b);
    allOk &= checkExpected("정상 D1-B(같은 날 갱신)", state, b);
    const d2 = await load("T04-NORMAL-D2", FILES["T04-NORMAL-D2"]);
    state = runFixture(state, d2);
    allOk &= checkExpected("정상 D2(다음날)", state, d2);
  }

  // 2) 각 실패: reset → D1-A → D1-B → 실패 1개
  for (const failId of ["T04-TIMEOUT", "T04-AUTH-401", "T04-RATE-429", "T04-OFFLINE", "T04-SCHEMA-BREAK"]) {
    let state = resetEvaluationState();
    state = runFixture(state, await load("T04-NORMAL-D1-A", FILES["T04-NORMAL-D1-A"]));
    state = runFixture(state, await load("T04-NORMAL-D1-B", FILES["T04-NORMAL-D1-B"]));
    const failFx = await load(failId, FILES[failId]);
    state = runFixture(state, failFx);
    allOk &= checkExpected(`실패 재생 ${failId}`, state, failFx);
  }

  // 3) 오류 뒤 회복: reset → D1-A → D1-B → TIMEOUT → RECOVER-D2
  {
    let state = resetEvaluationState();
    state = runFixture(state, await load("T04-NORMAL-D1-A", FILES["T04-NORMAL-D1-A"]));
    state = runFixture(state, await load("T04-NORMAL-D1-B", FILES["T04-NORMAL-D1-B"]));
    const to = await load("T04-TIMEOUT", FILES["T04-TIMEOUT"]);
    state = runFixture(state, to);
    allOk &= checkExpected("회복 전(TIMEOUT)", state, to);
    const rec = await load("T04-RECOVER-D2", FILES["T04-RECOVER-D2"]);
    state = runFixture(state, rec);
    allOk &= checkExpected("회복 후(RECOVER-D2)", state, rec);
  }

  console.log(allOk ? "\n모든 공식 fixture 재생이 각자의 expected와 일치합니다." : "\n일부 불일치 있음 — 위 로그 확인.");
  process.exitCode = allOk ? 0 : 1;
}

main();
