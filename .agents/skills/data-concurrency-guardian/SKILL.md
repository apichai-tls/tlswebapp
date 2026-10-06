---
name: data-concurrency-guardian
description: Enforces strict Field-Level Diffing and Optimistic Concurrency Control (OCC) across all CRM forms and API endpoints to prevent Stale Data Overwrites and Form Overwrite bugs.
license: MIT
metadata:
  domain: fullstack-security
  triggers: handleSave, handleEdit, updateCustomer, updateRider, API routes, database, form submission, React state, diffing
  role: specialist
  scope: implementation
  output-format: code
---

# Data Concurrency Guardian

Senior Full-Stack Architect specialized in distributed data integrity, concurrency, and preventing stale data overwrites in multi-user CRUD applications.

## When to Use This Skill

- Implementing or modifying any `handleSave`, `handleEdit`, or form submission logic in React.
- Modifying backend API endpoints or Database (DB) actions that update records.
- Building new Edit Modals (e.g., Customer, Rider, Settings).
- Refactoring existing forms that currently use "Fetch-Edit-Overwrite All" patterns.

## Core Rules & Invariants

You MUST enforce the following two invariants on ALL data update operations:

### 1. Client-Side: True Field-Level Diffing
**Never** send a complete `Partial<Entity>` payload containing unmodified fields back to the server. 
- **Requirement:** Forms MUST capture an initial snapshot (`initialFormStateRef`) upon loading.
- **Requirement:** During submission, diff the current form state against the `initialFormStateRef`.
- **Requirement:** Only send fields that evaluate to `true` under `current !== initial` strictly. If no fields changed, abort the API call.

### 2. Server-Side: Optimistic Concurrency Control (OCC)
**Never** blindly accept updates into the database.
- **Requirement:** All entities must track a `version` (integer) or a highly-precise `updatedAt` timestamp.
- **Requirement:** The Client payload must include the `version` (or timestamp) of the record *at the time it was opened for editing*.
- **Requirement:** The Backend API must compare the incoming `version` against the current DB `version`. 
- **Requirement:** If `incoming.version !== db.version`, throw a 409 Conflict Error to prevent overriding background updates.

## Core Workflow

1. **Analyze Form:** Check if the form currently sends the entire object. If so, flag it as vulnerable.
2. **Implement Snapshot:** Add `initialFormStateRef` and build the initial snapshot synchronously or via an immediate `useEffect` after dialog open.
3. **Refactor Payload:** Write a strict diffing loop in `handleSave` to isolate only intentionally changed fields.
4. **Enforce Versioning:** Ensure the API endpoint requires a `version` field.
5. **Backend Check:** In `src/actions/db.ts` or `src/lib/api.ts`, add the OCC check before applying the patch.
6. **Validate:** Verify that the frontend elegantly handles 409 Conflict Errors (e.g., via Toast notifications) and prompts the user to refresh.
