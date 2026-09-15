#!/usr/bin/env node
// reference/t04-real-information-board-public-v1/ 의 원본 파일들을 asset-manifest.json의
// SHA-256과 대조하고 evidence/asset-verification.json을 남긴다.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = `${__dirname}/..`;
const REF = `${ROOT}/reference/t04-real-information-board-public-v1`;

async function sha256(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const manifest = JSON.parse(await readFile(`${REF}/asset-manifest.json`, "utf8"));
  const results = [];
  let allMatch = true;

  for (const entry of manifest.files) {
    let actual;
    let error = null;
    try {
      actual = await sha256(`${REF}/${entry.path}`);
    } catch (e) {
      actual = null;
      error = e.message;
    }
    const match = actual === entry.sha256;
    if (!match) allMatch = false;
    results.push({ path: entry.path, expected_sha256: entry.sha256, actual_sha256: actual, match, error });
  }

  const report = {
    package_id: manifest.package_id,
    verified_at: new Date().toISOString(),
    file_count: manifest.files.length,
    all_match: allMatch,
    results,
  };

  await writeFile(`${ROOT}/evidence/asset-verification.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`검증 완료: ${results.filter((r) => r.match).length}/${results.length} 일치 (all_match=${allMatch})`);
  if (!allMatch) process.exitCode = 1;
}

main();
