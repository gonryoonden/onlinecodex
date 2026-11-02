# Vercel preview repair — 2026-11-02

The protected deployment rejected API requests because the local proxy guard did not recognize Vercel Authentication. A server-only opt-in now accepts only the exact configured HTTPS origin on the exact Vercel project. Keep Vercel Authentication enabled for ALL deployments. Never configure this mode on an unprotected deployment. Explicit bearer token configuration still takes precedence; Origin and cross-site checks remain active.

Required deployment variables: STUDIO_AUTH_MODE=vercel-protection, STUDIO_PROTECTED_PROJECT_ID=prj_fKRVXuFN59Sd3ySegT0OHww0q2De, STUDIO_ALLOWED_ORIGIN=https://personal-magic-studio-preview.vercel.app. VERCEL and VERCEL_PROJECT_ID are platform variables.

The existing sensitive GEMINI_API variable cannot be renamed through Vercel. The server accepts it as a fallback to GEMINI_API_KEY without reading or copying the secret. GEMINI_BILLING_TIER=free still requires operator confirmation. ENABLE_PAID_AI=false remains in effect.

Validation: 12 local Node guard tests passed, covering default denial, exact project/origin, spoofed forwarding headers, cross-origin/site denial, bearer precedence and local development. Full CI and deployed browser verification are pending. Python PPTX/background execution remains unverified on Vercel; do not claim full product completion.
