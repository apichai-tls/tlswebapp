<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# POS Development Branch Rule
- All modifications and development related to the POS system (including cashier shifts, checkout flows, receipt printing, and POS-related settings) must be done exclusively on the `feature/pos-new` branch. Never perform POS modifications directly on the `main` branch.

# Playwright Test Execution Rule
- Do NOT run Playwright or E2E tests automatically after UI or layout modifications unless explicitly requested by the user.


