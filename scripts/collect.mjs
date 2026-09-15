#!/usr/bin/env node
// 실제 공개 원천(USNO)을 서버 쪽(GitHub Actions 실행 환경 또는 로컬 CLI)에서 호출해
// app/public/data/records.json 을 원자적으로 갱신한다.
//
// - API 키가 필요 없는 출처만 쓴다 (README 카드2).
// - 실패해도 마지막 정상값(daily[])은 절대 덮어쓰지 않는다 (README 카드3).
// - 같은 Asia/Seoul 날짜에 여러 번 성공해도 하루 한 행으로 원자적 갱신한다 (README 카드4).
//
// 실행: node scripts/collect.mjs
// (Node 18+ 내장 fetch 사용, 외부 패키지 의존성 없음)

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeUsnoReading,
  upsertDailyReading,
  markFailure,
  emptyStore,
  LOCATION,
  TZ_OFFSET_HOURS,
} from "../app/public/shared/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH = `${__dirname}/../app/public/data/records.json`;

function seoulDateKey(d = new Date()) {
  // Asia/Seoul 기준 YYYY-MM-DD (en-CA 로케일이 ISO 형식 YYYY-MM-DD를 그대로 줌)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

async function loadStore() {
  try {
    const text = await readFile(RECORDS_PATH, "utf8");
    return JSON.parse(text);
  } catch {
    return emptyStore();
  }
}

async function saveStoreAtomic(store) {
  await mkdir(dirname(RECORDS_PATH), { recursive: true });
  const tmpPath = `${RECORDS_PATH}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(store, null, 2) + "\n", "utf8");
  await rename(tmpPath, RECORDS_PATH); // 같은 폴더 내 rename은 원자적
}

async function main() {
  const recordDate = seoulDateKey();
  const sourceUrl = `https://aa.usno.navy.mil/api/rstt/oneday?date=${recordDate}&coords=${LOCATION.lat},${LOCATION.lon}&tz=${TZ_OFFSET_HOURS}`;

  let store = await loadStore();
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const code = res.status === 401 || res.status === 403 ? "auth_401" : res.status === 429 ? "rate_429" : "http_error";
      store = markFailure(store, code, { checkedAt: fetchedAt });
      await saveStoreAtomic(store);
      console.error(`[collect] HTTP ${res.status} — 실패로 기록, 마지막 정상값 보존`);
      process.exitCode = 1;
      return;
    }
    const raw = await res.json();
    const reading = normalizeUsnoReading(raw, { sourceUrl, sourceObservedAt: fetchedAt, recordDate });
    store = upsertDailyReading(store, reading, { fetchedAt });
    await saveStoreAtomic(store);
    console.log(`[collect] ${recordDate} 기록 완료 — ${reading.value}${reading.unit} (${reading.phase_name})`);
  } catch (err) {
    const code = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : err?.code || "network_error";
    store = markFailure(store, code, { checkedAt: fetchedAt });
    await saveStoreAtomic(store);
    console.error(`[collect] 실패(${code}): ${err.message} — 마지막 정상값 보존`);
    process.exitCode = 1;
  }
}

main();
