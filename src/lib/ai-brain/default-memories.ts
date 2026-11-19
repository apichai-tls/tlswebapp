export interface DefaultBrainMemorySeed {
  category:
    | "workflow"
    | "sop"
    | "department"
    | "branch"
    | "customer_pattern"
    | "pricing"
    | "correction";
  title: string;
  content: string;
  tags: string;
}

export const DEFAULT_BUSINESS_MEMORIES: DefaultBrainMemorySeed[] = [
  {
    category: "workflow",
    title: "End-to-End Order Lifecycle & Checker QC Return",
    content:
      "Orders flow through TBA -> Pending -> Pickup -> Billing -> Process (Washing / Dry Clean / Ironing / Packing departments) -> Checker QC -> Delivery -> Completed. Once all processing departments finish an order, every item returns to the Checker station for final item-count verification and QC before being released to Riders for delivery.",
    tags: "order-flow,checker,qc,delivery,departments",
  },
  {
    category: "department",
    title: "Department Ownership & Task Auto-Assignment",
    content:
      "Staff belong to departments (Management & IT, Accounting & CSO, Branch Operations, Logistics Fleet). Each processing department views its own queue and an employee clicks to claim/start work so ownership is tracked. On the Task Board, assigning a ticket to a department (such as Accounting & CSO) automatically assigns all active employees in that department.",
    tags: "departments,tasks,accounting,cso,ownership",
  },
  {
    category: "sop",
    title: "CSO Paid vs. Shop Paid & Billing Hygiene",
    content:
      "Every non-cancelled order should have a Bill issued (billNo / proforma), bill image sent to the customer, and payment reconciled between CSO Paid (isPaid) and Shop Paid (isShopPaid). Orders marked CSO Paid + Shop Unpaid or missing bill photos represent billing/reconciliation leaks that Accounting & CSO must follow up on.",
    tags: "billing,cso,accounting,payment,reconciliation",
  },
  {
    category: "customer_pattern",
    title: "Customer Complaints & Feedback CRM Recording",
    content:
      "Any customer complaint or feedback (shrinkage, stains, missing garments, delivery issues, special detergent/allergy notes) linked to an Order No. or Customer is recorded in both the Task Board and the Customer's CRM profile (including chat follow-ups and photo evidence) so branches can prevent repeat incidents.",
    tags: "crm,complaints,feedback,quality,retention",
  },
  {
    category: "branch",
    title: "Multi-Brand Operations (That Laundry Shop & NoName Laundry)",
    content:
      "The system operates multiple brands (that_laundry_shop and noname_laundry) across branches (e.g., 15 Sukhumvit, Phatthanakan, Pattaya, Online). Orders may be collected at one branch and processed at another processing hub before delivery.",
    tags: "multi-brand,branches,transfer,hub",
  },
];
