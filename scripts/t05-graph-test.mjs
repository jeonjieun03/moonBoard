// T05 고정 검사 10개(T05-G01~G10) — HANDOFF.md 섹션 4 / evidence/t05-initial-tests.json 과 동일한 입력·기대값.
// shared/chart.mjs의 순수 함수만 사용하므로 브라우저 없이 Node에서 그대로 검증할 수 있다.
// 이 스크립트는 새 파일이며, 기존 self-test.mjs / run-fixtures-check.mjs(T04 검사)는 건드리지 않는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prepareIlluminationChartData, layoutChartPoints, renderChartMarkup } from "../app/public/shared/chart.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = [];

function check(id, label, fn) {
  try {
    fn();
    results.push({ id, label, status: "PASS" });
  } catch (err) {
    results.push({ id, label, status: "FAIL", message: err.message });
  }
}

function row(date, value, unit = "%") {
  return { record_date: date, normalized_value: value, unit };
}

// --- T05-G01: 기록 1개 → 1개 표시 ---
check("T05-G01", "기록 1개 → 1개 표시", () => {
  const state = { daily_readings: [row("2026-09-15", 17)] };
  const points = prepareIlluminationChartData(state);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0], { date: "2026-09-15", value: 17, unit: "%" });
  const markup = renderChartMarkup(points);
  assert.match(markup, /2026-09-15 17%/);
});

// --- T05-G02: 기록 2개 → 두 날짜 모두 표시 ---
check("T05-G02", "기록 2개 → 두 날짜 모두 표시", () => {
  const state = { daily_readings: [row("2026-09-15", 17), row("2026-09-16", 25)] };
  const points = prepareIlluminationChartData(state);
  assert.equal(points.length, 2);
  const markup = renderChartMarkup(points);
  assert.match(markup, /2026-09-15 17%/);
  assert.match(markup, /2026-09-16 25%/);
});

// --- T05-G03: 날짜가 뒤섞여도 날짜순 표시 ---
check("T05-G03", "날짜가 뒤섞여도 날짜순 표시", () => {
  const state = { daily_readings: [row("2026-09-16", 25), row("2026-09-15", 17), row("2026-09-17", 30)] };
  const points = prepareIlluminationChartData(state);
  assert.deepEqual(
    points.map((p) => p.date),
    ["2026-09-15", "2026-09-16", "2026-09-17"]
  );
  const coords = layoutChartPoints(points);
  // x좌표도 날짜순으로 단조 증가해야 함
  assert.ok(coords[0].x < coords[1].x && coords[1].x < coords[2].x);
});

// --- T05-G04: 같은 날짜 중복이 그래프에 중복 표시되지 않음 ---
check("T05-G04", "같은 날짜 중복이 그래프에 중복 표시되지 않음", () => {
  const state = {
    daily_readings: [row("2026-09-15", 17), row("2026-09-15", 40)],
  };
  const points = prepareIlluminationChartData(state);
  assert.equal(points.length, 1, "같은 record_date는 한 점으로 병합되어야 함");
});

// --- T05-G05: 0% 표시 ---
check("T05-G05", "0% 표시", () => {
  const state = { daily_readings: [row("2026-09-15", 0)] };
  const points = prepareIlluminationChartData(state);
  const markup = renderChartMarkup(points);
  assert.match(markup, /2026-09-15 0%/);
  const coords = layoutChartPoints(points);
  assert.ok(Number.isFinite(coords[0].y), "0%도 유효한 좌표를 가져야 함(그래프 밖으로 밀려나면 안 됨)");
});

// --- T05-G06: 100% 표시 ---
check("T05-G06", "100% 표시", () => {
  const state = { daily_readings: [row("2026-09-15", 100)] };
  const points = prepareIlluminationChartData(state);
  const markup = renderChartMarkup(points);
  assert.match(markup, /2026-09-15 100%/);
  const coords = layoutChartPoints(points);
  assert.ok(Number.isFinite(coords[0].y));
});

// --- T05-G07: 빈 기록 → 기록 없음 안내, 오류 없음 ---
check("T05-G07", "빈 기록 → 기록 없음 안내, 오류 없음", () => {
  const state = { daily_readings: [] };
  const points = prepareIlluminationChartData(state);
  assert.equal(points.length, 0);
  const markup = renderChartMarkup(points); // 예외를 던지면 이 check()가 FAIL로 잡음
  assert.match(markup, /기록이 없습니다/);
  assert.doesNotMatch(markup, /<svg/);
});

// --- T05-G08: 그래프 추가 전후 원본 reading 불변 ---
check("T05-G08", "그래프 추가 전후 원본 reading 불변", () => {
  const originalRow = {
    record_id: "moon-illumination-daegu-2026-09-15",
    signal_id: "moon-illumination-daegu",
    record_date: "2026-09-15",
    normalized_value: 17,
    unit: "%",
    reading: { normalized_value: 17, unit: "%", record_date: "2026-09-15" },
  };
  const before = JSON.stringify(originalRow);
  const state = { daily_readings: [originalRow] };
  const points = prepareIlluminationChartData(state);
  renderChartMarkup(points);
  const after = JSON.stringify(originalRow);
  assert.equal(before, after, "차트 함수 실행이 원본 row/reading 객체를 변경하면 안 됨");
});

// --- T05-G09: 기존 5종 오류 fixture 결과 불변 (기존 self-test/fixtures-check를 그대로 재실행해 확인) ---
check("T05-G09", "기존 5종 오류 fixture 결과 불변", () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, "self-test.mjs")], { encoding: "utf8" });
  assert.match(out, /모든 self-test 통과/);
  const out2 = execFileSync(process.execPath, [path.join(__dirname, "run-fixtures-check.mjs")], { encoding: "utf8" });
  assert.match(out2, /모든 공식 fixture 재생이 각자의 expected와 일치합니다/);
});

// --- T05-G10: records.json 재로드 시 그래프 데이터와 저장 날짜·조명률이 1:1 일치 ---
check("T05-G10", "records.json 재로드 시 그래프 데이터와 저장 날짜·조명률이 1:1 일치", () => {
  const recordsPath = path.join(__dirname, "..", "app", "public", "data", "records.json");
  const raw = JSON.parse(readFileSync(recordsPath, "utf8"));
  const points = prepareIlluminationChartData(raw);
  assert.equal(points.length, raw.daily_readings.length);
  for (const stored of raw.daily_readings) {
    const match = points.find((p) => p.date === stored.record_date);
    assert.ok(match, `records.json의 ${stored.record_date}가 그래프 데이터에 없음`);
    assert.equal(match.value, stored.normalized_value);
    assert.equal(match.unit, stored.unit);
  }
});

const failed = results.filter((r) => r.status === "FAIL");
for (const r of results) {
  console.log(`${r.status === "PASS" ? "✅" : "❌"} ${r.id} — ${r.label}${r.message ? ` :: ${r.message}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exit(1);
