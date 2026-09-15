# 오늘의 달 — T04 진짜 정보판

요약: 대구 기준 달의 조명 비율(illumination)을 매일 실제로 조회해 Asia/Seoul 날짜별로 기록하는 정적 웹 앱입니다.
데이터 수신 실패 다섯 종류와 복구를 과제 제공 합성 fixture로 재생합니다. 실제 이틀 기록과 과제 제출 증빙은 구분합니다.

## 진행 상태 (2026-09-15 기준)

1. 주제/설계: 확정. 값 = 달의 조명 비율(%, USNO `fracillum`), 보조 정보 = 위상(`curphase`). 기준 위치 대구(35.8714, 128.6014), 기준 시간대 Asia/Seoul.
2. 실제 조회·저장 로직: 구현 완료 (`app/public/shared/normalize.mjs`, `scripts/collect.mjs`), 로컬 self-test 통과.
3. 화면: 구현 완료 (`app/public/index.html`, `app.js`, `style.css`) — 실제 값/단위/출처/출처시각/조회시각/시간대, 일별 기록 표, 전일 대비, 원자료 대조 보기 포함.
4. **합성 fixture 5종+복구 재생: 미완성.** 과제 원본 zip(`orbit-iss-board-...zip`)의 `fixtures/*.json` 9개 파일을 아직 못 받아서, `app/public/shared/synthetic.mjs`가 자리만 잡아둔 상태입니다. zip을 받으면 `app/public/fixtures/`에 원본 그대로 넣고 이 모듈을 완성해야 합니다.
5. 배포: GitHub Actions 워크플로(`.github/workflows/collect-and-deploy.yml`) 작성 완료, 아직 실제 GitHub 저장소에 push된 적 없음 (로컬에서만 작업 중).
6. 실제 이틀 기록: **미확보.** 첫 push 후 워크플로가 처음 실제로 성공하는 날이 1일차, 그 다음 실제 KST 날짜에 한 번 더 성공해야 2일차 확보.

## 실행

```bash
npm test        # 네트워크 없이 정규화/저장 로직 검증
npm run collect # 실제 USNO API 호출해 app/public/data/records.json 갱신 (로컬 네트워크 필요)
npm run dev      # 정적 서버로 로컬 확인 (http://localhost:8080)
```

## 실제 조회와 보존

- 원천: `https://aa.usno.navy.mil/api/rstt/oneday?date=YYYY-MM-DD&coords=35.8714,128.6014&tz=9` (USNO Astronomical Applications API, 키 불필요)
- 핵심 값: `fracillum`(조명 비율, %). API가 이미 정수 퍼센트 문자열로 반올림해서 주므로 원자료·저장값·화면값이 그대로 일치.
- 출처 시각: 실제로 이 URL을 호출한 시각(UTC ISO, 화면엔 KST로 변환 표시). 조회 시각(화면을 보는 지금)과 구분해서 둘 다 표시.
- 기록 날짜 키: 호출 시점을 Asia/Seoul로 변환한 날짜. 같은 날짜는 한 행 갱신, 다음 날짜는 새 행.
- 실패(HTTP 오류/타임아웃/네트워크 오류)는 `last_good`과 기존 일별 행을 절대 덮어쓰지 않고 `last_status`만 stale/error로 갱신 (`app/public/shared/normalize.mjs`).
- 공개 기록 파일: `app/public/data/records.json`. 새 시크릿 창에서도 동일 파일을 조회.

## GitHub 배포 (아직 미실행)

1. 이 저장소를 본인 GitHub 계정에 생성 후 push.
2. 저장소 Settings → Pages → Source에서 **GitHub Actions** 선택.
3. main push 또는 Actions 탭에서 `Collect moon data and deploy` 워크플로 수동 실행(`workflow_dispatch`).
4. 자동 수집은 매일 00:15 UTC(09:15 KST) 예약 실행. 예약은 지연될 수 있으니 실제 커밋의 `source_observed_at`을 증거로 사용 (예약 시각 아님).
5. API 키는 필요 없음. 워크플로가 `records.json`을 커밋하는 데 쓰는 `GITHUB_TOKEN`은 저장소 안에서만 쓰이고 브라우저·공개 파일에 노출되지 않음.

## 합성 시험 (미완성 — zip 수신 후 완성 예정)

원본 zip의 9개 fixture(`T04-NORMAL-D1-A/B/D2`, `T04-TIMEOUT`, `T04-AUTH-401`, `T04-RATE-429`, `T04-OFFLINE`, `T04-SCHEMA-BREAK`, `T04-RECOVER-D2`)를 받으면:
1. `app/public/fixtures/`에 원본 그대로 복사 (바이트 보존 — `.gitattributes`로 고정 예정)
2. `app/public/shared/synthetic.mjs`의 `normalizeFixture()`를 실제 파일 구조에 맞춰 완성
3. 화면의 "수신 테스트" 패널에 재생 버튼 연결 (실제 데이터와 분리된 별도 store 사용, 같은 normalize/저장 함수 재사용)
4. `evidence/asset-verification.json`에 원본 17개 파일 SHA-256 대조 결과 기록

## 자료와 증빙 (예정)

- `evidence/asset-verification.json`: 과제 package ID와 파일 SHA-256 대조 (zip 수신 후 생성)
- `evidence/secret-scan.json`: 비밀값 패턴 검색 결과 (외부 API 키를 쓰지 않으므로 애초에 노출될 비밀 없음)
- 플랫폼 발급 `t04_day` 영수증 2건: 발급 절차가 제공 자료에 없어 실제 제출 단계에서 확인 필요 (앱이 이를 위조하거나 대신 발급하지 않음)

USNO API 문서: https://aa.usno.navy.mil/data/api
