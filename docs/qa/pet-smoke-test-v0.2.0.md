# Kurose Runa custom pet v0.2.0 smoke test

- 상태: 수동 앱 확인 대기
- 작성일: 2026-07-18
- 자동 검증: 통과
- UI 자동화: Codex 앱이 Computer Use 대상에서 안전 정책으로 차단되어 실행하지 않음

## 자동 검증 결과

- manifest: 통과
- spritesheet: WebP, `1536×1872`, 알파 채널 있음
- 파일 크기: 1,290,958 bytes, 20 MiB 이하
- atlas: 8열×9행, 셀 `192×208`
- 사용 셀: 57개 모두 비어 있지 않음
- 미사용 셀: 15개 모두 완전 투명
- 시각 contact sheet와 9개 animation preview: 통과

## 데스크톱 앱 수동 체크리스트

1. Codex 앱을 완전히 종료한 뒤 다시 연다.
2. **Settings → Pets → Refresh**를 선택한다.
3. `Kurose Runa`가 목록에 표시되는지 확인한다.
4. `Kurose Runa`를 선택한 뒤 `/pet`으로 표시·숨김을 확인한다.
5. 펫을 좌우로 이동해 `running-right`, `running-left` 방향과 리본 위치를 확인한다.
6. 일반 대기에서 idle blink가 보이는지 확인한다.
7. 작업 실행, 사용자 입력 대기, 실패, 결과 검토 상황에서 상태가 구분되는지 확인한다.
8. 다음 차단 회귀가 없는지 확인한다.
   - 셀 경계 잘림
   - 갑작스러운 크기 팝
   - 기준선 점프
   - 리본 방향 반전
   - 얼굴·의상·색상 변화

## CLI 선택 검증

지원 터미널에서 다음을 확인한다.

```text
/pets
/pets Kurose Runa
/pets off
```

- 요구 환경: iTerm2 3.6+, Kitty graphics 또는 Sixel 지원 터미널
- 제외 환경: tmux, Zellij

## 완료 기록

수동 확인 후 아래 값을 채운다.

- Codex 앱 버전:
- macOS 버전:
- 터미널과 버전:
- 데스크톱 pet picker: PASS / FAIL
- 9개 상태: PASS / FAIL
- CLI pet picker: PASS / FAIL / NOT RUN
- 발견한 문제:
- 확인자:
- 확인 시각:
