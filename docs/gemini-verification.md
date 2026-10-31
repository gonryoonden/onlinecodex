# Gemini capability evidence (2026-10-31)

Official documents fetched during implementation:
- https://ai.google.dev/gemini-api/docs/image-understanding
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/models/gemini

Verified from installed @google/genai declarations: models.get, Model.supportedActions, generateContent, GenerateContentConfig.responseJsonSchema, abortSignal, httpOptions.timeout and retryOptions. The official image understanding guide documents object detection and segmentation, but that does not establish that every configured model returns calibrated polygons. Studio therefore accepts a validated polygon only when supplied and otherwise labels an image region approximate crop; it never converts a box into a purported segmentation mask. Native API segmentation mask payload decoding is not implemented; this version uses polygon geometry/manual polygon correction.

The model catalog still lists gemini-2.5-flash and notes that access to 2.5 models may be restricted to accounts that used them previously. Runtime models.get checks account availability before any generation. A missing/unsupported model fails with actionable diagnostics; there is no automatic fallback to another model or image generation.

No API key was provided. **Live model availability, Korean recognition accuracy, response-schema acceptance and live segmentation quality are BLOCKED**, not established by mocked SDK tests. Mocking exists only in automated tests. All real-source screenshots explicitly show AI disabled.

ENABLE_PAID_AI=false is the shipped default and no image generation code exists. This flag cannot control Google account billing for text/vision requests; set provider budgets/quotas in the account. Free-tier availability and data-use terms must be checked by the account owner. Up to two application retries plus a model metadata probe can occur per analysis action; image analysis never happens just from upload.
