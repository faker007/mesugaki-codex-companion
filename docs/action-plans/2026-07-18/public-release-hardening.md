# Mesugaki Codex Companion 공개 배포 마감 실행 계획

- 상태: 진행 중
- 작성일: 2026-07-18
- 대상 저장소: `faker007/mesugaki-codex-companion`
- 대상 릴리스: `v0.2.0`
- 전체 예상 시간: 6~9시간 + 라이선스 결정 대기 시간
- 담당 역할: 저장소 관리자, QA, 문서 작성자, 릴리스 관리자

## 목표

현재 공개된 스킬과 Kurose Runa Codex 펫을 실제 앱에서 검증하고, 제3자가 사용 조건을 이해한 채 재현 가능한 방식으로 설치·검증할 수 있는 `v0.2.0` 릴리스로 마감한다.

## 현재 기준선

- `main`과 `origin/main`은 커밋 `55e3aea`에서 일치한다.
- 펫 atlas는 WebP `1536×1872`, 8열×9행, 사용 57프레임, 미사용 투명 셀 15개다.
- 로컬 검증에서 Node 테스트 56개가 통과했다.
- GitHub의 README, contact sheet, spritesheet 공개 URL은 `200 OK`다.
- 저장소에는 `LICENSE`, GitHub Actions workflow, Git tag, GitHub Release가 없다.
- `pnpm run setup`과 `pnpm run install:pet`은 별도 흐름이다.
- 저장소 자체 `pnpm run check`는 pet atlas의 크기·알파·셀 계약을 독립적으로 재검증하지 않는다.
- 패키지 설치와 정적 QA는 완료했지만 Codex 데스크톱 앱에서 custom pet을 선택해 보는 최종 smoke test는 남아 있다.

## 2026-07-18 진행 상황

| 작업 | 상태 | 확인 결과 |
| --- | --- | --- |
| 실제 Codex custom pet smoke test | 사용자 확인 대기 | 정적·시각 QA 통과, Computer Use의 Codex 앱 접근은 안전 정책으로 차단 |
| 코드·캐릭터 자산 라이선스 | 구현 완료 | 코드·문서 MIT, 루나 캐릭터·이미지·펫·음성 자산 All Rights Reserved |
| 저장소 자체 pet validator | 구현·로컬 검증 완료 | 72셀, 크기, 알파, 파일 크기, manifest 검사와 fixture 4개 통과 |
| GitHub Actions CI | 구현 완료·원격 검증 대기 | Node 20, pnpm 10.27.0, frozen install, `pnpm run check` |
| 공식 설치·지원 환경 문서 | 구현 완료 | GUI Upload pet, CLI·IDE·웹 제한 반영 |
| 스킬+펫 통합 설치 | 구현·로컬 검증 완료 | `setup:all`, `--install-pet`, `--force-pet` 추가 |
| `v0.2.0` Release | 대기 | smoke test, 라이선스, CI 성공 후 실행 |
| 공개 저장소 운영 문서 | 구현 완료 | CONTRIBUTING, SECURITY, issue/PR template 추가 |

## 범위

### 포함

- 데스크톱 앱과 지원되는 CLI 환경에서 custom pet smoke test
- 코드와 캐릭터·음성 자산의 라이선스 경계 확정
- 저장소 자체 pet validator와 GitHub Actions CI
- 공식 Codex Pets 흐름과 지원 환경을 반영한 README
- 스킬과 펫의 통합 설치 진입점
- `v0.2.0` tag, GitHub Release, checksum
- 최소한의 기여·보안 안내

### 제외

- 새 캐릭터 디자인 또는 기존 57프레임 재생성
- Fish Audio·ElevenLabs provider 자체 변경
- Windows/Linux용 음성 재생 구현
- npm registry 배포
- ChatGPT 웹용 custom pet 동기화 구현

## 선행 결정

### D1. 라이선스 조합

저장소 관리자가 구현 전에 아래 두 항목을 확정한다.

1. 코드·문서: `MIT` 또는 `Apache-2.0`
2. 캐릭터·이미지·음성 자산: 별도 이용 조건
   - 재사용 허용 시 CC 계열 조건을 명시한다.
   - 재배포를 제한하려면 `All Rights Reserved`와 허용 범위를 명시한다.
   - Fish Audio·ElevenLabs 계정, voice ID, 생성 음성의 사용 권한은 설치자 책임임을 적는다.

완료 조건은 루트 `LICENSE`와 README의 자산 권리 섹션이 서로 모순되지 않는 것이다.

### D2. 릴리스 기준

- 첫 공개 릴리스는 현재 `package.json`과 맞춰 `v0.2.0`으로 고정한다.
- `main`의 raw URL은 최신판 안내에만 사용하고, 릴리스 자산과 checksum을 재현 가능한 설치 기준으로 사용한다.

## 작업 목록

| 순서 | 우선순위 | 작업 | 담당 역할 | 예상 시간 | 의존성 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | 실제 Codex custom pet smoke test | QA | 45~90분 | 없음 |
| 2 | P0 | 코드·캐릭터 자산 라이선스 확정 | 저장소 관리자 | 30~60분 | D1 |
| 3 | P0 | 저장소 자체 pet validator 구현 | 개발자 | 90~150분 | 없음 |
| 4 | P0 | GitHub Actions CI 추가 | 개발자·QA | 45~90분 | 작업 3 |
| 5 | P1 | 공식 설치 흐름과 지원 환경 문서화 | 문서 작성자 | 45~75분 | 작업 1 |
| 6 | P1 | 스킬+펫 통합 설치 진입점 추가 | 개발자 | 45~90분 | 작업 1 |
| 7 | P1 | `v0.2.0` 릴리스와 checksum 발행 | 릴리스 관리자 | 30~60분 | 작업 1~6 |
| 8 | P2 | CONTRIBUTING·SECURITY·issue template 추가 | 저장소 관리자 | 45~90분 | 작업 2 |

## 단계별 실행

### 1. 실제 앱과 CLI smoke test

1. Codex 데스크톱 앱을 완전히 다시 연다.
2. `Settings → Pets → Refresh`에서 `Kurose Runa`가 표시되는지 확인한다.
3. custom pet을 선택하고 `/pet`으로 표시·숨김을 반복한다.
4. 다음 상태를 실제 작업으로 유도해 애니메이션을 확인한다.
   - idle
   - running-right / running-left
   - waving
   - jumping
   - failed 또는 blocked
   - waiting 또는 needs input
   - running 또는 active work
   - review 또는 ready
5. 리본 방향, 얼굴, 기준선, 크기 튐, 셀 경계 잘림을 기록한다.
6. 지원되는 터미널이 있으면 `/pets`, `/pets Kurose Runa`, `/pets off`를 확인한다.
7. 결과를 `docs/qa/pet-smoke-test-v0.2.0.md`에 앱·터미널 버전과 함께 남긴다.

완료 조건:

- 앱 pet picker에서 선택 가능하다.
- 9개 상태에 차단 수준의 시각 회귀가 없다.
- 실패가 있으면 해당 행만 수정하고 atlas·QA 전체를 다시 검증한다.

### 2. 라이선스 경계 추가

1. 결정 D1에 따라 루트 `LICENSE`를 추가한다.
2. `ASSET-LICENSE.md`에 아래 경계를 명시한다.
   - `assets/**`
   - `pet-assets/**`
   - 캐릭터명·설정·음성
3. README에 짧은 라이선스 요약과 두 문서 링크를 추가한다.
4. 사용자가 보유해야 하는 provider 계정·음성 권한을 명시한다.

완료 조건:

- 코드 복제·수정·배포 조건과 캐릭터 자산 사용 조건을 각각 판단할 수 있다.
- LICENSE 문구와 README 요약이 일치한다.

### 3. 저장소 자체 pet validator 구현

1. `scripts/validate-pet.mjs`를 추가한다.
2. cross-platform 이미지 검사를 위해 `sharp`를 devDependency로 추가하고 `pnpm-lock.yaml`을 커밋한다.
3. validator가 다음 계약을 검사한다.
   - `pet.json` 필수 필드와 `spritesheetPath`
   - 파일 형식 PNG 또는 WebP
   - 정확한 크기 `1536×1872`
   - 알파 채널 존재
   - 파일 크기 20 MiB 이하
   - 8열×9행, 셀 `192×208`
   - 상태별 사용 프레임 수 `6,8,8,4,5,8,6,6,6`
   - 미사용 15셀 완전 투명
4. 정상·잘못된 크기·불투명 미사용 셀·누락 manifest fixture를 테스트한다.
5. `pnpm run validate:pet`을 만들고 `pnpm run check`에 포함한다.

완료 조건:

- 외부 `hatch-pet` 설치 없이 clone된 저장소만으로 pet 계약을 재검증할 수 있다.
- 실패 출력이 파일과 위반 계약을 구체적으로 가리킨다.

### 4. GitHub Actions CI 추가

1. `.github/workflows/ci.yml`을 추가한다.
2. pull request와 `main` push에서 실행한다.
3. Node 20, Corepack, 저장소에 고정한 pnpm 버전을 사용한다.
4. `pnpm install --frozen-lockfile` 후 `pnpm run check`와 `git diff --check`를 실행한다.
5. 최소 권한 `contents: read`를 선언하고 비밀값을 요구하지 않는다.
6. README에 CI badge를 추가한다.

완료 조건:

- 새 PR과 `main` push에서 CI가 자동 실행된다.
- README drift, 테스트 실패, pet 계약 위반이 CI를 실패시킨다.

### 5. README와 설치 문서 정리

README 템플릿을 SSOT로 유지하면서 다음 내용을 추가한다.

1. 공식 데스크톱 흐름
   - `Settings → Pets → Upload pet`
   - 또는 로컬 설치 후 `Refresh`
2. 직접 다운로드 링크
   - release의 `spritesheet.webp`
   - checksum
3. 지원 범위
   - custom pet은 ChatGPT 웹에 자동 동기화되지 않음
   - IDE 확장에는 pet picker와 floating overlay가 없음
   - CLI는 iTerm2 3.6+, Kitty graphics 또는 Sixel 필요
   - tmux와 Zellij에서는 terminal pet을 사용할 수 없음
4. `pnpm run install:pet`과 `--force`의 차이
5. 실제 smoke test 문서 링크

완료 조건:

- 처음 방문한 사용자가 GUI 업로드, 로컬 설치, 지원되지 않는 환경을 README만으로 구분할 수 있다.
- `pnpm run readme` 후 `pnpm run readme:check`가 통과한다.

### 6. 통합 설치 진입점

1. 기존 `pnpm run setup`의 비밀값 경계를 유지한다.
2. `--install-pet` 옵션 또는 `pnpm run setup:all` 중 하나를 추가한다.
3. pet 설치는 API 키를 읽거나 요구하지 않는다.
4. 기존 다른 pet 파일이 있으면 `--force` 없이 중단한다.
5. 설치 결과에 skill symlink, pet 경로, doctor 결과를 함께 보고한다.

완료 조건:

- 새 사용자는 한 진입점으로 스킬과 펫을 설치할 수 있다.
- 기존 `setup`과 `install:pet`의 개별 사용도 깨지지 않는다.

### 7. `v0.2.0` 릴리스

1. 모든 P0·P1 완료 후 `main`이 깨끗하고 CI가 성공했는지 확인한다.
2. `v0.2.0` annotated tag를 만든다.
3. GitHub Release에 다음을 첨부한다.
   - `spritesheet.webp`
   - `pet.json`
   - `SHA256SUMS`
4. 릴리스 노트에 설치법, 지원 환경, 알려진 제한을 적는다.
5. release asset URL이 `200 OK`인지 확인한다.

완료 조건:

- tag, package version, release 제목이 모두 `v0.2.0`으로 일치한다.
- checksum으로 다운로드한 두 자산을 검증할 수 있다.

### 8. 공개 저장소 운영 문서

- `CONTRIBUTING.md`: 변경 흐름, README SSOT, 이미지 추가 규칙, 필수 검증 명령
- `SECURITY.md`: 비밀값 금지, 취약점 비공개 제보 경로, 지원 버전
- `.github/ISSUE_TEMPLATE/bug.yml`: OS, Codex surface, 버전, provider, sanitized doctor 결과
- `.github/pull_request_template.md`: 테스트·비밀값·이미지 권리 체크리스트

완료 조건:

- issue와 PR에서 재현 정보와 권리 확인을 빠뜨리지 않도록 기본 양식이 제공된다.

## 검증 매트릭스

| 영역 | 검증 | 기대 결과 |
| --- | --- | --- |
| 저장소 | `pnpm run check` | 모든 validator와 테스트 통과 |
| 포맷 | `git diff --check` | 출력 없음 |
| 보안 | key/token 패턴 스캔 | 실제 비밀값 0건 |
| README | `pnpm run readme:check` | template과 README 일치 |
| 펫 설치 | 임시 `MESUGAKI_PET_INSTALL_DIR` 테스트 | 설치·멱등·충돌 거부·force 교체 통과 |
| 펫 atlas | `pnpm run validate:pet` | 크기·알파·셀·manifest 계약 통과 |
| 앱 | Settings/Pets와 `/pet` smoke test | 선택·표시·상태 전환 정상 |
| CLI | `/pets`, `/pets <name>`, `/pets off` | 지원 터미널에서 정상 |
| GitHub | CI, raw/release URL | CI 성공, URL `200 OK` |
| 릴리스 | SHA-256 재계산 | `SHA256SUMS`와 일치 |

## 위험과 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 라이선스 결정 지연 | 공개 재사용 조건 불명확 | 코드와 자산 결정을 분리하고 D1 완료 전 Release를 보류 |
| 실제 앱에서 상태 매핑 차이 | 잘못된 애니메이션 노출 | 앱 smoke test 결과를 기준으로 최소 행만 수정 |
| CI 이미지 라이브러리 설치 실패 | PR 검증 중단 | `sharp` 버전과 pnpm lockfile 고정, Node 20 단일 matrix로 시작 |
| README와 실제 설치 흐름 불일치 | 사용자 설치 실패 | 공식 Pets 문서 링크와 smoke test 결과를 함께 유지 |
| `main` raw URL 변경 | 재현 불가 | Release asset과 checksum을 설치 기준으로 제공 |
| 음성 provider 권리 오해 | 이용 조건 분쟁 | 자산 라이선스와 provider 책임 범위를 분리해 명시 |

## 롤백 기준

- CI가 기존 56개 테스트를 깨뜨리면 workflow merge를 보류한다.
- 통합 설치가 기존 설정을 변경하거나 비밀값 경계를 침범하면 `setup:all`을 제거하고 개별 명령을 유지한다.
- 앱 smoke test에서 차단 수준의 펫 회귀가 발견되면 `v0.2.0` tag를 만들지 않고 해당 행 수정으로 돌아간다.
- 잘못 발행한 tag나 Release는 새 수정 버전으로 교체하고 이미 공개된 tag를 강제 이동하지 않는다.

## 최종 완료 조건

- 실제 Codex 앱에서 Kurose Runa를 선택하고 주요 상태를 확인했다.
- 코드와 캐릭터·음성 자산의 사용 조건이 명확하다.
- GitHub Actions가 모든 PR과 `main` push에서 저장소·README·pet 계약을 검증한다.
- README가 공식 GUI 업로드, 로컬 설치, 지원 환경과 제한을 설명한다.
- 스킬+펫 통합 설치와 기존 개별 설치가 모두 통과한다.
- `v0.2.0` Release와 SHA-256 checksum이 공개되고 다운로드 URL이 정상이다.
