# Personal Magic Studio

개인용 한국어 Canva형 편집기. `fidelity-v2`를 보존하고 Canvix(MIT)의 편집 모델·상태 관리·Konva 렌더러를 재사용합니다. 프로젝트는 IndexedDB에 로컬 저장하며 API 키·DB·로그인 없이 일반 편집/백업/PNG/PDF/PPTX를 사용할 수 있습니다. **라이브 Gemini 키/모델 목록 연결은 확인했으며 실원본에서 텍스트 19개·이미지 영역 27개를 생성했습니다. 이미지 분리는 근사 크롭이며 제품은 부분 완료 상태입니다.**

## 실행 (Linux / 검증 대상 Node 24, Python 3.12)

```bash
git clone https://github.com/gonryoonden/onlinecodex.git
cd onlinecodex
git switch feature/personal-magic-studio
./scripts/setup-studio
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" ./scripts/dev
```

Chrome에서 http://127.0.0.1:3000 을 엽니다. 이 URL은 로컬 주소이며 공개 배포 주소가 아닙니다. Python 가상환경 경로는 위처럼 지정합니다. PNG/PDF/ZIP은 브라우저에서 생성하고 PPTX는 Python을 사용하는 로컬 API에서 생성합니다.

프로덕션 로컬 실행:

```bash
npm --prefix apps/studio run build
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" npm --prefix apps/studio start
```

선택 AI 설정: `.env.example`을 `apps/studio/.env.local`로 복사하고 서버 환경에 `GEMINI_API_KEY`를 등록합니다. 채팅/코드에 키를 붙여 넣지 마세요. 모델 후보는 `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` 순서입니다. 실제 계정 metadata 접근은 세 후보 모두 확인했습니다. 생성 성공/품질은 metadata와 별개로 검증합니다. AI Studio에서 이 키의 프로젝트가 Free Tier인지 확인한 뒤 `GEMINI_BILLING_TIER=free`를 설정해야 분석이 활성화됩니다. 이 값은 운영자 확인이며 독립적인 과금 검증은 아닙니다. `ENABLE_PAID_AI=false`가 기본이고 이미지 생성 모델을 호출하지 않습니다. 이 플래그가 Google 계정의 과금을 차단하는 것은 아닙니다. 계정 예산·쿼터를 별도로 설정하세요.

이전 2차 개발의 보존 상태와 다음 작업은 [인계 문서](docs/phase2-handoff.md)를 참고하세요. 로컬 배경 복원은 편집기와 연결됐습니다. 최신 진행·실패·검증 기록은 [개발 루프](docs/development-loop.md)를 확인하세요.

## 사용

1. 왼쪽에서 텍스트·도형·이미지를 추가하고 오른쪽에서 글자/좌표/회전/투명도를 수정합니다. 이미지/PDF를 캔버스에 드롭할 수도 있습니다.
2. Shift+클릭으로 여러 요소를 선택해 정렬합니다. 레이어 목록에서 순서·표시·잠금·이름을 바꿉니다. Ctrl+Z / Ctrl+Shift+Z, Ctrl+D, 방향키를 사용할 수 있습니다.
3. 아래에서 페이지를 추가·복제·이동합니다. 자동저장 상태를 확인하고 필요한 때 저장을 누릅니다.
4. 이미지를 선택하고 Magic Layers를 엽니다. 키가 없으면 자동 분석만 비활성화됩니다. 수동 영역/텍스트/도형과 다각형 마스크는 오프라인에서 지정할 수 있습니다. 원문을 확인하고 영역을 채택·제외하세요.
5. ‘로컬 배경 보정’은 외부 전송 없이 CPU에서 객체·글자 영역을 제거합니다. NS가 기본이며 Telea 또는 글자 획/전체 영역 제거를 선택할 수 있습니다. 영역 수정 시 다시 보정하세요. 복원은 근사이며 미리보기로 잔상을 확인하세요. 단색/그라데이션 배경 근사 재구성을 확인하거나 복잡한 배경의 ‘보정 필요’ 경고를 확인합니다. 원본과 미리보기를 확대 비교하고 레이어를 **새 페이지**에 생성합니다.
6. 내보내기에서 현재 PNG, 다중 페이지 PDF/PPTX, 재편집 가능한 프로젝트 ZIP을 저장합니다. 프로젝트 ZIP은 새 브라우저 세션에서 가져올 수 있습니다. PDF 가져오기는 페이지별 이미지이며 자동 native PDF 변환이 아닙니다.

브라우저 데이터를 지우면 프로젝트도 사라집니다. ZIP을 정기적으로 외부 백업하세요. 판독 불확실 텍스트/마스크/복잡한 배경을 정확한 자동 분리로 보장하지 않습니다. 무료·로컬 기능과 API 쿼터/비용 의존 분석을 구분합니다. 민감 자료는 제공자의 데이터 사용 약관을 검토하기 전 무료 티어로 전송하지 마세요.

## 검증

```bash
npm --prefix apps/studio run typecheck
npm --prefix apps/studio run lint
npm --prefix apps/studio test
npm --prefix apps/studio run build
# Chromium 경로가 다르면 CHROMIUM_PATH=/path/to/chrome 지정
npm --prefix apps/studio run test:e2e
.venvs/studio/bin/python -m pip install -r scripts/studio-test-requirements.txt
STUDIO_PYTHON="$PWD/.venvs/studio/bin/python" ./scripts/test-studio-python
.venvs/studio/bin/python scripts/verify-studio-artifacts.py
.venvs/studio/bin/python scripts/inspect-studio-pptx.py
```

E2E는 테스트용 합성 원본과 수동 영역을 사용하며 실제 AI 결과를 모의로 성공시키지 않습니다. 테스트 완료 후 `scripts/verify-studio-artifacts.py`로 실제 출력 파일/alpha/슬라이드 내용을 검사합니다. 자세한 명령·결과·13항목 판정은 [수락 보고서](docs/acceptance.md)에 기록합니다.

## 문서와 출처

- [구조와 재사용 결정](docs/architecture.md), [한계](docs/limitations.md), [개인용 배포/Windows](docs/deployment.md)
- [Gemini 공식 문서 확인과 미검증 범위](docs/gemini-verification.md), [서드파티 고지](THIRD_PARTY_NOTICES.md)
- 앱 `apps/studio/`, 새 테스트 `apps/studio/tests/`와 `tests/studio/`, 증거 `evidence/studio/`
- [보존된 fidelity-v2 README](docs/fidelity-v2-original-README.md), 기존 엔진 `.agents/skills/image-to-editable-ppt/`, 기존 결과 `output/`

### 무료 모델과 연결

Node 24가 필요합니다. 실행 명령은 환경 HTTPS 프록시를 지원하는 `--use-env-proxy`를 사용합니다. SDK는 서버가 요구하는 2.x로 갱신했습니다. 기본 무료 후보 우선순위는 3.8 Flash → 3.6 Flash → 3.5 Flash-Lite입니다. 429인 경우에만 다음 후보로 전환하며 각 후보는 한 번만 호출합니다. `GEMINI_QUOTA_FALLBACK=false`로 전환을 끌 수 있습니다. 인증·JSON·시간초과·서버 혼잡·일일 로컬 제한 오류는 자동 전환하지 않습니다. 과금 계정에서 이 설정이 청구를 차단하지는 않습니다. Gemini 4 Argon은 공식 Free tier 미지원이므로 사용하지 않습니다.

이번 실검증 성공 모델은 `gemini-3.5-flash-lite`입니다. 상위 3.8/3.6은 검증 중 503 혼잡이 발생했습니다. Magic Layers의 무료 분석 모델 선택에서 3.5를 직접 선택할 수 있습니다. 최고 우선 무료 후보 기본값은 3.8이며 429일 때만 자동 하향합니다. 실제 AI 응답의 CER은 공백·줄바꿈 정규화 후 0.5%(400자 중 2자), mask는 0개였습니다. [실제 비교 이미지](evidence/studio/phase3/live-result-comparison.png)를 확인하고 한글·좌표·배경을 검토하세요.
