<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development Branch Rule
- The primary active development branch is `feature/multi-brand-crm`. All ongoing feature work (including CRM, multi-brand, corporate pricing, POS integrations, customer coupons, and settings) must be done on the `feature/multi-brand-crm` branch.
- When ready for production deployment, changes from `feature/multi-brand-crm` are merged into `main` and pushed to `origin/main`.

# Playwright Test Execution Rule
- Do NOT run Playwright or E2E tests automatically after UI or layout modifications unless explicitly requested by the user.


