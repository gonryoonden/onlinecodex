# Third-party notices

## Canvix — actual editor reuse

Source https://github.com/mir-ashiq/canvix, inspected and copied commit `8aa4cf98bb54d95950d8dc4bd241f6ffbd33b0f8` (package 0.11.3). MIT, Copyright (c) 2026 Ashiq Hussain Mir. Full notice retained in [licenses/Canvix-MIT.txt](licenses/Canvix-MIT.txt).

Adapted files: `apps/studio/src/lib/types.ts`, `editor-utils.ts`, `magic.ts`, `animations.ts`, `v06-geometry.ts`, `lib/collab/{hlc,identity,merge,protocol}.ts`, `store/editor-store.ts`, `components/canvas/{element-node,v06-nodes,use-loaded-image}.tsx` (last file `.ts`). Original editor history, layer and page operations, native factories, image caching and Konva node renderer are reused. The store's server persistence is removed. Studio changes protect locked-layer deletion. Magic reconstruction flow follows the inspected original `reconstruct.ts`, replacing rectangular JPEG crops with explicit PNG/polygon paths and correction warnings. DB/auth/collaboration UI and ZAI are not shipped.

## Existing onlinecodex fidelity-v2 engine

Base https://github.com/gonryoonden/onlinecodex commit `0baf282ef35aff119296852f149964c059165e29` on `fidelity-v2`. Engine preserved byte-for-byte. Its upstream is https://github.com/ningzimu/image-to-editable-ppt-skill at `b7be494e31a0ed56ef98716891db5474606b8cdf` (existing cloud-setup/source.json). MIT Copyright (c) 2026 ningzimu. Existing `.agents/skills/image-to-editable-ppt/LICENSE` and `cloud-setup/UPSTREAM-LICENSE` remain intact. New Python adapter imports its deterministic manifest builder rather than replacing the engine.

## px-image2pptx — reviewed, not incorporated

Source https://github.com/JadeLiu-tech/px-image2pptx commit `6f4ad9fa27173388c0dc3a63710a2832fb2c3b1b`. License actually verified as MIT, Copyright (c) 2025 pxGenius; copy in `licenses/px-image2pptx-MIT.txt`. Reviewed Python dependencies: PaddleOCR, OpenCV, optional torch/simple-lama. No source from this project is shipped: existing fidelity builder meets native export needs; adding Paddle/torch and downloaded weights would increase setup burden and cannot establish Korean OCR/inpainting quality without testing. Optional Qwen-Image-Layered/GPU is not installed, redistributed or provisioned.

## Fonts

Noto Sans KR via `@fontsource/noto-sans-kr`, locally bundled by Next (no runtime Google Fonts request). SIL Open Font License 1.1, Google Inc.; full text in `licenses/Noto-Sans-KR-OFL.txt`. Tests use system Noto Sans CJK to draw Korean synthetic ground truth. Office output references font names and does not embed fonts.

## JavaScript dependencies

Exact resolved versions are in `apps/studio/package-lock.json`. Installed package name/version/license inventory: `docs/npm-license-inventory.json`. Principal libraries: Next/React/ReactDOM (MIT), Konva/react-konva (MIT), Zustand (MIT), Zod (MIT), @google/genai (Apache-2.0), PDF.js (Apache-2.0), jsPDF (MIT), JSZip (MIT OR GPL-3.0-or-later; MIT selected), sharp (Apache-2.0 and its bundled native dependencies), Lucide (ISC), Playwright (Apache-2.0), Vitest/TypeScript/ESLint (licenses in package inventory). Original npm package license files are installed with their packages; preserve those when redistributing builds.

PDF.js worker is copied from the installed package by postinstall, without stripping its license header. It is generated and not independently versioned. Upstream version ranges were reviewed and high-severity PDF.js/sharp advisories were addressed; see security audit evidence.

## Python dependencies

`Pillow` (HPND), `numpy` (BSD-3-Clause), `lxml` (BSD-3-Clause), `PyYAML` (MIT), `requests` (Apache-2.0). `PyMuPDF` is used by the preserved engine's validation/rendering ecosystem and test artifact checks and is **AGPL-3.0 or commercial**, so private local use and redistribution/hosted use must respect that license; it is not relabeled MIT here. `python-pptx` (MIT) and `openai` (Apache-2.0) are test-only dependencies in the Studio setup; no paid API is called by those tests. The builder itself emits OOXML using Python standard library plus Pillow/lxml in the adapter. Avoid publishing a combined hosted distribution without reviewing PyMuPDF obligations or obtaining its commercial license.
