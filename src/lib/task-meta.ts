export interface TaskMetadata {
  department?: string | null;
  departmentLabel?: string | null;
  taskType?: string | null; // "general" | "accounting" | "complaint" | "feedback" | "operations" | "logistics"
  issueCategory?: string | null;
  affectedItem?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerMemberId?: string | null;
  billNo?: string | null;
  channel?: string | null;
  staffResponse?: string | null;
  isCustomerFeedback?: boolean | null;
}

export const TASK_META_NOTE_ID = "__task_meta__";

export function normalizeTaskPhone(phone?: string | null): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("66") && digits.length >= 10) {
    return "0" + digits.slice(2);
  }
  return digits;
}

export function extractTaskMetaFromNotesJson(notesJson?: string | null): TaskMetadata {
  if (!notesJson) return {};
  try {
    const parsed = JSON.parse(notesJson);
    if (!Array.isArray(parsed)) return {};
    const metaEntry = parsed.find(
      (n: any) => n && (n.type === "meta" || n.id === TASK_META_NOTE_ID) && n.meta
    );
    return metaEntry?.meta && typeof metaEntry.meta === "object" ? { ...metaEntry.meta } : {};
  } catch {
    return {};
  }
}

export function upsertTaskMetaInNotes<
  T extends {
    id: string;
    type?: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: string;
    meta?: TaskMetadata;
  }
>(notes: T[], meta?: TaskMetadata | null): T[] {
  const cleaned = Array.isArray(notes)
    ? notes.filter((n) => n && n.id !== TASK_META_NOTE_ID && n.type !== "meta")
    : [];

  if (!meta) return cleaned;

  const hasValue = Object.values(meta).some(
    (v) => v !== undefined && v !== null && String(v).trim() !== ""
  );
  if (!hasValue) return cleaned;

  const metaNote = {
    id: TASK_META_NOTE_ID,
    type: "meta",
    text: "",
    userId: "system",
    userName: "System",
    timestamp: new Date().toISOString(),
    meta,
  } as unknown as T;

  return [...cleaned, metaNote];
}

export function doesUserBelongToDepartment(
  user: { department?: string | null; role?: string | null; isActive?: boolean },
  deptKey: string
): boolean {
  if (!user || user.isActive === false || !deptKey) return false;
  const target = deptKey.trim().toLowerCase();
  const userDept = (user.department || "").trim().toLowerCase();
  const userRole = (user.role || "").trim().toLowerCase();

  if (userDept === target) return true;

  if (target === "accounting_cso" || target.includes("accounting") || target === "cso") {
    return (
      userDept === "accounting_cso" ||
      userDept === "accounting" ||
      userDept === "cso" ||
      userRole === "accounting" ||
      (!userDept && userRole === "cso")
    );
  }

  if (target === "branch_ops" || target.includes("branch") || target === "operations") {
    return userDept === "branch_ops" || (!userDept && userRole === "staff");
  }

  if (target === "logistics") {
    return userDept === "logistics" || (!userDept && userRole === "rider");
  }

  if (target === "management") {
    return (
      userDept === "management" ||
      (!userDept && (userRole === "admin" || userRole === "superadmin" || userRole === "manager"))
    );
  }

  return false;
}

export interface IssueCategoryPreset {
  id: string;
  label: string;
  labelTh: string;
  taskType: string;
  defaultPriority?: "low" | "medium" | "high" | "urgent";
  checklist?: string[];
  descriptionHint?: string;
}

export const DEPARTMENT_ISSUE_PRESETS: Record<string, IssueCategoryPreset[]> = {
  accounting_cso: [
    {
      id: "tax_invoice",
      label: "Tax Invoice / Receipt Issue",
      labelTh: "ออกใบกำกับภาษี / ใบเสร็จ",
      taskType: "accounting",
      defaultPriority: "medium",
      checklist: [
        "Verify Tax ID / Company billing details",
        "Verify payment amount and transfer channel",
        "Issue Tax Invoice / Receipt in accounting system",
        "Send document to customer",
      ],
      descriptionHint: "Specify Tax ID, billing name, invoice amount, and delivery email/WhatsApp...",
    },
    {
      id: "payment_slip_check",
      label: "Payment / Slip Verification",
      labelTh: "ตรวจสอบยอดโอน / สลิป",
      taskType: "accounting",
      defaultPriority: "high",
      checklist: [
        "Match transfer slip timestamp & amount with bank statement",
        "Update order / wallet payment status",
        "Notify branch / customer once verified",
      ],
      descriptionHint: "Describe transfer discrepancy, reference number, bank name, and expected amount...",
    },
    {
      id: "refund_wallet_adjust",
      label: "Refund / Wallet Adjustment",
      labelTh: "คืนเงิน / ปรับยอด Wallet",
      taskType: "accounting",
      defaultPriority: "high",
      checklist: [
        "Verify original transaction & customer wallet balance",
        "Obtain supervisor/accounting approval",
        "Execute refund or wallet adjustment and attach proof",
        "Confirm updated balance with customer",
      ],
      descriptionHint: "Explain reason for refund/credit adjustment, exact THB amount, and bank details if transfer...",
    },
    {
      id: "billing_discrepancy",
      label: "Billing / Price Discrepancy",
      labelTh: "ยอดบิลไม่ตรง / แก้ไขราคา",
      taskType: "accounting",
      defaultPriority: "medium",
      checklist: [
        "Review order items & customer price list / promo applied",
        "Recalculate invoice & inform CSO/Customer",
      ],
      descriptionHint: "Detail which item price, promo code, or member tier rate needs correction...",
    },
    {
      id: "petty_cash_expense",
      label: "Petty Cash / Vendor Settlement",
      labelTh: "เบิกเงินสดย่อย / เคลียร์บิล",
      taskType: "accounting",
      defaultPriority: "medium",
      checklist: [
        "Verify receipt / invoice attachment",
        "Approve or reconcile petty cash ledger",
      ],
      descriptionHint: "Include receipt number, vendor name, branch, and amount...",
    },
  ],
  complaint_crm: [
    {
      id: "garment_damage",
      label: "Damaged / Discolored Garment",
      labelTh: "ผ้าชำรุด / สีตก",
      taskType: "complaint",
      defaultPriority: "urgent",
      checklist: [
        "Contact customer promptly to acknowledge & collect photos",
        "Inspect garment at branch / washing station",
        "Confirm resolution (compensation / re-treatment / credit)",
        "Update customer & close CRM ticket",
      ],
      descriptionHint: "Describe the garment type, brand/color, exact damage/stain issue, and customer expectation...",
    },
    {
      id: "missing_item",
      label: "Missing / Swapped Item",
      labelTh: "ผ้าหาย / สลับถุง",
      taskType: "complaint",
      defaultPriority: "urgent",
      checklist: [
        "Review Checker Item Count & QC log for this order",
        "Check washing / ironing / packing stations & CCTV",
        "Arrange immediate return delivery or resolution",
      ],
      descriptionHint: "List missing garment(s), brand, color, and Checker Item Count details...",
    },
    {
      id: "rewash_quality",
      label: "Stain / Re-wash / Ironing Quality",
      labelTh: "คราบไม่สะอาด / แก้ไขงานรีด",
      taskType: "complaint",
      defaultPriority: "high",
      checklist: [
        "Schedule free pickup from customer for re-wash/re-iron",
        "Tag order priority & notify Washing/Ironing Dept",
        "Verify QC before delivery back to customer",
      ],
      descriptionHint: "Specify which garments need re-wash or re-ironing and pickup window...",
    },
    {
      id: "delivery_delay_service",
      label: "Late Pickup / Delivery / Rider Feedback",
      labelTh: "รับ-ส่งล่าช้า / ร้องเรียนบริการ",
      taskType: "complaint",
      defaultPriority: "high",
      checklist: [
        "Check dispatch & rider timeline for this order",
        "Follow up with rider and apologize / update ETA to customer",
      ],
      descriptionHint: "Note scheduled time vs actual arrival, rider name, and customer feedback...",
    },
    {
      id: "customer_feedback",
      label: "Special Care Note / Customer Feedback",
      labelTh: "คำแนะนำ / ความพึงพอใจลูกค้า",
      taskType: "feedback",
      defaultPriority: "medium",
      checklist: [
        "Record customer preference / feedback in CRM",
        "Share note with relevant branch & CSO team",
      ],
      descriptionHint: "Record positive feedback, detergent/scent preference, or future handling instructions...",
    },
  ],
  branch_ops: [
    {
      id: "qc_mismatch",
      label: "Item Count / QC Discrepancy",
      labelTh: "จำนวนผ้าไม่ตรง / ปัญหา QC",
      taskType: "operations",
      defaultPriority: "high",
      checklist: [
        "Re-count physical items against Checker list",
        "Confirm with customer before washing if mismatch persists",
      ],
      descriptionHint: "Specify expected count vs actual items found in bag...",
    },
    {
      id: "special_stain_care",
      label: "Delicate / Special Stain Handling",
      labelTh: "ผ้าบอบบาง / จัดการคราบพิเศษ",
      taskType: "operations",
      defaultPriority: "medium",
      checklist: [
        "Inspect care label & obtain customer approval if high risk",
        "Note detergent / temperature requirement for Washing Dept",
      ],
      descriptionHint: "Describe fabric type, stain location, and customer consent...",
    },
  ],
  logistics: [
    {
      id: "schedule_address_change",
      label: "Pickup/Delivery Reschedule or Address Change",
      labelTh: "เปลี่ยนเวลา / ที่อยู่รับ-ส่ง",
      taskType: "logistics",
      defaultPriority: "high",
      checklist: [
        "Update pickup/delivery address & time in Dispatch",
        "Notify assigned rider",
      ],
      descriptionHint: "Include new condo/room, Google Maps pin, or requested time slot...",
    },
    {
      id: "juristic_dropoff_issue",
      label: "Juristic / Lobby Access Issue",
      labelTh: "ปัญหานิติบุคคล / ฝากผ้า",
      taskType: "logistics",
      defaultPriority: "medium",
      checklist: [
        "Coordinate with customer / juristic office",
        "Upload drop-off or locker proof photo",
      ],
      descriptionHint: "Detail lobby rule, keycard/QR requirement, or contact person...",
    },
  ],
  management: [
    {
      id: "management_escalation",
      label: "Management Escalation / Approval",
      labelTh: "ขออนุมัติ / ยกระดับปัญหาผู้บริหาร",
      taskType: "general",
      defaultPriority: "high",
      checklist: [
        "Review incident summary & cost impact",
        "Approve resolution plan",
      ],
      descriptionHint: "Summarize escalation reason, customer history, and recommended approval...",
    },
  ],
};

export const FOLLOWUP_QUICK_REPLIES: string[] = [
  "Contacted customer & confirmed details",
  "Checked order / item count & updated team",
  "Accounting verification in progress",
  "Resolved & confirmed with customer",
  "Waiting for customer reply / photo",
];
