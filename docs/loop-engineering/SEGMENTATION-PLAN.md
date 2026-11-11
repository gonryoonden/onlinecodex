# Resume from ec29b63 — automatic box-prompt segmentation

User master prompt resumes the existing 13/24 attempts; no budget/state/history reset. Remaining 11 attempts prioritize a real segmentation model, then restoration and actual-image browser acceptance including PDF and resizing. The original PRD/gates remain in effect; this adds explicit model inference acceptance.

- Compare original SAM, MobileSAM, browser ONNX/WebGPU/WASM, local Python CPU and external inference. Verify upstream license and weight provenance before integration. No new paid service, new API charges or credential/auth changes.
- First model gate: original 27 stored REAL Gemini boxes, unmodified image, no manual polygon/mask, pinned pretrained model on CPU. Generate all masks, timing/memory, independent quality screening and contact sheet. At least one complete object with actual alpha must pass visual inspection; model-predicted IoU is not calibrated real accuracy.
- Browser gate: host/download pinned models from same app, execute privately on user's device if practical. No unsupported Python-only feature presented as deployed Vercel functionality. Failed/unavailable model falls back to saved candidates and manual correction.
- Background gate: removal uses model mask support; source outside bounded mask unchanged. Separate approximation status; measure seam/ghost limitations, preserve originals.
- Acceptance: actual >=3 sources; cached REAL Gemini response remains distinct from human box inventories. Native edits, resize/move/delete, ZIP new-context restore, PNG/PDF/native PPTX. Explicit automatic mask origin and model version/hash.
- Preserve successful changes in small commits; reserve each verification with the existing runner. No completing an unmet gate; stop when budget is exhausted, same cause fails 3 consecutive times, or no authorized technical route remains.
