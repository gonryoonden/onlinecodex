# Automatic eligibility evidence
Consent authorizes external transmission only. It never proves segmentation/background quality.

Keep confidence >=.8, coverage .02..99, spill <=.15, structural alpha checks, protected candidate boxes, area/edge and atomic-write guards unchanged.

Automatic local flat replacement uses the existing full 2px ring with max channel deviation 10, <=1% outliers. Smooth directional reconstruction additionally requires P95 independent horizontal/vertical predictions to agree within 10 channels. A separate shading path requires chromatic exterior (median channel range >=20), disagreement P95 <=40, channel-difference spread P95 <=10, exterior gradient P99 <=10 and maximum <=40. This is bounded evidence for smooth shading, not ground-truth accuracy or a generic confidence threshold relaxation. Abrupt geometry, grayscale ambiguity and substantial texture stay in review. Background write still requires no neighbor conflict. Full rectangle native text repairs use the same bounded inpaint guard.

Mask semantic guard compares source pixels with transparent crop perimeter median; after 2px erosion, connected background-colored interior >=16px and >=2% of foreground blocks automatic writes. It catches known filled holes/leakage, cannot detect all wrong identities or missing parts. No topology is silently modified. Explicit user flat-key/brush corrections change pixels and are labeled manual.

A ready = verified local flat replacement. B warning = measured smooth approximation or explicit manual flat approximation, visible and editable. C review = concrete unresolved mask/repair issue, allocated layer hidden while original raster retains that object. Failed extraction tracked separately; merged/excluded candidates excluded from A/B/C counts. Original page/assets and undo retained. No checkbox upgrades a decision.

Known limitations: no complete annotated corpus; same-hue geometry, shadows, undetected/printed decorations and occlusion remain unproven. Observed ring agreement does not reveal hidden texture. Never call a model score or CPU/browser parity semantic accuracy.
