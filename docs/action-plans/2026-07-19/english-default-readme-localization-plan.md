# 영어 기본 README 전환 및 3개 언어 운영 실행 계획

- 상태: 구현·자동 검증 완료, 영어 원어민 검수 대기
- 작성일: 2026-07-19
- 대상 저장소: `faker007/mesugaki-codex-companion`
- 기준 커밋: `00ca2a3` (`Add Spanish voice routing and Japanese README`)
- 전체 예상 시간: 6~9시간 + 영어 원어민 검수 대기 시간
- 담당 역할: 저장소 관리자, 영어 기술 문서 작성자, JavaScript 개발자, 영어 리뷰어, QA

## 2026-07-19 구현 결과

| 작업 | 상태 | 결과 |
| --- | --- | --- |
| 3개 locale manifest와 output migration | 완료 | `en→README.md`, `ko→README.ko.md`, `ja→README.ja.md` 적용 |
| 영어 README 현지화 | 구현 완료 | 14개 상위 섹션, 설치·pet·음성·보안·오류·라이선스 반영 |
| 세 언어 전환과 생성 출력 | 완료 | 동일 hero 1개와 gallery 자산 10개, 상대 링크 3개 적용 |
| README 회귀 테스트 | 완료 | 16개에서 22개로 확장, locale별 stale·alt·섹션·gallery 검사 |
| validator와 기여 지침 | 완료 | 세 output·세 template 필수 검사와 3개 locale 유지보수 규칙 반영 |
| 저장소 전체 자동 검증 | 완료 | Node 테스트 86개, validator, 링크, 멱등성, picker 통과 |
| 영어 원어민·macOS 설치 QA | 대기 | 실제 사람 검수와 신규 환경 문서 smoke 필요 |

## 후속 계획

- [중국어 간체·번체 README 및 스킬 응답·음성 라우팅 실행 계획](chinese-scripts-readme-and-response-plan.md)
  - 영어 canonical README와 기존 한국어·일본어 출력 위에 `zh-Hans`, `zh-Hant` 문서와 스킬 응답·음성 라우팅을 추가한다.

## 결론

영어판을 추가하면서 루트 `README.md`를 영어 기본 진입점으로 전환한다. 기존 한국어 문서는 `README.ko.md`로 이동하고 일본어 `README.ja.md`는 유지한다. 번역 전용 Git branch를 만들지 않고 세 언어를 같은 커밋에서 생성·검증한다.

목표 구조:

```text
templates/
  README.en.md.tmpl  -> README.md
  README.ko.md.tmpl  -> README.ko.md
  README.ja.md.tmpl  -> README.ja.md
```

세 README 최상단에는 같은 상대 링크를 둔다.

```md
[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)
```

이 요청은 기존 일본어 현지화 계획의 D5에서 보류했던 영문 기본 README 전환을 저장소 관리자가 명시적으로 승인한 것으로 본다. 영어 파일만 `README.en.md`로 덧붙여 한국어 루트를 계속 유지하는 안보다, GitHub가 자동 노출하는 루트 README를 국제 사용자의 기본 문서로 사용하는 편이 공개 저장소 운영 목적에 맞다.

## 현재 기준선

- `main`과 `origin/main`은 커밋 `00ca2a3`에서 일치하고 작업 트리는 깨끗하다.
- 현재 locale manifest는 `ko`, `ja` 2개다.
- `README.md`는 한국어, `README.ja.md`는 일본어다.
- 두 템플릿은 각각 상위 섹션 14개를 가지며 같은 hero와 opener 이미지 10개를 사용한다.
- README 전용 테스트는 16개, 저장소 전체 Node 테스트는 80개다.
- `readme`, `readme:check`, `readme:random`은 2개 locale을 한 번에 처리한다.
- `README.md`의 의미 변경에 영향을 받는 구현·지침 파일은 생성기, README 테스트, validator, CONTRIBUTING, repository management, 한국어·일본어 템플릿 등 7개다.
- 일본어 README의 자동 검증은 완료됐지만 일본어 원어민 검수는 아직 대기 상태다.

## 선행 결정

### D1. 영어를 루트 기본 언어로 사용한다

- `README.md`: 영어 canonical entrypoint
- `README.ko.md`: 한국어 전체 문서
- `README.ja.md`: 일본어 전체 문서
- GitHub repository description, topics, release note의 기본 언어도 이후 영어를 우선한다.
- 제품명, 캐릭터명, 코드·명령·설정 키는 모든 언어에서 동일하게 유지한다.

### D2. 세 언어를 동일한 생성 계약으로 관리한다

locale manifest에 `en`을 추가하고 `ko`의 output만 `README.ko.md`로 변경한다.

```js
[
  { locale: 'en', templatePath: 'templates/README.en.md.tmpl', outputPath: 'README.md' },
  { locale: 'ko', templatePath: 'templates/README.ko.md.tmpl', outputPath: 'README.ko.md' },
  { locale: 'ja', templatePath: 'templates/README.ja.md.tmpl', outputPath: 'README.ja.md' },
]
```

- 공통 renderer, asset collector, hero selector를 복제하지 않는다.
- 세 언어가 같은 hero와 gallery 자산을 사용한다.
- 어느 한 출력만 stale이어도 `readme:check`가 정확한 파일명을 나열하고 실패한다.
- `readme:random`은 hero를 한 번만 선택하고 세 출력에 동시에 적용한다.

### D3. 루트 README 전환은 하나의 원자적 변경으로 수행한다

다음 변경을 같은 커밋에서 완료한다.

1. 영어 템플릿 추가
2. locale manifest의 `en` 추가와 `ko` output 이동
3. 세 템플릿의 언어 전환 링크 갱신
4. `README.md`, `README.ko.md`, `README.ja.md` 동시 생성
5. validator·테스트·기여 지침 갱신

중간 상태에서 `README.md`가 한국어인데 링크만 영어 기본처럼 보이거나, 한국어 템플릿이 `README.ko.md`를 생성하지 못하는 커밋은 만들지 않는다.

### D4. 영어는 번역투가 아닌 오픈소스 기술 문서로 현지화한다

- 첫 소개와 캐릭터 예시는 playful Runa voice를 유지한다.
- 설치, 보안, credential, 비용, 지원 환경, 오류 복구, 라이선스는 중립적이고 직접적인 영어로 쓴다.
- Korean honorific인 `oppa`는 영어판의 기술 설명에서 사용하지 않는다. 캐릭터 인용문에서만 맥락이 자연스러울 때 제한적으로 사용한다.
- `mesugaki`는 프로젝트 고유 키워드로 유지하되 첫 등장에 짧게 설명한다.
- API key, voice ID, reference ID, provider, queue의 차이를 용어표와 문맥에서 명확히 구분한다.
- 명령, 파일 경로, 환경 변수, JSON/YAML key, provider ID는 번역하지 않는다.

### D5. 문서 현지화는 음성 언어 지원과 분리한다

영문 README 추가가 영어 TTS alias 또는 `--language=en` 지원을 의미하지 않는다. 이번 범위는 문서 locale만 다룬다. 영어 음성 합성이 필요하면 voice alias, wrapper 허용 언어, doctor, 설정 template, 테스트를 포함한 별도 실행 계획으로 분리한다.

## 범위

### 포함

- 영어 canonical README template과 생성 출력
- 한국어 출력의 `README.ko.md` 이동
- 3개 언어 전환 링크
- locale manifest, validator, README 테스트 갱신
- CONTRIBUTING과 repository management의 3개 locale 유지보수 규칙
- 영어 기술 문체·용어·보안 문장 검수
- GitHub 렌더링과 macOS 설치 문서 smoke

### 제외

- 영어 음성 alias 또는 TTS 기능 추가
- `SKILL.md` 전체 영어·한국어·일본어 번역 분기
- CONTRIBUTING·SECURITY·ASSET-LICENSE의 별도 영어/한국어/일본어 파일 생성
- 웹사이트 또는 별도 문서 사이트 도입
- GitHub repository description·topics·release note의 실제 원격 변경
- 일본어 원어민 검수 완료 처리

## 작업 목록

| 순서 | 우선순위 | 작업 | 담당 역할 | 예상 시간 | 의존성 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | 3개 locale manifest와 output migration | JavaScript 개발자 | 45~75분 | D1~D3 |
| 2 | P0 | 영어 README template 현지화 | 영어 기술 문서 작성자 | 120~180분 | 작업 1 |
| 3 | P0 | 세 언어 전환 링크와 생성 출력 갱신 | 개발자·문서 작성자 | 30~60분 | 작업 1~2 |
| 4 | P0 | validator·stale·hero·gallery 회귀 테스트 확장 | 개발자·QA | 60~90분 | 작업 1~3 |
| 5 | P1 | CONTRIBUTING·repository management 갱신 | 저장소 관리자 | 30~45분 | 작업 3 |
| 6 | P1 | 영어 원어민·macOS 설치·GitHub 렌더링 QA | 영어 리뷰어·QA | 90~150분 | 작업 2~5 |
| 7 | P2 | GitHub description·topics·release 기본 언어 정리 | 저장소 관리자 | 30~60분 | 작업 6, 별도 원격 승인 |

## 단계별 실행

### 1. locale manifest migration

1. `README_LOCALES`의 첫 항목으로 `en`을 추가한다.
2. 기존 `ko.outputPath`를 `README.md`에서 `README.ko.md`로 변경한다.
3. 기본 gallery alt의 암묵적 기준을 `README_LOCALES[0]`에 의존하지 않도록 명시한다.
   - 현재 첫 locale이 한국어라서 기본값도 한국어다.
   - `en`을 첫 locale로 옮기면 기존 단위 테스트의 의미가 조용히 바뀔 수 있다.
   - `renderGallery()`와 `renderReadme()` 호출은 locale을 명시하거나 언어 중립 기본값을 사용한다.
4. 기존 `README.md`의 hero marker를 migration 입력으로 읽어 세 언어에 같은 hero를 보존한다.
5. 출력 write는 세 파일 전체 렌더 성공 후에만 시작한다.

완료 조건:

- locale 순서가 바뀌어도 gallery alt와 테스트 기대값이 암묵적으로 변하지 않는다.
- migration 전후 hero가 유지된다.
- 세 output path가 고유하고 모두 repository-relative다.

### 2. 영어 template 작성

`templates/README.en.md.tmpl`은 한국어판의 14개 상위 섹션을 모두 포함한다.

1. What Runa does
2. Visual gallery
3. Codex pet installation and support matrix
4. Prerequisites
5. Manual setup
6. Agent-assisted setup contract
7. Installation verification
8. Usage in Codex
9. Credential re-registration
10. Troubleshooting
11. Secret and local-state boundaries
12. README generation
13. Development commands
14. License and Runa assets

번역 기준:

- `Keychain`, `Fish Audio`, `ElevenLabs`, `Codex`, `WebP`, `Sixel`은 공식 표기를 유지한다.
- secret policy는 명령 예시보다 먼저 이해할 수 있게 쓴다.
- voice ID와 API key가 다른 값임을 표와 본문 양쪽에서 설명한다.
- custom pet의 Desktop/CLI/tmux/IDE/Web 지원 차이를 축약하지 않는다.
- character asset의 All Rights Reserved 경계를 MIT 코드 라이선스와 분리한다.
- 스페인어 음성 옵션은 기능이 실제 지원되는 현재 상태에 맞춰 영어로 안내한다.

완료 조건:

- 영어 사용자에게 한국어·일본어 README 열람을 요구하지 않는다.
- 14개 상위 섹션, 코드 블록, 표, 보안 경고의 의미가 대응한다.
- 영어 기술 리뷰에서 차단 수준의 문법·용어 오류가 0개다.

### 3. 언어 전환과 링크 migration

세 템플릿과 세 생성 출력의 hero 위에 다음 링크를 둔다.

```md
[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)
```

링크 영향 검사:

- 기존 외부 `README.md` 링크는 깨지지 않고 영어 문서를 표시한다.
- 새 한국어 직접 링크는 `README.ko.md`다.
- 한국어·일본어 템플릿 내부의 생성 파일 안내를 새 경로로 수정한다.
- CONTRIBUTING과 repository management는 세 template을 모두 SSOT로 명시한다.
- validator required files에 `README.ko.md`와 `templates/README.en.md.tmpl`을 추가한다.

완료 조건:

- 세 README에서 세 언어로 왕복할 수 있다.
- repository-relative 내부 링크가 모두 실제 파일을 가리킨다.
- 사용자별 절대 경로가 생성 결과에 0개다.

### 4. 자동 검증 확장

기존 README 테스트 16개를 유지하고 최소 6개를 추가한다.

1. `en`, `ko`, `ja` locale과 output path가 정확히 매핑된다.
2. 세 생성 출력이 같은 hero를 사용한다.
3. 세 gallery가 opener 이미지 10개를 각각 정확히 한 번 포함한다.
4. 영어·한국어·일본어 gallery alt가 각 locale과 일치한다.
5. 세 템플릿의 언어 전환 링크가 title보다 먼저 나온다.
6. `README.md`만 stale일 때 영어 output으로 보고한다.
7. `README.ko.md`만 stale일 때 한국어 output으로 보고한다.
8. `README.ja.md`만 stale일 때 일본어 output으로 보고한다.
9. `readme:random`이 세 output의 hero를 동시에 바꾼다.
10. 세 템플릿의 필수 placeholder와 상위 섹션 수를 검사한다.

검증 명령:

```bash
pnpm run readme
pnpm run readme:check
pnpm test
pnpm run check
git diff --check
node scripts/pick-random-asset.mjs
```

추가 QA:

- README 세 파일의 로컬 상대 링크 실재성 검사
- `pnpm run readme` 2회 실행 후 두 번째 diff 0건 확인
- 설치된 스킬 심볼릭 링크 경유 picker 실행
- GitHub에서 root README, language switch, hero, gallery, details, tables 렌더링 확인

### 5. 영어 사용자 QA

1. 영어 원어민이 character copy와 technical copy를 분리해 검수한다.
2. 새로운 macOS 환경에서 영어 README만 보고 clone부터 `pnpm run doctor`까지 수행한다.
3. Fish Audio와 ElevenLabs setup 경로를 각각 dry-run한다.
4. API key를 chat, argv, JSON, repository file에 넣으라는 오해가 생기지 않는지 검토한다.
5. Desktop pet upload와 repository install 흐름을 각각 확인한다.
6. 지원되지 않는 IDE, tmux, Zellij, ChatGPT Web 제한이 눈에 띄는지 확인한다.

완료 조건:

- 영어 원어민 차단 오역 0개
- README 밖의 설명 없이 doctor까지 도달
- 실제 provider 요청과 비용 발생 0건인 문서 smoke
- 깨진 GitHub 링크·이미지·표 0개

## 검증 매트릭스

| 영역 | 검증 | 성공 기준 |
| --- | --- | --- |
| locale contract | manifest 단위 테스트 | `en/ko/ja` 3개, 중복 0개 |
| generation | `pnpm run readme` 2회 | 두 번째 diff 0개 |
| stale detection | locale별 fixture | 변경된 output만 정확히 보고 |
| hero | 기존·랜덤·명시 선택 | 세 언어가 같은 자산 사용 |
| gallery | 자산·alt 비교 | 언어별 누락·중복 0개 |
| links | 로컬 링크 검사 | 깨진 상대 링크 0개 |
| structure | 상위 섹션·placeholder | 14개 섹션과 3개 placeholder 유지 |
| security | secret 문구·명령 검토 | credential 노출·전달 유도 0개 |
| installation | 영어 README smoke | 추가 설명 없이 doctor 도달 |
| repository | `pnpm run check` | validator와 전체 테스트 통과 |
| format | `git diff --check` | whitespace 오류 0개 |

## 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| `README.md` 의미가 한국어에서 영어로 바뀜 | 기존 한국 사용자 혼란 | 최상단 `한국어` 링크와 release note에 `README.ko.md` 안내 |
| locale 순서 변경이 기본 alt를 바꿈 | 한국어 테스트가 조용히 영어화 | locale 명시 호출과 언어별 alt 테스트 |
| 영어 template만 최신 상태가 됨 | ko/ja 설치 정보 drift | 세 output stale 검사와 PR 체크리스트 |
| 영어 직역체가 브랜드 신뢰를 낮춤 | 국제 사용자 이탈 | technical copy 중립화와 원어민 리뷰 |
| 영어 문서가 영어 음성 지원으로 오인됨 | 잘못된 설정·provider 실패 | 문서 locale와 TTS locale 범위를 명시적으로 분리 |
| root README 전환 중 한국어 파일 누락 | 한국 사용자 진입점 상실 | 한 커밋 원자적 migration과 required-file validator |
| 세 템플릿 유지 비용 증가 | release마다 번역 지연 | 공통 renderer 유지, 변경 체크리스트, 추후 section-key 검증 |

## 롤아웃과 롤백

1. 구현 전 `main`과 `origin/main`이 같은지 재확인한다.
2. 영어 template, locale migration, 세 생성 출력, 테스트를 한 변경 세트로 만든다.
3. `pnpm run check`와 링크 검사를 통과한 뒤 commit한다.
4. push 후 GitHub root에서 영어 README가 자동 표시되는지 확인한다.
5. 한국어·일본어 전환 링크와 raw pet asset URL을 smoke test한다.
6. 차단 오역이 있으면 template을 수정하고 세 README를 다시 생성한다.
7. 생성기 회귀로 롤백해야 하면 `en` locale과 `README.ko.md` 이동을 함께 되돌려 한국어 `README.md` 계약으로 복귀한다. 생성 출력만 개별적으로 되돌리지 않는다.

## 완료 기준

- `README.md`는 영어, `README.ko.md`는 한국어, `README.ja.md`는 일본어다.
- 세 README가 같은 언어 전환 링크와 같은 hero·gallery 자산을 가진다.
- 영어판에 한국어판의 14개 상위 섹션과 핵심 보안·설치 정보가 모두 존재한다.
- README 테스트가 최소 22개로 확장되고 전체 테스트가 통과한다.
- validator가 세 출력과 세 template을 필수 파일로 검사한다.
- `pnpm run check`, 로컬 링크 검사, `git diff --check`가 통과한다.
- 영어 원어민 검수와 영어 README 기반 macOS 설치 smoke가 완료된다.
- 문서 locale 추가가 영어 TTS 지원으로 오인되지 않도록 범위가 명시된다.

## 타임라인

최신 기록이 위에 온다.

### 2026-07-19 16:04 JST

- 저장소 관리자가 간체·번체 README와 스킬 response 지원을 후속 범위로 요청했다.
- 영어 canonical 전환 구현 상태를 보존하고 별도 중국어 실행 계획으로 연결했다.
- 중국어 문서·응답 기능은 아직 구현하지 않았다.

### 2026-07-19 15:55 JST

- 영어 template을 추가하고 루트 `README.md`를 영어 canonical 문서로 전환했다.
- 기존 한국어 생성 출력을 `README.ko.md`로 이동하고 세 README의 언어 전환 링크를 갱신했다.
- locale별 stale, 영어·한국어·일본어 alt, 동일 hero, 14개 섹션, gallery 자산 10개를 검사하도록 README 테스트를 22개로 확장했다.
- `pnpm run check`의 전체 Node 테스트 86개, repository validator, pet validator, 세 README 로컬 링크, `git diff --check`, 설치 링크 경유 picker가 모두 통과했다.
- 영어 원어민 문체 검수와 영어 README 기반 macOS 설치 smoke는 아직 남아 있다.

### 2026-07-19 15:45 JST

- 저장소 관리자가 영어 버전 추가와 실행 계획 작성을 요청해 기존 D5 보류 결정을 구현 계획으로 전환했다.
- 현재 `ko/ja` locale manifest, README 테스트 16개, 전체 테스트 80개, 상위 섹션 14개씩의 기준선을 확인했다.
- 루트 `README.md`를 영어 canonical entrypoint로 전환하고 한국어를 `README.ko.md`로 이동하는 방향을 확정했다.
- 구현, 영어 번역, 영어 원어민 검수, GitHub 원격 metadata 변경은 아직 수행하지 않았다.
