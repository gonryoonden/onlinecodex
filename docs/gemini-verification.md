# 3차 실검증 — 2026-10-31 KST

이 절이 아래 2차 체크포인트의 현 상태 설명을 갱신합니다.

- `GEMINI_API_KEY`: **PRESENT**. 사용자 확인: 해당 API 프로젝트 Billing Tier **Free**. 이는 운영자 확인이며 독립적인 청구 조회는 아닙니다. ENABLE_PAID_AI=false.
- 공식 models/pricing HTTP 200, 인증 metadata HTTP 200. 3.8 Flash / 3.6 Flash / 3.5 Flash-Lite 모두 계정 접근 가능. Argon은 Free tier 미지원으로 제외.
- 실제 성공 모델: **gemini-3.5-flash-lite**, Interactions SDK **2.32.0**, 원본 2752×1536, 분석 HTTP 200 / 10.92초 / 1 generation call. [실응답](../evidence/studio/phase3/gemini-live-improved.json).
- 상위 3.8/3.6은 검증 중 503 high demand. 자동 fallback은 사용자 요청에 따라 **429에만**, 3.8→3.6→3.5-lite 각 1회. 모든 후보 쿼터 소진/로컬 일일 예산 소진 시 중지. 혼잡/인증/타임아웃/JSON 오류는 자동 재시도하지 않음. UI에서 무료 후보를 직접 선택할 수 있음.
- 실제 오류 루프: Node가 환경 proxy를 사용하지 않음 → Node24 --use-env-proxy. SDK1 legacy Interactions 400 → SDK2 migration, response_mime_type 제거/output_text 사용. nested schema constraint-state 과다 → 전송 schema의 숫자/길이 제약만 제거, **수신 Zod 검증은 유지**.
- 실제 결과: 텍스트 19 / 이미지 영역 27 / native shape 0 / 실제 segmentation mask 0. 이미지 영역은 **근사 크롭**이며 27개 모두 의미적으로 정확하다는 인증은 아님.
- 한글 CER: 공백·줄바꿈 정규화 + greedy text matching, 수작업 정답 400자 중 2자 오류 = **0.5%**. 누락 텍스트 블록 0/19. 예: `매분기`를 `분기기`로 오인식. [상세](../evidence/studio/phase3/gemini-live-improved-ocr.json). CER은 위치/색/줄바꿈/마스크 인증이 아님. 초기 OCR 전용 응답은 CER1.25%, 이미지0/style0 → prompt 개선 후 이미지27/style19.
- 검증용 실제 응답을 저장했고, 브라우저에서는 해당 실응답을 **재생**하여 추가 Gemini 호출 없이 편집·로컬 복원·출력 테스트. 모의로 만든 AI 성공이 아님. 완전히 새로운 이미지의 성공률을 입증하지는 않음.
- [원본/편집 레이어 비교](../evidence/studio/phase3/live-result-comparison.png), [픽셀 평가](../evidence/studio/phase3/live-visual-quality.json): contain 정렬 전체 페이지 RGB MAE 8.31. 마스크 IoU는 N/A.

---

# Gemini capability evidence — phase 2 checkpoint (2026-10-31 KST)

## Actual environment / account result

`GEMINI_API_KEY` was absent at the first check and still absent after the user's environment-publication reply. The current connected Cloud instance reports current observations, spec revision 2, `secrets: []`, `runtime_variables: []`. No secret values or fragments were displayed or written. **Authenticated model probes and generation calls performed: 0.** No successful account model has been selected. Actual free-tier/billing/project permissions are unknown.

Publishing a configuration did not attach it to this running task. In the next Cloud task, select the environment carrying the secret, apply/restart it as needed, then check only key presence. Do not paste the key into chat. A key/model metadata response alone cannot establish billing tier. Check the key's project Billing Tier in AI Studio before setting `GEMINI_BILLING_TIER=free`. This setting is an operator attestation, not independent API verification or a billing firewall. Keep `ENABLE_PAID_AI=false`; it does not block Google account charges.

## Public documentation checked

- [3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)
- [3.5 Flash Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Published pricing/free tiers](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
- [Image understanding, object detection and segmentation](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [3.8 API changes](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8)
- [Billing](https://ai.google.dev/gemini-api/docs/billing)

The candidate catalog records published free-tier, image-input and structured-output support. These public statements do not establish this account's quota, access, Korean OCR accuracy or mask quality. Ordered candidates: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`. The old 2.5 default is removed. Metadata-only fallback is restricted to this list; no paid image model or API-mode fallback is automatic.

The generic segmentation example and model-specific thinking guidance differ: the former shows `minimal`, whereas the 3.8 model page lists low/medium/high and rejects minimal. The implementation uses low and omits sampling parameters. Actual account/API acceptance remains BLOCKED. Default Interactions uses `store:false`, explicit zero SDK retries, structured JSON and a 45s timeout. Explicit `GEMINI_API_MODE=generate-content` remains available. Installed @google/genai 1.52.0 declarations were checked for both APIs.

## Implemented versus pending

- Implemented: Google `[ymin,xmin,ymax,xmax]` → Studio `[x,y,width,height]`, explicit bbox-local versus whole-image polygon conversion, schema validation, review flags, optional separate mask call preserving the first result on failure.
- Implemented: metadata-only `POST /api/ai/connection`, fail-closed free-project policy, no automatic generation retries for invalid JSON/429/timeouts; Interactions SDK retries also disabled. Separate mode uses at most two generation calls. The UI still invokes combined mode only.
- Local tests: synthetic wire fixtures and mocked SDK failures exercise code contracts. They are **not live Gemini evidence**.
- Pending: actual account model access and generation, schema acceptance, combined-versus-separate quality comparison, Korean OCR/style/layout accuracy, real-image segmentation and complete editing flow.
- Pending: grayscale PNG mask decoding/alpha extraction in the browser. Schema acceptance and Python helper support are only partial plumbing; reconstruct.ts still handles polygons/rectangular crops.

The repository's `2024년_산업안전보건교육_주요_개정_요약.png` exists and was visually inspected. No external private material was fetched. It has not been sent to Gemini, and there is no actual AI decomposition comparison to report.
