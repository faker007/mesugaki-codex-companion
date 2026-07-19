# 일본 사용자용 README 현지화 및 다국어 운영 실행 계획

- 상태: 구현·자동 검증 완료, 일본어 원어민 검수 대기
- 작성일: 2026-07-19
- 대상 저장소: `faker007/mesugaki-codex-companion`
- 전체 예상 시간: 7~11시간 + 일본어 원어민 검수 대기 시간
- 담당 역할: 저장소 관리자, 문서 작성자, JavaScript 개발자, 일본어 리뷰어, QA

## 2026-07-19 구현 결과

| 작업 | 상태 | 결과 |
| --- | --- | --- |
| locale manifest와 파일명 migration | 완료 | `ko`, `ja`의 template·output·label·gallery alt 계약 추가 |
| 다국어 README 생성기 | 완료 | 한 hero와 10개 gallery 자산을 두 locale에 동시 생성·검사 |
| 일본어 README 현지화 | 구현 완료 | 설치, pet, 음성, 보안, 오류 복구, 라이선스 전체 섹션 반영 |
| 생성·드리프트 테스트 | 완료 | README 테스트 4개에서 16개로 확장 |
| 저장소 validator | 완료 | 일본어 README와 두 locale template을 필수 파일로 검사 |
| 번역 기여 규칙 | 완료 | CONTRIBUTING과 repository management 지침 갱신 |
| 일본어 원어민·macOS 설치 QA | 대기 | 자동 검증 후 별도 사람 검수 필요 |

## 결론

일본어 문서는 Git 브랜치로 분리하지 않는다. `main`의 같은 커밋 안에서 `README.md`와 `README.ja.md`를 함께 관리하고, 두 파일 최상단에 상대 경로 언어 전환 링크를 둔다.

현재 단계에서는 기존 한국어 진입점인 `README.md`를 유지한다. 일본 사용자용 `README.ja.md`를 추가한 뒤 실제 해외 유입과 기여 수요가 확인되면, 별도 P2 결정으로 `README.md`를 짧은 영문 기본 문서로 전환하고 한국어를 `README.ko.md`로 옮긴다. 일본어 추가와 영문 기본 문서 전환을 한 번에 진행하지 않아 번역 원본과 사용자 진입점이 동시에 흔들리는 일을 피한다.

권장 1차 언어 전환 영역:

```md
[한국어](README.md) | [日本語](README.ja.md)
```

## 운영 근거

- GitHub는 README를 저장소 방문자가 가장 먼저 보는 항목 중 하나로 설명하며, 설치·사용·기여 방법을 전달하는 진입점으로 권장한다.
  - [GitHub Docs: About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- GitHub의 상대 링크는 현재 브랜치에 맞춰 자동 변환되므로 clone, fork, branch에서도 같은 저장소 안의 번역 README를 안정적으로 연결한다.
  - [GitHub Docs: Relative links](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#relative-links)
- LocalSend는 기본 README 상단에서 일본어를 포함한 다수 언어 파일로 전환하고, Ant Design도 README 상단의 언어 링크로 영문·중문을 연결한다. 둘 다 번역 전용 Git 브랜치 대신 같은 저장소의 문서 링크를 사용한다.
  - [LocalSend repository](https://github.com/localsend/localsend)
  - [Ant Design repository](https://github.com/ant-design/ant-design)

## 현재 기준선

- `scripts/generate-readme.mjs`는 `templates/README.md.tmpl` 하나만 읽어 `README.md` 하나를 생성한다.
- `pnpm run readme`, `readme:check`, `readme:random`은 모두 단일 README를 전제로 한다.
- `renderGallery()`의 이미지 대체 텍스트가 한국어로 고정되어 있다.
- `scripts/readme.test.mjs`에는 상대 이미지 경로, 전체 이미지 1회 노출, 랜덤 hero 변경, 잘못된 이미지 거부를 다루는 테스트 4개가 있다.
- `scripts/validate-repo.mjs`는 `README.md`와 `templates/README.md.tmpl`만 필수 파일로 검사한다.
- README는 생성 파일이므로 직접 수정하지 않고 템플릿과 생성기를 SSOT로 유지해야 한다.
- 작업 시작 시 저장소에는 스페인어 음성 옵션과 관련된 기존 미커밋 변경 8개가 있다. 이 계획의 구현은 해당 변경을 덮어쓰거나 되돌리지 않는다.

## 선행 결정

### D1. 언어는 파일로 분기한다

- 1차: `README.md`는 한국어, `README.ja.md`는 일본어다.
- 번역 전용 branch, orphan branch, submodule은 사용하지 않는다.
- 코드 변경과 문서 변경을 한 PR에서 원자적으로 검토할 수 있어야 한다.

### D2. 생성기가 모든 언어 출력을 소유한다

1차 구현에서 아래 구조로 명시적인 locale 이름을 사용한다.

```text
templates/
  README.ko.md.tmpl
  README.ja.md.tmpl
README.md
README.ja.md
```

기존 `templates/README.md.tmpl`은 `README.ko.md.tmpl`로 이동하고, 생성기 내부의 locale manifest가 템플릿·출력·언어명·대체 텍스트를 연결한다. 단일 언어 전용 함수를 복사하지 않고 같은 renderer를 두 locale이 공유한다.

### D3. hero와 gallery 자산은 언어 간 동일하게 유지한다

- `readme:random`은 hero를 한 번만 선택하고 한국어·일본어 README에 동일한 자산을 기록한다.
- 모든 opener 이미지는 두 README에서 각각 정확히 한 번씩 노출한다.
- 파일명, 명령어, 환경 변수, JSON 키, provider ID, voice ID는 번역하지 않는다.
- 이미지 `alt`와 설명 문장만 locale에 맞게 생성한다.

### D4. 일본어는 직역이 아니라 기술 현지화한다

- 캐릭터 소개와 예시 대화에는 브랜드의 장난스러운 말투를 유지한다.
- 설치, 보안, 비용, 지원 환경, 오류 복구 문장은 중립적이고 정확한 일본어로 쓴다.
- macOS Keychain, API 키 보관, Fish Audio·ElevenLabs 계정 책임, custom pet 지원 한계를 생략하지 않는다.
- 자연스러움 검수와 명령 재현성 검수를 분리한다.

### D5. 영문 기본 README 전환은 별도 의사결정이다

다음 중 2개 이상을 충족할 때 P2로 검토한다.

- 비한국어권 issue 또는 PR이 월 3건 이상 2개월 지속된다.
- GitHub traffic 또는 사용자 피드백에서 영어 진입점 요구가 반복된다.
- 영문 문서를 유지할 담당자 또는 리뷰 SLA를 확보한다.
- release마다 한국어·일본어·영어 동기화를 검사하는 자동화가 준비된다.

전환 시 목표 구조는 `README.md` 영문 기본, `README.ko.md`, `README.ja.md`다. 기존 한국어 링크를 깨지 않도록 이동 PR에서 링크·badge·raw URL을 전수 검사한다.

## 작업 목록

| 순서 | 우선순위 | 작업 | 담당 역할 | 예상 시간 | 의존성 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | locale manifest와 파일명 migration 설계 | 개발자·저장소 관리자 | 45~75분 | D1~D3 |
| 2 | P0 | 다국어 README 생성기와 템플릿 구조 구현 | JavaScript 개발자 | 90~150분 | 작업 1 |
| 3 | P0 | 일본어 README 현지화 | 문서 작성자 | 120~180분 | 작업 2 |
| 4 | P0 | 생성·검증·드리프트 방지 테스트 확장 | 개발자·QA | 60~90분 | 작업 2~3 |
| 5 | P1 | 일본어 원어민·macOS 설치 QA | 일본어 리뷰어·QA | 90~150분 | 작업 3~4 |
| 6 | P1 | 번역 기여 규칙과 PR 체크리스트 추가 | 저장소 관리자 | 45~75분 | 작업 4 |
| 7 | P2 | 영문 기본 README 전환 여부 재평가 | 저장소 관리자 | 60~120분 | D5 지표 |

## 단계별 실행

### 1. locale manifest와 migration

1. 생성기 안에 `ko`, `ja` locale 정의를 둔다.
2. 각 정의는 `templatePath`, `outputPath`, `languageLabel`, `galleryAlt`를 가진다.
3. `templates/README.md.tmpl`을 `templates/README.ko.md.tmpl`로 이동한다.
4. 생성 파일의 첫 줄에 locale별 생성 경고와 수정 대상 템플릿을 명시한다.
5. `scripts/validate-repo.mjs`의 필수 파일 목록을 두 템플릿과 두 출력으로 갱신한다.

완료 조건:

- 새 locale 추가에 renderer 복제가 필요 없다.
- 기존 한국어 README 내용과 이미지 선택은 migration 전후에 의도하지 않게 변하지 않는다.

### 2. 다국어 생성기 구현

1. 모든 locale 템플릿을 병렬로 읽고 렌더링한다.
2. 기존 `README.md`에서 hero를 읽되, 없으면 다른 locale 출력에서도 찾을 수 있게 한다.
3. `--random`과 `--image`는 locale 수와 무관하게 hero를 한 번만 선택한다.
4. `--check`는 stale 출력 파일을 모두 나열하고 하나라도 다르면 실패한다.
5. JSON 결과에 locale별 output과 공통 hero, asset count를 포함한다.
6. `pnpm run readme`, `readme:check`, `readme:random`의 사용자 인터페이스는 유지한다.

완료 조건:

- 한 명령으로 두 README가 함께 생성된다.
- 한 언어만 오래된 상태를 `readme:check`가 놓치지 않는다.

### 3. 일본어 현지화

한국어 템플릿의 섹션을 빠짐없이 일본어 템플릿으로 옮기되 다음 기준을 적용한다.

| 원문 개념 | 일본어 권장 표기 | 비고 |
| --- | --- | --- |
| 음성 합성 | 音声合成 | 첫 등장 이후에도 동일 표기 |
| 프로바이더 | プロバイダー | provider ID 값은 원문 유지 |
| API 키 | APIキー | 보관·비용 경고는 중립 문체 |
| macOS 키체인 | macOSキーチェーン | 제품 고유명 유지 |
| 음성 ID | voice ID | config 키와 혼동 방지 |
| 전역 음성 큐 | グローバル音声キュー | 비동기·직렬 처리 의미 설명 |
| 재생 | 再生 | replay와 playback 맥락 구분 |
| dry-run | `dry-run` | 명령·옵션은 번역 금지 |

추가 규칙:

- 언어 전환 링크를 hero 이미지보다 위에 둔다.
- 일본어 문장부호와 전각·반각 공백을 일관되게 쓴다.
- 코드 블록, 경로, 옵션, 환경 변수는 한국어판과 byte 단위로 비교 가능한 원문을 유지한다.
- 한국어 특유의 호칭과 조롱을 기계적으로 옮기지 말고 일본어 화자가 이해할 자연스러운 캐릭터 대사로 재작성한다.
- 보안·결제·지원 범위에는 캐릭터 말투를 사용하지 않는다.

완료 조건:

- 한국어판의 설치·설정·사용·보안·라이선스·기여 정보가 일본어판에 모두 존재한다.
- 일본어 독자가 한국어판을 열지 않고 설치와 doctor 실행까지 진행할 수 있다.

### 4. 자동 검증 확장

기존 README 테스트 4개를 유지하고 최소 7개를 추가한다.

1. locale manifest가 중복 output path를 거부한다.
2. 두 README가 같은 hero를 사용한다.
3. 두 gallery가 모든 자산을 각각 정확히 한 번 렌더링한다.
4. locale별 `alt`가 올바른 언어로 생성된다.
5. 두 README 최상단 언어 전환 링크가 실제 파일을 가리킨다.
6. `--check`가 한국어 stale만 탐지한다.
7. `--check`가 일본어 stale만 탐지한다.
8. 알 수 없는 locale 또는 누락 템플릿을 구체적인 파일명과 함께 거부한다.
9. 랜덤 hero 변경 후 두 출력의 hero가 동시에 바뀐다.
10. 생성 결과에 사용자별 macOS 절대 경로가 들어가지 않는다.

검증 명령:

```bash
pnpm run readme
pnpm run readme:check
pnpm test
pnpm run check
git diff --check
```

완료 조건:

- `pnpm run check`가 API 키 없이 통과한다.
- README 생성 후 두 번째 생성에서 Git diff가 발생하지 않는다.

### 5. 일본어 사용자 QA

1. 일본어 원어민 리뷰어가 제목, 도입부, 설치, 오류 복구, 라이선스 문장을 구분해 검수한다.
2. 일본어 macOS 환경에서 clone부터 `pnpm run doctor`까지 README만 보고 수행한다.
3. README의 모든 상대 링크, 목차 anchor, 이미지, badge를 GitHub 렌더링에서 클릭한다.
4. Fish Audio와 ElevenLabs 경로를 각각 dry-run하고 일본어 안내가 provider 설정을 혼동시키지 않는지 확인한다.
5. 작은 화면에서도 최상단 언어 링크와 hero가 읽기 가능한지 확인한다.

완료 조건:

- 차단 수준의 오역과 깨진 링크가 0개다.
- 설치 QA에서 문서 밖의 구두 설명 없이 doctor까지 도달한다.
- 리뷰어 수정은 템플릿에 반영되고 생성 README 직접 수정은 0건이다.

### 6. 기여 규칙 정리

`CONTRIBUTING.md`에 다음을 추가한다.

- README 수정은 모든 locale 템플릿의 관련 섹션을 함께 검토한다.
- 번역을 즉시 제공하지 못하면 PR 본문에 미동기화 locale과 후속 issue를 명시한다.
- 명령, 옵션, 경로, 환경 변수, 보안 경고는 번역 과정에서 삭제하거나 의미를 바꾸지 않는다.
- 생성 README가 아니라 `templates/README.<locale>.md.tmpl`을 수정한다.
- PR 체크리스트에서 `pnpm run readme:check`와 원어민 검수 여부를 확인한다.

초기에는 자동 번역 플랫폼을 도입하지 않는다. README 2개 규모에서 먼저 파일·리뷰·CI 계약을 안정화한 뒤, locale이 4개 이상이거나 번역 PR이 월 5건 이상이면 Weblate 같은 별도 번역 흐름을 재평가한다.

## 검증 매트릭스

| 영역 | 검증 | 성공 기준 |
| --- | --- | --- |
| 생성 | `pnpm run readme` 2회 | 두 번째 실행 diff 0개 |
| stale 감지 | locale별 fixture | 어느 한 출력만 달라도 실패 |
| hero | 고정·랜덤·명시 선택 | 두 언어가 같은 파일 사용 |
| gallery | 자산 수 비교 | locale마다 누락·중복 0개 |
| 링크 | 상대 링크 검사 | 깨진 내부 링크 0개 |
| 문체 | 원어민 리뷰 | 캐릭터/기술 문체 경계 준수 |
| 설치 | 일본어 README 기반 smoke | doctor까지 추가 설명 없이 완료 |
| 저장소 | `pnpm run check` | 전체 테스트·validator 통과 |
| 포맷 | `git diff --check` | whitespace 오류 0개 |

## 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| 한국어만 수정되어 번역이 오래됨 | 일본 사용자에게 잘못된 설치법 제공 | 모든 locale을 검사하는 생성기와 PR 체크리스트 |
| 두 템플릿의 구조가 장기간 갈라짐 | 누락 섹션이 조용히 누적 | locale 공통 section marker 또는 manifest 기반 구조 검증 |
| 직역된 조롱 표현이 부자연스럽거나 공격적임 | 일본 사용자 이탈 | 캐릭터 소개에만 현지화된 말투 사용, 기술 문장은 중립화 |
| README 기본 언어를 동시에 변경함 | 기존 사용자와 링크가 함께 깨짐 | 일본어 추가와 영문 전환을 별도 단계로 분리 |
| 언어별 hero가 달라짐 | release 설명과 스크린샷 불일치 | hero 한 번 선택 후 모든 locale에 공유 |
| 생성 파일을 직접 고침 | 다음 생성에서 번역 소실 | locale별 생성 경고, validator, CONTRIBUTING 안내 |

## 롤아웃과 롤백

1. 첫 PR은 생성기·템플릿·테스트·일본어 README를 함께 포함한다.
2. PR 본문에 한국어/일본어 렌더링 링크와 `pnpm run check` 결과를 첨부한다.
3. merge 후 GitHub에서 언어 링크와 이미지 렌더링을 smoke test한다.
4. 치명적 오역이 발견되면 일본어 링크만 임시 제거하지 말고, `README.ja.md`와 템플릿을 같은 수정 PR에서 고친다.
5. 생성기 회귀가 발생하면 locale manifest 변경을 되돌리고 기존 한국어 단일 생성 경로로 복귀할 수 있게 migration 커밋을 분리한다.

## 완료 기준

- `README.md`와 `README.ja.md`가 상단 상대 링크로 서로 연결된다.
- 두 README는 locale별 템플릿에서 자동 생성된다.
- hero와 gallery 자산이 두 언어에서 일치한다.
- 기존 4개 테스트와 신규 최소 7개 테스트가 통과한다.
- `pnpm run check`와 `git diff --check`가 통과한다.
- 일본어 원어민 검수와 README 기반 macOS 설치 smoke가 완료된다.
- CONTRIBUTING에 번역 갱신 규칙과 검증 명령이 기록된다.
- 영문 기본 README 전환은 D5 지표가 충족되기 전까지 별도 보류 상태로 남는다.

## 타임라인

최신 기록이 위에 온다.

### 2026-07-19 13:02 JST

- `README.md`와 `README.ja.md`를 같은 hero와 gallery로 생성하는 locale manifest 기반 생성기를 구현했다.
- 한국어 템플릿을 `README.ko.md.tmpl`로 명시화하고 일본어 템플릿과 상단 언어 전환 링크를 추가했다.
- locale 중복, 필수 필드, 언어별 alt, hero 일치, locale별 stale 탐지, 실제 템플릿·출력 링크를 자동 검사하도록 README 테스트를 16개로 확장했다.
- validator와 기여 지침을 다국어 SSOT에 맞춰 갱신했다.
- `pnpm run check`의 전체 Node 테스트 80개, repository validator, pet validator, 두 README의 로컬 링크 검사, `git diff --check`가 모두 통과했다.
- 일본어 원어민 문체 검수와 일본어 사용자 기반 macOS 설치 smoke는 아직 남아 있다.

### 2026-07-19 12:48 JST

- 단일 `README.md`·단일 템플릿 생성 구조와 기존 테스트 4개를 확인했다.
- 번역 전용 Git 브랜치 대신 같은 커밋의 `README.ja.md`를 사용하는 방향을 확정했다.
- GitHub 공식 README·상대 링크 문서와 LocalSend·Ant Design의 다국어 README 사례를 운영 근거로 반영했다.
- 구현, 일본어 번역, 원어민 검수, release 반영은 아직 수행하지 않았다.
