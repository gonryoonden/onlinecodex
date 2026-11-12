# Unresolved text parity, not shipped
Attempts6/7/8 failed the same strict canvas/PNG comparison: changed pixels0.5185546875%, mean channel error0.6359109158, canvas ink bounds[121,128,436,186] versus PNG[121,128,436,187]. First-line ink right edge341 vs337. Therefore this is not reported as an exact rendering match.

The experiment loaded/fitted real glyphs and19 saved Gemini text candidates, then tried shared font loading/invalidation. The pixel discrepancy remained exactly unchanged. Root cause remains unresolved. Font-loading/typography changes were restored to the verified410d3c3 app snapshot; the experimental font fit19 success is NOT a delivered-feature claim.

The captured canvas/PNG are unmodified actual bitmaps. The test recipe is preserved as `editor-interaction.spec.txt` so this known failing experiment does not silently turn into a passing regression gate or break ordinary test discovery. It includes tests of experimental, now reverted APIs; restore the corresponding experiment before using the complete file, or isolate the bitmap comparison with explicitly set text dimensions/font.

The three failures count toward the user stop rule even though they had different investigation/hypothesis labels. No fourth implementation attempt is allowed without new direction. The delivered source is exactly410d3c3; see the final report for branch/report commits.
