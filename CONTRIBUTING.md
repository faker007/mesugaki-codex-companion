# Contributing

## 변경 원칙

- 기존 비밀값·개인 설정·생성 음성을 저장소에 넣지 않는다.
- README는 `templates/README.md.tmpl`을 수정한 뒤 `pnpm run readme`로 생성한다.
- 오프닝 이미지는 `assets/`에 versioned sibling으로 추가하며 기존 파일을 덮어쓰지 않는다.
- pet 변경은 `1536×1872`, 8열×9행, 57개 사용 프레임과 15개 투명 셀 계약을 유지한다.
- 관련 없는 리팩터링과 포맷 변경을 같은 PR에 섞지 않는다.

## 로컬 검증

```bash
pnpm install
pnpm run check
git diff --check
```

pet을 변경했다면 contact sheet와 9개 GIF preview를 직접 확인하고 변경 이유를 PR에 적는다.

## Pull request 체크리스트

- 변경 목적과 범위를 설명한다.
- 실행한 검증과 결과를 적는다.
- 이미지·음성·캐릭터 자산을 추가할 권리가 있는지 확인한다.
- API 키, credential, 개인 데이터가 포함되지 않았는지 확인한다.
- 사용자 노출 설치 흐름을 바꿨다면 README 템플릿도 함께 갱신한다.
