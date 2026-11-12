# Reviewed editor design (2026-11-12 KST)
Subject: an everyday infographic editor. Primary job: edit an independent object without losing the complete design context. Preserve Personal Magic Studio's ink/teal identity and established tools; no landing-page ornaments.

Tools: frontend-design/systematic-debugging skills; actual Chromium/Playwright. Figma MCP is available but no existing file/key is supplied; do not create an external file. No dedicated UI/UX Design System MCP found in callable tool catalog. Design principles applied directly: WCAG2.2 keyboard/focus/status/dialog semantics and target sizing; progressive disclosure; editable canvas before diagnostics. These are reference principles, not an automated WCAG conformance certification.

Tokens: ink#18333b, action#28776c, quiet mint#e6f0eb, border#dce4e4, workspace#e7edee, critical#9f3737. Preserve Noto Sans KR for interface and document fallback; compact brand lettering remains restrained, utility numerals tabular. Type12px controls/11px utility/14px panel titles. Spacing4/8/12/16/24; targets32–36px desktop,40–44px touch; visible focus and reduced-motion support. Warning and fatal states use text/icons as well as color.

Before:76px header +47px tools +224px stacked messages +73px pages +35px zoom. At1650×928 viewport1081×473 and actual source613.5×342.4. Side columns70+235+264px. Selection pointerdown-to-second-rAF median110.5ms (8 samples, Chromium dev, not field INP). Canvas already shares decoded images and memoizes ElementNode, but parent creates new onDoubleClick closures for every node and subscribes to unrelated view/selection state; this defeats the existing memo boundary.

Plan, reviewed against brief:
```
56px  existing brand / project / focus / save / export
      rail56 | tools212 (collapsible) | CANVAS | layers+properties264 (collapsible)
40px                                  one summary / details / exceptions
40px                                  document+comparison+advanced tools
                                      artboard with16px margin
40px                                  page navigation (compact in focus)
32px                                  fit / fit width /100% / selection / zoom
```
Signature is a thin, quiet status strip aligned with the artboard workspace, instead of multiple diagnostic cards. This is a functional hierarchy choice; no new animation/library/font download. Focus collapses panels and trims chrome but keeps explicit controls to reopen panels and exit. Native range controls adjust panel widths predictably with keyboard support. On small screens panels become drawers, not competing columns.

View scale is session UI state, separate from project data. Fit/fit-width follow viewport; manual100%/zoom stay numerically stable through resizing/focus. Selection-fit scrolls the selected document bounds into view. Source comparison overlays the immutable source inside the exact document fit; no visibility/project writes.

Status detail and exceptions are bounded scrollable dialogs with Escape/focus return. Serious errors stay visible; ordinary upload/complete messages become transient toasts. A/B/C counts remain derived from actual engine inventory; C/failed never made visible by this redesign.

Close means cancel and close, not hidden background execution. Abort + run identity + mounted guard prevent late page creation/persistence. Completed analysis persists before model starts; retry reuses it. Worker messages distinguish actual transport bytes, integrity, runtime, embedding and masks; restoration/layer/entry are subsequent real boundaries. Cache same-origin model bytes only after matching existing pinned hashes; recheck on reuse. No model binary changes.

Text plan: reuse fitTextToBox and actual Noto glyph loading for new AI text; preserve recognized characters and explicit paragraphs, fit the box rather than expand into neighbors. Existing projects change only through explicit text edits/fit. Rendering and export share measured wrapping/height; don't claim unknown original typography is exact.
