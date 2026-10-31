# Personal Magic Studio 2차 작업 인계 — 2026-10-31 KST

**보존 체크포인트이며 전체 개발 완료가 아닙니다.** 사용자 요청으로 새 기능 개발을 멈추고 현재 작업을 기존 브랜치에 보존합니다. 시간 필터로 변경을 버리지 않고, 1차 기준 `a1b4396` 이후 모든 미커밋 변경을 검사했습니다.

- 저장소: https://github.com/gonryoonden/onlinecodex
- 브랜치: `feature/personal-magic-studio`
- Draft PR #1: https://github.com/gonryoonden/onlinecodex/pull/1 (base `fidelity-v2`, draft 유지)
- 이전 1차 커밋: `a1b4396b5fcb046a66dec5065b828b8602fdd51c`
- 이 체크포인트 SHA는 최종 응답/Git 로그 및 PR에서 확인합니다. 자기 자신의 SHA를 커밋 안에 넣지는 않습니다.

## 보존한 변경

1. 최신 Gemini 후보 카탈로그, 무료 프로젝트 운영자 확인 전 생성 차단 정책. `ENABLE_PAID_AI=false` 유지. 실제 계정 무료 사용은 미확인입니다.
2. 메타데이터 연결 확인 API, Interactions/명시적 generate-content 선택, low thinking, JSON 구조화 결과 검증. 모델/생성 성공은 아직 없습니다.
3. Google YX 코너 좌표 → Studio XYWH, bbox 내부/전체 이미지 polygon 좌표 명시 변환. 별도 segmentation API 모드와 실패 시 첫 분석 보존. UI 모드 선택은 아직 연결하지 않았습니다.
4. 429/잘못된 JSON/타임아웃 자동 재시도 제거, SDK 재시도 비활성, 실제 생성 시도 단위 카운터.
5. 로컬 OpenCV Telea/NS 배경 복원 API·Python helper. px-image2pptx MIT textmask.py를 원본 그대로 재사용. 배경/텍스트 제거 객체 소스/마스크를 반환하고 마스크 밖 픽셀을 보존합니다. 가려진 배경의 정확한 복원은 보장하지 않습니다.
6. 위 계약에 대한 로컬 테스트와 기존 회귀 검증. E2E 증거 경로를 환경변수로 분리하여 1차 증거를 덮어쓰지 않습니다.

## 새 환경에서 이어갈 순서

```bash
git clone https://github.com/gonryoonden/onlinecodex.git
cd onlinecodex
git switch feature/personal-magic-studio
git pull --ff-only
./scripts/setup-studio
npm --prefix apps/studio run typecheck
npm --prefix apps/studio test
npm --prefix apps/studio run build
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" npm --prefix apps/studio start
```

1. 필수 문서 README/master-task/acceptance/architecture/limitations/gemini-verification와 이 인계 문서를 읽습니다.
2. Cloud 작업에 secret이 연결되었는지 **존재 여부만** 확인합니다. 현재 작업은 사용자 등록 안내 후에도 `GEMINI_API_KEY` 없음 / 연결된 secrets 0개였습니다. 키를 로그·Git·채팅에 쓰지 않습니다.
3. 무료 프로젝트 여부를 AI Studio에서 확인합니다. `.env.example`의 `GEMINI_BILLING_TIER=free`는 운영자 확인 값입니다. 과금 상태 미확인 시 생성하지 않습니다. 연결 API는 모델 metadata만 검사하며 생성 성공/무료 사용을 인증하지 않습니다.
4. 키·무료 조건이 확인되면 실제 저장소 한글 이미지로 3.8 → 3.6 → 3.5-lite 접근/호출을 검증하고, 성공 모델만 기록합니다. 추정 모델을 성공한 것처럼 표시하지 않습니다.
5. **미완료:** `MagicDialog.tsx`에 로컬 복원/검토·실패 UI 연결, `reconstruct.ts`에 복원 배경과 텍스트 제거 객체 소스 연결. 현재 UI는 복잡한 원본 배경+경고를 그대로 사용합니다. API만 존재하는 상태를 잔상 해결 완료로 표시하지 않습니다.
6. **미완료:** PNG grayscale segmentation mask를 실제 alpha로 변환하고 bbox/원본 픽셀 정렬, 마스크 재보정·출처 관리. 현재 브라우저는 polygon만 잘라냅니다. Python mask 경로의 alpha 해석과 검증도 추가로 점검해야 합니다.
7. **미완료:** 실제 AI 한글 OCR·스타일·도형·객체 품질, combined/separate 비교, 객체 이동/삭제 후 잔상, 저장/재접속/PNG/PDF/PPTX 전체 시나리오·스크린샷·SSIM. 합성/수동 영역 테스트와 실제 AI 증거는 구분합니다. 기존 fidelity 인증 조건을 완화하지 않습니다.

## 검증 기록

최초 실패 로그도 `evidence/studio/phase2/*-initial.log`에 보존합니다. 타입 오류 원인은 Next의 ProcessEnv가 NODE_ENV를 요구하는 새 spawn 환경이었으며, 해당 값만 추가해 수정했습니다. 초기 TS 실패 5개는 변경된 무료 정책/Google wire 형식/무재시도 계약과 과거 테스트 설정의 불일치였습니다. 기존 테스트를 삭제하지 않고 정책과 wire fixture를 갱신했으며 신규 실패 방지 테스트를 추가했습니다. 최종 결과는 [수락 보고서의 2차 체크포인트](acceptance.md#2차-보존-체크포인트)에 기록합니다.

`reconstruct.ts`, fidelity-v2 엔진, 사용자 원본/기존 output과 1차 증거는 보존합니다. 실제 AI 검증 미완료이므로 PR은 Draft로 유지합니다.
