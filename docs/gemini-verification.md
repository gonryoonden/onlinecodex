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
