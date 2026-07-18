# Security Policy

## 지원 범위

보안 수정은 최신 `main`과 최신 GitHub Release를 우선 대상으로 한다.

## 비밀값 경계

- API 키는 macOS Keychain 또는 설치자가 직접 구성한 환경변수에서만 읽는다.
- API 키를 issue, PR, 채팅, 명령 인자, JSON, 로그, 저장소 파일에 넣지 않는다.
- 보안 보고에 doctor 결과가 필요하면 credential 값이 아니라 redacted 출처 이름만 포함한다.

## 취약점 제보

credential 노출, 임의 명령 실행, 파일 덮어쓰기, 권한 확장 같은 문제는 공개 issue에 상세 재현값을 올리지 않는다. GitHub의 private vulnerability reporting이 제공되면 저장소의 **Security → Report a vulnerability**를 사용한다. 사용할 수 없다면 민감한 값을 제거한 최소 설명으로 저장소 관리자에게 비공개 연락 방법을 먼저 요청한다.

보고에는 영향받는 버전, 운영체제, 재현 단계, 기대 동작, 실제 동작을 포함하고 실제 API 키나 개인 데이터는 포함하지 않는다.
