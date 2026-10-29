# Fidelity v2 experimental implementation

Branch: fidelity-v2. This is a working incremental engine release, **not completion of every requested feature**.

## Measured results

Same source PNG, same LibreOffice/Poppler rendering at 1600x900, source contained without aspect distortion. Metric: 11x11 uniform-window grayscale SSIM; RGB MAE 0..255.

| Metric | v1 | v2 |
|---|---:|---:|
| SSIM | 0.679807 | 0.684475 |
| RGB MAE | 19.148763 | 18.258202 |

Improvement is modest: SSIM +0.00467, RGB error -4.65%. No regional regression exceeds the baseline-relative tolerance. Thresholds (.01 global SSIM drop / .05 regional drop) are regression tolerances, not claims of perceptual perfection. JSON reports and comparison/heatmap PNGs are in qa-v1 and qa-v2.

v2 result: result-v2.pptx; preview-v2.png. v1 result.pptx is preserved. editppt v2-page validation passed; 39 editable text boxes +18 native structural shapes, 23 image objects, 0 tables (this fixture contains no true table). Existing native-table tests remain passing. LibreOffice opens/renders the output. Korean text is native and uses ko-KR; font metrics differ slightly from the source.

## Engine changes and causes

- Old soft matte's dominance equation erased pastel subjects when their red channel approached the key maximum. Restrict dominance processing to the near-key RGB distance; distant pink/yellow colors stay opaque. Added regression for the exact pink/yellow pixel colors encountered.
- New fidelity.py: ROI segmentation from background residual or supplied masks; color-seeded masks for isolated contrasting objects; compositing-equation edge decontamination; exact opaque-pixel preservation; hash-linked source/background/mask/asset evidence. Empty/rectangular masks, border contacts, changed core pixels, mismatched alpha/hashes and excessive compositing residual fail closed.
- New source-masked provenance is allowed **only with executable evidence verification**. Existing rules for other provenance types remain active.
- Helmet uses original source pixels via seed segmentation. A broad automatic fit failed closed before local fit/seed was used. Wrench fit was rejected for complex border residual; its existing source-faithful separated asset was retained. Nothing was accepted by relaxing the failed checks.
- Native DrawingML linear gradient replaces solid mint background. Preview engine also renders the same stops. Stop order/colors/angle are checked. No original whole-image background is used.
- Text boxes support lang (default ko-KR), char_spacing and Noto Sans CJK KR fallback default. Table font fallback and cross-platform font discovery are not comprehensively implemented.
- Visual QA generates same-resolution SSIM/RGB metrics, named-region metrics, side-by-side comparison and heatmap. Text comparison API reports exact string match, bbox IoU and center displacement. Baseline-relative regression_plan identifies regions to repair. Repairs remain agent-driven, not an automatic retry loop.

## Tests

128 upstream tests pass, unchanged assertions, in an actual copied upstream-compatible directory layout. A first symlink test harness caused one resolved-path mismatch; replacing symlinks with actual copied directories resolved it without altering the tested code/assertion. Seven added tests pass: identical/different SSIM, invalid gradient, Korean language/spacing XML, rejection of rectangular masks, exact core pixels and tamper detection, pastel-color preservation, text geometry and selective repair planning. Full logs: logs/v2-final-tests.log; later fidelity-only rerun: logs/fidelity-tests.log. Final structural report: v2-page/validation-v2.json.

## Limits / incomplete requested work

- No universal learned segmentation model, general alpha matting network, automatic complex-background text removal/inpainting, or guaranteed preservation of extremely faint shadows. Local plane fitting refuses complex residuals; existing image-edit backend is still needed in those cases.
- No general color-spill classifier, automatic clipping ground truth or automatic font-weight/line-break correctness scoring. Mask boundary/compositing checks catch specific defects; source/render visual inspection is still required.
- Existing PaddleOCR attempt produced no recognition output because model downloads were denied by network policy. No Korean OCR result/confidence was invented; fixture text uses the previous visual transcription. OCR JSON adapters/orchestration remain future work.
- No automatic semantic object-location matching from rendered pixels. Text bbox comparison requires stable IDs from independent reference annotations. Existing editppt checks native structure/counts.
- New-task restore and restart were not exercised. Install/start scripts require this repository's v2 version marker and will not download upstream over it. Environment draft is saved separately; publication remains a user action.

## Reproduction / rollback

Activate /workspace/.venvs/editppt; run bash cloud-setup/test-fidelity.sh. Commands: editppt fidelity --help; fidelity fit-background, seed-mask, extract and qa. The reference reconstruction manifest and assets are in output/v2-page; build with editppt page build, render with LibreOffice, validate with editppt page validate. QA source/render commands accept named render-pixel regions.

Upstream b7be494 is archived in vendor/upstream, with upstream MIT copyright in cloud-setup/UPSTREAM-LICENSE and skill/LICENSE. Version marker: skill/FIDELITY_VERSION. For rollback extract into a separate folder and install its CLI into a separate venv. Do not overwrite working changes. Startup instructions: cloud-setup/start-fidelity.md.
