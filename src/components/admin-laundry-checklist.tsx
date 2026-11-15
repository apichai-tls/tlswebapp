"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  Job,
  ShopLocation,
  jobStore,
  settingsStore,
} from "@/lib/store";
import { formatJobDisplayId } from "@/lib/utils";
import { ServiceItemVisual } from "@/components/service-item-visual";
import { useAuth } from "@/providers/auth-provider";
import { getUsers } from "@/actions/users";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Droplets,
  Shirt,
  PackageCheck,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Tag,
  Palette,
  Search,
  History,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Layers,
  UserCheck,
  Play,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export type ChecklistStage =
  | "checking"
  | "recheck_required"
  | "washing_verify"
  | "washing"
  | "ironing_verify"
  | "ironing"
  | "packing_verify"
  | "ready_for_delivery";

export type DepartmentStageKey = "checker" | "washing" | "ironing" | "delivery_prep";

export interface DepartmentAssignment {
  staffId?: string;
  staffName: string;
  staffEmail?: string;
  staffRole?: string;
  staffDepartment?: string;
  departmentStage: DepartmentStageKey;
  startedAt: string;
  completedAt?: string;
}

export interface StaffOperatorOption {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
}

export type GarmentTreatment = "wash_only" | "wash_iron" | "iron_only" | "dry_clean";

export interface ChecklistGarmentLine {
  id: string;
  garmentKey: string;
  name: string;
  nameTh: string;
  treatment?: GarmentTreatment;
  checkerQty: number;
  washerQty?: number | null;
  ironerQty?: number | null;
  packerQty?: number | null;
  brand?: string;
  color?: string;
  note?: string;
}

export interface ChecklistHistoryEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole?: string;
  department: string;
  action: string;
  totalPieces: number;
  note?: string;
}

export interface ChecklistDiscrepancyAlert {
  reportedBy: string;
  reportedAt: string;
  department: "washing" | "ironing" | "packing";
  reason: string;
  expectedTotal: number;
  countedTotal: number;
}

export interface JobLaundryChecklist {
  jobId: string;
  stage: ChecklistStage;
  requiresIroning: boolean;
  items: ChecklistGarmentLine[];
  discrepancyAlert?: ChecklistDiscrepancyAlert | null;
  activeAssignee?: DepartmentAssignment | null;
  departmentAssignees?: {
    checker?: DepartmentAssignment | null;
    washing?: DepartmentAssignment | null;
    ironing?: DepartmentAssignment | null;
    delivery_prep?: DepartmentAssignment | null;
  };
  history: ChecklistHistoryEntry[];
  updatedAt: string;
}

export function getStageDepartmentKey(stage: ChecklistStage): DepartmentStageKey {
  switch (stage) {
    case "checking":
    case "recheck_required":
      return "checker";
    case "washing_verify":
    case "washing":
      return "washing";
    case "ironing_verify":
    case "ironing":
      return "ironing";
    case "packing_verify":
    case "ready_for_delivery":
      return "delivery_prep";
  }
}

export function getDepartmentStageLabel(dept: DepartmentStageKey): {
  title: string;
  titleTh: string;
  route: string;
} {
  switch (dept) {
    case "checker":
      return {
        title: "1. Checker Dept",
        titleTh: "1. แผนกตรวจนับผ้า (Checker)",
        route: "/item-check/checker",
      };
    case "washing":
      return {
        title: "2. Washing Dept",
        titleTh: "2. แผนกซัก/อบ (Washing)",
        route: "/item-check/washing",
      };
    case "ironing":
      return {
        title: "3. Ironing Dept",
        titleTh: "3. แผนกรีดผ้า (Ironing)",
        route: "/item-check/ironing",
      };
    case "delivery_prep":
      return {
        title: "4. Checker Delivery Prep",
        titleTh: "4. Checker ตรวจนับเตรียมส่งไรเดอร์",
        route: "/item-check/delivery-prep",
      };
  }
}

/**
 * Shared hook to load active staff members and allow selecting/confirming
 * which employee is operating the current department station.
 */
export function useChecklistStaffDirectory(fallbackName?: string) {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState<StaffOperatorOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    try {
      const saved = localStorage.getItem("tls_active_dept_operator_id");
      if (saved) setSelectedStaffId(saved);
    } catch {}

    getUsers()
      .then((res) => {
        if (!mounted || !res?.success || !Array.isArray(res.data)) return;
        const activeUsers: StaffOperatorOption[] = res.data
          .filter((u: any) => u.isActive !== false && u.role !== "rider")
          .map((u: any) => ({
            id: String(u.id),
            name: String(u.name || u.email?.split("@")[0] || "Staff"),
            email: String(u.email || ""),
            role: String(u.role || "staff"),
            department: u.department ? String(u.department) : null,
          }));
        setStaffList(activeUsers);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const combinedOptions = useMemo(() => {
    const map = new Map<string, StaffOperatorOption>();
    if (user?.id) {
      map.set(String(user.id), {
        id: String(user.id),
        name: String(user.name || user.email?.split("@")[0] || fallbackName || "Staff"),
        email: String(user.email || ""),
        role: String(user.role || "staff"),
        department: user.department || null,
      });
    }
    for (const s of staffList) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [user, staffList, fallbackName]);

  const activeOperator: StaffOperatorOption = useMemo(() => {
    if (selectedStaffId) {
      const found = combinedOptions.find((o) => o.id === selectedStaffId);
      if (found) return found;
    }
    if (user?.id) {
      return {
        id: String(user.id),
        name: String(user.name || user.email?.split("@")[0] || fallbackName || "Staff"),
        email: String(user.email || ""),
        role: String(user.role || "staff"),
        department: user.department || null,
      };
    }
    return (
      combinedOptions[0] || {
        id: "staff_default",
        name: fallbackName || "Staff",
        email: "",
        role: "staff",
        department: null,
      }
    );
  }, [selectedStaffId, combinedOptions, user, fallbackName]);

  const selectOperator = (staffId: string) => {
    setSelectedStaffId(staffId);
    try {
      localStorage.setItem("tls_active_dept_operator_id", staffId);
    } catch {}
  };

  return {
    staffOptions: combinedOptions,
    activeOperator,
    selectOperator,
  };
}

/**
 * Helper to claim/start an order in its current department with the employee's user details.
 */
export async function claimAndStartChecklistOrder(
  job: Job,
  settings: Record<string, string>,
  operator: StaffOperatorOption,
  forcedDeptKey?: DepartmentStageKey
): Promise<JobLaundryChecklist> {
  const existing = parseJobChecklist(job, settings);
  const effectiveStage: ChecklistStage =
    existing?.stage ||
    (job.subStatus === "ready"
      ? "ready_for_delivery"
      : job.subStatus === "iron"
      ? "ironing"
      : job.subStatus === "wash"
      ? "washing"
      : "checking");

  const deptKey = forcedDeptKey || getStageDepartmentKey(effectiveStage);
  const deptMeta = getDepartmentStageLabel(deptKey);
  const nowIso = new Date().toISOString();

  const assignment: DepartmentAssignment = {
    staffId: operator.id,
    staffName: operator.name,
    staffEmail: operator.email,
    staffRole: operator.role,
    staffDepartment: operator.department || deptMeta.title,
    departmentStage: deptKey,
    startedAt: nowIso,
  };

  const totalPcs = (existing?.items || []).reduce(
    (sum, it) => sum + (Number(it.checkerQty) || 0),
    0
  );

  const entry: ChecklistHistoryEntry = {
    id: `h_${Date.now()}`,
    timestamp: nowIso,
    actorName: operator.name,
    actorRole: operator.department || operator.role,
    department: deptMeta.title,
    action: `▶️ Started Process — Managed by ${operator.name}${operator.department ? ` (${operator.department})` : ` (${operator.role})`}`,
    totalPieces: totalPcs,
  };

  const payload: JobLaundryChecklist = {
    jobId: job.id,
    stage: effectiveStage,
    requiresIroning: existing ? existing.requiresIroning : detectJobRequiresIroning(job),
    items: existing?.items || [],
    discrepancyAlert: existing?.discrepancyAlert || null,
    activeAssignee: assignment,
    departmentAssignees: {
      ...(existing?.departmentAssignees || {}),
      [deptKey]: assignment,
    },
    history: [entry, ...(existing?.history || [])],
    updatedAt: nowIso,
  };

  await settingsStore.updateSetting(
    getChecklistSettingKey(job.id),
    JSON.stringify(payload)
  );

  return payload;
}

export interface PresetGarment {
  key: string;
  name: string;
  nameTh: string;
  visualHint: string;
  group: "tops" | "bottoms" | "innerwear" | "bedding" | "other";
}

export const PRESET_GARMENTS: PresetGarment[] = [
  { key: "polo", name: "Polo", nameTh: "เสื้อโปโล", visualHint: "POLO SHIRT", group: "tops" },
  { key: "tshirt", name: "T-Shirt", nameTh: "เสื้อยืด", visualHint: "T-SHIRT", group: "tops" },
  { key: "shirt", name: "Shirt", nameTh: "เสื้อเชิ้ต", visualHint: "SHIRT", group: "tops" },
  { key: "blouse", name: "Blouse", nameTh: "เสื้อแฟชั่นหญิง", visualHint: "BLOUSE", group: "tops" },
  { key: "jacket", name: "Jacket / Hoodie", nameTh: "เสื้อคลุม / ฮู้ด", visualHint: "JACKET", group: "tops" },
  { key: "sweater", name: "Sweater", nameTh: "เสื้อกันหนาว", visualHint: "SWEATER", group: "tops" },
  { key: "suit", name: "Suit / Blazer", nameTh: "สูท / เบลเซอร์", visualHint: "SUIT", group: "tops" },

  { key: "shorts", name: "Shorts", nameTh: "กางเกงขาสั้น", visualHint: "SHORTS", group: "bottoms" },
  { key: "trousers", name: "Trousers / Pants", nameTh: "กางเกงขายาว / สแล็ค", visualHint: "TROUSERS", group: "bottoms" },
  { key: "jeans", name: "Jeans", nameTh: "กางเกงยีนส์", visualHint: "JEANS", group: "bottoms" },
  { key: "skirt", name: "Skirt", nameTh: "กระโปรง", visualHint: "SKIRT", group: "bottoms" },
  { key: "dress", name: "Dress / Jumpsuit", nameTh: "ชุดเดรส / จั๊มสูท", visualHint: "DRESS", group: "bottoms" },

  { key: "underwear", name: "Underwear", nameTh: "กางเกงชั้นใน", visualHint: "SHORT", group: "innerwear" },
  { key: "bra", name: "Bra / Sports Bra", nameTh: "ชุดชั้นใน (บรา)", visualHint: "DRESS", group: "innerwear" },
  { key: "socks", name: "Socks", nameTh: "ถุงเท้า (คู่)", visualHint: "SOCKS", group: "innerwear" },
  { key: "socks_single", name: "1-Side Sock", nameTh: "ถุงเท้า (1 ข้าง)", visualHint: "1-SIDE SOCK", group: "innerwear" },
  { key: "pajamas", name: "Pajamas / Sleepwear", nameTh: "ชุดนอน", visualHint: "SHIRT", group: "innerwear" },
  { key: "singlet", name: "Singlet / Tank Top", nameTh: "เสื้อกล้าม / ซับใน", visualHint: "T-SHIRT", group: "innerwear" },

  { key: "towel", name: "Bath Towel", nameTh: "ผ้าเช็ดตัว", visualHint: "BATH TOWEL", group: "bedding" },
  { key: "hand_towel", name: "Hand / Face Towel", nameTh: "ผ้าเช็ดหน้า / ผม", visualHint: "TOWEL", group: "bedding" },
  { key: "bedsheet", name: "Bed Sheet", nameTh: "ผ้าปูที่นอน", visualHint: "BED SHEET", group: "bedding" },
  { key: "pillowcase", name: "Pillow Case", nameTh: "ปลอกหมอน", visualHint: "PILLOW", group: "bedding" },
  { key: "duvet", name: "Duvet / Blanket", nameTh: "ผ้านวม / ผ้าห่ม", visualHint: "DUVET", group: "bedding" },

  { key: "scarf", name: "Scarf / Neck Tie", nameTh: "ผ้าพันคอ / เนคไท", visualHint: "NECK TIE", group: "other" },
  { key: "cap", name: "Cap / Hat / Bag", nameTh: "หมวก / กระเป๋าผ้า", visualHint: "BAG", group: "other" },
];

export const COLOR_SWATCHES: { label: string; labelTh: string; dotClass: string }[] = [
  { label: "White", labelTh: "ขาว", dotClass: "bg-white border border-slate-300" },
  { label: "Black", labelTh: "ดำ", dotClass: "bg-slate-900" },
  { label: "Grey", labelTh: "เทา", dotClass: "bg-slate-400" },
  { label: "Navy", labelTh: "กรมท่า", dotClass: "bg-indigo-950" },
  { label: "Blue", labelTh: "ฟ้า/น้ำเงิน", dotClass: "bg-blue-500" },
  { label: "Red", labelTh: "แดง", dotClass: "bg-rose-600" },
  { label: "Pink", labelTh: "ชมพู", dotClass: "bg-pink-400" },
  { label: "Green", labelTh: "เขียว", dotClass: "bg-emerald-500" },
  { label: "Yellow", labelTh: "เหลือง", dotClass: "bg-amber-400" },
  { label: "Beige/Brown", labelTh: "ครีม/น้ำตาล", dotClass: "bg-amber-700" },
  { label: "Purple", labelTh: "ม่วง", dotClass: "bg-purple-500" },
  { label: "Multi/Stripe", labelTh: "หลากสี/ลาย", dotClass: "bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500" },
];

export const POPULAR_BRANDS: string[] = [
  "Uniqlo",
  "Zara",
  "H&M",
  "Nike",
  "Adidas",
  "Lacoste",
  "Polo Ralph Lauren",
  "Muji",
  "Wacoal",
  "Sabina",
  "Calvin Klein",
  "Levi's",
  "GQ",
  "Arrow",
  "CPS",
  "Jaspal",
  "Lululemon",
  "Under Armour",
];

export const TREATMENT_OPTIONS: {
  id: GarmentTreatment;
  icon: string;
  label: string;
  labelTh: string;
  badgeClass: string;
  activeBtnClass: string;
}[] = [
  {
    id: "wash_only",
    icon: "🧺",
    label: "Wash Only",
    labelTh: "ซักพับ (ไม่รีด)",
    badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
    activeBtnClass: "bg-sky-600 text-white border-sky-600 shadow-xs",
  },
  {
    id: "wash_iron",
    icon: "👕",
    label: "Wash & Iron",
    labelTh: "ซักรีด",
    badgeClass: "bg-indigo-100 text-indigo-900 border-indigo-300",
    activeBtnClass: "bg-indigo-600 text-white border-indigo-600 shadow-xs",
  },
  {
    id: "iron_only",
    icon: "🔥",
    label: "Iron Only",
    labelTh: "รีดอย่างเดียว",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    activeBtnClass: "bg-amber-600 text-white border-amber-600 shadow-xs",
  },
  {
    id: "dry_clean",
    icon: "✨",
    label: "Dry Clean",
    labelTh: "ซักแห้ง",
    badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
    activeBtnClass: "bg-purple-600 text-white border-purple-600 shadow-xs",
  },
];

export function getTreatmentMeta(treatment?: GarmentTreatment) {
  return (
    TREATMENT_OPTIONS.find((t) => t.id === (treatment || "wash_only")) ||
    TREATMENT_OPTIONS[0]
  );
}

export function detectDefaultTreatment(job?: Job | null): GarmentTreatment {
  if (!job) return "wash_only";
  if (job.serviceType === "wash_iron_fold" || job.serviceType === "wash_iron_hanger") {
    return "wash_iron";
  }
  if (Array.isArray(job.items) && job.items.length > 0) {
    const names = job.items.map((it) => `${it.name || ""} ${it.nameEn || ""}`.toUpperCase()).join(" ");
    if (names.includes("DRY CLEAN") || names.includes("DRY-CLEAN") || names.includes("ซักแห้ง")) {
      return "dry_clean";
    }
    if (names.includes("WASH/IRON") || names.includes("WASH & IRON")) {
      return "wash_iron";
    }
    if (names.includes("IRON") && !names.includes("WASH")) {
      return "iron_only";
    }
  }
  return "wash_only";
}

export function detectJobRequiresIroning(job?: Job | null): boolean {
  if (!job) return false;
  if (job.serviceType === "wash_iron_fold" || job.serviceType === "wash_iron_hanger") {
    return true;
  }
  if (Array.isArray(job.laundryTypes)) {
    const joined = job.laundryTypes.join(" ").toUpperCase();
    if (joined.includes("IRON") || joined.includes("HANGER") || joined.includes("DRY")) {
      return true;
    }
  }
  if (Array.isArray(job.items)) {
    for (const it of job.items) {
      const n = `${it.name || ""} ${it.nameEn || ""}`.toUpperCase();
      if (n.includes("IRON") || n.includes("HANGER") || n.includes("DRY CLEAN")) {
        return true;
      }
    }
  }
  return false;
}

export function getChecklistSettingKey(jobId: string): string {
  return `job_checklist:${jobId}`;
}

export function parseJobChecklist(
  job: Job | null | undefined,
  settings: Record<string, string> | null | undefined
): JobLaundryChecklist | null {
  if (!job?.id || !settings) return null;
  const raw = settings[getChecklistSettingKey(job.id)];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      jobId: job.id,
      stage: parsed.stage || "checking",
      requiresIroning:
        typeof parsed.requiresIroning === "boolean"
          ? parsed.requiresIroning
          : detectJobRequiresIroning(job),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      discrepancyAlert: parsed.discrepancyAlert || null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getStageMeta(stage: ChecklistStage): {
  label: string;
  labelTh: string;
  badgeClass: string;
  stepIndex: number;
} {
  switch (stage) {
    case "recheck_required":
      return {
        label: "Recheck Required!",
        labelTh: "ส่งกลับให้นับใหม่!",
        badgeClass: "bg-rose-600 text-white border-rose-700 animate-pulse",
        stepIndex: 0,
      };
    case "checking":
      return {
        label: "1. Checker Counting",
        labelTh: "1. จุดตรวจนับผ้า (Checker)",
        badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
        stepIndex: 0,
      };
    case "washing_verify":
      return {
        label: "2. Washing Counter-Check",
        labelTh: "2. แผนกซักตรวจนับซ้ำ",
        badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
        stepIndex: 1,
      };
    case "washing":
      return {
        label: "2. Washing in Progress",
        labelTh: "2. กำลังซัก/อบ",
        badgeClass: "bg-blue-600 text-white border-blue-700",
        stepIndex: 1,
      };
    case "ironing_verify":
      return {
        label: "3. Ironing Counter-Check",
        labelTh: "3. แผนกรีดตรวจนับซ้ำ",
        badgeClass: "bg-violet-100 text-violet-900 border-violet-300",
        stepIndex: 2,
      };
    case "ironing":
      return {
        label: "3. Ironing in Progress",
        labelTh: "3. กำลังรีดผ้า",
        badgeClass: "bg-indigo-600 text-white border-indigo-700",
        stepIndex: 2,
      };
    case "packing_verify":
      return {
        label: "4. Back to Checker (Delivery Prep)",
        labelTh: "4. ส่งกลับ Checker (ตรวจนับเตรียมส่ง)",
        badgeClass: "bg-teal-100 text-teal-900 border-teal-300",
        stepIndex: 3,
      };
    case "ready_for_delivery":
      return {
        label: "Ready for Delivery Rider",
        labelTh: "Checker เตรียมพร้อมส่งไรเดอร์",
        badgeClass: "bg-emerald-600 text-white border-emerald-700",
        stepIndex: 4,
      };
  }
}

export interface LaundryChecklistWorkspaceProps {
  job: Job | null;
  actorName?: string;
  onSubStatusChange?: (newSubStatus: "billing" | "wash" | "dry" | "iron" | "ready") => void;
  isStandalonePage?: boolean;
  onBackToQueue?: () => void;
}

export function LaundryChecklistWorkspace({
  job,
  actorName = "Staff",
  onSubStatusChange,
  isStandalonePage = false,
  onBackToQueue,
}: LaundryChecklistWorkspaceProps) {
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );

  const { staffOptions, activeOperator, selectOperator } = useChecklistStaffDirectory(actorName);
  const currentActorName = activeOperator.name || actorName;
  const currentActorRole = activeOperator.department || activeOperator.role || "Staff";

  const savedChecklist = useMemo(
    () => parseJobChecklist(job, settings),
    [job, settings]
  );

  const [draftChecklist, setDraftChecklist] = useState<JobLaundryChecklist | null>(null);
  const [activeTreatment, setActiveTreatment] = useState<GarmentTreatment>(() =>
    detectDefaultTreatment(job)
  );
  const [selectedGroup, setSelectedGroup] = useState<"all" | "tops" | "bottoms" | "innerwear" | "bedding" | "other">("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [customItemName, setCustomItemName] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [showDiscrepancyBox, setShowDiscrepancyBox] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Sync draft state when opening or switching jobs
  React.useEffect(() => {
    if (!job) {
      setDraftChecklist(null);
      return;
    }
    setActiveTreatment(detectDefaultTreatment(job));
    if (savedChecklist) {
      setDraftChecklist(savedChecklist);
    } else {
      setDraftChecklist({
        jobId: job.id,
        stage: "checking",
        requiresIroning: detectJobRequiresIroning(job),
        items: [],
        discrepancyAlert: null,
        history: [],
        updatedAt: new Date().toISOString(),
      });
    }
    setShowDiscrepancyBox(false);
    setDiscrepancyReason("");
  }, [job?.id, savedChecklist]);

  if (!job || !draftChecklist) return null;

  const defaultJobTreatment = detectDefaultTreatment(job);

  const totalCheckerPieces = draftChecklist.items.reduce(
    (sum, it) => sum + (Number(it.checkerQty) || 0),
    0
  );

  const treatmentSummary = draftChecklist.items.reduce(
    (acc, it) => {
      const t: GarmentTreatment = it.treatment || defaultJobTreatment;
      const qty = Number(it.checkerQty) || 0;
      acc[t] = (acc[t] || 0) + qty;
      return acc;
    },
    { wash_only: 0, wash_iron: 0, iron_only: 0, dry_clean: 0 } as Record<GarmentTreatment, number>
  );

  const ironOrDryCleanPieces =
    treatmentSummary.wash_iron + treatmentSummary.iron_only + treatmentSummary.dry_clean;
  const anyNeedsIroning = ironOrDryCleanPieces > 0 || draftChecklist.requiresIroning;
  const allAreIronOnly =
    totalCheckerPieces > 0 && treatmentSummary.iron_only === totalCheckerPieces;

  const isCheckerEditable =
    draftChecklist.stage === "checking" || draftChecklist.stage === "recheck_required";

  const activeVerifyRole: "washer" | "ironer" | "packer" | null =
    draftChecklist.stage === "washing_verify"
      ? "washer"
      : draftChecklist.stage === "ironing_verify"
      ? "ironer"
      : draftChecklist.stage === "packing_verify"
      ? "packer"
      : null;

  const totalVerifiedPieces = draftChecklist.items.reduce((sum, it) => {
    if (activeVerifyRole === "washer") return sum + (Number(it.washerQty ?? it.checkerQty) || 0);
    if (activeVerifyRole === "ironer") return sum + (Number(it.ironerQty ?? it.checkerQty) || 0);
    if (activeVerifyRole === "packer") return sum + (Number(it.packerQty ?? it.checkerQty) || 0);
    return sum + (Number(it.checkerQty) || 0);
  }, 0);

  const hasCountMismatch =
    activeVerifyRole !== null &&
    draftChecklist.items.some((it) => {
      const target =
        activeVerifyRole === "washer"
          ? it.washerQty ?? it.checkerQty
          : activeVerifyRole === "ironer"
          ? it.ironerQty ?? it.checkerQty
          : it.packerQty ?? it.checkerQty;
      return target !== it.checkerQty;
    });

  const persistChecklist = async (
    next: JobLaundryChecklist,
    syncJobSubStatus?: "billing" | "wash" | "dry" | "iron" | "ready",
    toastMsg?: string
  ) => {
    setIsSaving(true);
    try {
      const payload: JobLaundryChecklist = {
        ...next,
        updatedAt: new Date().toISOString(),
      };
      setDraftChecklist(payload);
      await settingsStore.updateSetting(
        getChecklistSettingKey(job.id),
        JSON.stringify(payload)
      );
      if (syncJobSubStatus) {
        onSubStatusChange?.(syncJobSubStatus);
        await jobStore.updateJob(job.id, { subStatus: syncJobSubStatus }).catch(() => {});
      }
      if (toastMsg) toast.success(toastMsg);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save checklist");
    } finally {
      setIsSaving(false);
    }
  };

  const computeRequiresIroningFromItems = (items: ChecklistGarmentLine[]) =>
    items.some((it) => {
      const t = it.treatment || defaultJobTreatment;
      return t === "wash_iron" || t === "iron_only" || t === "dry_clean";
    });

  const handleTapPresetGarment = (preset: PresetGarment) => {
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      // Find existing generic line for this garment AND activeTreatment (without custom brand/color)
      const existingIdx = prev.items.findIndex(
        (it) =>
          it.garmentKey === preset.key &&
          (it.treatment || defaultJobTreatment) === activeTreatment &&
          !it.brand &&
          !it.color
      );
      let nextItems = [...prev.items];
      if (existingIdx >= 0) {
        const target = nextItems[existingIdx];
        nextItems[existingIdx] = {
          ...target,
          treatment: activeTreatment,
          checkerQty: (target.checkerQty || 0) + 1,
        };
      } else {
        nextItems.push({
          id: `${preset.key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          garmentKey: preset.key,
          name: preset.name,
          nameTh: preset.nameTh,
          treatment: activeTreatment,
          checkerQty: 1,
        });
      }
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
  };

  const handleAddCustomGarment = () => {
    const trimmed = customItemName.trim();
    if (!trimmed) return;
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      const nextItems: ChecklistGarmentLine[] = [
        ...prev.items,
        {
          id: `custom_${Date.now()}`,
          garmentKey: "custom",
          name: trimmed,
          nameTh: trimmed,
          treatment: activeTreatment,
          checkerQty: 1,
        },
      ];
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
    setCustomItemName("");
  };

  const handleImportInvoiceItems = () => {
    if (!Array.isArray(job.items) || job.items.length === 0) {
      toast.info("No invoice items found on this order yet.");
      return;
    }
    const pieceItems = job.items.filter(
      (it) =>
        it.unit !== "kg" &&
        !String(it.name || "").toUpperCase().includes("DELIVERY") &&
        !String(it.name || "").toUpperCase().includes("WASH/FOLD") &&
        !String(it.name || "").toUpperCase().includes("WASH/IRON")
    );
    if (pieceItems.length === 0) {
      toast.info("Invoice only contains KILO / Delivery items — tap garment icons below to count individual pieces.");
      return;
    }
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      for (const inv of pieceItems) {
        const upperName = `${inv.name || ""} ${inv.nameEn || ""}`.toUpperCase();
        const inferredTreatment: GarmentTreatment =
          upperName.includes("DRY") || upperName.includes("ซักแห้ง")
            ? "dry_clean"
            : upperName.includes("IRON") && !upperName.includes("WASH")
            ? "iron_only"
            : upperName.includes("IRON") || upperName.includes("HANGER")
            ? "wash_iron"
            : activeTreatment;

        const existingIdx = nextItems.findIndex(
          (x) =>
            x.name.toUpperCase() === String(inv.name).toUpperCase() &&
            (x.treatment || defaultJobTreatment) === inferredTreatment &&
            !x.brand &&
            !x.color
        );
        if (existingIdx >= 0) {
          nextItems[existingIdx] = {
            ...nextItems[existingIdx],
            treatment: inferredTreatment,
            checkerQty: Math.max(nextItems[existingIdx].checkerQty, Number(inv.quantity) || 1),
          };
        } else {
          nextItems.push({
            id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            garmentKey: inv.name.toLowerCase(),
            name: inv.name,
            nameTh: inv.nameEn || inv.name,
            treatment: inferredTreatment,
            checkerQty: Number(inv.quantity) || 1,
          });
        }
      }
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
    toast.success(`Imported ${pieceItems.length} garment lines from invoice`);
  };

  const handleDuplicateVariantRow = (row: ChecklistGarmentLine) => {
    const newId = `${row.garmentKey}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      const idx = prev.items.findIndex((x) => x.id === row.id);
      const nextItems = [...prev.items];
      const copyRow: ChecklistGarmentLine = {
        ...row,
        id: newId,
        treatment: row.treatment || activeTreatment,
        checkerQty: 1,
        brand: "",
        color: "",
        note: "",
      };
      nextItems.splice(idx + 1, 0, copyRow);
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
    setExpandedRowId(newId);
  };

  const updateRowField = (rowId: string, patch: Partial<ChecklistGarmentLine>) => {
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items
        .map((it) => (it.id === rowId ? { ...it, ...patch } : it))
        .filter((it) => it.checkerQty > 0);
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
  };

  const removeRow = (rowId: string) => {
    setDraftChecklist((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.filter((it) => it.id !== rowId);
      return {
        ...prev,
        requiresIroning: computeRequiresIroningFromItems(nextItems),
        items: nextItems,
      };
    });
  };

  // Stage transition & Employee Ownership actions
  const currentDeptKey = getStageDepartmentKey(draftChecklist.stage);
  const currentDeptMeta = getDepartmentStageLabel(currentDeptKey);
  const currentDeptAssignee = draftChecklist.departmentAssignees?.[currentDeptKey] || null;
  const isCurrentDeptStartedBySomeone = Boolean(
    draftChecklist.activeAssignee &&
      draftChecklist.activeAssignee.departmentStage === currentDeptKey
  );

  const buildCurrentAssignee = (completed = false): DepartmentAssignment => {
    const existingStart =
      currentDeptAssignee?.startedAt ||
      (draftChecklist.activeAssignee?.departmentStage === currentDeptKey
        ? draftChecklist.activeAssignee.startedAt
        : new Date().toISOString());
    return {
      staffId: activeOperator.id,
      staffName: currentActorName,
      staffEmail: activeOperator.email,
      staffRole: activeOperator.role,
      staffDepartment: activeOperator.department || currentDeptMeta.title,
      departmentStage: currentDeptKey,
      startedAt: existingStart,
      ...(completed ? { completedAt: new Date().toISOString() } : {}),
    };
  };

  const handleStartManagingOrderInDept = async () => {
    const assignment = buildCurrentAssignee(false);
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: currentDeptMeta.title,
      action: `▶️ Started Process — Managed by ${currentActorName} (${currentActorRole})`,
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        activeAssignee: assignment,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          [currentDeptKey]: assignment,
        },
        history: [entry, ...draftChecklist.history],
      },
      undefined,
      `${currentActorName} is now managing this order in ${currentDeptMeta.title}!`
    );
  };

  const handlePassToWashing = async () => {
    if (draftChecklist.items.length === 0 || totalCheckerPieces <= 0) {
      toast.error("Please count at least 1 laundry item before passing onwards.");
      return;
    }
    const routeDirectToIroning = allAreIronOnly;
    const nextStage: ChecklistStage = routeDirectToIroning ? "ironing_verify" : "washing_verify";
    const initializedItems = draftChecklist.items.map((it) => ({
      ...it,
      treatment: it.treatment || defaultJobTreatment,
      washerQty: it.checkerQty,
      ...(routeDirectToIroning ? { ironerQty: it.checkerQty } : {}),
    }));
    const completedCheckerAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(true),
      departmentStage: "checker",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Checker",
      action: routeDirectToIroning
        ? "Counted Iron-Only Items → Auto-Routed Directly to Ironing Dept"
        : draftChecklist.stage === "recheck_required"
        ? "Recounted & Sent Back to Washing Dept"
        : "Counted Items & Passed to Washing Dept",
      totalPieces: totalCheckerPieces,
    };
    setExpandedRowId(null);
    await persistChecklist(
      {
        ...draftChecklist,
        requiresIroning: anyNeedsIroning,
        stage: nextStage,
        items: initializedItems,
        discrepancyAlert: null,
        activeAssignee: null,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          checker: completedCheckerAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      routeDirectToIroning ? "iron" : undefined,
      routeDirectToIroning
        ? `All ${totalCheckerPieces} pcs are Iron Only — sent directly to Ironing Department!`
        : `Checklist (${totalCheckerPieces} pcs) passed to Washing Department!`
    );
  };

  const handleVerifyAndStartWashing = async () => {
    const verifiedItems = draftChecklist.items.map((it) => ({
      ...it,
      washerQty: it.checkerQty,
    }));
    const washerAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(false),
      departmentStage: "washing",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Washing Dept",
      action: `Verified Count Matches Checker — Washing Started by ${currentActorName}`,
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        stage: "washing",
        items: verifiedItems,
        discrepancyAlert: null,
        activeAssignee: washerAssignee,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          washing: washerAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      "wash",
      `Washing started by ${currentActorName} (${totalCheckerPieces} pcs verified)!`
    );
  };

  const handleReturnToCheckerForRecheck = async (dept: "washing" | "ironing" | "packing") => {
    const mismatchedLines = draftChecklist.items
      .filter((it) => {
        const actual =
          dept === "washing"
            ? it.washerQty ?? it.checkerQty
            : dept === "ironing"
            ? it.ironerQty ?? it.checkerQty
            : it.packerQty ?? it.checkerQty;
        return actual !== it.checkerQty;
      })
      .map((it) => {
        const actual =
          dept === "washing"
            ? it.washerQty ?? it.checkerQty
            : dept === "ironing"
            ? it.ironerQty ?? it.checkerQty
            : it.packerQty ?? it.checkerQty;
        return `${it.name}: Checker=${it.checkerQty}, Counted=${actual}`;
      });

    const reasonText =
      discrepancyReason.trim() ||
      (mismatchedLines.length > 0
        ? `Count mismatch (${mismatchedLines.join("; ")})`
        : "Item count discrepancy — returned basket & checklist to Checker for recount");

    const deptLabel =
      dept === "washing" ? "Washing Dept" : dept === "ironing" ? "Ironing Dept" : "Checker (Final Delivery Prep)";

    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: deptLabel,
      action: "⚠️ Returned Checklist & Laundry to Checker for Recheck",
      totalPieces: totalVerifiedPieces,
      note: reasonText,
    };

    await persistChecklist(
      {
        ...draftChecklist,
        stage: "recheck_required",
        activeAssignee: null,
        discrepancyAlert: {
          reportedBy: currentActorName,
          reportedAt: new Date().toISOString(),
          department: dept,
          reason: reasonText,
          expectedTotal: totalCheckerPieces,
          countedTotal: totalVerifiedPieces,
        },
        history: [entry, ...draftChecklist.history],
      },
      "billing",
      "Returned checklist & laundry load to Checker for recheck!"
    );
    setShowDiscrepancyBox(false);
    setDiscrepancyReason("");
  };

  const handleFinishWashingPassNext = async (sendToIroning: boolean) => {
    const nextStage: ChecklistStage = sendToIroning ? "ironing_verify" : "packing_verify";
    const nextItems = draftChecklist.items.map((it) =>
      sendToIroning
        ? { ...it, ironerQty: it.checkerQty }
        : { ...it, packerQty: it.checkerQty }
    );
    const completedWasherAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(true),
      departmentStage: "washing",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Washing Dept",
      action: sendToIroning
        ? "Washing Completed → Passed to Ironing Dept"
        : "Washing Completed (No Ironing) → Returned All Items to Checker to Prepare for Delivery",
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        requiresIroning: sendToIroning,
        stage: nextStage,
        items: nextItems,
        activeAssignee: null,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          washing: completedWasherAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      sendToIroning ? "iron" : "dry",
      sendToIroning
        ? "Sent to Ironing Department!"
        : "All items returned to Checker to prepare for delivery!"
    );
  };

  const handleVerifyAndStartIroning = async () => {
    const verifiedItems = draftChecklist.items.map((it) => ({
      ...it,
      ironerQty: it.checkerQty,
    }));
    const ironerAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(false),
      departmentStage: "ironing",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Ironing Dept",
      action: `Verified Count — Ironing Started by ${currentActorName}`,
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        stage: "ironing",
        items: verifiedItems,
        activeAssignee: ironerAssignee,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          ironing: ironerAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      "iron",
      `Ironing count verified & started by ${currentActorName}!`
    );
  };

  const handleFinishIroningPassToPacking = async () => {
    const nextItems = draftChecklist.items.map((it) => ({
      ...it,
      packerQty: it.checkerQty,
    }));
    const completedIronerAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(true),
      departmentStage: "ironing",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Ironing Dept",
      action: "All Departments Finished → Returned All Items to Checker to Prepare for Delivery",
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        stage: "packing_verify",
        items: nextItems,
        activeAssignee: null,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          ironing: completedIronerAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      undefined,
      "All items returned to Checker to prepare for delivery!"
    );
  };

  const handleConfirmFinalPackingReady = async () => {
    const verifiedItems = draftChecklist.items.map((it) => ({
      ...it,
      packerQty: it.checkerQty,
    }));
    const completedPrepAssignee: DepartmentAssignment = {
      ...buildCurrentAssignee(true),
      departmentStage: "delivery_prep",
    };
    const entry: ChecklistHistoryEntry = {
      id: `h_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorName: currentActorName,
      actorRole: currentActorRole,
      department: "Checker (Delivery Prep)",
      action: `✅ Checker Final Count Verified by ${currentActorName} — Prepared & Ready for Delivery Rider`,
      totalPieces: totalCheckerPieces,
    };
    await persistChecklist(
      {
        ...draftChecklist,
        stage: "ready_for_delivery",
        items: verifiedItems,
        discrepancyAlert: null,
        activeAssignee: completedPrepAssignee,
        departmentAssignees: {
          ...(draftChecklist.departmentAssignees || {}),
          delivery_prep: completedPrepAssignee,
        },
        history: [entry, ...draftChecklist.history],
      },
      "ready",
      `Checker (${currentActorName}) verified all ${totalCheckerPieces} pcs — Order prepared & Ready for Delivery Riders!`
    );
  };

  const stageMeta = getStageMeta(draftChecklist.stage);
  const filteredPresets = PRESET_GARMENTS.filter(
    (g) => selectedGroup === "all" || g.group === selectedGroup
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200 shrink-0">
        <div className={`flex flex-wrap items-center justify-between gap-3 ${!isStandalonePage ? "pr-6" : ""}`}>
          <div className="flex items-center gap-3">
            {isStandalonePage && onBackToQueue && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBackToQueue}
                className="h-9 px-3 text-xs font-bold gap-1.5 border-slate-300"
              >
                ← Queue
              </Button>
            )}
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 flex flex-wrap items-center gap-2">
                <span>Laundry Item Count & Department Handoff</span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {job.billNo || formatJobDisplayId(job.id)}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Customer: <strong className="text-slate-800">{job.customerName || "Walk-in"}</strong>
                {job.weight ? ` • Weight: ${job.weight} kg` : ""}
                {" • "}Total Counted:{" "}
                <strong className="text-indigo-600 font-black">{totalCheckerPieces} pcs</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${stageMeta.badgeClass}`}>
              {stageMeta.labelTh}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowHistory((v) => !v)}
              className="h-8 text-xs font-bold gap-1.5"
            >
              <History size={14} />
              <span>Log ({draftChecklist.history.length})</span>
            </Button>
            {!isStandalonePage && (
              <a
                href={`/item-check?jobId=${encodeURIComponent(job.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-colors"
                title="Open Standalone APK Page (/item-check)"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">APK Page</span>
              </a>
            )}
          </div>
        </div>

        {/* Active Employee & Department Ownership Bar */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isCurrentDeptStartedBySomeone && draftChecklist.activeAssignee ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold shadow-2xs">
                <UserCheck size={14} className="shrink-0" />
                <span>
                  Managed by: <strong>{draftChecklist.activeAssignee.staffName}</strong>
                  {draftChecklist.activeAssignee.staffDepartment
                    ? ` (${draftChecklist.activeAssignee.staffDepartment})`
                    : draftChecklist.activeAssignee.staffRole
                    ? ` (${draftChecklist.activeAssignee.staffRole})`
                    : ""}
                </span>
                <span className="text-[10.5px] text-indigo-200 font-medium">
                  • Started{" "}
                  {new Date(draftChecklist.activeAssignee.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold">
                <Play size={13} className="text-amber-700 shrink-0" />
                <span>
                  Waiting for <strong>{currentDeptMeta.title}</strong> staff to click &amp; start managing this order
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-500">Staff:</span>
              <select
                value={activeOperator.id}
                onChange={(e) => selectOperator(e.target.value)}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none"
                title="Select employee operating this station"
              >
                {staffOptions.map((op) => (
                  <option key={op.id} value={op.id}>
                    👤 {op.name} ({op.department || op.role})
                  </option>
                ))}
              </select>
            </div>

            {draftChecklist.stage !== "ready_for_delivery" && (
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={handleStartManagingOrderInDept}
                className={`h-8 text-xs font-black gap-1.5 cursor-pointer ${
                  isCurrentDeptStartedBySomeone &&
                  draftChecklist.activeAssignee?.staffName === currentActorName
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                }`}
              >
                <Play size={13} />
                <span>
                  {isCurrentDeptStartedBySomeone
                    ? draftChecklist.activeAssignee?.staffName === currentActorName
                      ? `Active: ${currentActorName}`
                      : `Take Over as ${currentActorName}`
                    : `Start Process as ${currentActorName} (เริ่มรับงาน)`}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* 4-Step Pipeline Progress Bar with Employee Ownership */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2.5">
            {[
              {
                idx: 0,
                title: "1. Checker",
                sub: "Pour & Count Items",
                targetStage: "checking" as ChecklistStage,
                assignee: draftChecklist.departmentAssignees?.checker,
              },
              {
                idx: 1,
                title: "2. Washing Dept",
                sub: "Verify Count & Wash",
                targetStage: "washing_verify" as ChecklistStage,
                assignee: draftChecklist.departmentAssignees?.washing,
              },
              {
                idx: 2,
                title: "3. Ironing Dept",
                sub: draftChecklist.requiresIroning ? "Verify & Iron" : "Skipped (No Iron)",
                targetStage: "ironing_verify" as ChecklistStage,
                assignee: draftChecklist.departmentAssignees?.ironing,
              },
              {
                idx: 3,
                title: "4. Back to Checker",
                sub: "Final Check & Prep for Delivery",
                targetStage: "packing_verify" as ChecklistStage,
                assignee: draftChecklist.departmentAssignees?.delivery_prep,
              },
            ].map((step) => {
              const isCurrent = stageMeta.stepIndex === step.idx;
              const isDone = stageMeta.stepIndex > step.idx;
              const isSkipped = step.idx === 2 && !draftChecklist.requiresIroning;
              return (
                <div
                  key={step.idx}
                  className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all select-none ${
                    isCurrent
                      ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-500/20"
                      : isDone
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                      : isSkipped
                      ? "bg-slate-100/60 border-slate-200 opacity-60"
                      : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="text-[11px] font-black text-slate-800 truncate">{step.title}</span>
                    {isDone && <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />}
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 truncate w-full">{step.sub}</span>
                  {step.assignee?.staffName ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-white/90 px-1.5 py-0.5 rounded border border-indigo-200 truncate max-w-full">
                      <span>👤 {step.assignee.staffName}</span>
                    </span>
                  ) : isCurrent ? (
                    <span className="mt-1 text-[9.5px] font-bold text-amber-700 truncate">
                      ⏳ Click Start above
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Discrepancy Alert Banner if Returned to Checker */}
          {draftChecklist.discrepancyAlert && (
            <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-rose-700">
                    ⚠️ Returned to Checker for Recount ({draftChecklist.discrepancyAlert.department.toUpperCase()} DEPT)
                  </p>
                  <p className="text-xs font-bold mt-0.5">{draftChecklist.discrepancyAlert.reason}</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Expected: <strong>{draftChecklist.discrepancyAlert.expectedTotal} pcs</strong> • Counted by{" "}
                    {draftChecklist.discrepancyAlert.reportedBy}:{" "}
                    <strong>{draftChecklist.discrepancyAlert.countedTotal} pcs</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* History Log Drawer (Collapsible) */}
          {showHistory && (
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <History size={14} className="text-indigo-600" />
                <span>Department Handoff & Verification Log</span>
              </p>
              {draftChecklist.history.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No handoff events recorded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {draftChecklist.history.map((h) => (
                    <div
                      key={h.id}
                      className="text-xs flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div>
                        <span className="font-bold text-indigo-700">[{h.department}]</span>{" "}
                        <span className="font-semibold text-slate-800">{h.action}</span>
                        {h.note && <p className="text-[11px] text-rose-600 font-medium">Note: {h.note}</p>}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {h.totalPieces} pcs • by {h.actorName} •{" "}
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick-Tap Garment Buttons (Shown during Checker stage or when adding items) */}
          {isCheckerEditable && (
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Step 1: Select Service Mode & Tap Garments to Count (เลือกประเภทบริการแล้วกดนับชิ้นผ้า)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Select how the items should be processed below, then tap garments. You can also change treatment per item row.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImportInvoiceItems}
                  className="h-7 text-[11px] font-bold gap-1 border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100"
                >
                  <Sparkles size={12} />
                  <span>Import Piece Items from Invoice</span>
                </Button>
              </div>

              {/* Active Service Treatment Mode Selector */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                    Active Service Mode for Next Taps (โหมดบริการสำหรับรายการที่กดนับ):
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TREATMENT_OPTIONS.map((opt) => {
                    const isActive = activeTreatment === opt.id;
                    const countInMode = treatmentSummary[opt.id] || 0;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setActiveTreatment(opt.id)}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                          isActive
                            ? opt.activeBtnClass
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base leading-none">{opt.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-black leading-tight truncate">{opt.label}</p>
                            <p
                              className={`text-[10px] font-semibold truncate ${
                                isActive ? "text-white/85" : "text-slate-500"
                              }`}
                            >
                              {opt.labelTh}
                            </p>
                          </div>
                        </div>
                        {countInMode > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                              isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {countInMode}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All Items (ทั้งหมด)" },
                  { id: "tops", label: "Tops / Shirts (เสื้อ)" },
                  { id: "bottoms", label: "Bottoms / Pants (กางเกง/กระโปรง)" },
                  { id: "innerwear", label: "Innerwear / Socks (ชุดชั้นใน/ถุงเท้า)" },
                  { id: "bedding", label: "Towels & Bedding (ผ้าขนหนู/เครื่องนอน)" },
                  { id: "other", label: "Accessories (อื่นๆ)" },
                ].map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setSelectedGroup(grp.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      selectedGroup === grp.id
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {grp.label}
                  </button>
                ))}
              </div>

              {/* Garment Visual Quick-Tap Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredPresets.map((preset) => {
                  const totalForPreset = draftChecklist.items
                    .filter((it) => it.garmentKey === preset.key)
                    .reduce((s, it) => s + (it.checkerQty || 0), 0);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleTapPresetGarment(preset)}
                      className={`relative flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        totalForPreset > 0
                          ? "bg-indigo-50/90 border-indigo-400 ring-1 ring-indigo-500/20"
                          : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                      }`}
                    >
                      <ServiceItemVisual
                        name={preset.visualHint}
                        sizeClass="w-9 h-9"
                        selected={totalForPreset > 0}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 leading-tight truncate">
                          {preset.name}
                        </p>
                        <p className="text-[10.5px] font-semibold text-slate-500 truncate">
                          {preset.nameTh}
                        </p>
                      </div>
                      {totalForPreset > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white shrink-0">
                          ×{totalForPreset}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom Garment Input */}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomGarment();
                    }
                  }}
                  placeholder="Other garment type (e.g., Curtain, Handkerchief, Baby Romper)..."
                  className="h-8 text-xs bg-slate-50"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustomGarment}
                  className="h-8 text-xs font-bold gap-1 shrink-0"
                >
                  <Plus size={14} />
                  <span>Add Custom Item</span>
                </Button>
              </div>
            </div>
          )}

          {/* Stage 4 Banner: Returned to Checker for Final Consolidation & Delivery Prep */}
          {draftChecklist.stage === "packing_verify" && (
            <div className="p-3.5 rounded-xl bg-teal-50 border-2 border-teal-300 text-teal-950 flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <PackageCheck className="text-teal-700 shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-teal-800">
                    🔄 Step 4: Returned to Checker — Prepare Order for Delivery (ผ้าทุกแผนกเสร็จแล้ว • ส่งกลับ Checker เตรียมส่งไรเดอร์)
                  </p>
                  <p className="text-xs font-semibold text-teal-900 mt-0.5">
                    All processing departments have finished. Checker: consolidate all garments (Wash, Iron, Dry Clean), verify the final piece count below, pack the order, and mark it ready for the Delivery Rider.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Item Checklist Table & Brand/Colour Tagging */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Recorded Laundry Items ({draftChecklist.items.length} lines • {totalCheckerPieces} pieces)
                </h4>
                {/* Treatment Breakdown Summary Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {TREATMENT_OPTIONS.map((opt) => {
                    const cnt = treatmentSummary[opt.id] || 0;
                    if (cnt <= 0) return null;
                    return (
                      <span
                        key={opt.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${opt.badgeClass}`}
                      >
                        <span>{opt.icon}</span>
                        <span>
                          {opt.label}: {cnt} pcs
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                <Shirt size={13} className={anyNeedsIroning ? "text-indigo-600" : "text-slate-400"} />
                <span>
                  {allAreIronOnly
                    ? "Auto-Route: Direct to Ironing Dept → Back to Checker"
                    : anyNeedsIroning
                    ? `Auto-Route: Wash → Ironing Dept (${ironOrDryCleanPieces} pcs) → Back to Checker`
                    : "Auto-Route: Wash Only → Back to Checker for Delivery Prep"}
                </span>
              </div>
            </div>

            {draftChecklist.items.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                No items counted yet. Tap the garment buttons above (e.g. Polo, Shorts, Bra) as you pour out the laundry bag.
              </div>
            ) : (
              <div className="space-y-2">
                {draftChecklist.items.map((row) => {
                  const isExpanded = expandedRowId === row.id;
                  const rowTreatment: GarmentTreatment = row.treatment || defaultJobTreatment;
                  const tMeta = getTreatmentMeta(rowTreatment);
                  const verifyQty =
                    activeVerifyRole === "washer"
                      ? row.washerQty ?? row.checkerQty
                      : activeVerifyRole === "ironer"
                      ? row.ironerQty ?? row.checkerQty
                      : activeVerifyRole === "packer"
                      ? row.packerQty ?? row.checkerQty
                      : row.checkerQty;
                  const rowMismatch = activeVerifyRole !== null && verifyQty !== row.checkerQty;

                  const isWashingStage =
                    draftChecklist.stage === "washing_verify" || draftChecklist.stage === "washing";
                  const isIroningStage =
                    draftChecklist.stage === "ironing_verify" || draftChecklist.stage === "ironing";

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border transition-all ${
                        rowMismatch
                          ? "border-rose-400 bg-rose-50/50"
                          : isIroningStage && rowTreatment === "wash_only"
                          ? "border-slate-200 bg-slate-100/50 opacity-75"
                          : "border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                        {/* Left: Icon + Name + Treatment + Brand/Colour badges */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <ServiceItemVisual name={row.name} sizeClass="w-9 h-9" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-black text-slate-900">{row.name}</span>
                              {row.nameTh && row.nameTh !== row.name && (
                                <span className="text-xs font-semibold text-slate-500">
                                  ({row.nameTh})
                                </span>
                              )}

                              {/* Treatment Badge / Selector */}
                              {isCheckerEditable ? (
                                <select
                                  value={rowTreatment}
                                  onChange={(e) =>
                                    updateRowField(row.id, {
                                      treatment: e.target.value as GarmentTreatment,
                                    })
                                  }
                                  className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border cursor-pointer outline-none ${tMeta.badgeClass}`}
                                  title="Change service treatment for this item"
                                >
                                  {TREATMENT_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.icon} {opt.label} ({opt.labelTh})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full border ${tMeta.badgeClass}`}
                                >
                                  <span>{tMeta.icon}</span>
                                  <span>
                                    {tMeta.label} ({tMeta.labelTh})
                                  </span>
                                </span>
                              )}

                              {/* Department-Specific Safety Warnings */}
                              {isWashingStage && rowTreatment === "dry_clean" && (
                                <span className="text-[10.5px] font-black px-2 py-0.5 rounded-md bg-purple-600 text-white">
                                  ⚠️ DRY CLEAN — ห้ามซักน้ำปกติ!
                                </span>
                              )}
                              {isWashingStage && rowTreatment === "iron_only" && (
                                <span className="text-[10.5px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                  🔥 IRON ONLY — ข้ามขั้นตอนซัก
                                </span>
                              )}
                              {isIroningStage && rowTreatment === "wash_only" && (
                                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                                  🧺 Wash Only — ไม่ต้องรีด
                                </span>
                              )}

                              {row.brand && (
                                <Badge variant="secondary" className="text-[10.5px] font-bold bg-indigo-100 text-indigo-800 border-indigo-200">
                                  🏷️ {row.brand}
                                </Badge>
                              )}
                              {row.color && (
                                <Badge variant="secondary" className="text-[10.5px] font-bold bg-white text-slate-800 border border-slate-300">
                                  🎨 {row.color}
                                </Badge>
                              )}
                              {row.note && (
                                <Badge variant="outline" className="text-[10.5px] font-semibold text-amber-800 bg-amber-50 border-amber-200">
                                  📝 {row.note}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Quantity Controls + Brand/Colour Toggle */}
                        <div className="flex items-center gap-2">
                          {/* Checker Qty Control */}
                          {isCheckerEditable ? (
                            <div className="flex items-center gap-1 bg-white px-1.5 py-1 rounded-lg border border-slate-200">
                              <button
                                type="button"
                                onClick={() =>
                                  updateRowField(row.id, { checkerQty: Math.max(0, row.checkerQty - 1) })
                                }
                                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700 cursor-pointer"
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={row.checkerQty}
                                onChange={(e) =>
                                  updateRowField(row.id, {
                                    checkerQty: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  })
                                }
                                className="w-12 text-center font-black text-sm text-indigo-700 bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateRowField(row.id, { checkerQty: row.checkerQty + 1 })}
                                className="w-7 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center font-black text-indigo-700 cursor-pointer"
                              >
                                <Plus size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateRowField(row.id, { checkerQty: row.checkerQty + 5 })}
                                className="px-1.5 h-7 rounded-md bg-indigo-100/80 hover:bg-indigo-200 text-[10px] font-black text-indigo-800 cursor-pointer"
                                title="Add +5"
                              >
                                +5
                              </button>
                            </div>
                          ) : (
                            <div className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700">
                              Checker: <strong className="text-indigo-700 text-sm">×{row.checkerQty}</strong>
                            </div>
                          )}

                          {/* Department Counter-Check Control (Washer / Ironer / Packer) */}
                          {activeVerifyRole && (
                            <div
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
                                rowMismatch
                                  ? "bg-rose-100 border-rose-400 text-rose-900"
                                  : "bg-emerald-50 border-emerald-300 text-emerald-900"
                              }`}
                            >
                              <span className="text-[10px] font-bold uppercase mr-1">
                                {activeVerifyRole === "washer"
                                  ? "Wash Count:"
                                  : activeVerifyRole === "ironer"
                                  ? "Iron Count:"
                                  : "Checker Final:"}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = Math.max(0, verifyQty - 1);
                                  if (activeVerifyRole === "washer") updateRowField(row.id, { washerQty: nextVal });
                                  if (activeVerifyRole === "ironer") updateRowField(row.id, { ironerQty: nextVal });
                                  if (activeVerifyRole === "packer") updateRowField(row.id, { packerQty: nextVal });
                                }}
                                className="w-6 h-6 rounded bg-white hover:bg-slate-100 flex items-center justify-center font-bold cursor-pointer"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-8 text-center font-black text-sm">{verifyQty}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = verifyQty + 1;
                                  if (activeVerifyRole === "washer") updateRowField(row.id, { washerQty: nextVal });
                                  if (activeVerifyRole === "ironer") updateRowField(row.id, { ironerQty: nextVal });
                                  if (activeVerifyRole === "packer") updateRowField(row.id, { packerQty: nextVal });
                                }}
                                className="w-6 h-6 rounded bg-white hover:bg-slate-100 flex items-center justify-center font-bold cursor-pointer"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          )}

                          {isCheckerEditable && (
                            <>
                              {/* Brand & Colour Button (Checker Only) */}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                className={`h-8 text-[11px] font-bold gap-1 ${
                                  row.brand || row.color
                                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                    : "text-slate-600"
                                }`}
                              >
                                <Palette size={13} />
                                <span className="hidden sm:inline">Brand / Colour</span>
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicateVariantRow(row)}
                                className="h-8 px-2 text-xs text-indigo-600 hover:bg-indigo-50"
                                title="Split / Add another Brand or Colour of this item"
                              >
                                <Copy size={13} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRow(row.id)}
                                className="h-8 px-2 text-xs text-rose-500 hover:bg-rose-50"
                                title="Remove line"
                              >
                                <Trash2 size={13} />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expandable Brand, Colour & Condition Drawer (Checker Only) */}
                      {isCheckerEditable && isExpanded && (
                        <div className="px-3 pb-3 pt-2 border-t border-slate-200/80 bg-white rounded-b-xl space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-500 uppercase">
                                Brand (ยี่ห้อ)
                              </label>
                              <Input
                                value={row.brand || ""}
                                onChange={(e) => updateRowField(row.id, { brand: e.target.value })}
                                placeholder="e.g. Uniqlo, Nike, Zara..."
                                className="h-8 text-xs mt-0.5"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-500 uppercase">
                                Colour (สีผ้า)
                              </label>
                              <Input
                                value={row.color || ""}
                                onChange={(e) => updateRowField(row.id, { color: e.target.value })}
                                placeholder="e.g. White, Black, Navy..."
                                className="h-8 text-xs mt-0.5"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-500 uppercase">
                                Defect / Note (ตำหนิ/หมายเหตุ)
                              </label>
                              <Input
                                value={row.note || ""}
                                onChange={(e) => updateRowField(row.id, { note: e.target.value })}
                                placeholder="e.g. Collar stain, missing button..."
                                className="h-8 text-xs mt-0.5"
                              />
                            </div>
                          </div>

                          {/* Quick Colour Swatches */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                              Quick Colour Tap:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {COLOR_SWATCHES.map((sw) => {
                                const active = row.color === sw.label;
                                return (
                                  <button
                                    key={sw.label}
                                    type="button"
                                    onClick={() =>
                                      updateRowField(row.id, {
                                        color: active ? "" : sw.label,
                                      })
                                    }
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                      active
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                    }`}
                                  >
                                    <span className={`w-3 h-3 rounded-full shrink-0 ${sw.dotClass}`} />
                                    <span>{sw.label} ({sw.labelTh})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Quick Brand Chips */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                              Quick Brand Tap:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {POPULAR_BRANDS.map((b) => {
                                const active = row.brand === b;
                                return (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() =>
                                      updateRowField(row.id, { brand: active ? "" : b })
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border transition-all cursor-pointer ${
                                      active
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                    }`}
                                  >
                                    {b}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Discrepancy Return Reason Box */}
          {showDiscrepancyBox && activeVerifyRole && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 space-y-2.5">
              <p className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                <AlertTriangle size={15} />
                <span>Return Laundry Basket & Checklist to Checker for Recheck</span>
              </p>
              <Input
                value={discrepancyReason}
                onChange={(e) => setDiscrepancyReason(e.target.value)}
                placeholder="Specify what was mismatched (e.g. Found 9 Polos instead of 10, 1 White Shirt extra)..."
                className="bg-white text-xs h-9 border-rose-200"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiscrepancyBox(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={() =>
                    handleReturnToCheckerForRecheck(
                      activeVerifyRole === "washer"
                        ? "washing"
                        : activeVerifyRole === "ironer"
                        ? "ironing"
                        : "packing"
                    )
                  }
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Confirm Return to Checker (ส่งกลับให้จุดตรวจนับใหม่)</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Department Action Bar */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => persistChecklist(draftChecklist, undefined, "Checklist progress saved")}
              className="text-xs font-bold"
            >
              Save Draft
            </Button>
            <span className="text-xs text-slate-500 font-semibold">
              Total:{" "}
              <strong className="text-slate-900 font-black">{totalCheckerPieces} items</strong>
              {activeVerifyRole && (
                <>
                  {" "}
                  • Verified:{" "}
                  <strong
                    className={
                      hasCountMismatch ? "text-rose-600 font-black" : "text-emerald-600 font-black"
                    }
                  >
                    {totalVerifiedPieces} items
                  </strong>
                </>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* STAGE 1: CHECKER ACTIONS */}
            {isCheckerEditable && (
              <Button
                type="button"
                disabled={isSaving || totalCheckerPieces === 0}
                onClick={handlePassToWashing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black gap-1.5 px-4"
              >
                <span>
                  {allAreIronOnly
                    ? "Pass Iron-Only Order Directly to Ironing Dept (ส่งแผนกรีดทันที)"
                    : "Pass to Washing Dept (ส่งแผนกซักตรวจนับ)"}
                </span>
                <ArrowRight size={15} />
              </Button>
            )}

            {/* STAGE 2A: WASHING COUNTER-CHECK */}
            {draftChecklist.stage === "washing_verify" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setShowDiscrepancyBox(true)}
                  className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Mismatch → Return to Checker (ส่งกลับจุดตรวจนับ)</span>
                </Button>
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={handleVerifyAndStartWashing}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black gap-1.5 px-4"
                >
                  <CheckCircle2 size={15} />
                  <span>Verify All Match & Start Washing (ครบถูกต้อง • เริ่มซัก)</span>
                </Button>
              </>
            )}

            {/* STAGE 2B: WASHING IN PROGRESS -> AUTO-ROUTE BASED ON RECORDED TREATMENTS */}
            {draftChecklist.stage === "washing" && (
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => handleFinishWashingPassNext(anyNeedsIroning)}
                className={
                  anyNeedsIroning
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black gap-1.5 px-4"
                    : "bg-teal-600 hover:bg-teal-700 text-white text-xs font-black gap-1.5 px-4"
                }
              >
                {anyNeedsIroning ? <Shirt size={15} /> : <PackageCheck size={15} />}
                <span>
                  {anyNeedsIroning
                    ? `Washing Done → Send to Ironing Dept (${ironOrDryCleanPieces} pcs need Iron/Press)`
                    : "Washing Done (Wash Only) → Return All Items to Checker for Delivery Prep (ส่งกลับ Checker เตรียมส่ง)"}
                </span>
                <ArrowRight size={15} />
              </Button>
            )}

            {/* STAGE 3A: IRONING COUNTER-CHECK */}
            {draftChecklist.stage === "ironing_verify" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setShowDiscrepancyBox(true)}
                  className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Mismatch → Return to Checker</span>
                </Button>
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={handleVerifyAndStartIroning}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black gap-1.5 px-4"
                >
                  <CheckCircle2 size={15} />
                  <span>Verify Count & Start Ironing (เริ่มรีด)</span>
                </Button>
              </>
            )}

            {/* STAGE 3B: IRONING IN PROGRESS -> RETURN ALL ITEMS TO CHECKER FOR DELIVERY PREP */}
            {draftChecklist.stage === "ironing" && (
              <Button
                type="button"
                disabled={isSaving}
                onClick={handleFinishIroningPassToPacking}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-black gap-1.5 px-4"
              >
                <PackageCheck size={15} />
                <span>All Departments Done → Return to Checker for Delivery Prep (ส่งกลับ Checker เตรียมส่งไรเดอร์)</span>
              </Button>
            )}

            {/* STAGE 4: BACK TO CHECKER — FINAL COUNT & PREPARE FOR DELIVERY */}
            {draftChecklist.stage === "packing_verify" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setShowDiscrepancyBox(true)}
                  className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Missing Item → Flag for Recheck (ของไม่ครบ)</span>
                </Button>
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={handleConfirmFinalPackingReady}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black gap-1.5 px-4"
                >
                  <CheckCircle2 size={15} />
                  <span>Checker Final Count Verified → Ready for Delivery Rider (Checker ตรวจนับครบ • พร้อมส่งไรเดอร์)</span>
                </Button>
              </>
            )}

            {/* STAGE 5: READY FOR DELIVERY */}
            {draftChecklist.stage === "ready_for_delivery" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <CheckCircle2 size={14} />
                  All {totalCheckerPieces} pcs Packed & Verified Ready for Delivery
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraftChecklist((prev) =>
                      prev ? { ...prev, stage: "checking" } : prev
                    )
                  }
                  className="text-xs"
                >
                  Re-open Count
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

interface LaundryChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  actorName?: string;
  onSubStatusChange?: (newSubStatus: "billing" | "wash" | "dry" | "iron" | "ready") => void;
}

export function LaundryChecklistDialog({
  open,
  onOpenChange,
  job,
  actorName = "Staff",
  onSubStatusChange,
}: LaundryChecklistDialogProps) {
  if (!job) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-slate-200 rounded-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Laundry Item Count & Department Handoff</DialogTitle>
        </DialogHeader>
        <LaundryChecklistWorkspace
          job={job}
          actorName={actorName}
          onSubStatusChange={onSubStatusChange}
          isStandalonePage={false}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Full-page Floor Operations Board for Checker, Washing, Ironing, and Packing staff
 */
interface AdminLaundryChecklistBoardProps {
  jobs: Job[];
  shops: ShopLocation[];
  actorName?: string;
  onOpenOrderDialog?: (job: Job) => void;
}

export function AdminLaundryChecklistBoard({
  jobs,
  shops,
  actorName = "Staff",
  onOpenOrderDialog,
}: AdminLaundryChecklistBoardProps) {
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );

  const { staffOptions, activeOperator, selectOperator } = useChecklistStaffDirectory(actorName);

  const [selectedStageTab, setSelectedStageTab] = useState<
    "all" | "recheck" | "checker" | "washing" | "ironing" | "packing" | "ready"
  >("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChecklistJob, setActiveChecklistJob] = useState<Job | null>(null);
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);

  const handleStartOrderCard = async (job: Job) => {
    setClaimingJobId(job.id);
    try {
      await claimAndStartChecklistOrder(job, settings, activeOperator);
      toast.success(`${activeOperator.name} started managing order ${job.billNo || formatJobDisplayId(job.id)}!`);
      setActiveChecklistJob(job);
    } catch (err: any) {
      toast.error(err?.message || "Failed to start order");
    } finally {
      setClaimingJobId(null);
    }
  };

  const activeLaundryJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        if (j.status === "cancel" || j.status === "return" || j.status === "topup") return false;
        // Include active orders in billing, pickup (inbound), delivery, or recently created
        return j.status === "billing" || j.status === "delivery" || j.status === "pickup";
      })
      .map((job) => {
        const checklist = parseJobChecklist(job, settings);
        const effectiveStage: ChecklistStage =
          checklist?.stage ||
          (job.subStatus === "ready"
            ? "ready_for_delivery"
            : job.subStatus === "iron"
            ? "ironing"
            : job.subStatus === "wash"
            ? "washing"
            : "checking");
        return { job, checklist, effectiveStage };
      });
  }, [jobs, settings]);

  const counts = useMemo(() => {
    const c = { all: 0, recheck: 0, checker: 0, washing: 0, ironing: 0, packing: 0, ready: 0 };
    for (const row of activeLaundryJobs) {
      if (branchFilter !== "all" && row.job.branchId !== branchFilter) continue;
      c.all++;
      if (row.effectiveStage === "recheck_required") c.recheck++;
      else if (row.effectiveStage === "checking") c.checker++;
      else if (row.effectiveStage === "washing_verify" || row.effectiveStage === "washing") c.washing++;
      else if (row.effectiveStage === "ironing_verify" || row.effectiveStage === "ironing") c.ironing++;
      else if (row.effectiveStage === "packing_verify") c.packing++;
      else if (row.effectiveStage === "ready_for_delivery") c.ready++;
    }
    return c;
  }, [activeLaundryJobs, branchFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeLaundryJobs.filter(({ job, checklist, effectiveStage }) => {
      if (branchFilter !== "all" && job.branchId !== branchFilter) return false;
      if (selectedStageTab === "recheck" && effectiveStage !== "recheck_required") return false;
      if (selectedStageTab === "checker" && effectiveStage !== "checking" && effectiveStage !== "recheck_required")
        return false;
      if (selectedStageTab === "washing" && effectiveStage !== "washing_verify" && effectiveStage !== "washing")
        return false;
      if (selectedStageTab === "ironing" && effectiveStage !== "ironing_verify" && effectiveStage !== "ironing")
        return false;
      if (selectedStageTab === "packing" && effectiveStage !== "packing_verify") return false;
      if (selectedStageTab === "ready" && effectiveStage !== "ready_for_delivery") return false;

      if (!q) return true;
      const billMatch = (job.billNo || formatJobDisplayId(job.id)).toLowerCase().includes(q);
      const custMatch = (job.customerName || "").toLowerCase().includes(q) || (job.customerPhone || "").includes(q);
      const itemMatch = (checklist?.items || []).some(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.brand || "").toLowerCase().includes(q) ||
          (it.color || "").toLowerCase().includes(q)
      );
      return billMatch || custMatch || itemMatch;
    });
  }, [activeLaundryJobs, branchFilter, selectedStageTab, searchQuery]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Top Department Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="text-indigo-600" size={22} />
              <span>Laundry Item Count & Department QC Board (ระบบตรวจนับผ้าแยกแผนก)</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              1. Checker pours & counts items (Treatment/Brand/Colour) → 2. Washing Dept → 3. Ironing Dept (if needed) → 4. All items return to Checker to prepare for Delivery Rider
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active Employee Selector for Clicking to Start Orders */}
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1">
              <UserCheck size={14} className="text-indigo-600 shrink-0" />
              <span className="text-[11px] font-bold text-indigo-900">Employee:</span>
              <select
                value={activeOperator.id}
                onChange={(e) => selectOperator(e.target.value)}
                className="h-7 rounded-lg bg-white border border-indigo-200 px-2 text-xs font-extrabold text-slate-800 outline-none"
              >
                {staffOptions.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name} ({op.department || op.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bill, customer, staff..."
                className="pl-8 h-9 text-xs"
              />
            </div>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
            >
              <option value="all">All Branches</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dedicated Department Pages Quick Launch Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Users size={14} className="text-indigo-600" />
            <span>Open Dedicated Standalone Department Page (หน้าจอแยกตามแผนก):</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "1. Checker Page", href: "/item-check/checker", color: "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200" },
              { label: "2. Washing Dept Page", href: "/item-check/washing", color: "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200" },
              { label: "3. Ironing Dept Page", href: "/item-check/ironing", color: "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200" },
              { label: "4. Checker Delivery Prep Page", href: "/item-check/delivery-prep", color: "bg-teal-100 text-teal-900 border-teal-300 hover:bg-teal-200" },
            ].map((d) => (
              <a
                key={d.href}
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-extrabold transition-colors ${d.color}`}
              >
                <span>{d.label}</span>
                <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </div>

        {/* Stage Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: `All Active (${counts.all})`, badge: "" },
            ...(counts.recheck > 0
              ? [{ id: "recheck", label: `⚠️ Returned for Recheck (${counts.recheck})`, badge: "bg-rose-600 text-white" }]
              : []),
            { id: "checker", label: `1. Checker Initial Count (${counts.checker + counts.recheck})`, badge: "" },
            { id: "washing", label: `2. Washing Dept (${counts.washing})`, badge: "" },
            { id: "ironing", label: `3. Ironing Dept (${counts.ironing})`, badge: "" },
            { id: "packing", label: `4. Back to Checker — Delivery Prep (${counts.packing})`, badge: "" },
            { id: "ready", label: `5. Ready for Riders (${counts.ready})`, badge: "" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStageTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedStageTab === tab.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : tab.id === "recheck"
                  ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <ClipboardCheck size={36} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-700">No laundry loads in this stage</p>
          <p className="text-xs text-slate-400">Select another department tab above or clear your search filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRows.map(({ job, checklist, effectiveStage }) => {
            const meta = getStageMeta(effectiveStage);
            const totalPieces = (checklist?.items || []).reduce(
              (sum, it) => sum + (Number(it.checkerQty) || 0),
              0
            );
            const requiresIron = checklist
              ? checklist.requiresIroning
              : detectJobRequiresIroning(job);

            return (
              <div
                key={job.id}
                className={`bg-white rounded-2xl border p-4 flex flex-col justify-between gap-3 shadow-2xs transition-all hover:shadow-md ${
                  effectiveStage === "recheck_required"
                    ? "border-rose-400 ring-2 ring-rose-500/20"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-indigo-700">
                          {job.billNo || formatJobDisplayId(job.id)}
                        </span>
                        <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${meta.badgeClass}`}>
                          {meta.labelTh}
                        </span>
                      </div>
                      <p className="text-sm font-extrabold text-slate-900 mt-1">
                        {job.customerName || "Walk-in Customer"}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        {job.customerPhone || "No phone"}
                        {job.weight ? ` • ${job.weight} kg` : ""}
                        {requiresIron ? " • 👔 Needs Ironing" : " • 📦 Wash & Fold"}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
                        <p className="text-[10px] font-bold uppercase leading-none">Pieces</p>
                        <p className="text-base font-black leading-tight">{totalPieces}</p>
                      </div>
                    </div>
                  </div>

                  {/* Employee Ownership & Department Staff Status Box */}
                  {(() => {
                    const deptKey = getStageDepartmentKey(effectiveStage);
                    const deptMeta = getDepartmentStageLabel(deptKey);
                    const activeAssignee =
                      checklist?.activeAssignee && checklist.activeAssignee.departmentStage === deptKey
                        ? checklist.activeAssignee
                        : checklist?.departmentAssignees?.[deptKey] || null;
                    const assignees = checklist?.departmentAssignees || {};

                    return (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                        {activeAssignee ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-800">
                              <UserCheck size={14} className="text-indigo-600 shrink-0" />
                              <span>
                                Managed by: <strong className="text-indigo-950">{activeAssignee.staffName}</strong>
                                {activeAssignee.staffDepartment
                                  ? ` (${activeAssignee.staffDepartment})`
                                  : activeAssignee.staffRole
                                  ? ` (${activeAssignee.staffRole})`
                                  : ""}
                              </span>
                            </span>
                            <span className="text-[10.5px] font-bold text-slate-500">
                              {new Date(activeAssignee.startedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-xs font-bold text-amber-800">
                            <span>⏳ Waiting for {deptMeta.title} employee to click &amp; start</span>
                          </div>
                        )}

                        {(assignees.checker || assignees.washing || assignees.ironing || assignees.delivery_prep) && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/70 text-[10px] font-bold text-slate-600">
                            {assignees.checker && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                1. Checker: <strong>{assignees.checker.staffName}</strong>
                              </span>
                            )}
                            {assignees.washing && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                2. Wash: <strong>{assignees.washing.staffName}</strong>
                              </span>
                            )}
                            {assignees.ironing && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                3. Iron: <strong>{assignees.ironing.staffName}</strong>
                              </span>
                            )}
                            {assignees.delivery_prep && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                4. Prep: <strong>{assignees.delivery_prep.staffName}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Discrepancy Banner if any */}
                  {checklist?.discrepancyAlert && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 font-semibold">
                      ⚠️ <strong>Returned by {checklist.discrepancyAlert.reportedBy}:</strong>{" "}
                      {checklist.discrepancyAlert.reason}
                    </div>
                  )}

                  {/* Garment Count Pills Preview */}
                  {checklist && checklist.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {checklist.items.slice(0, 8).map((it) => (
                        <span
                          key={it.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800"
                        >
                          <span>{it.name}</span>
                          {it.brand && <span className="text-indigo-600">({it.brand})</span>}
                          {it.color && <span className="text-slate-500">[{it.color}]</span>}
                          <strong className="text-indigo-700">×{it.checkerQty}</strong>
                        </span>
                      ))}
                      {checklist.items.length > 8 && (
                        <span className="text-[11px] font-bold text-slate-400 px-1">
                          +{checklist.items.length - 8} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 font-semibold">
                      Waiting for Checker to pour out laundry bag & count items.
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {(() => {
                    const deptKey = getStageDepartmentKey(effectiveStage);
                    const isAlreadyClaimedInDept = Boolean(
                      checklist?.activeAssignee && checklist.activeAssignee.departmentStage === deptKey
                    );
                    if (!isAlreadyClaimedInDept && effectiveStage !== "ready_for_delivery") {
                      return (
                        <Button
                          type="button"
                          disabled={claimingJobId === job.id}
                          onClick={() => handleStartOrderCard(job)}
                          className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black gap-1.5 cursor-pointer"
                        >
                          <Play size={14} />
                          <span>
                            Start Process as {activeOperator.name} (เริ่มรับงาน)
                          </span>
                        </Button>
                      );
                    }
                    return (
                      <Button
                        type="button"
                        onClick={() => setActiveChecklistJob(job)}
                        className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black gap-1.5 cursor-pointer"
                      >
                        <ClipboardCheck size={14} />
                        <span>
                          {totalPieces === 0
                            ? "Continue Item Count (นับชิ้นผ้าต่อ)"
                            : effectiveStage === "washing_verify"
                            ? "Washer Counter-Check (ตรวจนับซ้ำ)"
                            : effectiveStage === "ironing_verify"
                            ? "Ironer Counter-Check (ตรวจนับรีด)"
                            : effectiveStage === "packing_verify"
                            ? "Checker Delivery Prep & Final Count"
                            : "Open Item Checklist (เปิดใบตรวจนับ)"}
                        </span>
                      </Button>
                    );
                  })()}
                  {onOpenOrderDialog && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenOrderDialog(job)}
                      className="h-9 px-2.5 text-xs font-bold"
                      title="Open Invoice / Order Details"
                    >
                      <ExternalLink size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Checklist Modal */}
      <LaundryChecklistDialog
        open={Boolean(activeChecklistJob)}
        onOpenChange={(v) => {
          if (!v) setActiveChecklistJob(null);
        }}
        job={activeChecklistJob}
        actorName={actorName}
      />
    </div>
  );
}
