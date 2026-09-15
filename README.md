# 오늘의 달 — T04 진짜 정보판

요약: 대구 기준 달의 조명 비율(illumination)을 매일 실제로 조회해 Asia/Seoul 날짜별로 기록하는 정적 웹 앱입니다.
데이터 수신 실패 다섯 종류와 복구를 과제 제공 공식 합성 fixture로 재생합니다. 실제 이틀 기록과 과제 제출 증빙은 구분합니다.

## 진행 상태 (2026-09-15 기준)

1. 주제/설계: 확정. 값 = 달의 조명 비율(%, USNO `fracillum`), 보조 정보 = 위상(`curphase`). 기준 위치 대구(35.8714, 128.6014), 기준 시간대 Asia/Seoul.
2. 실제 조회·저장 로직: 구현 완료. `app/public/shared/store.mjs`(공식 `adapter-reset.example.js` 포팅본), `app/public/shared/usno-adapter.mjs`(live adapter), `scripts/collect.mjs`.
3. 화면: 구현 완료 (`app/public/index.html`, `app.js`, `style.css`) — 실제 값/단위/출처/출처시각/조회시각/시간대, 일별 기록 표, 전일 대비, 원자료 대조 보기 포함.
4. **합성 fixture 5종+복구 재생: 구현 완료.** 원본 `fixtures/*.json` 9개를 받아 `app/public/fixtures/`(배포용)와 `reference/.../fixtures/`(대조용)에 원본 그대로 보관, SHA-256 17/17 일치 확인(`npm run verify-assets`). `app/public/shared/synthetic.mjs`가 공식 재생 순서(정상/실패 5종/복구)대로 `store.mjs`를 호출하고, 화면의 "수신 테스트" 패널에서 버튼으로 즉시 재생 가능.
5. 배포: GitHub Actions 워크플로(`.github/workflows/collect-and-deploy.yml`) 작성 완료, **아직 실제 GitHub 저장소에 push된 적 없음** (로컬에서만 작업 중 — 다음 단계는 본인 GitHub에 push).
6. 실제 이틀 기록: **미확보.** 첫 push 후 워크플로가 처음 실제로 성공하는 날이 1일차, 그 다음 실제 KST 날짜에 한 번 더 성공해야 2일차 확보.

## 실행과 검사

```bash
npm test           # 네트워크 없이 store.mjs 검증: self-test + 공식 9개 fixture 전부 재생해 expected와 대조
npm run verify-assets  # reference/의 원본 17개 파일 SHA-256을 asset-manifest.json과 대조
node scripts/scan-secrets.mjs  # 저장소 추적 파일에서 비밀값 패턴 검색
npm run collect     # 실제 USNO API 호출해 app/public/data/records.json 갱신 (로컬 네트워크 필요)
npm run dev         # 정적 서버로 로컬 확인 (http://localhost:8080)
```

현재 `npm test` 결과: self-test 통과 + 공식 fixture 9개 전부(정상 3, 실패 5, 회복 1) 각자의 `expected` 블록과 일치.
`npm run verify-assets` 결과: 17/17 파일 SHA-256 일치. `scan-secrets.mjs` 결과: 46개 파일 스캔, 비밀값 0건.

## 실제 조회와 보존

- 원천: `https://aa.usno.navy.mil/api/rstt/oneday?date=YYYY-MM-DD&coords=35.8714,128.6014&tz=9` (USNO Astronomical Applications API, 키 불필요)
- 핵심 값: `fracillum`(조명 비율, %) → `normalized_value`. API가 이미 정수 퍼센트 문자열로 반올림해서 주므로 원자료·저장값·화면값이 그대로 일치.
- 저장 형식은 과제 공식 `normalized-reading.schema.json`을 그대로 따름(`signal_id, normalized_value, unit, source_name, source_url, source_time, fetched_at, record_timezone, record_date`).
- 출처 시각(`source_time`): USNO는 초 단위가 아니라 요청한 날짜 하루 단위로 계산하므로, 그 날짜의 KST 자정을 출처 시각으로 표기하고 화면에 "일 단위 계산값"이라고 분명히 밝힘(정밀도를 지어내지 않음).
- 조회 시각(`fetched_at`): 실제로 이 URL을 호출한 시각. 출처 시각과 구분해서 둘 다 화면에 KST로 표시.
- 기록 날짜(`record_date`): `fetched_at`을 Asia/Seoul로 변환해 파생 — 같은 날짜는 한 행 갱신, 다음 날짜는 새 행.
- 실패는 `current_reading`/`daily_readings`를 절대 덮어쓰지 않고 `status`(freshness/error_code)만 갱신 (`app/public/shared/store.mjs`, 공식 참조 어댑터 로직).
- 공개 기록 파일: `app/public/data/records.json`. 새 시크릿 창에서도 동일 파일을 조회.

## GitHub 배포 (다음 단계 — 아직 미실행)

1. 이 저장소를 본인 GitHub 계정에 생성 후 push.
2. 저장소 Settings → Pages → Source에서 **GitHub Actions** 선택.
3. main push 또는 Actions 탭에서 `Collect moon data and deploy` 워크플로 수동 실행(`workflow_dispatch`) — 이걸로 실제 1일차 기록 시작.
4. 자동 수집은 매일 00:15 UTC(09:15 KST) 예약 실행. 예약은 지연될 수 있으니 실제 커밋의 `fetched_at`을 증거로 사용 (예약 시각 아님).
5. API 키는 필요 없음. 워크플로가 `records.json`을 커밋하는 데 쓰는 `GITHUB_TOKEN`은 저장소 안에서만 쓰이고 브라우저·공개 파일에 노출되지 않음.

## 합성 시험

`app/public/shared/synthetic.mjs`가 `public-contract.json`의 공식 재생 순서를 그대로 따른다:
- 정상 저장: reset → D1-A → D1-B → D2
- 각 실패: reset → D1-A → D1-B → 실패 fixture 1개 (TIMEOUT/AUTH-401/RATE-429/OFFLINE/SCHEMA-BREAK)
- 회복: reset → D1-A → D1-B → TIMEOUT → RECOVER-D2

`scripts/run-fixtures-check.mjs`로 9개 공식 fixture를 전부 재생해 각 fixture의 `expected` 블록(freshness/error_code/row_count/stored_value/delta)과 실제 결과를 자동 대조 — 전부 일치 확인됨. 합성 값은 `pt` 단위이며 실제 달 조명 비율(%)과 절대 섞지 않는다. 합성 날짜(2026-08-24/25)는 실제 날짜 증거로 쓰지 않는다.

## 자료와 증빙

- `reference/t04-real-information-board-public-v1/`: 과제 원본 17개 파일 그대로 보관 (README, 스키마 4종, criterion-registry.json, adapter-reset.example.js, fixture-manifest.json, fixtures/ 9개)
- `evidence/asset-verification.json`: 원본 17개 파일 SHA-256 대조 결과 — 17/17 일치
- `evidence/secret-scan.json`: 비밀값 패턴 검색 결과 — 0건 (애초에 키 없는 공개 API만 사용)
- 플랫폼 발급 `t04_day` 영수증 2건: 발급 절차가 제공 자료에 없어 실제 제출 단계에서 확인 필요 (앱이 이를 위조하거나 대신 발급하지 않음)

USNO API 문서: https://aa.usno.navy.mil/data/api
