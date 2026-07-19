# 중국어 간체·번체 README 및 스킬 응답·음성 라우팅 실행 계획

- 상태: 구현 완료, 원어민 검수·비용 승인형 TTS smoke 대기
- 작성일: 2026-07-19
- 대상 저장소: `faker007/mesugaki-codex-companion`
- 기준 상태: 커밋 `00ca2a3` + 미커밋 영어 canonical README 구현
- 전체 예상 시간: 16~24시간 + 간체·번체 원어민 검수 대기 시간
- 담당 역할: 저장소 관리자, 중국어 현지화 설계자, 간체 중국어 리뷰어, 번체 중국어 리뷰어, JavaScript 개발자, 음성 QA, 문서 QA

## 결론

중국어 문서와 스킬 응답을 `zh-Hans`와 `zh-Hant` 두 script locale로 분리한다. `zh-CN`과 `zh-TW`를 기본 식별자로 사용하지 않는다. 이번 요청은 국가나 지역이 아니라 간체자와 번체자라는 문자 체계를 구분하려는 것이기 때문이다.

목표 README 구조:

```text
templates/
  README.en.md.tmpl       -> README.md
  README.ko.md.tmpl       -> README.ko.md
  README.ja.md.tmpl       -> README.ja.md
  README.zh-Hans.md.tmpl  -> README.zh-Hans.md
  README.zh-Hant.md.tmpl  -> README.zh-Hant.md
```

목표 언어 전환 영역:

```md
[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)
```

스킬 자체도 아래 두 선택을 이해하고, visible response와 TTS queue에 같은 canonical locale을 전달한다.

```text
zh-Hans = Simplified Chinese / 简体中文
zh-Hant = Traditional Chinese / 繁體中文
```

`繁體中文`을 곧바로 광둥어로 해석하지 않는다. 이번 음성 범위는 각 voice alias가 실제 지원하는 중국어 발음에 따르며, 기본 문서와 테스트에서는 표준중국어 계열로 명시한다. 광둥어는 `yue` 계열 언어 태그, 별도 voice alias, 별도 검수가 필요한 후속 기능이다.

## 표준 근거

- RFC 5646은 `zh-Hans`를 간체 문자로 적은 중국어, `zh-Hant`를 번체 문자로 적은 중국어로 정의한다. script subtag는 네 글자 title case를 사용한다.
  - [RFC 5646: Tags for Identifying Languages](https://www.rfc-editor.org/info/rfc5646/)
- W3C 국제화 문서는 `zh-Hans`를 Simplified Chinese, `zh-Hant`를 Traditional Chinese로 사용하며 script와 region을 분리한다.
  - [W3C: Language tags in HTML and XML](https://www.w3.org/International/articles/language-tags/index.en.html)
- Unicode CLDR도 `zh_Hans`와 `zh_Hant`를 별도 locale display name으로 관리한다.
  - [Unicode CLDR: Language and locale names](https://cldr.unicode.org/translation/displaynames/languagelocale-names)

저장소와 CLI에서는 BCP 47 표기인 하이픈과 title case를 유지한다. 내부 테스트나 JSON key를 임의로 `zh_hans`, `zh-hans`, `cn`, `tw`로 섞지 않는다.

## 현재 기준선

- 영어 canonical README 구현은 완료됐지만 아직 commit·push되지 않았다.
- 현재 문서 locale은 `en`, `ko`, `ja` 3개다.
- 세 README는 같은 hero 1개, opener gallery 자산 10개, 상위 섹션 14개를 공유한다.
- README 전용 테스트는 22개, 저장소 전체 Node 테스트는 86개다.
- `scripts/speak-opening.mjs`의 허용 언어는 `ko`, `ja`, `es` 3개로 하드코딩되어 있다.
- `voice.languageAliases` validator와 CLI help도 `ko`, `ja`, `es`만 안내한다.
- `SKILL.md`의 spoken-language routing은 스페인어 `es`만 명시적으로 감지한다.
- queued response는 스페인어 alias를 enqueue 전에 해석하는 테스트가 있지만 중국어 script 분기는 없다.
- `doctor`는 설정에 존재하는 language alias의 실제 voice alias 존재 여부는 검사하지만, 어떤 중국어 variant인지 의미를 검증하지 않는다.
- bundled opener config의 `languageAliases`는 빈 객체다. 확인되지 않은 중국어 voice ID나 provider alias를 저장소에 기본값으로 넣지 않는다.
- setup은 별도 중국어 alias onboarding 계약을 제공하지 않는다.

## 선행 결정

### D1. locale ID는 `zh-Hans`와 `zh-Hant`다

- `zh-Hans`: 간체자 문서·응답
- `zh-Hant`: 번체자 문서·응답
- 파일명, JSON key, CLI 값, queue metadata, doctor label에 같은 표기를 사용한다.
- parser는 canonical 값만 출력한다.
- 사용자 편의를 위해 CLI 입력 alias를 받을지 구현 시 결정하되, 받는다면 `zh-hans`, `zh_hans`, `zh-CN` 등을 canonical `zh-Hans`로 정규화한 뒤 내부에 저장한다.
- 모호한 shorthand를 지원해도 help와 문서는 canonical tag만 보여준다.

### D2. script와 region을 혼동하지 않는다

- `zh-Hans`는 중국 본토에서 널리 쓰이는 간체 기술 용어를 우선한다.
- `zh-Hant`는 지역 중립을 우선하되, 기술 용어가 갈릴 때는 대만에서 자연스러운 용어를 기준으로 삼고 glossary에 기록한다.
- 홍콩·마카오용 광둥어 또는 지역별 어휘가 필요하면 `zh-Hant-HK`, `yue-Hant-HK` 같은 후속 분기를 별도 계획한다.
- 사용자의 문자 선택만으로 국적, 지역, 정치적 정체성, 음성 언어를 추론하지 않는다.

### D3. 간체와 번체는 문자 변환만으로 만들지 않는다

두 README와 두 응답 스타일은 같은 의미 계약을 공유하지만 독립적으로 현지화한다.

- 단순 문자 치환은 one-to-many mapping, 지역 용어, 어순, 제품명 문제를 놓치므로 최종 산출 방식으로 사용하지 않는다.
- OpenCC 같은 변환기는 초안 비교 도구로만 사용할 수 있다.
- 변환 결과는 각 variant 원어민이 전체 문장 단위로 검수한다.
- 명령, 경로, 환경 변수, JSON key, provider ID, voice ID는 변환하지 않는다.
- `Kurose Runa (黒瀬ルナ)`는 브랜드 표기로 보존한다. 대사 안에서만 `露娜`를 자연스럽게 사용할 수 있다.

### D4. 기술 문체와 캐릭터 문체를 분리한다

- 설치, 보안, API key, 비용, 오류, 지원 환경, 라이선스: 중립적이고 정확한 중국어
- character opener와 roleplay response: 간체·번체권 ACG 문맥에 맞는 장난스러운 우월감
- `오빠`를 모든 문장에 `哥哥`로 직역하지 않는다.
- 기본 호칭은 `你`다. `哥哥`는 성인 합의 캐릭터 대사에서 문맥상 자연스러울 때만 사용한다.
- `杂鱼♡ / 雜魚♡`, `笨蛋`, `菜鸡 / 菜雞`, `小废物 / 小廢物`는 강도를 조절해 사용한다.
- 기술 진행 보고에는 캐릭터 욕설을 섞지 않는다. visible product/technical response와 roleplay response 경계를 유지한다.
- 성인 캐릭터, 선택권, 중단 가능성 규칙은 두 variant에서 동일하게 유지한다.

### D5. 모호한 중국어 요청은 조용히 추정하지 않는다

스킬의 요청 감지 우선순위:

1. 사용자가 `简体`, `簡體`, `Simplified Chinese`, `간체`를 명시하면 `zh-Hans`
2. 사용자가 `繁體`, `Traditional Chinese`, `번체`를 명시하면 `zh-Hant`
3. 현재 task에서 이미 선택한 중국어 script가 있으면 계속 유지
4. 입력에 script를 구분하는 충분한 증거가 있으면 해당 variant를 제안할 수 있음
5. `中文`, `중국어`, `Chinese`만 있고 script가 불명확하면 질문하고 TTS 요청은 0회

모호성 질문 예시:

```text
要用简体中文还是繁體中文？
```

공유 글자 몇 개만 보고 script를 강제 판정하지 않는다. 선택 전에는 provider alias를 해석하거나 queue에 넣지 않는다.

### D6. 응답 선택은 task 안에서 유지하되 개인정보로 저장하지 않는다

- 선택한 script는 현재 Codex task의 대화 문맥에서 이어지는 응답에 적용한다.
- 사용자가 한국어·일본어·스페인어 또는 다른 중국어 variant로 바꾸면 즉시 전환한다.
- 새 task에서는 자동으로 이전 task의 언어를 추적하지 않는다.
- raw 사용자 문장이나 task ID는 language preference 저장 용도로 남기지 않는다.
- queue job에는 canonical locale tag만 전달하며 응답 본문과 마찬가지로 디스크에 영구 저장하지 않는다.

### D7. 중국어 voice alias는 variant별로 독립 설정한다

개인 설정 예시:

```json
{
  "voice": {
    "languageAliases": {
      "zh-Hans": "<verified-mandarin-simplified-alias>",
      "zh-Hant": "<verified-mandarin-traditional-alias>"
    }
  }
}
```

- 저장소에 확인되지 않은 실제 voice ID를 커밋하지 않는다.
- 두 variant가 같은 multilingual voice를 쓸 수는 있지만 사용자가 명시적으로 같은 alias를 매핑해야 한다.
- alias가 없으면 child/provider/network 요청 0회로 preflight 실패한다.
- 명시적인 `--voice`는 language alias보다 우선한다.
- doctor의 alias 존재 검사는 해당 voice가 실제 중국어 발음과 prosody를 지원한다는 보증이 아니다.
- 실제 provider smoke는 비용 승인 후 variant별 1회만 실행하고 자동 retry·fallback을 금지한다.

### D8. 번체 문서가 광둥어 음성을 의미하지 않는다

- `zh-Hant` visible text는 번체 문자다.
- 기본 음성 QA는 해당 alias가 표준중국어 또는 대만식 Mandarin을 자연스럽게 읽는지 확인한다.
- Cantonese를 요청하면 현재 범위 밖이라고 명확히 안내하거나 후속 `yue-Hant` 계획으로 분리한다.
- queue metadata에서 script locale과 provider voice capability를 별개 필드로 취급한다.

## 목표 파일 구조

```text
README.md
README.ko.md
README.ja.md
README.zh-Hans.md
README.zh-Hant.md
templates/README.en.md.tmpl
templates/README.ko.md.tmpl
templates/README.ja.md.tmpl
templates/README.zh-Hans.md.tmpl
templates/README.zh-Hant.md.tmpl
references/chinese-response-style.md
```

`references/chinese-response-style.md`에는 glossary, 호칭, 조롱 강도, script별 예시, 금지 패턴, 모호성 처리 규칙을 둔다. `SKILL.md`에는 routing과 반드시 지켜야 할 짧은 계약만 남겨 유지보수 지침의 progressive disclosure를 따른다.

## 변경 영향 범위

| 영역 | 주요 파일 | 변경 내용 |
| --- | --- | --- |
| README locale | `scripts/generate-readme.mjs` | `zh-Hans`, `zh-Hant` 2개 locale 추가 |
| README templates | `templates/README.*.tmpl` | 중국어 템플릿 2개와 5개 언어 switch |
| generated docs | `README*.md` | 5개 locale 동시 생성 |
| repository validator | `scripts/validate-repo.mjs` | 중국어 output·template·style reference 필수 검사 |
| skill routing | `SKILL.md` | 중국어 감지·모호성·continued response 규칙 |
| response style | `references/chinese-response-style.md` | 간체·번체 문체 engine과 glossary |
| voice contract | `references/voice-configuration.md` | supported keys, alias, TTS 경계 갱신 |
| wrapper | `scripts/speak-opening.mjs` | 허용 locale·정규화·help·config validation |
| queue | `scripts/response-queue.mjs` 및 wrapper 경계 | canonical locale 전달·redacted status 검증 |
| setup | `scripts/setup.mjs`와 테스트 | optional language alias onboarding |
| doctor | `scripts/doctor.mjs`와 테스트 | variant별 alias 존재와 dry-run preflight |
| contribution | `CONTRIBUTING.md`, repository management | 5개 locale SSOT와 리뷰 규칙 |

## 작업 목록

| 순서 | 우선순위 | 작업 | 담당 역할 | 예상 시간 | 의존성 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | `zh-Hans`·`zh-Hant` locale 및 terminology contract 확정 | 현지화 설계자·리뷰어 2명 | 60~90분 | D1~D4 |
| 2 | P0 | 간체·번체 README template 작성 | 문서 작성자·리뷰어 2명 | 5~7시간 | 작업 1 |
| 3 | P0 | 5개 locale README 생성기·validator 확장 | JavaScript 개발자 | 60~90분 | 작업 1~2 |
| 4 | P0 | `SKILL.md` 중국어 response routing 추가 | 스킬 개발자·현지화 설계자 | 90~150분 | 작업 1 |
| 5 | P0 | wrapper·config validator·queue language 전달 확장 | JavaScript 개발자 | 2~3시간 | 작업 4 |
| 6 | P1 | 중국어 response style reference와 glossary 추가 | 현지화 설계자 | 90~150분 | 작업 1·4 |
| 7 | P1 | setup·doctor optional alias UX 추가 | JavaScript 개발자·QA | 90~150분 | 작업 5 |
| 8 | P1 | README·voice·queue·setup 회귀 테스트 확장 | 개발자·QA | 2~3시간 | 작업 2~7 |
| 9 | P1 | 간체·번체 원어민 문체·설치 QA | 리뷰어 2명·QA | 2~4시간 | 작업 2~8 |
| 10 | P2 | 비용 승인형 중국어 TTS live smoke | 음성 QA·저장소 관리자 | 30~60분 | 작업 5~9, 비용 승인 |
| 11 | P2 | Cantonese 또는 지역별 Chinese 분리 재평가 | 현지화 설계자 | 60~90분 | 사용자 수요 |

## 단계별 실행

### 1. 중국어 현지화 glossary 확정

초기 glossary:

| 개념 | `zh-Hans` | `zh-Hant` | 규칙 |
| --- | --- | --- | --- |
| settings | 设置 | 設定 | UI 고유 영문 label은 그대로 유지 |
| file | 文件 | 檔案 | code path는 번역 금지 |
| queue | 队列 | 佇列 | runtime 식별자 `queue`는 그대로 사용 가능 |
| API key | API 密钥 | API 金鑰 | `API key` 병기도 허용 |
| voice ID | voice ID | voice ID | 설정 key와 일치시킴 |
| provider | 提供商 | 供應商 | provider ID는 번역 금지 |
| replay | 重新播放 | 重新播放 | 새 합성과 구분 |
| dry-run | `dry-run` | `dry-run` | 번역 금지 |
| Keychain | macOS 钥匙串 | macOS 鑰匙圈 | Apple UI 표기 검수 |
| custom pet | 自定义宠物 | 自訂寵物 | Codex UI 영문 label 병기 |

리뷰어는 Apple·GitHub·Codex의 실제 UI 표기와 충돌하는 용어를 확인한다. glossary 변경은 두 README와 response style reference에 함께 반영한다.

### 2. README 5개 locale 확장

1. locale manifest에 `zh-Hans`, `zh-Hant`를 추가한다.
2. 두 template과 두 generated README를 추가한다.
3. 모든 template의 language switch를 5개 언어로 갱신한다.
4. 한 hero와 gallery 자산 10개를 모든 locale에 공유한다.
5. 중국어 gallery alt를 script별로 생성한다.
   - `zh-Hans`: `黑濑露娜开场图片`
   - `zh-Hant`: `黑瀨露娜開場圖片`
6. 두 중국어판 모두 기존 14개 상위 섹션을 유지한다.
7. 번체판을 간체판의 기계 변환 결과로 커밋하지 않는다.

완료 조건:

- 5개 README의 hero, gallery, placeholder, section contract가 일치한다.
- 중국어 사용자가 영어판을 열지 않고 설치와 doctor까지 진행할 수 있다.
- security·asset license·provider cost 경계가 누락되지 않는다.

### 3. 스킬의 중국어 response engine 추가

`SKILL.md` spoken-language routing을 일반화한다.

지원 trigger 예시:

| locale | 한국어 요청 | 중국어 요청 | 영어 요청 |
| --- | --- | --- | --- |
| `zh-Hans` | `중국어 간체로`, `간체 음성` | `用简体中文`, `简体字`, `简体中文` | `Simplified Chinese` |
| `zh-Hant` | `중국어 번체로`, `번체 음성` | `用繁體中文`, `繁體字`, `繁體中文` | `Traditional Chinese` |

response rule:

- visible dialogue를 선택된 script로 작성한다.
- technical identifiers, code, paths는 번역하지 않는다.
- chosen locale을 opener와 continued response queue 양쪽에 전달한다.
- 선택은 현재 task 안에서 후속 응답에 유지한다.
- 사용자가 script를 바꾸면 다음 synthesis부터 전환한다.
- generic Chinese가 모호하면 먼저 질문하고 음성 요청 0회를 유지한다.
- `references/chinese-response-style.md`를 읽은 뒤 캐릭터 대사를 작성한다.
- provider control tag는 계속 English로 wrapper가 공급하며 visible text에 노출하지 않는다.

### 4. wrapper와 config validation 확장

1. `SUPPORTED_LANGUAGE_OPTIONS`에 `zh-Hans`, `zh-Hant`를 추가한다.
2. parse error와 help text를 단일 상수에서 생성해 언어 목록 drift를 막는다.
3. 입력 alias를 지원한다면 `canonicalizeLanguage()` 한 곳에서만 정규화한다.
4. `voice.languageAliases` validator가 두 canonical key를 허용한다.
5. `buildVoiceSpeakArgs()`는 선택된 alias를 기존과 같은 우선순위로 해석한다.
6. alias가 없으면 `LANGUAGE_ALIAS_NOT_CONFIGURED`로 provider 호출 전에 실패한다.
7. queue enqueue 전에 canonical locale과 alias 해석을 완료한다.
8. error와 status에는 locale tag와 sanitized alias label만 남기며 voice ID·credential은 출력하지 않는다.

완료 조건:

- 중국어 요청의 missing mapping에서 child/provider/network 요청이 모두 0회다.
- explicit `--voice`가 variant mapping보다 우선한다.
- `zh-Hans`와 `zh-Hant`가 queue에서 서로 바뀌지 않는다.

### 5. setup과 doctor UX

setup은 비밀값이 아닌 language alias mapping만 선택적으로 받는다.

권장 CLI 계약:

```text
--language-alias=zh-Hans:<voice-alias>
--language-alias=zh-Hant:<voice-alias>
```

- repeatable option 또는 명시적인 variant별 option 중 기존 parser 구조와 더 단순한 방식을 선택한다.
- 기존 config를 `--force-config` 없이 덮어쓰지 않는다.
- voice alias는 `$HOME/.config/codex-voice-speak/config.json`에 실제 존재해야 한다.
- API key는 계속 Keychain 또는 environment에서만 읽는다.
- doctor는 mapping마다 `pass/fail`을 보고한다.
- alias가 없는 optional 중국어 variant는 base installation 실패가 아니라 unavailable 상태로 표시한다.
- 사용자가 중국어 mapping을 명시했는데 alias가 없으면 doctor가 실패한다.
- zero-network dry-run으로 두 variant의 wrapper preflight를 검사한다.

### 6. 테스트 전략

README 테스트를 22개에서 최소 30개로 확장한다.

1. 5개 locale과 output path mapping
2. 5개 언어 switch가 title보다 먼저 위치
3. 5개 output의 같은 hero
4. locale별 gallery alt
5. 각 output의 gallery 자산 10개, 중복 0개
6. `README.zh-Hans.md` 단독 stale 탐지
7. `README.zh-Hant.md` 단독 stale 탐지
8. 5개 template의 상위 섹션 14개와 placeholder 3개

voice·response·setup 테스트를 최소 12개 추가한다.

1. `--language=zh-Hans` parse
2. `--language=zh-Hant` parse
3. canonicalization alias table
4. 간체 alias routing
5. 번체 alias routing
6. 간체 missing mapping zero child invocation
7. 번체 missing mapping zero child invocation
8. explicit voice override precedence
9. queued 간체 response locale 보존
10. queued 번체 response locale 보존
11. config validator 허용·거부 key
12. setup mapping 보존과 mode `0600`
13. doctor variant별 alias pass/fail
14. generic Chinese ambiguity에서 synthesis 0회는 스킬 QA로 검증

목표 자동 테스트 기준:

- README 테스트 최소 30개
- 전체 Node 테스트 최소 106개
- 실패·skip 0개

### 7. 언어·음성 QA

간체와 번체는 서로 다른 리뷰어가 검수한다.

문서 QA:

- 설치·보안·오류·라이선스 문장의 자연스러움
- 14개 섹션 대응
- Apple·Codex UI 명칭
- 간체/번체 혼입 문자 검사
- 명령과 path의 byte-level 보존

캐릭터 QA:

- Runa의 우월감과 장난스러움이 자연스러운지
- 한국어 조롱의 부자연스러운 직역이 없는지
- adult·consent·stop boundary가 유지되는지
- 기술 응답에 roleplay 욕설이 침범하지 않는지
- generic `中文` 모호성 질문이 짧고 이해되는지

TTS QA:

- 비용 승인 전에는 wrapper dry-run만 실행
- 승인 후 `zh-Hans`, `zh-Hant` 각각 1개 짧은 문장만 합성
- teacher-like delivery, singing cadence, 과도한 감정 tag가 없는지 확인
- Traditional script가 자동으로 Cantonese로 취급되지 않는지 확인
- 실패 시 retry·provider fallback 0회

## 검증 매트릭스

| 영역 | 검증 | 성공 기준 |
| --- | --- | --- |
| locale standard | manifest·CLI·config 비교 | `zh-Hans`, `zh-Hant` 표기 일치 |
| README generation | `pnpm run readme` 2회 | 두 번째 diff 0개, 5 outputs |
| README structure | template/output 테스트 | locale마다 14개 섹션·10개 gallery |
| script purity | 문자·glossary review | 차단 수준의 간체/번체 혼입 0개 |
| request routing | trigger matrix QA | explicit variant 정확도 100% |
| ambiguity | generic Chinese scenario | 질문 후 provider 요청 0회 |
| wrapper | unit tests | 두 variant alias routing 통과 |
| missing alias | preflight test | child/provider/network 0회 |
| queue | enqueue tests | canonical locale 보존, cross-swap 0건 |
| setup | config fixture | mapping 보존, mode `0600`, secret 0개 |
| doctor | zero-network dry-run | configured alias만 pass/fail 정확히 표시 |
| repository | `pnpm run check` | 전체 테스트·validator 통과 |
| links | 5 README 상대 링크 | 깨진 링크 0개 |
| format | `git diff --check` | whitespace 오류 0개 |

## 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| `zh-CN/zh-TW`로 script와 region 혼동 | 사용자 정체성과 언어 계약 오류 | `zh-Hans/zh-Hant` canonical 사용 |
| 기계 변환만으로 번체 생성 | 부자연스러운 지역 용어·오역 | 독립 현지화와 리뷰어 2명 |
| 번체를 광둥어로 자동 해석 | 잘못된 음성·사용자 불신 | script와 spoken language 분리, Cantonese 별도 계획 |
| generic `中文`을 임의 분기 | 원치 않는 script와 TTS 비용 | 모호성 질문, 선택 전 요청 0회 |
| 두 variant가 queue에서 섞임 | 화면과 음성이 다른 script | enqueue 전 canonical locale 고정 테스트 |
| multilingual alias가 중국어를 부자연스럽게 읽음 | teacher-like·singing 음성 회귀 | variant별 alias와 비용 승인형 1회 smoke |
| `哥哥`·`杂鱼` 남용 | 번역투·불쾌감 | response style reference와 강도 규칙 |
| 5개 README drift | 설치·보안 정보 불일치 | 모든 output stale 검사와 PR 체크리스트 |
| setup이 기존 config를 덮어씀 | 개인 설정 손실 | 기존 preserve·`--force-config`·mode-0600 backup 유지 |
| provider capability를 doctor가 과신 | alias 존재를 언어 지원으로 오해 | doctor 메시지에 existence와 capability 분리 |

## 롤아웃과 롤백

1. 현재 미커밋 영어 README 구현을 보존하고 기준 diff를 기록한다.
2. response routing·wrapper·tests를 먼저 구현해 중국어 locale contract를 고정한다.
3. 두 중국어 template과 generated README를 추가한다.
4. setup·doctor·기여 지침을 갱신한다.
5. zero-network 전체 검증 후 원어민 리뷰를 진행한다.
6. 비용 승인 시에만 variant별 TTS smoke를 1회 실행한다.
7. merge/push 후 GitHub에서 5개 언어 switch와 root English README를 확인한다.
8. 중국어 response 기능에 회귀가 있으면 두 Chinese voice route와 alias onboarding을 함께 되돌린다.
9. README만 롤백해야 하면 locale manifest, 두 template, 두 output, switch, validator를 한 세트로 되돌린다.
10. 영어 canonical README와 기존 ko/ja 출력은 중국어 롤백의 영향을 받지 않게 유지한다.

## 완료 기준

- `README.zh-Hans.md`와 `README.zh-Hant.md`가 각각 독립 template에서 생성된다.
- 5개 README가 같은 hero·gallery·language switch를 가진다.
- 두 중국어 README에 14개 상위 섹션과 핵심 설치·보안·라이선스 정보가 모두 존재한다.
- `SKILL.md`가 간체·번체 요청, continued response, script switch, generic Chinese ambiguity를 처리한다.
- `references/chinese-response-style.md`에 glossary와 캐릭터 문체 규칙이 있다.
- wrapper·config·queue가 `zh-Hans`, `zh-Hant`를 canonical하게 전달한다.
- missing alias와 ambiguity에서 provider 요청이 0회다.
- setup과 doctor가 optional Chinese aliases를 비밀값 노출 없이 다룬다.
- README 테스트 최소 30개, 전체 Node 테스트 최소 106개가 통과한다.
- `pnpm run check`, 5개 README 링크 검사, `git diff --check`, 설치 링크 picker가 통과한다.
- 간체·번체 원어민 리뷰어가 각각 차단 오역 0건을 확인한다.
- 실제 TTS smoke는 비용 승인 없이는 실행되지 않는다.
- Cantonese 미지원과 후속 분리 조건이 문서에 명시된다.

## 타임라인

최신 기록이 위에 온다.

### 2026-07-19 구현 완료

- `README.zh-Hans.md`와 `README.zh-Hant.md`를 독립 template에서 생성하는 5-locale README 구조를 구현했다.
- wrapper와 response queue에 canonical `zh-Hans`·`zh-Hant` alias routing, missing mapping zero-request preflight, explicit voice 우선순위를 추가했다.
- setup에 repeatable `--language-alias=<locale>:<voice-alias>`를 추가하고 doctor가 설정된 언어별 zero-network dry-run을 수행하게 했다.
- `SKILL.md`에 explicit script 감지, generic `中文` 모호성 질문, task-local 유지, Traditional Chinese와 Cantonese 분리 계약을 추가했다.
- `references/chinese-response-style.md`에 간체·번체 glossary, 기술/캐릭터 문체 경계, 금지 패턴과 QA checklist를 추가했다.
- 실제 provider TTS smoke는 비용 승인이 없어 실행하지 않았고, 간체·번체 원어민 최종 검수는 별도 대기 상태로 남겼다.

### 2026-07-19 16:04 JST

- 저장소 관리자가 간체·번체 README와 스킬 응답 자체의 중국어 지원 실행 계획을 요청했다.
- RFC 5646, W3C, Unicode CLDR 근거에 따라 canonical locale을 `zh-Hans`, `zh-Hant`로 확정했다.
- 현재 3개 README, README 테스트 22개, 전체 테스트 86개와 `ko/ja/es` voice 제한을 기준선으로 확인했다.
- 문서 locale, visible response style, wrapper, queue, setup, doctor, TTS QA를 하나의 후속 계획으로 연결했다.
- 구현, 중국어 번역, 원어민 검수, 실제 provider TTS smoke는 아직 수행하지 않았다.
