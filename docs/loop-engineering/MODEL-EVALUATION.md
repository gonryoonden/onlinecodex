# Box-prompt segmentation infrastructure evaluation

User resume base `ec29b63`; preserve 13/24 history. Current probe: pinned MobileSAM, original source and all 27 saved REAL Gemini image boxes; no manually supplied masks or points. Attempt 14 failed because realpath comparison skipped the venv activation; fixed in 15. Do not count an environment setup failure as a model accuracy failure.

| Option | License / download | CPU/GPU & deployment | Decision |
|---|---|---|---|
| Original SAM ViT-B/H | Apache-2.0; ~375MB / ~2.4GB checkpoint | High CPU/memory; large browser/server cold start, Vercel packaging constraints | Compare architecture; not adopted for this constrained device |
| MobileSAM TinyViT | Official Apache-2.0; checkpoint 40,728,226 bytes (~39MiB); box prompts | Local CPU tested; browser ONNX feasible; image embedding reused for all boxes | Selected for actual probe |
| Local Python CPU | Same model; torch CPU and dependencies > model size | Measured peak RSS ~681MiB. Suitable development reference; not presented as Vercel hosted Python functionality | Reference/evaluation only |
| Browser ONNX WASM/WebGPU | Same model; self-host encoder/decoder; no keys/image uploads | Requires measured download/memory/time and cancellation. WASM baseline, WebGPU optional; no SharedArrayBuffer assumed | Export and browser acceptance next |
| Separate inference service | Depends on provider/model; extra data transfer | New infrastructure, keys, recurring charges/privacy surface | Not adopted without authorization |

Upstream: https://github.com/ChaoningZhang/MobileSAM/tree/f706ad9c4eb7f219c00d9050e46328518ffb65d2 . Checkpoint SHA256 `6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f`. Runtime CPU torch 2.6.0+cpu, torchvision 0.21.0+cpu, timm 0.9.2. Weight loading uses torch 2.6's weights-only default.

CPU evidence: `evidence/studio/loop/sam-cpu/`. 26/27 pass structural screening, but this is NOT 26 accurate cutouts. Conservative visually verified automatic success is initially **1/27** (r33 helmet). Hollow paperclips/glasses show filled-background holes and cannot be declared precise segmentation. Predicted IoU can exceed 1 and is not a confidence probability. Model masks, candidate visibility, background readiness and visual verification remain separate counts.

No paid service or new Gemini call is involved. Public model downloads do not upload source images. The task-local Python environment/models are in work/, not the server deployment. Inference/extraction and background restoration remain separate stages.
