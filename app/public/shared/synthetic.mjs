// 합성 fixture 재생 모듈 (플레이스홀더).
//
// TODO: 과제 원본 zip(orbit-iss-board-...zip)의 fixtures/*.json 9개 파일을 받으면
//   app/public/fixtures/ 아래에 원본 그대로 복사하고, 아래 FIXTURE_FILES 매핑과
//   loadFixture()의 필드 매핑을 실제 파일 구조에 맞춰 완성한다.
//   (지금은 README에 적힌 값만 알고 있어 정확한 JSON key 이름을 모름 — 반드시 원본 파일 기준으로 맞출 것)
//
// 원칙(README 카드3):
//  - 실제 조회와 "같은" normalize 결과 형태로 변환해서, 같은 store 함수(upsertDailyReading/markFailure)에 넣는다.
//  - 합성 저장소는 실제 store(records.json)와 완전히 분리된 별도 객체를 쓴다 (실제 데이터 오염 금지).
//  - 합성 날짜(2026-08-24/25)는 실제 날짜 증거로 취급하지 않는다.

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

export async function loadFixture(id, { baseUrl = "/fixtures/" } = {}) {
  const file = FIXTURE_FILES[id];
  if (!file) throw new Error(`알 수 없는 fixture id: ${id}`);
  const res = await fetch(baseUrl + file);
  if (!res.ok) throw new Error(`fixture 로드 실패: ${file} (${res.status})`);
  return res.json();
}

// TODO(완성 필요): 실제 fixture JSON 구조를 확인한 뒤 정규화 매핑을 채운다.
export function normalizeFixture(_fixtureJson, _fixtureId) {
  throw new Error("normalizeFixture 미구현 — 원본 zip의 fixtures/*.json 구조 확인 후 채워야 함");
}
