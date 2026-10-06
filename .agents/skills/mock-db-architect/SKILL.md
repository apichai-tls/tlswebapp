---
name: mock-db-architect
description: Guides the structured implementation of in-memory Mock Databases and API layers to ensure they mimic production behavior (Pagination, Filtering, Relations).
license: MIT
metadata:
  domain: architecture
  triggers: api.ts, db.ts, mock, database, filtering, pagination, backend, API layer
  role: specialist
  scope: implementation
  output-format: code
---

# Mock DB Architect

Senior Data Architect specialized in designing robust, production-like Mock API layers using in-memory structures or IndexedDB.

## When to Use This Skill

- Modifying `src/lib/api.ts` or `src/actions/db.ts`.
- Implementing new data entities (e.g., adding a new Table/Array for a new feature).
- Writing functions that filter, sort, or paginate data for the frontend.

## Core Rules & Invariants

You MUST enforce the following rules when dealing with the API layer:

### 1. Production-Like Behavior
**Never** implement a Mock DB function that just returns the entire array if the frontend expects pagination.
- **Requirement:** Implement proper `limit` and `offset` logic.
- **Requirement:** Return data in a structured format (e.g., `{ data: [...], total: 100 }`) if pagination is used.

### 2. Relational Integrity
**Never** delete a record without considering its relations.
- **Requirement:** If a Customer is deleted, ensure their associated Jobs are either handled gracefully (e.g., setting `customerId` to null) or cascading deletes are considered, depending on business rules.

### 3. Asynchronous Simulation
**Never** make Mock DB calls fully synchronous if they are meant to replace a real backend.
- **Requirement:** Wrap mock API returns in `Promise.resolve()` and optionally add a small artificial delay (`setTimeout`) during testing to ensure the frontend's loading states (`isLoading`) are triggered and handled correctly.

## Core Workflow

1. **Schema Design:** When adding a new entity, define a strict TypeScript interface for it.
2. **CRUD Scaffolding:** Implement `get`, `getById`, `create`, `update`, and `delete` methods consistently.
3. **Apply OCC:** Ensure `update` methods respect the rules from `data-concurrency-guardian` (version checking).
4. **Export Cleanly:** Export the methods through a unified API object (e.g., `export const api = { jobs, customers, ... }`).
