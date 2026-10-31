# 개발 루프 — 2026-10-31 KST

현재 Phase: 3 — 실제 Gemini 연결, 로컬 복원 UI 통합 및 통합 검증 중.
기준 커밋: df713dca5e6e71a6fd7bc152d4655aa2f0b6c6dd (원격 feature/personal-magic-studio).
원본 작업 트리: main 기반 work / 54bf39a, 미커밋 변경 없음. 원격 최신 개발 브랜치를 fetch하여 이어감. 초기 tracking 전환 실패 후 --no-track 전환, 기존 브랜치명으로 복구. 사용자 원본/output/fidelity 엔진 보존.

## 루프와 결과

1. 기준선: TypeScript 48 PASS. Python 150 PASS. 이전 미완료 PNG mask/repair API를 확인하고 재작성하지 않음.
2. 로컬 복원 연결: MagicDialog → 기존 background API → reconstruct. 원본과 복원 asset 분리, 텍스트 제거 objectSource 사용, 영역/설정 변경 시 복원 무효화, 실패 표시, NS/Telea·텍스트 획/영역 선택, 미리보기 검토. PNG grayscale×alpha → 실제 투명 crop. 합성 테스트는 실제 AI로 표시하지 않음.
3. 평가 기준: 합성 masked RGB MAE ≤8, 비마스크 픽셀 완전 보존. 기준을 사전에 코드에 고정. 5종 합성·실원본 수동 영역을 Telea/NS로 평가. 단색/한글/겹침/표 PASS, 복잡 무늬 FAIL (Telea 20.45, NS 19.13). NS를 UI 기본값으로 선택. 숨겨진 실제 배경 정답이 없으므로 실이미지 복원 SSIM/정확 복원 성공을 주장하지 않음. 비교: evidence/studio/phase3/quality/.
4. 브라우저: 기존 7 + 합성 PNG mask/repair/무효화/출력 + 실한국어 원본 수동 제목 보정/이동/저장/출력 = 9 PASS. AI 자동 분해와 수동 정답 영역 검증을 구분함.
5. Gemini: 키 PRESENT. Python 공식 문서/인증 metadata HTTP 200. 무료 후보 3.8/3.6/3.5-lite 모두 metadata 접근 가능. 4-argon은 metadata 접근 가능하지만 공식 가격표 Free tier 미지원으로 제외. 사용자가 AI Studio 프로젝트 Free 표시 확인함. ENABLE_PAID_AI=false. 사용자 요청에 따라 429에 한해서 다음 무료 후보로 전환(각 1회, combined 최대3회). auth/JSON/timeout/로컬 일일 한도는 전환 없음. SDK 자체 재시도 0.
6. 실제 실패 원인: Node fetch 환경 프록시 미사용 → Node24 --use-env-proxy 적용. 이후 Interactions 400은 SDK1 legacy API 거부 → 공식 SDK2와 response_format/output_text로 이행. 처음 MODEL_UNSUPPORTED 분류는 네트워크 실패였으며 모델이 실제 미지원이라는 증거가 아님. 초기 실패 로그/JSON 보존.
7. 안전 검토: 진단 재실행이 중복 API 가능성으로 자동 거부됨. 잘못된 cwd에서 동기 파일 읽기 실패로 API 호출 이전 종료했음을 증명한 후 재승인받음. 비밀값을 출력/저장하지 않음. 일시 live 진단 테스트는 /tmp로 이동하여 일반 CI가 API를 호출하지 않음.

## 남은 검증

- SDK2 실제 원본 이미지 분석 응답/한글 CER/객체 품질, 실제 결과를 이용한 편집·출력 E2E.
- 마지막 변경 후 type/lint/build/TS/Python/E2E 및 출력 검사 재확인.
- GitHub PR 조회/Actions API는 Forbidden. Git push 가능 여부와 원격 head는 별도 검증 예정.
- 개인 HTTPS 인증 배포는 수행하지 않음(사용자 게시 금지 유지). 기존 docs/deployment.md 구성 활용. Vercel에서 Python subprocess 가능하다고 가정하지 않음.

## 재개 명령

```bash
cd /workspace/onlinecodex
npm --prefix apps/studio run typecheck
npm --prefix apps/studio run lint
npm --prefix apps/studio test
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" ./scripts/test-studio-python
npm --prefix apps/studio run build
# 오프라인 회귀 서버: GEMINI_API_KEY= STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" npm --prefix apps/studio start
STUDIO_EVIDENCE_DIR="$PWD/evidence/studio/phase3" npm --prefix apps/studio run test:e2e
STUDIO_EVIDENCE_DIR="$PWD/evidence/studio/phase3" .venvs/studio/bin/python scripts/verify-studio-artifacts.py
.venvs/studio/bin/python scripts/studio-evaluate-repair.py
```

마지막 검증된 신규 커밋/최종 결과는 다음 기록에서 갱신한다. 외부 서비스 결과를 로컬 PASS로 대체하지 않는다.

## 3차 최종 기능 검증

- SDK2.32.0 migration 후 모델 serving schema의 nested bounds로 인한 state 폭발을 실제400에서 확인. 전송 schema만 간소화하고 strict Zod 사후검증 보존. 프록시·SDK·schema 실패 원인을 각각 해결함.
- 실제 성공: 3.5 Flash-Lite Interactions, HTTP200/10.92초, text19/image27/style19/mask0/native shape0. 응답과 provenance 저장. 3.8/3.6은 실제503이므로 같은 조건 무한재시도하지 않음.
- 프롬프트 개선 전: CER1.25%, image0/style0. 개선 후: CER0.5%(400자 중2자), image27/style19. 의미적 segmentation이나 정확한 레이아웃 성공으로 확대 해석하지 않음.
- 브라우저10 PASS: 실제 응답 재생으로 46영역 생성→로컬repair→한글수정→이미지이동/리사이즈/삭제→저장/리로드→PNG/PDF/PPTX. 추가AI호출 없음. 실AI PPTX는2슬라이드/native text19/picture27. 원본 비교 MAE8.31, maskIoU N/A.
- TypeScript59 PASS, Python151 PASS, type/lint/build PASS. 기존13개 수락기준 유지, 복잡합성배경은 고정기준 FAIL을 그대로 기록.
- 미완료: 실제 정확한 투명객체 마스크·경계/그림자 복원·오인식2자 및style/좌표 검토, 상위무료모델서비스503, GitHubCI조회Forbidden, HTTPS개인배포(미게시).
- 배포가 아닌 기존 Draft브랜치 반영을 진행. 마지막 검증 커밋/원격head/CI상태는 아래 보존기록에서 확인.


## Git 보존·외부 상태

- 마지막 전체 검증 구현 커밋: `f01b797e4dec803cdc19b4fbe4ef8b22cb003cc5`.
- 원격 `feature/personal-magic-studio`에 정상 push 성공. git ls-remote로 일치 확인.
- 기존 PR 주소: https://github.com/gonryoonden/onlinecodex/pull/1. API Forbidden으로 현재 Draft/open 상태를 독립 재확인하지 못함. merge/publish하지 않음.
- GitHub Actions 조회 및 workflow_dispatch 요청은 api.github.com Forbidden으로 BLOCKED. 원격 CI PASS라고 주장하지 않음. GitHub 웹의 기존 PR Checks에서 확인하고 필요 시 `Personal Magic Studio` 워크플로를 해당 브랜치로 실행해야 함.
- 이 후속 커밋은 검증 문서/원격 상태 기록만 포함. 코드 변경 없음. 구현 커밋 검증 결과는 유지.
- 다음 명령: `gh run list --repo gonryoonden/onlinecodex --branch feature/personal-magic-studio --limit 3` (API 접근 복구 후).
- 남은 품질 작업: 실이미지 mask 추출/그림자, style·좌표·OCR2자 교정, 상위 무료모델503 회복 후 제한된 재평가. 모델 생성 호출은 여기서 중지했으며 기존 실제 응답으로 오프라인 회귀 가능.
