# 수락 검증 보고서 — 2026-10-31

**제품 상태: 부분 완료.** 일반 편집기/로컬 저장/백업/파일 출력과 수동 Magic Layers는 구현·실행·검증했습니다. 라이브 Gemini 자동 분해, 원본의 완전한 배경 복원·인식 정확도는 검증하지 못했습니다. 아래 PASS는 명시된 로컬 범위의 결과이며 범용 AI 성공을 뜻하지 않습니다.

브랜치 `feature/personal-magic-studio`, 기준 `fidelity-v2@0baf282ef35aff119296852f149964c059165e29`. `.agents/`, `cloud-setup/`, 기존 테스트, `output/` 변경 없음: [보존 검사](../evidence/studio/preservation.json). 기존 엔진을 변경하지 않고 별도 앱과 어댑터를 추가했습니다.

환경: Linux, Node 24.19.0, Python 3.12.14, Chromium 154.0.8037.57. 의존성 실제 설치 `scripts/setup-studio`와 `npm ci` 기록: [clean-setup.log](../evidence/studio/clean-setup.log). 최종 런타임 전용 새 venv에는 Pillow/lxml/numpy만 설치해 PPTX 서버를 실행했습니다: [runtime-python-setup.log](../evidence/studio/runtime-python-setup.log). DB·AI 키·로그인 없음. `npm start`의 localhost 프로덕션 서버로 E2E를 수행했습니다. 서버와 URL은 실제 확인했으며 인터넷 공개 배포는 하지 않았습니다.

## 필수 13항목

| # | 수락 기준 | 판정 | 실제 증거와 범위 |
|---|---|---|---|
| 1 | 설치·앱 실행·typecheck·lint·unit·production build | PASS | [typecheck](../evidence/studio/typecheck.log), [lint](../evidence/studio/lint.log), [unit](../evidence/studio/unit.log) 37개, [build](../evidence/studio/build.log). 깨끗한 npm 설치/새 Python 런타임으로 실행. |
| 2 | Chrome 표시·파일 업로드·정상 흐름 콘솔 오류 없음 | PASS | [E2E](../evidence/studio/e2e.log) 7개. PNG/JPEG EXIF/WebP/PDF 업로드. [정상 흐름 console](../evidence/studio/console-errors.json) `[]`. 오류 주입 HTTP 응답은 별도 시나리오. |
| 3 | 한글·도형·이미지·레이어·undo·저장·재접속 | PASS | E2E의 한글 수정/좌표/잠금/숨김/순서/다중 정렬/undo/redo/새로고침. **실제 Chromium 프로세스 종료·같은 프로필 재실행** 후 동일 IndexedDB 페이지 복원. 저장 공간 실패 주입 시 경고와 사용 가능한 ZIP 백업도 검증. |
| 4 | 원본 에셋 분리·좌표·가로세로 비율 보존 | PASS | 업로드 원본 bytes와 저장 에셋 비교. 실제 한국어 원본 bytes 동일. EXIF JPEG 표시 방향과 서버 출력 방향 일치. 원본/페이지 비율이 다르면 contain+여백으로 동일 비율 유지. 별도 좌표/비율 unit test. |
| 5 | 합성 native text/shape·알파 분리·잔상 처리 | PASS | **AI 비사용 수동 정답 영역**: text 2, shape 4(선 포함), mask image 1. 마스크 바깥 alpha 0/안쪽 255. 불투명 RGB **18,304개 원본 일치**. 원래 글자 위치가 비었음을 실제 원본 글자 픽셀에서 검사. 미확인/복잡 배경은 잔상 경고. [파일 검사](../evidence/studio/artifact-verification.json), [마스크 인증](../evidence/studio/mask-certification.json). |
| 6 | 무키 AI 비활성·일반 편집 정상·가짜 AI 없음 | PASS | 실제 서버 capabilities disabled, AI POST 503. UI ‘AI 연결 필요’, 분석 버튼 비활성. 수동 지정은 ‘AI 결과 아님’ 명시. 성공 mock을 제품 경로에 넣지 않음. [API 검사](../evidence/studio/api-boundary-checks.json). |
| 7 | 잘못된 polygon/JSON·미지원 모델·429·타임아웃·무손상 | BLOCKED | **로컬 검증은 PASS**: Zod 단위 테스트, SDK 격리 테스트, 오류 HTTP 주입 E2E에서 프로젝트 페이지/에셋 무변경. 실제 계정·라이브 Gemini 응답/오류는 키가 없어 BLOCKED. [unit](../evidence/studio/unit.log), [Gemini 검증 범위](gemini-verification.md). |
| 8 | ZIP → 새 세션 가져오기 동일 레이어·텍스트·순서·에셋 | PASS | 별도 브라우저 컨텍스트에서 복원 후 pages/assets deep equality. ZIP 바이너리 에셋 SHA-256 확인. [프로젝트 ZIP](../evidence/studio/browser-project.studio.zip). |
| 9 | PNG·PDF·PPTX 실제 파일·미디어 무결성·native 객체 | PASS | PNG 디코드, PDF 2페이지 렌더, PPTX ZIP/미디어/6자리 색상 XML 검사, python-pptx 열기. 브라우저 PPTX slide 1: native text 1; slide 2: native shapes 3(텍스트 포함)+독립 이미지 1. 단일/다중 페이지 어댑터 테스트 포함. **전체 raster 한 장을 편집 PPTX라고 한 것이 아님.** LibreOffice로 두 슬라이드를 실제 PDF 렌더링. |
| 10 | 2페이지 순서·서로 다른 객체 출력 | PASS | 페이지 생성→이동→복제/삭제→출력. PPTX slide 1의 ‘두 번째 페이지 독립 객체’, slide 2의 ‘한글 텍스트 수정 / 첫 페이지’ 확인. [artifact report](../evidence/studio/artifact-verification.json). |
| 11 | fidelity-v2 기존 테스트·회귀 | PASS | 보존된 upstream **128/128**, fidelity **7/7**, 새 Python 어댑터 **9/9**. [python-tests-clean.log](../evidence/studio/python-tests-clean.log). 초기 4개 doctor 실패는 테스트 환경의 openai 누락이었고 설치 후 해소. 기존 엔진 변경 없음. |
| 12 | UI 스크린샷·원본/변환 비교·리포트 | PASS | [1366×768 편집기](../evidence/studio/editor-1366x768.png), [수동 분리 편집](../evidence/studio/magic-reconstructed-editor.png), [원본/변환](../evidence/studio/synthetic-comparison.png), [원본 대비 QA](../evidence/studio/synthetic-quality/comparison.png), [실제 한국어 부분 변환 경고](../evidence/studio/real-korean-manual-partial-warning.png), LibreOffice 렌더 2장. 실제 이미지들을 육안 확인. |
| 13 | 비밀·개인 데이터 미추가·라이선스 보존 | PASS | Git staged text 패턴 검사와 신규 파일 수동 확인: [secrets-scan.json](../evidence/studio/secrets-scan.json), `.env.example`만 포함. 신규 입력은 합성 fixture 또는 기존 공개 저장소 원본. [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md), MIT 고지 및 Noto OFL 보존. 운영 의존성 감사 0건; 개발 도구 중간 경고 16건은 공개 기록. |

## 품질 판정과 미충족 사항

- **Synthetic: 근사 재구성(수동 정답 영역, AI 인식 아님).** 편집/배경/마스크/원본 core 픽셀 검증 PASS. 글꼴 굵기·줄 위치·모서리·선 두께 근사 때문에 원본 동일 복원이 아닙니다. 편집 전 비교 SSIM **0.9447495**, RGB MAE **3.01042**. SSIM은 11×11 uniform grayscale, range=255, 동일 캔버스 contain 정렬. [quality.json](../evidence/studio/synthetic-quality/quality.json). 점수에 임의의 ‘100% 성공’ 라벨을 붙이지 않았습니다.
- **실제 한국어 원본: 부분 변환/배경 보정 필요.** 업로드와 원본 보존 PASS. 수동 제목 영역만 native로 시험했으며 원본 잔상이 남는 배경에는 경고를 표시했습니다. 전체 자동 분해·Korean OCR/segmentation 품질은 **BLOCKED**. 완전한 분리 성공으로 처리하지 않았습니다.
- **마스크 증거: PASS(해당 합성 asset).** 브라우저에서 나온 정수 ROI·alpha·원본·단색 배경을 기존 `fidelity.validate_masked`로 검사해 통과한 경우에만 `source-masked`로 기록합니다. 위조 픽셀/해시를 바꾸면 실패하는 테스트도 있습니다. 임의의 사용자 이미지/근사 crop은 이 인증이 아닙니다.
- **전체 페이지 strict fidelity 인증: FAIL/미인증.** [strict report](../evidence/studio/fidelity-strict-source-validation.json)는 일반 사용자 편집 문서의 소스 비교 QA 플래그를 확인되지 않은 상태(false)로 유지해 실패합니다. 비인증 foreground도 원본 추출로 속이지 않습니다. native PPTX 파일 열기·객체 무결성과 원본 충실도 인증은 다릅니다. 실패를 숨기거나 QA 플래그를 true로 조작하지 않았습니다.
- 복잡한 배경 inpainting, 브러시/홀 마스크, Google base64 mask 디코딩, PPTX 가져오기는 미구현. 다각형 재지정/영역 수정은 구현됨. 자동 모델 환각·누락의 의미적 정확성을 독립적으로 보장하지 못하므로 원문 비교/사용자 검토가 필요합니다.
- 라이브 Gemini, 계정 모델 가용성·비용/쿼터, Windows 네이티브/WSL, 실제 Microsoft PowerPoint GUI, 개인용 HTTPS 인증 배포는 미검증 또는 권한 대기. 실제 확인한 것은 Linux/Chromium/LibreOffice 및 ZIP/XML/python-pptx입니다.
- 보안: 높은 심각도 PDF.js/sharp를 수정 버전으로 변경. [운영 감사](../evidence/studio/npm-audit-production.json) 0건, [전체 감사](../evidence/studio/npm-audit.json) dev ESLint/minimatch 중간 16건. 호환성을 깨는 강제 downgrade로 경고를 감추지 않았습니다.

## 재현 명령

```bash
./scripts/setup-studio
.venvs/studio/bin/python -m pip install -r scripts/studio-test-requirements.txt
npm --prefix apps/studio run typecheck
npm --prefix apps/studio run lint
npm --prefix apps/studio test
npm --prefix apps/studio run build
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" npm --prefix apps/studio start
# 별도 터미널 (CHROMIUM_PATH 필요 시 설정)
npm --prefix apps/studio run test:e2e
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" ./scripts/test-studio-python
.venvs/studio/bin/python scripts/verify-studio-artifacts.py
.venvs/studio/bin/python scripts/inspect-studio-pptx.py
```

`*-initial.log`, `*-before.log`, `adapter/initial/`은 수정 전 실패 증거입니다. 최신 판정은 위에서 연결한 로그·JSON을 사용합니다. CI workflow도 추가했지만 GitHub 원격 실행 결과는 로컬 결과와 별도로 확인해야 합니다.
