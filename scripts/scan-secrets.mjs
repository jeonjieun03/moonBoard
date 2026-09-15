#!/usr/bin/env node
// 일반적인 비밀값 패턴을 저장소 추적 파일 전체에서 훑어 evidence/secret-scan.json을 남긴다.
// (이 앱은 애초에 키 없는 공개 API만 쓰므로 노출될 비밀 자체가 없음 — 그래도 점검 기록을 남긴다.)
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = `${__dirname}/..`;

const PATTERNS = [
  { name: "aws_access_key_id", re: /AKIA[0-9A-Z]{16}/g },
  { name: "generic_api_key_assignment", re: /(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi },
  { name: "private_key_block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "bearer_token", re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/g },
  { name: "slack_token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
];

function listTrackedFiles() {
  const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

async function main() {
  const files = listTrackedFiles();
  const findings = [];
  for (const relPath of files) {
    let text;
    try {
      text = await readFile(`${ROOT}/${relPath}`, "utf8");
    } catch {
      continue; // 바이너리 등 텍스트로 못 읽는 파일은 건너뜀
    }
    for (const { name, re } of PATTERNS) {
      const matches = text.match(re);
      if (matches) findings.push({ file: relPath, pattern: name, count: matches.length });
    }
  }

  const report = {
    scanned_at: new Date().toISOString(),
    files_scanned: files.length,
    patterns_checked: PATTERNS.map((p) => p.name),
    findings,
    note_ko: "패턴 기반 스캔이며 모든 비밀 형식을 보장하지 않음. 이 앱은 키가 필요 없는 공개 API만 사용.",
  };

  await writeFile(`${ROOT}/evidence/secret-scan.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`스캔 완료: ${files.length}개 파일, findings=${findings.length}`);
  if (findings.length) process.exitCode = 1;
}

main();
