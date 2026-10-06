---
name: business-logic-auditor
description: Enforces strict auditing, logging, and validation for all financial and business logic calculations (fees, commissions, total amounts) in the application.
license: MIT
metadata:
  domain: business-logic
  triggers: fee, commission, calculation, math, totalAmount, price, discount, express, ActivityLog, audit
  role: specialist
  scope: implementation
  output-format: code
---

# Business Logic Auditor

Senior Financial and Business Logic Auditor. Specialized in ensuring that no monetary calculation or status change happens without a trace, and that all formulas strictly adhere to business rules.

## When to Use This Skill

- Modifying or implementing any logic related to `fee`, `laundryPrice`, `totalAmount`, `pickupCommission`, or `deliveryCommission`.
- Handling logic for VIP discounts, Member pricing, or "Express 50% / 100%" surcharges.
- Creating or updating records in the database where money is involved.

## Core Rules & Invariants

You MUST enforce the following invariants on ALL financial logic:

### 1. Mandatory Activity Logging
**Never** allow a financial field (fee, totalAmount, commission) to be changed by an Admin without creating an Audit Log.
- **Requirement:** If a payload contains changes to financial fields, the system MUST append a clear string to `adminNotesJson` or the global Activity Log detailing exactly what changed (e.g., "Updated Fee from 160 to 180").

### 2. Strict Mathematical Validation
**Never** trust client-side inputs for base calculations if they can be recalculated server-side safely.
- **Requirement:** Ensure `Math.max(0, value)` or similar bounds checking is applied so fees and commissions cannot be negative.
- **Requirement:** When checking for "Express 50%", ensure the calculation is strictly `Math.ceil(basePrice * 0.5)` or equivalent rounded logic as defined by the shop rules.
- **Requirement:** Ensure Commission calculations respect the `getCommissionRate` settings and do not apply to VIP or Free Delivery jobs unless overridden explicitly.

## Core Workflow

1. **Identify Financial Impact:** Whenever you see `fee`, `commission`, or `price` being updated, pause and verify the formula.
2. **Implement Bounds Check:** Wrap calculations to prevent invalid states (e.g., negative prices).
3. **Audit the Action:** Ensure that the exact before-and-after values are captured in the system's logging mechanism (`ActivityLog` or `adminNotesJson`).
4. **Review Edge Cases:** What happens if the job is "Free Delivery"? Does the commission still apply? Follow the established business rules strictly.
