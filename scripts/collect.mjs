#!/usr/bin/env node
// 실제 공개 원천(USNO)을 서버 쪽(GitHub Actions 실행 환경 또는 로컬 CLI)에서 호출해
// app/public/data/records.json 을 원자적으로 갱신한다.
//
// - API 키가 필요 없는 출처만 쓴다 (README 카드2).
// - 실패해도 마지막 정상값(daily_readings[])은 절대 덮어쓰지 않는다 (README 카드3, store.mjs).
// - 같은 Asia/Seoul 날짜에 여러 번 성공해도 하루 한 행으로 원자적 갱신한다 (README 카드4).
// - live adapter(usno-adapter.mjs)와 합성 재생이 같은 store.mjs 함수를 공유한다.
//
// 실행: node scripts/collect.mjs

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applySuccessfulReading, applyError, resetEvaluationState } from "../app/public/shared/store.mjs";
import { adaptUsnoReading, LOCATION, TZ_OFFSET_HOURS } from "../app/public/shared/usno-adapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH = `${__dirname}/../app/public/data/records.json`;

function seoulDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

async function loadState() {
  try {
    return JSON.parse(await readFile(RECORDS_PATH, "utf8"));
  } catch {
    return resetEvaluationState();
  }
}

async function saveStateAtomic(state) {
  await mkdir(dirname(RECORDS_PATH), { recursive: true });
  const tmpPath = `${RECORDS_PATH}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await rename(tmpPath, RECORDS_PATH); // 같은 폴더 내 rename은 원자적
}

async function main() {
  const requestDate = seoulDateKey();
  const sourceUrl = `https://aa.usno.navy.mil/api/rstt/oneday?date=${requestDate}&coords=${LOCATION.lat},${LOCATION.lon}&tz=${TZ_OFFSET_HOURS}`;

  let state = await loadState();
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const code = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limit" : "schema_error";
      state = applyError(state, code, { virtual_now: fetchedAt });
      await saveStateAtomic(state);
      console.error(`[collect] HTTP ${res.status} → error_code=${code}, 마지막 정상값 보존`);
      process.exitCode = 1;
      return;
    }
    const raw = await res.json();
    const { reading, display } = adaptUsnoReading(raw, { sourceUrl, fetchedAt });
    state = applySuccessfulReading(state, reading, { virtual_now: fetchedAt }, display);
    await saveStateAtomic(state);
    console.log(`[collect] ${reading.record_date} 기록 완료 — ${reading.normalized_value}${reading.unit} (${display.phase_name})`);
  } catch (err) {
    const code = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : err?.code === "schema_error" ? "schema_error" : "offline";
    state = applyError(state, code, { virtual_now: fetchedAt });
    await saveStateAtomic(state);
    console.error(`[collect] 실패(${code}): ${err.message} — 마지막 정상값 보존`);
    process.exitCode = 1;
  }
}

main();
