"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Image as ImageIcon,
  Upload,
  Trash2,
  Search,
  Filter,
  Download,
  RefreshCw,
  User,
  Building2,
  Tag,
  Eye,
  Edit2,
  Settings2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Banknote,
  Receipt,
  ChevronDown,
  Files,
  Calendar,
  Car,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getPettyCashDataAction,
  createPettyCashTransactionAction,
  transferPettyCashAction,
  updatePettyCashTransactionAction,
  reviewPettyCashTransactionAction,
  savePettyCashCategoriesAction,
  savePettyCashHolderLimitAction,
  savePettyCashVehiclePlatesAction,
  submitPettyCashReplenishmentReportAction,
  reviewPettyCashReplenishmentReportAction,
} from "@/actions/db";
import { shopStore, riderStore } from "@/lib/store";
import { getUsers } from "@/actions/users";

interface PettyCashTx {
  id: string;
  txNumber?: string | null;
  type: "EXPENSE" | "TOPUP" | "TRANSFER_OUT" | "TRANSFER_IN" | "RETURN" | "ADJUST_ADD" | "ADJUST_DEDUCT";
  direction: "DEBIT" | "CREDIT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  holderId: string;
  holderName: string;
  branchId?: string | null;
  relatedTxId?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  category: string;
  description: string;
  vendorName?: string | null;
  invoiceNo?: string | null;
  vehiclePlate?: string | null;
  paymentMethod?: string | null;
  receiptUrls: string[];
  slipUrls: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "VOID";
  replenishmentReportId?: string | null;
  transactionDate: string | Date;
  createdById?: string | null;
  createdByName?: string | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | Date | null;
  rejectReason?: string | null;
  createdAt: string | Date;
}

interface PettyCashReplenishmentReport {
  id: string;
  reportNumber: string;
  holderId: string;
  holderName: string;
  branchId?: string | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  quotaLimit: number;
  currentBalanceAtSubmit: number;
  totalExpenseAmount: number;
  requestedAmount: number;
  expenseTxIds: string[];
  categorySummary: Array<{ category: string; amount: number; count: number }>;
  note?: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "DISBURSED" | "REJECTED";
  submittedById?: string | null;
  submittedByName?: string | null;
  submittedAt: string | Date;
  reviewedById?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | Date | null;
  rejectReason?: string | null;
  topupTxId?: string | null;
  topupChannel?: string | null;
  slipUrls: string[];
  createdAt: string | Date;
}

interface AdminPettyCashProps {
  currentUser?: any;
  selectedBranchId?: string;
}

type ExpenseDocType = "EXPENSE_DOC" | "DEBT_PAYMENT" | "PAYMENT_VOUCHER" | "PAYROLL";

const EXPENSE_DOC_TYPE_CONFIG: Record<
  ExpenseDocType,
  {
    label: string;
    subtitle: string;
    shortcut?: string;
    defaultCategory: string;
    vendorLabel: string;
    vendorPlaceholder: string;
    invoiceLabel: string;
    invoicePlaceholder: string;
    descriptionPlaceholder: string;
  }
> = {
  EXPENSE_DOC: {
    label: "Expense Document",
    subtitle: "Record general expenses, bills, or service fees with receipts (auto-deducts immediately)",
    shortcut: "Alt+N",
    defaultCategory: "",
    vendorLabel: "Vendor / Payee (ชื่อผู้จำหน่าย / ร้านค้า)",
    vendorPlaceholder: "e.g. Makro, Lotus, PTT...",
    invoiceLabel: "Document / Invoice No. (เลขที่เอกสาร / เลขที่บิล)",
    invoicePlaceholder: "e.g. EXP2026120001, INV-2026-001",
    descriptionPlaceholder: "e.g. Office rent, fabric softener, expressway toll...",
  },
  DEBT_PAYMENT: {
    label: "Debt / Capital Payment",
    subtitle: "Record trade payable settlement, loan repayment, or capital disbursement",
    defaultCategory: "Debt & Capital Payment (ชำระหนี้/จ่ายเงินทุน)",
    vendorLabel: "Creditor / Payee (เจ้าหนี้ / ผู้รับชำระ)",
    vendorPlaceholder: "Enter creditor or payee name...",
    invoiceLabel: "Ref / Contract No. (เลขที่เอกสารอ้างอิง / สัญญา)",
    invoicePlaceholder: "e.g. BILL-2026-01, LOAN-001",
    descriptionPlaceholder: "e.g. Outstanding invoice settlement, working capital repayment...",
  },
  PAYMENT_VOUCHER: {
    label: "Payment Voucher",
    subtitle: "Create a payment preparation or payment voucher document with supporting attachments",
    defaultCategory: "Payment Voucher (ใบสำคัญจ่าย)",
    vendorLabel: "Payee Name (สั่งจ่ายแก่ / ผู้รับเงิน)",
    vendorPlaceholder: "Enter payee or company name...",
    invoiceLabel: "Payment Voucher No. (เลขที่ใบสำคัญจ่าย)",
    invoicePlaceholder: "e.g. PV-202611-001",
    descriptionPlaceholder: "e.g. Monthly service fee disbursement per payment voucher...",
  },
  PAYROLL: {
    label: "Payroll",
    subtitle: "Record employee salaries, wages, overtime, or allowances",
    defaultCategory: "Payroll & Wages (รายการเงินเดือน/ค่าแรง)",
    vendorLabel: "Employee / Department (ชื่อพนักงาน / แผนก)",
    vendorPlaceholder: "Enter employee name or department...",
    invoiceLabel: "Payroll Period / Ref (งวดเดือน / เลขที่อ้างอิง)",
    invoicePlaceholder: "e.g. Nov 2026, PAY-202611",
    descriptionPlaceholder: "e.g. Monthly salary, part-time wages, overtime (OT)...",
  },
};

function isVehicleExpenseCategory(cat: string): boolean {
  const lower = (cat || "").toLowerCase();
  return (
    lower.includes("fuel") ||
    lower.includes("transport") ||
    lower.includes("น้ำมัน") ||
    lower.includes("ทางด่วน") ||
    lower.includes("ค่ารถ") ||
    lower.includes("maintenance") ||
    lower.includes("repair") ||
    lower.includes("parts") ||
    lower.includes("ซ่อม") ||
    lower.includes("อะไหล่")
  );
}

function isPdfOrDocUrl(url: string): boolean {
  const clean = (url || "").split("?")[0].toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|csv|txt|zip)$/.test(clean);
}

function getFileDisplayName(url: string, idx: number): string {
  try {
    const clean = (url || "").split("?")[0];
    const parts = clean.split("/");
    const last = decodeURIComponent(parts[parts.length - 1] || "");
    if (last) return last;
  } catch {}
  return `Document #${idx + 1}`;
}

export function AdminPettyCash({ currentUser, selectedBranchId = "ALL" }: AdminPettyCashProps) {
  const [transactions, setTransactions] = useState<PettyCashTx[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [holderLimits, setHolderLimits] = useState<Record<string, number>>({});
  const [replenishmentReports, setReplenishmentReports] = useState<PettyCashReplenishmentReport[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [holderFilter, setHolderFilter] = useState<string>("ALL");
  const hasInitializedDefaultWalletRef = useRef<boolean>(false);
  const [branchFilter, setBranchFilter] = useState<string>(selectedBranchId || "ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const now = new Date();
    return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const now = new Date();
    return format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
  });

  // Sync top-level branch filter if changed
  useEffect(() => {
    if (selectedBranchId) {
      setBranchFilter(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Create / Edit Transaction Modal
  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<PettyCashTx | null>(null);
  const [txMode, setTxMode] = useState<"EXPENSE" | "TOPUP" | "TRANSFER" | "RETURN">("EXPENSE");
  const [expenseDocType, setExpenseDocType] = useState<ExpenseDocType>("EXPENSE_DOC");
  const [expenseMenuOpen, setExpenseMenuOpen] = useState<boolean>(false);
  const expenseMenuRef = useRef<HTMLDivElement | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSummaryTable, setShowSummaryTable] = useState<boolean>(false);
  const [activeViewTab, setActiveViewTab] = useState<"ledger" | "claims" | "wallets" | "report" | "fuel">("ledger");
  const [fuelIncludeMaintenance, setFuelIncludeMaintenance] = useState<boolean>(false);
  const [selectedFuelPlate, setSelectedFuelPlate] = useState<string>("ALL");
  const [formHolderId, setFormHolderId] = useState<string>("");
  const [formHolderName, setFormHolderName] = useState<string>("");
  const [formBranchId, setFormBranchId] = useState<string>("");
  // Target recipient when Accounting transfers money to Store / Colleague
  const [formTargetHolderId, setFormTargetHolderId] = useState<string>("");
  const [formTargetHolderName, setFormTargetHolderName] = useState<string>("");
  const [formTargetBranchId, setFormTargetBranchId] = useState<string>("HQ");
  const [formCategory, setFormCategory] = useState<string>("");
  const [newQuickCategory, setNewQuickCategory] = useState<string>("");
  const [showQuickAddCategory, setShowQuickAddCategory] = useState<boolean>(false);
  const [vehiclePlates, setVehiclePlates] = useState<string[]>([]);
  const [formVehiclePlate, setFormVehiclePlate] = useState<string>("");
  const [newQuickPlate, setNewQuickPlate] = useState<string>("");
  const [showQuickAddPlate, setShowQuickAddPlate] = useState<boolean>(false);
  const [riders, setRiders] = useState<any[]>([]);
  const [formAmount, setFormAmount] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formVendorName, setFormVendorName] = useState<string>("");
  const [formInvoiceNo, setFormInvoiceNo] = useState<string>("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("Cash");
  const [formDate, setFormDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [formReceiptUrls, setFormReceiptUrls] = useState<string[]>([]);
  const [formSlipUrls, setFormSlipUrls] = useState<string[]>([]);
  const [isUploadingReceipts, setIsUploadingReceipts] = useState<boolean>(false);
  const [isUploadingSlips, setIsUploadingSlips] = useState<boolean>(false);
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);

  // Top-up / Replenishment ("เติมเงิน/เบิกคืนเงินสดย่อย") Specific States
  const [formHolderLimit, setFormHolderLimit] = useState<string>("10000");
  const [isEditingLimit, setIsEditingLimit] = useState<boolean>(false);
  const [isSavingLimit, setIsSavingLimit] = useState<boolean>(false);
  const [formTopupSourceAccount, setFormTopupSourceAccount] = useState<string>("");
  const [formSourceHolderId, setFormSourceHolderId] = useState<string>("");

  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);
  const previewReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const previewSlipInputRef = useRef<HTMLInputElement | null>(null);

  // Active target for Ctrl+V image pasting ("receipts" | "slips")
  const [pasteTarget, setPasteTarget] = useState<"receipts" | "slips">("receipts");
  const [previewPasteTarget, setPreviewPasteTarget] = useState<"receipts" | "slips">("receipts");

  // Category Management Modal
  const [catModalOpen, setCatModalOpen] = useState<boolean>(false);
  const [editableCategories, setEditableCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState<string>("");
  const [editingCategoryIdx, setEditingCategoryIdx] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState<string>("");
  const [isSavingCategories, setIsSavingCategories] = useState<boolean>(false);

  // Reject / Void Modal
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectTargetTx, setRejectTargetTx] = useState<PettyCashTx | null>(null);
  const [rejectActionType, setRejectActionType] = useState<"REJECT" | "VOID">("REJECT");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isReviewing, setIsReviewing] = useState<boolean>(false);

  // Attachment Preview Modal
  const [previewTx, setPreviewTx] = useState<PettyCashTx | null>(null);

  // Replenishment Report Submission Modal (User summarizes expenses of the cycle to request replenishment)
  const [submitReportModalOpen, setSubmitReportModalOpen] = useState<boolean>(false);
  const [reportHolderId, setReportHolderId] = useState<string>("");
  const [reportSelectedTxIds, setReportSelectedTxIds] = useState<string[]>([]);
  const [reportRequestedAmount, setReportRequestedAmount] = useState<string>("");
  const [reportNote, setReportNote] = useState<string>("");
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // Replenishment Report Review & Approval Modal (Accounting reviews report, approves bills & disburses top-up)
  const [reviewReportTarget, setReviewReportTarget] = useState<PettyCashReplenishmentReport | null>(null);
  const [claimsStatusFilter, setClaimsStatusFilter] = useState<"ALL" | "PENDING_APPROVAL" | "DISBURSED" | "REJECTED">("ALL");
  const [claimsHolderFilter, setClaimsHolderFilter] = useState<string>("ALL");
  const [reviewApprovedAmount, setReviewApprovedAmount] = useState<string>("");
  const [reviewTopupChannel, setReviewTopupChannel] = useState<string>("Bank Account");
  const [reviewSourceHolderId, setReviewSourceHolderId] = useState<string>("");
  const [reviewSlipUrls, setReviewSlipUrls] = useState<string[]>([]);
  const [reviewRemark, setReviewRemark] = useState<string>("");
  const [reviewRejectReason, setReviewRejectReason] = useState<string>("");
  const [isReviewingReport, setIsReviewingReport] = useState<boolean>(false);
  const reviewSlipInputRef = useRef<HTMLInputElement | null>(null);

  // Store snapshots for holders (Authorized AdminUsers) and branches
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);

  useEffect(() => {
    getUsers()
      .then((res: any) => {
        if (Array.isArray(res)) setAdminUsers(res);
        else if (res?.success && Array.isArray(res.data)) setAdminUsers(res.data);
      })
      .catch(() => {});
    setShops(shopStore.getSnapshot() || []);
    setRiders(riderStore.getSnapshot() || []);
    const unsubShops = shopStore.subscribe(() => setShops(shopStore.getSnapshot() || []));
    const unsubRiders = riderStore.subscribe(() => setRiders(riderStore.getSnapshot() || []));
    return () => {
      unsubShops();
      unsubRiders();
    };
  }, []);

  const parsePermissionsList = useCallback((rawPerms: any): string[] => {
    if (!rawPerms) return [];
    if (Array.isArray(rawPerms)) return rawPerms;
    if (typeof rawPerms === "string") {
      try {
        const parsed = JSON.parse(rawPerms);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return rawPerms
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    return [];
  }, []);

  const isAccountingOrAdminUser = useCallback(
    (u: any): boolean => {
      if (!u) return false;
      const role = (u.role || "").toLowerCase();
      const dept = (u.department || "").toLowerCase();
      if (role === "accounting" || role === "admin" || role === "superadmin" || dept.includes("accounting")) {
        return true;
      }
      const perms = parsePermissionsList(u.permissions);
      return perms.includes("approve-petty-cash");
    },
    [parsePermissionsList]
  );

  const hasPettyCashAccess = useCallback(
    (u: any): boolean => {
      if (!u || u.isActive === false) return false;
      const perms = parsePermissionsList(u.permissions);
      return perms.includes("petty-cash") || perms.includes("approve-petty-cash");
    },
    [parsePermissionsList]
  );

  const getBranchDisplayName = useCallback(
    (bId?: string | null): string => {
      if (!bId || bId === "HQ") return "Head Quarter";
      return shops.find((s) => s.id === bId)?.name || bId;
    },
    [shops]
  );

  // Check if current user can approve/top-up/transfer petty cash (Accounting / Admin)
  const canApproveOrTopUp = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || "").toLowerCase();
    if (role === "admin" || role === "superadmin" || role === "accounting" || role === "account") return true;
    const perms = parsePermissionsList(currentUser.permissions);
    return perms.includes("approve-petty-cash");
  }, [currentUser, parsePermissionsList]);

  // Available Petty Cash Holders — ONLY users who have permission to access Petty Cash
  const holderOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; roleLabel: string; department: string; branchId?: string | null; isAccounting: boolean }
    >();
    if (currentUser?.id) {
      map.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name || currentUser.email || "Current User",
        roleLabel: (currentUser.role || "staff").toUpperCase(),
        department: (currentUser.department || currentUser.role || "staff").toUpperCase(),
        branchId: currentUser.branchId || "HQ",
        isAccounting: isAccountingOrAdminUser(currentUser),
      });
    }
    adminUsers
      .filter((u) => hasPettyCashAccess(u))
      .forEach((u) => {
        map.set(u.id, {
          id: u.id,
          name: u.name || u.email,
          roleLabel: (u.role || "staff").toUpperCase(),
          department: (u.department || u.role || "staff").toUpperCase(),
          branchId: u.branchId || "HQ",
          isAccounting: isAccountingOrAdminUser(u),
        });
      });
    transactions.forEach((t) => {
      if (t.holderId && !map.has(t.holderId)) {
        map.set(t.holderId, {
          id: t.holderId,
          name: t.holderName,
          roleLabel: "STAFF",
          department: "STAFF",
          branchId: t.branchId || "HQ",
          isAccounting: false,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [adminUsers, transactions, currentUser, hasPettyCashAccess, isAccountingOrAdminUser]);

  // Recipients that the logged-in Accounting user can transfer money to (everyone in holderOptions except self)
  const transferRecipientOptions = useMemo(() => {
    return holderOptions
      .filter((h) => h.id !== (currentUser?.id || formHolderId))
      .sort((a, b) => {
        // Put Store/Branch staff first, then other Accounting/Admin colleagues
        if (a.isAccounting !== b.isAccounting) return a.isAccounting ? 1 : -1;
        return a.name.localeCompare(b.name, "th");
      });
  }, [holderOptions, currentUser?.id, formHolderId]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, usersRes] = await Promise.all([
        getPettyCashDataAction(),
        getUsers().catch(() => null),
      ]);
      if (Array.isArray(usersRes)) {
        setAdminUsers(usersRes);
      } else if (usersRes?.success && Array.isArray(usersRes.data)) {
        setAdminUsers(usersRes.data);
      }
      if (res.success) {
        setTransactions(res.transactions || []);
        setCategories(res.categories || []);
        setHolderLimits((res as any).holderLimits || {});
        if (Array.isArray((res as any).vehiclePlates)) {
          setVehiclePlates((res as any).vehiclePlates);
        }
        if (Array.isArray((res as any).replenishmentReports)) {
          setReplenishmentReports((res as any).replenishmentReports);
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("petty-cash-updated"));
        }
      } else {
        toast.error(res.error || "ไม่สามารถโหลดข้อมูลเงินสดย่อยได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Combine vehicle plates from active Riders + saved custom plates + existing transactions
  const availableVehiclePlateOptions = useMemo(() => {
    const plateToRiders = new Map<string, string[]>();
    (riders || [])
      .filter((r) => r && r.isActive !== false && r.vehiclePlate && String(r.vehiclePlate).trim())
      .forEach((r) => {
        const plate = String(r.vehiclePlate).trim();
        const label = r.nickname || r.name || "";
        const list = plateToRiders.get(plate) || [];
        if (label && !list.includes(label)) list.push(label);
        plateToRiders.set(plate, list);
      });

    const allPlates = new Set<string>();
    plateToRiders.forEach((_, plate) => allPlates.add(plate));
    (vehiclePlates || []).forEach((p) => {
      if (p && String(p).trim()) allPlates.add(String(p).trim());
    });
    (transactions || []).forEach((t) => {
      if (t.vehiclePlate && String(t.vehiclePlate).trim()) {
        allPlates.add(String(t.vehiclePlate).trim());
      }
    });

    return Array.from(allPlates).map((plate) => {
      const rNames = plateToRiders.get(plate);
      return {
        value: plate,
        label: rNames && rNames.length > 0 ? `${plate} (${rNames.join(", ")})` : plate,
      };
    });
  }, [riders, vehiclePlates, transactions]);

  // Per-Holder Balances (computed immediately from all non-rejected/non-void transactions + authorized holders, with period-filtered breakdown!)
  const holderSummaries = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    const map = new Map<
      string,
      {
        holderId: string;
        holderName: string;
        roleLabel: string;
        department: string;
        isAccounting: boolean;
        branchId?: string | null;
        openingBalance: number;
        closingBalance: number;
        companyTopup: number;
        transferIn: number;
        transferOut: number;
        totalTopup: number;
        totalExpense: number;
        approvedExpense: number;
        allTimeTopup: number;
        allTimeExpense: number;
        currentBalance: number;
        pendingCount: number;
        pendingAmount: number;
        txCount: number;
        allTimeTxCount: number;
      }
    >();

    // Seed all authorized Petty Cash holders so Accounting & Store wallets are visible immediately
    holderOptions.forEach((h) => {
      map.set(h.id, {
        holderId: h.id,
        holderName: h.name,
        roleLabel: h.roleLabel,
        department: h.department,
        isAccounting: h.isAccounting,
        branchId: h.branchId || "HQ",
        openingBalance: 0,
        closingBalance: 0,
        companyTopup: 0,
        transferIn: 0,
        transferOut: 0,
        totalTopup: 0,
        totalExpense: 0,
        approvedExpense: 0,
        allTimeTopup: 0,
        allTimeExpense: 0,
        currentBalance: 0,
        pendingCount: 0,
        pendingAmount: 0,
        txCount: 0,
        allTimeTxCount: 0,
      });
    });

    transactions.forEach((t) => {
      if (!t.holderId) return;
      let entry = map.get(t.holderId);
      if (!entry) {
        const matchedOpt = holderOptions.find((h) => h.id === t.holderId);
        entry = {
          holderId: t.holderId,
          holderName: t.holderName,
          roleLabel: matchedOpt?.roleLabel || "STAFF",
          department: matchedOpt?.department || "STAFF",
          isAccounting: matchedOpt?.isAccounting ?? false,
          branchId: t.branchId || "HQ",
          openingBalance: 0,
          closingBalance: 0,
          companyTopup: 0,
          transferIn: 0,
          transferOut: 0,
          totalTopup: 0,
          totalExpense: 0,
          approvedExpense: 0,
          allTimeTopup: 0,
          allTimeExpense: 0,
          currentBalance: 0,
          pendingCount: 0,
          pendingAmount: 0,
          txCount: 0,
          allTimeTxCount: 0,
        };
        map.set(t.holderId, entry);
      }
      entry.allTimeTxCount += 1;
      if (t.status === "REJECTED" || t.status === "VOID") return;

      const amt = Number(t.amount) || 0;
      const txMs = new Date(t.transactionDate).getTime();
      const isBeforePeriod = fromMs !== null && txMs < fromMs;
      const isAfterPeriod = toMs !== null && txMs > toMs;
      const isInPeriod = !isBeforePeriod && !isAfterPeriod;

      // 1. Live all-time balance & all-time totals
      if (t.direction === "CREDIT") {
        entry.allTimeTopup = Math.round((entry.allTimeTopup + amt) * 100) / 100;
        entry.currentBalance = Math.round((entry.currentBalance + amt) * 100) / 100;
      } else {
        entry.currentBalance = Math.round((entry.currentBalance - amt) * 100) / 100;
        if (t.type !== "TRANSFER_OUT") {
          entry.allTimeExpense = Math.round((entry.allTimeExpense + amt) * 100) / 100;
        }
      }

      // 2. Opening balance before selected dateFrom
      if (isBeforePeriod) {
        if (t.direction === "CREDIT") {
          entry.openingBalance = Math.round((entry.openingBalance + amt) * 100) / 100;
        } else {
          entry.openingBalance = Math.round((entry.openingBalance - amt) * 100) / 100;
        }
      }

      // 3. Period-filtered metrics (or all-time when no date filter is set)
      if (isInPeriod) {
        entry.txCount += 1;
        if (t.direction === "CREDIT") {
          entry.totalTopup = Math.round((entry.totalTopup + amt) * 100) / 100;
          if (t.type === "TRANSFER_IN") {
            entry.transferIn = Math.round((entry.transferIn + amt) * 100) / 100;
          } else {
            entry.companyTopup = Math.round((entry.companyTopup + amt) * 100) / 100;
          }
        } else {
          if (t.type === "TRANSFER_OUT") {
            entry.transferOut = Math.round((entry.transferOut + amt) * 100) / 100;
          } else {
            entry.totalExpense = Math.round((entry.totalExpense + amt) * 100) / 100;
            if (t.status === "APPROVED") {
              entry.approvedExpense = Math.round((entry.approvedExpense + amt) * 100) / 100;
            }
          }
        }

        if (t.status === "PENDING") {
          entry.pendingCount += 1;
          entry.pendingAmount = Math.round((entry.pendingAmount + amt) * 100) / 100;
        }
      }
    });

    // Compute closingBalance at end of selected period
    map.forEach((entry) => {
      entry.closingBalance =
        Math.round(
          (entry.openingBalance + entry.totalTopup - entry.transferOut - entry.totalExpense) * 100
        ) / 100;
    });

    const getDeptRank = (item: { department: string; roleLabel: string; isAccounting: boolean }) => {
      const dept = (item.department || item.roleLabel || "").toUpperCase();
      if (dept.includes("ACCOUNT") || item.roleLabel === "ACCOUNTING") return 1;
      if (dept.includes("ADMIN") || item.roleLabel === "ADMIN" || item.roleLabel === "SUPERADMIN") return 2;
      if (dept.includes("MANAGER") || item.roleLabel === "MANAGER") return 3;
      return 4;
    };

    return Array.from(map.values()).sort((a, b) => {
      const rankDiff = getDeptRank(a) - getDeptRank(b);
      if (rankDiff !== 0) return rankDiff;
      const deptCmp = (a.department || a.roleLabel).localeCompare(b.department || b.roleLabel, "th");
      if (deptCmp !== 0) return deptCmp;
      const branchCmp = getBranchDisplayName(a.branchId).localeCompare(getBranchDisplayName(b.branchId), "th");
      if (branchCmp !== 0) return branchCmp;
      return a.holderName.localeCompare(b.holderName, "th");
    });
  }, [transactions, holderOptions, getBranchDisplayName, dateFrom, dateTo]);

  const accountingCustodians = useMemo(
    () => holderSummaries.filter((h) => h.isAccounting),
    [holderSummaries]
  );

  // Default Wallet filter:
  // - Accounting & Admin (canApproveOrTopUp) default to "ALL" so they see all custodians' transactions immediately.
  // - Regular store custodians default to their own wallet.
  useEffect(() => {
    if (hasInitializedDefaultWalletRef.current) return;
    if (!currentUser?.id || holderSummaries.length === 0) return;
    hasInitializedDefaultWalletRef.current = true;
    if (!canApproveOrTopUp && holderSummaries.some((h) => h.holderId === currentUser.id)) {
      setHolderFilter(currentUser.id);
    } else {
      setHolderFilter("ALL");
    }
  }, [currentUser?.id, holderSummaries, canApproveOrTopUp]);
  const storeCustodians = useMemo(
    () => holderSummaries.filter((h) => !h.isAccounting),
    [holderSummaries]
  );
  const currentUserSummary = useMemo(
    () => holderSummaries.find((h) => h.holderId === currentUser?.id) || null,
    [holderSummaries, currentUser?.id]
  );
  const currentUserBalance = useMemo(() => {
    return currentUserSummary ? currentUserSummary.currentBalance : 0;
  }, [currentUserSummary]);

  // Filtered Transactions — Non-accounting users strictly see ONLY their own transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!canApproveOrTopUp) {
        if (!currentUser?.id || t.holderId !== currentUser.id) return false;
      } else {
        if (holderFilter !== "ALL" && t.holderId !== holderFilter) return false;
        if (branchFilter !== "ALL") {
          const effectiveBranch = t.branchId || "HQ";
          if (effectiveBranch !== branchFilter) return false;
        }
      }
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && t.type !== typeFilter) return false;

      if (dateFrom) {
        const fromMs = new Date(`${dateFrom}T00:00:00`).getTime();
        const txMs = new Date(t.transactionDate).getTime();
        if (txMs < fromMs) return false;
      }
      if (dateTo) {
        const toMs = new Date(`${dateTo}T23:59:59.999`).getTime();
        const txMs = new Date(t.transactionDate).getTime();
        if (txMs > toMs) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          (t.txNumber || "").toLowerCase().includes(q) ||
          (t.holderName || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          (t.vendorName || "").toLowerCase().includes(q) ||
          (t.invoiceNo || "").toLowerCase().includes(q) ||
          (t.vehiclePlate || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    transactions,
    canApproveOrTopUp,
    currentUser?.id,
    holderFilter,
    branchFilter,
    categoryFilter,
    statusFilter,
    typeFilter,
    dateFrom,
    dateTo,
    searchQuery,
  ]);

  // KPI Totals (2-Tier aware: separates Company Top-up, Accounting Pool, Store Pool, and Real Expenses without double-counting internal transfers)
  const kpiStats = useMemo(() => {
    let companyTopupTotal = 0;
    let transferredToStoreTotal = 0;
    let realExpenseTotal = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    let pendingCount = 0;
    let pendingAmount = 0;

    const accountingIds = new Set(accountingCustodians.map((h) => h.holderId));

    filteredTransactions.forEach((t) => {
      if (t.status === "REJECTED" || t.status === "VOID") return;
      const amt = Number(t.amount) || 0;
      if (t.direction === "CREDIT") {
        totalCredit = Math.round((totalCredit + amt) * 100) / 100;
        if (t.type === "TRANSFER_IN") {
          transferredToStoreTotal = Math.round((transferredToStoreTotal + amt) * 100) / 100;
        } else {
          companyTopupTotal = Math.round((companyTopupTotal + amt) * 100) / 100;
        }
      } else {
        totalDebit = Math.round((totalDebit + amt) * 100) / 100;
        if (t.type !== "TRANSFER_OUT" || accountingIds.has(t.holderId)) {
          realExpenseTotal = Math.round((realExpenseTotal + amt) * 100) / 100;
        }
      }
      if (t.status === "PENDING") {
        pendingCount += 1;
        pendingAmount = Math.round((pendingAmount + amt) * 100) / 100;
      }
    });

    const netBalance = Math.round((totalCredit - totalDebit) * 100) / 100;
    const accountingPoolBalance = Math.round(
      accountingCustodians.reduce((s, h) => s + h.currentBalance, 0) * 100
    ) / 100;
    const storePoolBalance = Math.round(
      storeCustodians.reduce((s, h) => s + h.currentBalance, 0) * 100
    ) / 100;

    return {
      totalCredit,
      totalDebit,
      netBalance,
      companyTopupTotal,
      transferredToStoreTotal,
      realExpenseTotal,
      accountingPoolBalance,
      storePoolBalance,
      pendingCount,
      pendingAmount,
    };
  }, [filteredTransactions, accountingCustodians, storeCustodians]);

  // Helper to compress image file to Data URL as fallback if server upload is unavailable
  const readFileAsCompressedDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = String(ev.target?.result || "");
        if (!file.type.startsWith("image/")) {
          resolve(result);
          return;
        }
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.82));
          } else {
            resolve(result);
          }
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Upload files helper (supports FileList or File[] from Ctrl+V clipboard, images + PDF/docs)
  const handleUploadFiles = async (
    files: FileList | File[] | null,
    subType: "receipts" | "slips",
    onSuccessUrls: (urls: string[]) => void,
    setUploading: (val: boolean) => void
  ) => {
    const fileArray = files ? Array.from(files) : [];
    if (fileArray.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    const entityId = editingTx?.id || previewTx?.id || `pc-${Date.now()}`;

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const rawFile = fileArray[i];
        const ext = rawFile.name?.includes(".")
          ? rawFile.name.split(".").pop()
          : rawFile.type.split("/")[1] || "png";
        const safeName =
          rawFile.name && rawFile.name !== "image.png"
            ? rawFile.name
            : `pasted-${subType}-${Date.now()}-${i + 1}.${ext}`;
        const file =
          rawFile.name === safeName
            ? rawFile
            : new File([rawFile], safeName, { type: rawFile.type || "image/png" });

        let publicUrl = "";
        try {
          const signRes = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: "system",
              entityId,
              subType,
              contentType: file.type || "application/octet-stream",
              filename: file.name,
            }),
          });
          if (signRes.ok) {
            const signData = await signRes.json();
            if (signData.uploadUrl && signData.publicUrl) {
              const putRes = await fetch(signData.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
              });
              if (putRes.ok) {
                publicUrl = signData.publicUrl;
              }
            }
          }
        } catch {}

        if (!publicUrl) {
          try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("entityType", "system");
            fd.append("entityId", entityId);
            fd.append("subType", subType);
            const localRes = await fetch("/api/upload-local", { method: "POST", body: fd });
            const localData = await localRes.json();
            if (localData.success && localData.publicUrl) {
              publicUrl = localData.publicUrl;
            }
          } catch {}
        }

        if (!publicUrl && file.type.startsWith("image/")) {
          publicUrl = await readFileAsCompressedDataUrl(file);
        }

        if (publicUrl) {
          uploaded.push(publicUrl);
        }
      }

      if (uploaded.length > 0) {
        onSuccessUrls(uploaded);
        toast.success(
          `Attached ${uploaded.length} file(s) to ${
            subType === "slips" ? "Transfer Slips (สลิปโอนเงิน)" : "Receipts / Docs (ใบเสร็จ)"
          }`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  // Update attachments directly on an existing transaction inside Preview Modal
  const handleUpdatePreviewTxAttachments = async (
    subType: "receipts" | "slips",
    nextUrls: string[]
  ) => {
    if (!previewTx) return;
    const payload =
      subType === "receipts"
        ? { receiptUrls: nextUrls, slipUrls: previewTx.slipUrls || [] }
        : { receiptUrls: previewTx.receiptUrls || [], slipUrls: nextUrls };
    const res = await updatePettyCashTransactionAction(previewTx.id, payload);
    if (res.success) {
      setPreviewTx((prev) =>
        prev
          ? {
              ...prev,
              receiptUrls: payload.receiptUrls,
              slipUrls: payload.slipUrls,
            }
          : null
      );
      await loadData();
    } else {
      toast.error(res.error || "Failed to update attachments");
    }
  };

  // Global Ctrl+V Paste Image Listener for Petty Cash Modals
  useEffect(() => {
    if (!txModalOpen && !previewTx && !reviewReportTarget) return;

    const extractImages = (clipboardData: DataTransfer | null | undefined): File[] => {
      if (!clipboardData) return [];
      const files: File[] = [];
      if (clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.type && item.type.startsWith("image/")) {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }
      if (files.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const f = clipboardData.files[i];
          if (f.type && f.type.startsWith("image/")) {
            files.push(f);
          }
        }
      }
      return files;
    };

    const handleWindowPaste = (e: ClipboardEvent) => {
      const imageFiles = extractImages(e.clipboardData);
      if (imageFiles.length === 0) return;

      // 1. Create / Edit Transaction Modal
      if (txModalOpen) {
        e.preventDefault();
        const isTopupQuickView = txMode === "TOPUP" && !editingTx;
        const effectiveTarget: "receipts" | "slips" = isTopupQuickView ? "slips" : pasteTarget;

        if (effectiveTarget === "slips") {
          handleUploadFiles(
            imageFiles,
            "slips",
            (urls) => setFormSlipUrls((prev) => [...prev, ...urls]),
            setIsUploadingSlips
          );
        } else {
          handleUploadFiles(
            imageFiles,
            "receipts",
            (urls) => setFormReceiptUrls((prev) => [...prev, ...urls]),
            setIsUploadingReceipts
          );
        }
        return;
      }

      // 2. Attachment Preview Modal (for existing transactions)
      if (previewTx) {
        e.preventDefault();
        if (previewPasteTarget === "slips") {
          handleUploadFiles(
            imageFiles,
            "slips",
            async (urls) => {
              const next = [...(previewTx.slipUrls || []), ...urls];
              await handleUpdatePreviewTxAttachments("slips", next);
            },
            setIsUploadingSlips
          );
        } else {
          handleUploadFiles(
            imageFiles,
            "receipts",
            async (urls) => {
              const next = [...(previewTx.receiptUrls || []), ...urls];
              await handleUpdatePreviewTxAttachments("receipts", next);
            },
            setIsUploadingReceipts
          );
        }
        return;
      }

      // 3. Replenishment Report Review Modal (Accounting pastes transfer slip)
      if (reviewReportTarget) {
        e.preventDefault();
        handleUploadFiles(
          imageFiles,
          "slips",
          (urls) => setReviewSlipUrls((prev) => [...prev, ...urls]),
          setIsUploadingSlips
        );
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [txModalOpen, txMode, editingTx, pasteTarget, previewTx, previewPasteTarget, reviewReportTarget]);

  const getHolderLimit = useCallback(
    (holderId: string, isAccounting?: boolean): number => {
      if (holderId && typeof holderLimits[holderId] === "number" && holderLimits[holderId] >= 0) {
        return holderLimits[holderId];
      }
      const found = holderOptions.find((h) => h.id === holderId);
      const acc = isAccounting ?? found?.isAccounting ?? false;
      return acc ? 10000 : 3000;
    },
    [holderLimits, holderOptions]
  );

  const handleSaveHolderLimit = async (targetHolderId: string, limitStr: string) => {
    const parsed = parseFloat(limitStr);
    if (!targetHolderId || isNaN(parsed) || parsed < 0) {
      toast.error("กรุณาระบุวงเงินสดย่อยที่ถูกต้อง");
      return;
    }
    setIsSavingLimit(true);
    try {
      const res = await savePettyCashHolderLimitAction(targetHolderId, parsed);
      if (res.success && res.holderLimits) {
        setHolderLimits(res.holderLimits);
        setIsEditingLimit(false);
        toast.success(`บันทึกวงเงินสดย่อย ฿${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} เรียบร้อยแล้ว`);
      } else {
        toast.error(res.error || "ไม่สามารถบันทึกวงเงินสดย่อยได้");
      }
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาดในการบันทึกวงเงิน");
    } finally {
      setIsSavingLimit(false);
    }
  };

  // Open Create Modal — Sender/Holder defaults to logged-in user, or presetRecipient when TOPUP
  const handleOpenCreateModal = (
    mode: "EXPENSE" | "TOPUP" | "TRANSFER" | "RETURN",
    presetRecipient?: { id: string; name: string; branchId?: string | null },
    docType: ExpenseDocType = "EXPENSE_DOC"
  ) => {
    const allowedDocType: ExpenseDocType = canApproveOrTopUp ? docType : "EXPENSE_DOC";
    setEditingTx(null);
    setTxMode(mode);
    setExpenseDocType(allowedDocType);
    setExpenseMenuOpen(false);
    const fixedHolderId = (mode === "TOPUP" && presetRecipient?.id) ? presetRecipient.id : (currentUser?.id || "");
    const fixedHolderName = (mode === "TOPUP" && presetRecipient?.name) ? presetRecipient.name : (currentUser?.name || currentUser?.email || "Current User");
    const fixedBranchId =
      (mode === "TOPUP" && presetRecipient?.branchId)
        ? presetRecipient.branchId
        : (currentUser?.branchId || (branchFilter !== "ALL" ? branchFilter : "HQ"));

    setFormHolderId(fixedHolderId);
    setFormHolderName(fixedHolderName);
    setFormBranchId(fixedBranchId);

    // Initialize limit & source account for TOPUP ("เติมเงิน/เบิกคืนเงินสดย่อย")
    setFormHolderLimit(String(getHolderLimit(fixedHolderId)));
    setIsEditingLimit(false);
    setFormTopupSourceAccount("");
    const defaultSourceHolder =
      currentUser?.id && currentUser.id !== fixedHolderId
        ? currentUser.id
        : holderOptions.find((h) => h.id !== fixedHolderId)?.id || "";
    setFormSourceHolderId(defaultSourceHolder);

    const defaultRecipient = presetRecipient || transferRecipientOptions[0] || null;
    setFormTargetHolderId(defaultRecipient?.id || "");
    setFormTargetHolderName(defaultRecipient?.name || "");
    setFormTargetBranchId(defaultRecipient?.branchId || "HQ");

    const docConfig = EXPENSE_DOC_TYPE_CONFIG[allowedDocType];
    setFormCategory(
      mode === "TOPUP"
        ? "Company Top-up (รับเงินโอนจากบริษัท)"
        : mode === "TRANSFER"
          ? "Transfer to Store (โอนวงเงินให้หน้าร้าน)"
          : mode === "RETURN"
            ? "Return Petty Cash (คืนเงินสดย่อย)"
            : docConfig.defaultCategory || categories[0] || "Store Misc (ค่าใช้จ่ายหน้าร้าน/เบ็ดเตล็ด)"
    );
    setFormAmount("");
    setFormDescription("");
    setFormVendorName("");
    setFormInvoiceNo("");
    setFormVehiclePlate("");
    setFormPaymentMethod(mode === "TOPUP" || mode === "TRANSFER" ? "Transfer" : "Cash");
    setFormDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setFormReceiptUrls([]);
    setFormSlipUrls([]);
    setPasteTarget(mode === "TOPUP" || mode === "TRANSFER" ? "slips" : "receipts");
    setShowQuickAddCategory(false);
    setNewQuickCategory("");
    setShowQuickAddPlate(false);
    setNewQuickPlate("");
    setTxModalOpen(true);
  };

  // Close Expense & Export Dropdowns on outside click + Alt+N shortcut for "เอกสารค่าใช้จ่าย"
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (expenseMenuRef.current && !expenseMenuRef.current.contains(e.target as Node)) {
        setExpenseMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleOpenCreateModal("EXPENSE", undefined, "EXPENSE_DOC");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  // Open Edit Modal
  const handleOpenEditModal = (tx: PettyCashTx) => {
    setEditingTx(tx);
    setTxMode(
      tx.type === "TOPUP"
        ? "TOPUP"
        : tx.type === "TRANSFER_OUT" || tx.type === "TRANSFER_IN"
          ? "TRANSFER"
          : tx.type === "RETURN"
            ? "RETURN"
            : "EXPENSE"
    );
    setFormHolderId(tx.holderId);
    setFormHolderName(tx.holderName);
    setFormBranchId(tx.branchId || "HQ");
    setFormTargetHolderId(tx.counterpartyId || "");
    setFormTargetHolderName(tx.counterpartyName || "");
    setFormTargetBranchId(tx.branchId || "HQ");
    setFormCategory(tx.category);
    setFormAmount(String(tx.amount));
    setFormDescription(tx.description);
    setFormVendorName(tx.vendorName || "");
    setFormInvoiceNo(tx.invoiceNo || "");
    setFormVehiclePlate(tx.vehiclePlate || "");
    setFormPaymentMethod(tx.paymentMethod || "Cash");
    setFormDate(format(new Date(tx.transactionDate), "yyyy-MM-dd'T'HH:mm"));
    setFormReceiptUrls(Array.isArray(tx.receiptUrls) ? [...tx.receiptUrls] : []);
    setFormSlipUrls(Array.isArray(tx.slipUrls) ? [...tx.slipUrls] : []);
    setPasteTarget(
      tx.type === "TOPUP" || tx.type === "TRANSFER_OUT" || tx.type === "TRANSFER_IN"
        ? "slips"
        : "receipts"
    );
    setShowQuickAddCategory(false);
    setNewQuickCategory("");
    setShowQuickAddPlate(false);
    setNewQuickPlate("");
    setTxModalOpen(true);
  };

  // Quick Add Category inside Expense Form
  const handleQuickAddCategory = async () => {
    const trimmed = newQuickCategory.trim();
    if (!trimmed) return;
    const nextCats = Array.from(new Set([...categories, trimmed]));
    const res = await savePettyCashCategoriesAction(nextCats);
    if (res.success && res.categories) {
      setCategories(res.categories);
      setFormCategory(trimmed);
      setNewQuickCategory("");
      setShowQuickAddCategory(false);
      toast.success(`เพิ่มหมวดหมู่ "${trimmed}" เรียบร้อยแล้ว`);
    } else {
      toast.error(res.error || "ไม่สามารถบันทึกหมวดหมู่ได้");
    }
  };

  // Quick Add Vehicle Plate inside Expense Form
  const handleQuickAddPlate = async () => {
    const trimmed = newQuickPlate.trim();
    if (!trimmed) return;
    const nextPlates = Array.from(new Set([...vehiclePlates, trimmed]));
    const res = await savePettyCashVehiclePlatesAction(nextPlates);
    if (res.success && res.vehiclePlates) {
      setVehiclePlates(res.vehiclePlates);
      setFormVehiclePlate(trimmed);
      setNewQuickPlate("");
      setShowQuickAddPlate(false);
      toast.success(`เพิ่มเลขทะเบียนรถ "${trimmed}" เรียบร้อยแล้ว`);
    } else {
      toast.error(res.error || "ไม่สามารถบันทึกเลขทะเบียนรถได้");
    }
  };

  // Submit Create or Edit Transaction
  const handleSubmitTransaction = async () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่มากกว่า 0");
      return;
    }
    if (!formHolderId || !formHolderName) {
      toast.error("ไม่พบข้อมูลผู้ทำรายการ");
      return;
    }

    if (!editingTx && txMode === "TOPUP") {
      if (!formTopupSourceAccount) {
        toast.error("Please select a source account (กรุณาเลือกช่องทางการเงิน)");
        return;
      }
      if (formTopupSourceAccount === "Petty Cash Wallet") {
        if (!formSourceHolderId) {
          toast.error("Please select a source petty cash wallet (กรุณาเลือกกระเป๋าเงินสดย่อยต้นทาง)");
          return;
        }
        if (formSourceHolderId === formHolderId) {
          toast.error("Source wallet and recipient cannot be the same (กระเป๋าต้นทางและผู้รับต้องไม่ใช่คนเดียวกัน)");
          return;
        }
      }
    } else if (!editingTx && txMode === "TRANSFER") {
      if (!formTargetHolderId || !formTargetHolderName) {
        toast.error("กรุณาเลือกผู้รับโอนปลายทาง (หน้าร้าน / พนักงาน)");
        return;
      }
      if (formTargetHolderId === formHolderId) {
        toast.error("ผู้โอนต้นทางและผู้รับปลายทางต้องไม่ใช่คนเดียวกัน");
        return;
      }
    } else {
      if (!formCategory.trim()) {
        toast.error("กรุณาเลือกหมวดหมู่รายการ");
        return;
      }
      if (!formDescription.trim()) {
        toast.error("กรุณาระบุรายละเอียดรายการ");
        return;
      }
    }

    setIsSubmittingTx(true);
    try {
      // Auto-save custom Petty Cash Limit if Accounting changed it inside the Top-up modal
      if (!editingTx && txMode === "TOPUP" && canApproveOrTopUp) {
        const parsedLimit = parseFloat(formHolderLimit);
        const currentSavedLimit = getHolderLimit(formHolderId);
        if (!isNaN(parsedLimit) && parsedLimit >= 0 && Math.abs(parsedLimit - currentSavedLimit) > 0.001) {
          const limitRes = await savePettyCashHolderLimitAction(formHolderId, parsedLimit);
          if (limitRes.success && limitRes.holderLimits) {
            setHolderLimits(limitRes.holderLimits);
          }
        }
      }

      if (editingTx) {
        const res = await updatePettyCashTransactionAction(editingTx.id, {
          amount: amt,
          holderId: formHolderId,
          holderName: formHolderName,
          branchId: formBranchId || null,
          category: formCategory.trim(),
          description: formDescription.trim(),
          vendorName: formVendorName.trim() || null,
          invoiceNo: formInvoiceNo.trim() || null,
          vehiclePlate: txMode === "EXPENSE" && isVehicleExpenseCategory(formCategory) ? (formVehiclePlate.trim() || null) : null,
          paymentMethod: formPaymentMethod,
          receiptUrls: formReceiptUrls,
          slipUrls: formSlipUrls,
          transactionDate: formDate ? new Date(formDate) : new Date(),
        });
        if (!res.success) {
          toast.error(res.error || "อัปเดตรายการไม่สำเร็จ");
          return;
        }
        toast.success("อัปเดตรายการเงินสดย่อยเรียบร้อยแล้ว");
      } else if (txMode === "TOPUP" && formTopupSourceAccount === "Petty Cash Wallet") {
        const sourceHolder = holderOptions.find((h) => h.id === formSourceHolderId);
        const fromName = sourceHolder?.name || "Petty Cash Holder";
        const fromBranch = sourceHolder?.branchId || "HQ";
        const res = await transferPettyCashAction({
          fromHolderId: formSourceHolderId,
          fromHolderName: fromName,
          fromBranchId: fromBranch,
          toHolderId: formHolderId,
          toHolderName: formHolderName,
          toBranchId: formBranchId || "HQ",
          amount: amt,
          description:
            formDescription.trim() ||
            `Petty cash replenishment from ${fromName} to ${formHolderName}`,
          paymentMethod: "Transfer",
          receiptUrls: formReceiptUrls,
          slipUrls: formSlipUrls,
          transactionDate: formDate ? new Date(formDate) : new Date(),
        });
        if (!res.success) {
          toast.error(res.error || "Failed to transfer from petty cash wallet");
          return;
        }
        toast.success(
          `Top-up ฿${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from ${fromName} -> ${formHolderName} completed`
        );
      } else if (txMode === "TRANSFER") {
        const res = await transferPettyCashAction({
          fromHolderId: formHolderId,
          fromHolderName: formHolderName,
          fromBranchId: formBranchId || "HQ",
          toHolderId: formTargetHolderId,
          toHolderName: formTargetHolderName,
          toBranchId: formTargetBranchId || "HQ",
          amount: amt,
          description:
            formDescription.trim() ||
            `โอนวงเงินสดย่อยให้ ${formTargetHolderName} (${getBranchDisplayName(formTargetBranchId)})`,
          paymentMethod: formPaymentMethod || "Transfer",
          receiptUrls: formReceiptUrls,
          slipUrls: formSlipUrls,
          transactionDate: formDate ? new Date(formDate) : new Date(),
        });
        if (!res.success) {
          toast.error(res.error || "โอนเงินสดย่อยไม่สำเร็จ");
          return;
        }
        toast.success(
          `⇄ โอนวงเงินสดย่อย ฿${amt.toLocaleString()} จาก ${formHolderName} -> ${formTargetHolderName} สำเร็จ (ตัดบัญชี & เพิ่มยอดหน้าร้านอัตโนมัติ)`
        );
      } else {
        const effectiveCategory =
          txMode === "TOPUP"
            ? `Company Top-up (${formTopupSourceAccount})`
            : formCategory.trim();
        const effectiveDescription =
          txMode === "TOPUP"
            ? formDescription.trim() || `Petty Cash Replenishment (${formTopupSourceAccount})`
            : formDescription.trim();
        const effectiveMethod =
          txMode === "TOPUP"
            ? formTopupSourceAccount === "Cash"
              ? "Cash"
              : "Transfer"
            : formPaymentMethod;

        const res = await createPettyCashTransactionAction({
          type: txMode,
          amount: amt,
          holderId: formHolderId,
          holderName: formHolderName,
          branchId: formBranchId || null,
          category: effectiveCategory,
          description: effectiveDescription,
          vendorName: formVendorName.trim() || null,
          invoiceNo: formInvoiceNo.trim() || null,
          vehiclePlate: txMode === "EXPENSE" && isVehicleExpenseCategory(formCategory) ? (formVehiclePlate.trim() || null) : null,
          paymentMethod: effectiveMethod,
          receiptUrls: formReceiptUrls,
          slipUrls: formSlipUrls,
          transactionDate: formDate ? new Date(formDate) : new Date(),
        });
        if (!res.success) {
          toast.error(res.error || "บันทึกรายการไม่สำเร็จ");
          return;
        }
        toast.success(
          txMode === "TOPUP"
            ? `เติมเงินสดย่อย +฿${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${formTopupSourceAccount}) เข้ากระเป๋า ${formHolderName} สำเร็จ`
            : `บันทึกเบิกจ่าย -฿${amt.toLocaleString()} (${formHolderName}) และตัดยอดคงเหลือทันทีเรียบร้อยแล้ว`
        );
      }

      setTxModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSubmittingTx(false);
    }
  };

  // Approve immediately
  const handleQuickApprove = async (tx: PettyCashTx) => {
    setIsReviewing(true);
    try {
      const res = await reviewPettyCashTransactionAction({
        id: tx.id,
        action: "APPROVE",
      });
      if (res.success) {
        toast.success(`อนุมัติรายการ ${tx.txNumber || ""} เรียบร้อยแล้ว`);
        await loadData();
        window.dispatchEvent(new Event("petty-cash-updated"));
      } else {
        toast.error(res.error || "ไม่สามารถอนุมัติรายการได้");
      }
    } finally {
      setIsReviewing(false);
    }
  };

  // Confirm Reject / Void
  const handleConfirmRejectOrVoid = async () => {
    if (!rejectTargetTx) return;
    if (!rejectReason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการปฏิเสธหรือยกเลิกรายการ");
      return;
    }
    setIsReviewing(true);
    try {
      const res = await reviewPettyCashTransactionAction({
        id: rejectTargetTx.id,
        action: rejectActionType,
        reason: rejectReason.trim(),
      });
      if (res.success) {
        toast.success(
          rejectActionType === "REJECT"
            ? "ปฏิเสธรายการ คืนยอดเงินสดย่อยกลับเข้าคงเหลือ และเปิด Task ติดตามงานเรียบร้อยแล้ว"
            : "ยกเลิกรายการ (Void) และปรับปรุงยอดคงเหลือเรียบร้อยแล้ว"
        );
        setRejectModalOpen(false);
        setRejectTargetTx(null);
        setRejectReason("");
        await loadData();
        window.dispatchEvent(new Event("petty-cash-updated"));
      } else {
        toast.error(res.error || "ดำเนินการไม่สำเร็จ");
      }
    } finally {
      setIsReviewing(false);
    }
  };

  // Save Category Manager
  const handleSaveCategoriesModal = async () => {
    if (editableCategories.length === 0) {
      toast.error("ต้องมีหมวดหมู่อย่างน้อย 1 รายการ");
      return;
    }
    setIsSavingCategories(true);
    try {
      const res = await savePettyCashCategoriesAction(editableCategories);
      if (res.success && res.categories) {
        setCategories(res.categories);
        setCatModalOpen(false);
        toast.success("บันทึกหมวดหมู่ค่าใช้จ่ายเรียบร้อยแล้ว");
      } else {
        toast.error(res.error || "ไม่สามารถบันทึกหมวดหมู่ได้");
      }
    } finally {
      setIsSavingCategories(false);
    }
  };

  const getNetClaimDelta = useCallback((t: PettyCashTx): number => {
    const amt = Number(t.amount) || 0;
    return t.direction === "CREDIT" ? -amt : amt;
  }, []);

  // Unclaimed & APPROVED (or PENDING for Accounting custodians/submitters) transactions for a holder
  // Includes both DEBIT (EXPENSE / TRANSFER_OUT / ADJUST_DEDUCT) and non-TOPUP CREDIT returns (TRANSFER_IN / RETURN / ADJUST_ADD)
  // so Net Replenishment always reconciles 1:1 with Quota - Current Balance.
  const getUnclaimedExpenseTxsForHolder = useCallback(
    (targetHolderId: string): PettyCashTx[] => {
      if (!targetHolderId) return [];
      const targetSummary = holderSummaries.find((h) => h.holderId === targetHolderId);
      const allowPendingForAccounting = Boolean(targetSummary?.isAccounting || canApproveOrTopUp);
      return transactions.filter(
        (t) =>
          t.holderId === targetHolderId &&
          (t.status === "APPROVED" || (allowPendingForAccounting && t.status === "PENDING")) &&
          !t.replenishmentReportId &&
          (t.direction === "DEBIT" || t.type === "TRANSFER_IN" || t.type === "RETURN" || t.type === "ADJUST_ADD")
      );
    },
    [transactions, holderSummaries, canApproveOrTopUp]
  );

  // Open Submit Replenishment Report Modal
  const handleOpenSubmitReportModal = (presetHolderId?: string) => {
    const targetId = presetHolderId || (holderFilter !== "ALL" ? holderFilter : currentUser?.id || holderSummaries[0]?.holderId || "");
    setReportHolderId(targetId);
    const unclaimed = getUnclaimedExpenseTxsForHolder(targetId);
    const ids = unclaimed.map((t) => t.id);
    setReportSelectedTxIds(ids);
    const totalExp = Math.round(unclaimed.reduce((s, t) => s + getNetClaimDelta(t), 0) * 100) / 100;
    const hSum = holderSummaries.find((h) => h.holderId === targetId);
    const limit = getHolderLimit(targetId, hSum?.isAccounting);
    const shortfall = Math.max(0, Math.round((limit - (hSum?.currentBalance ?? 0)) * 100) / 100);
    const defaultReq = totalExp > 0 ? totalExp : shortfall;
    setReportRequestedAmount(defaultReq > 0 ? defaultReq.toFixed(2) : "");
    setReportNote("");
    setSubmitReportModalOpen(true);
  };

  // Submit Replenishment Report to Accounting
  const handleConfirmSubmitReport = async () => {
    const hSum = holderSummaries.find((h) => h.holderId === reportHolderId);
    const holderOpt = holderOptions.find((h) => h.id === reportHolderId);
    const holderName = hSum?.holderName || holderOpt?.name || currentUser?.name || "Custodian";
    const branchId = hSum?.branchId || holderOpt?.branchId || currentUser?.branchId || "HQ";

    const selectedTxs = transactions.filter((t) => reportSelectedTxIds.includes(t.id));
    if (selectedTxs.length === 0) {
      toast.error("กรุณาเลือกรายการใช้จ่ายอย่างน้อย 1 รายการเพื่อสรุป Report ขอเบิกเงินสดย่อย");
      return;
    }

    const totalExp = Math.round(selectedTxs.reduce((s, t) => s + getNetClaimDelta(t), 0) * 100) / 100;
    const reqAmt = parseFloat(reportRequestedAmount);
    if (isNaN(reqAmt) || reqAmt <= 0) {
      toast.error("กรุณาระบุยอดเงินที่ต้องการขอเบิกชดเชย (> 0)");
      return;
    }

    const catMap = new Map<string, { category: string; amount: number; count: number }>();
    let minDateMs: number | null = null;
    let maxDateMs: number | null = null;

    selectedTxs.forEach((t) => {
      const cat = t.category || "Uncategorized";
      const cur = catMap.get(cat) || { category: cat, amount: 0, count: 0 };
      cur.amount = Math.round((cur.amount + getNetClaimDelta(t)) * 100) / 100;
      cur.count += 1;
      catMap.set(cat, cur);

      const ms = new Date(t.transactionDate).getTime();
      if (!isNaN(ms)) {
        if (minDateMs === null || ms < minDateMs) minDateMs = ms;
        if (maxDateMs === null || ms > maxDateMs) maxDateMs = ms;
      }
    });

    setIsSubmittingReport(true);
    try {
      const res = await submitPettyCashReplenishmentReportAction({
        holderId: reportHolderId,
        holderName,
        branchId,
        periodStart: minDateMs ? new Date(minDateMs) : null,
        periodEnd: maxDateMs ? new Date(maxDateMs) : null,
        quotaLimit: getHolderLimit(reportHolderId, hSum?.isAccounting),
        currentBalanceAtSubmit: hSum?.currentBalance ?? 0,
        totalExpenseAmount: totalExp,
        requestedAmount: reqAmt,
        expenseTxIds: reportSelectedTxIds,
        categorySummary: Array.from(catMap.values()).sort((a, b) => b.amount - a.amount),
        note: reportNote.trim() || undefined,
      });

      if (res.success) {
        toast.success(
          `ส่งใบสรุปค่าใช้จ่าย (${res.report?.reportNumber || "Report"}) ยอดขอเบิก ฿${reqAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ให้ฝ่ายบัญชีตรวจสอบเรียบร้อยแล้ว`
        );
        setSubmitReportModalOpen(false);
        setActiveViewTab("claims");
        await loadData();
      } else {
        toast.error(res.error || "ไม่สามารถส่งสรุป Report ได้");
      }
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Open Accounting Review Modal for a Replenishment Report
  const handleOpenReviewReportModal = (rep: PettyCashReplenishmentReport) => {
    setReviewReportTarget(rep);
    setReviewApprovedAmount(rep.requestedAmount.toFixed(2));
    setReviewTopupChannel(rep.topupChannel || "Bank Account");
    const defaultSource =
      currentUser?.id && currentUser.id !== rep.holderId
        ? currentUser.id
        : holderOptions.find((h) => h.id !== rep.holderId)?.id || "";
    setReviewSourceHolderId(defaultSource);
    setReviewSlipUrls(Array.isArray(rep.slipUrls) ? [...rep.slipUrls] : []);
    setReviewRemark(`Replenishment per Report #${rep.reportNumber}`);
    setReviewRejectReason("");
  };

  // Accounting Approves or Rejects a Replenishment Report
  const handleConfirmReviewReport = async (action: "APPROVE" | "APPROVE_AND_DISBURSE" | "REJECT") => {
    if (!reviewReportTarget) return;
    if (action === "REJECT" && !reviewRejectReason.trim()) {
      toast.error("กรุณาระบุเหตุผลที่ไม่อนุมัติ Report นี้");
      return;
    }
    const amt = parseFloat(reviewApprovedAmount);
    if (action !== "REJECT" && (isNaN(amt) || amt <= 0)) {
      toast.error("กรุณาระบุยอดอนุมัติเบิกชดเชยที่ถูกต้อง");
      return;
    }

    setIsReviewingReport(true);
    try {
      const sourceHolder = holderOptions.find((h) => h.id === reviewSourceHolderId);
      const res = await reviewPettyCashReplenishmentReportAction({
        reportId: reviewReportTarget.id,
        action,
        approvedAmount: amt,
        rejectReason: reviewRejectReason.trim(),
        topupSourceAccount: reviewTopupChannel,
        sourceHolderId: reviewSourceHolderId,
        sourceHolderName: sourceHolder?.name || currentUser?.name || "Accounting",
        sourceBranchId: sourceHolder?.branchId || "HQ",
        slipUrls: reviewSlipUrls,
        remark: reviewRemark.trim(),
      });

      if (res.success) {
        toast.success(
          action === "APPROVE_AND_DISBURSE"
            ? `อนุมัติใบสรุป #${reviewReportTarget.reportNumber} และเติมเงินสดย่อย +฿${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} เข้ากระเป๋า ${reviewReportTarget.holderName} เรียบร้อยแล้ว`
            : action === "APPROVE"
              ? `อนุมัติใบสรุป #${reviewReportTarget.reportNumber} เรียบร้อยแล้ว (รอโอนจ่ายเงินชดเชย)`
              : `ปฏิเสธใบสรุป #${reviewReportTarget.reportNumber} และคืนสถานะบิลให้แก้ไขเรียบร้อยแล้ว`
        );
        setReviewReportTarget(null);
        await loadData();
      } else {
        toast.error(res.error || "ดำเนินการไม่สำเร็จ");
      }
    } finally {
      setIsReviewingReport(false);
    }
  };

  const periodLabel = useMemo(() => {
    try {
      if (dateFrom && dateTo) {
        if (dateFrom === dateTo) {
          return `${format(new Date(`${dateFrom}T00:00:00`), "dd/MM/yyyy")} (รายวัน)`;
        }
        return `${format(new Date(`${dateFrom}T00:00:00`), "dd/MM/yyyy")} – ${format(new Date(`${dateTo}T00:00:00`), "dd/MM/yyyy")}`;
      }
      if (dateFrom) return `ตั้งแต่วันที่ ${format(new Date(`${dateFrom}T00:00:00`), "dd/MM/yyyy")}`;
      if (dateTo) return `ถึงวันที่ ${format(new Date(`${dateTo}T00:00:00`), "dd/MM/yyyy")}`;
    } catch {}
    return "ทั้งหมด (All Time)";
  }, [dateFrom, dateTo]);

  // Thai Baht Text Converter (e.g. 2135 -> "สองพันหนึ่งร้อยสามสิบห้าบาทถ้วน")
  const toThaiBahtText = (amount: number): string => {
    const abs = Math.abs(Number(amount) || 0);
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split(".");
    const numWords = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    const posWords = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

    const convertDigits = (digitsStr: string): string => {
      if (!digitsStr || /^0+$/.test(digitsStr)) return "";
      let out = "";
      const len = digitsStr.length;
      for (let i = 0; i < len; i++) {
        const d = parseInt(digitsStr[i], 10);
        const pos = len - i - 1;
        const modPos = pos % 6;
        if (d !== 0) {
          if (modPos === 1 && d === 1) {
            out += "";
          } else if (modPos === 1 && d === 2) {
            out += "ยี่";
          } else if (modPos === 0 && d === 1 && len > 1 && digitsStr[i - 1] !== "0") {
            out += "เอ็ด";
          } else {
            out += numWords[d];
          }
          out += posWords[modPos];
        }
        if (pos > 0 && modPos === 0) {
          out += "ล้าน";
        }
      }
      return out;
    };

    const bahtWords = convertDigits(intPart) || "ศูนย์";
    const satangWords = convertDigits(decPart);
    const prefix = amount < 0 ? "ลบ" : "";
    return satangWords
      ? `${prefix}${bahtWords}บาท${satangWords}สตางค์`
      : `${prefix}${bahtWords}บาทถ้วน`;
  };

  // Extended Analytics for Detailed Modern Dashboard & Reports
  const dashboardDetails = useMemo(() => {
    const totalLimitAll = holderSummaries.reduce(
      (sum, h) => sum + getHolderLimit(h.holderId, h.isAccounting),
      0
    );
    const totalWalletBalanceAll = Math.round(
      holderSummaries.reduce((sum, h) => sum + h.currentBalance, 0) * 100
    ) / 100;
    const totalShortfallAll = Math.round(
      holderSummaries.reduce((sum, h) => {
        const lim = getHolderLimit(h.holderId, h.isAccounting);
        return sum + Math.max(0, lim - h.currentBalance);
      }, 0) * 100
    ) / 100;

    let txWithAttachments = 0;
    let expenseTxCount = 0;
    let topupTxCount = 0;
    let transferTxCount = 0;
    let approvedExpenseTotal = 0;
    const categorySpendMap = new Map<string, { category: string; amount: number; count: number }>();

    const accountingIds = new Set(accountingCustodians.map((h) => h.holderId));

    filteredTransactions.forEach((t) => {
      if (t.status === "REJECTED" || t.status === "VOID") return;
      const amt = Number(t.amount) || 0;
      const hasFiles = (t.receiptUrls?.length || 0) + (t.slipUrls?.length || 0) > 0;
      if (hasFiles) txWithAttachments += 1;

      if (t.type === "TOPUP") {
        topupTxCount += 1;
      } else if (t.type === "TRANSFER_IN" || t.type === "TRANSFER_OUT") {
        transferTxCount += 1;
        if (t.type === "TRANSFER_OUT" && accountingIds.has(t.holderId)) {
          expenseTxCount += 1;
          if (t.status === "APPROVED") {
            approvedExpenseTotal = Math.round((approvedExpenseTotal + amt) * 100) / 100;
          }
          const catName = t.category || "Transfer to Store";
          const prev = categorySpendMap.get(catName) || { category: catName, amount: 0, count: 0 };
          prev.amount = Math.round((prev.amount + amt) * 100) / 100;
          prev.count += 1;
          categorySpendMap.set(catName, prev);
        }
      } else if (t.direction === "DEBIT") {
        expenseTxCount += 1;
        if (t.status === "APPROVED") {
          approvedExpenseTotal = Math.round((approvedExpenseTotal + amt) * 100) / 100;
        }
        const catName = t.category || "Uncategorized";
        const prev = categorySpendMap.get(catName) || { category: catName, amount: 0, count: 0 };
        prev.amount = Math.round((prev.amount + amt) * 100) / 100;
        prev.count += 1;
        categorySpendMap.set(catName, prev);
      }
    });

    const activeValidCount = filteredTransactions.filter(
      (t) => t.status !== "REJECTED" && t.status !== "VOID"
    ).length;
    const attachmentCompliancePct =
      activeValidCount > 0 ? Math.round((txWithAttachments / activeValidCount) * 100) : 100;

    const categoryBreakdown = Array.from(categorySpendMap.values()).sort(
      (a, b) => b.amount - a.amount
    );

    // Filtered holder summaries matching current branch/holder filters for the report table
    const visibleHolderSummaries = holderSummaries.filter((h) => {
      if (!canApproveOrTopUp) {
        return currentUser?.id ? h.holderId === currentUser.id : false;
      }
      if (holderFilter !== "ALL" && h.holderId !== holderFilter) return false;
      if (branchFilter !== "ALL") {
        const effectiveBranch = h.branchId || "HQ";
        if (effectiveBranch !== branchFilter) return false;
      }
      return true;
    });

    return {
      totalLimitAll,
      totalWalletBalanceAll,
      totalShortfallAll,
      txWithAttachments,
      activeValidCount,
      attachmentCompliancePct,
      expenseTxCount,
      topupTxCount,
      transferTxCount,
      approvedExpenseTotal,
      categoryBreakdown,
      visibleHolderSummaries,
    };
  }, [
    holderSummaries,
    getHolderLimit,
    filteredTransactions,
    canApproveOrTopUp,
    currentUser?.id,
    holderFilter,
    branchFilter,
  ]);

  // Structured Thai Accounting Petty Cash Report Data (powers both Report Tab & Print/PDF)
  const thaiAccountingReport = useMemo(() => {
    const THAI_MONTHS = [
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ];
    const fmtThaiDateBE = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear() + 543;
      return `${dd}/${mm}/${yyyy}`;
    };

    let thaiPeriodLabel = "ทั้งหมด";
    try {
      if (dateFrom && dateTo) {
        const d1 = new Date(`${dateFrom}T00:00:00`);
        const d2 = new Date(`${dateTo}T00:00:00`);
        const isFullMonth =
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === 1 &&
          d2.getDate() === new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
        if (isFullMonth) {
          thaiPeriodLabel = `${THAI_MONTHS[d1.getMonth()]} ${d1.getFullYear() + 543}`;
        } else if (dateFrom === dateTo) {
          thaiPeriodLabel = fmtThaiDateBE(d1);
        } else {
          thaiPeriodLabel = `${fmtThaiDateBE(d1)} – ${fmtThaiDateBE(d2)}`;
        }
      } else if (dateFrom) {
        thaiPeriodLabel = `ตั้งแต่ ${fmtThaiDateBE(new Date(`${dateFrom}T00:00:00`))}`;
      } else if (dateTo) {
        thaiPeriodLabel = `ถึง ${fmtThaiDateBE(new Date(`${dateTo}T00:00:00`))}`;
      }
    } catch {}

    const printedDateBE = fmtThaiDateBE(new Date());

    // Section 1: Expense items only (exclude TOPUP / TRANSFER / RETURN / REJECTED / VOID) sorted chronologically
    const expenseItems = filteredTransactions
      .filter((t) => t.type === "EXPENSE" && t.status !== "REJECTED" && t.status !== "VOID")
      .slice()
      .sort(
        (a, b) =>
          new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
      );

    const totalExpenseInPeriod =
      Math.round(expenseItems.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;

    // Custodians to include in Pivot Matrix (everyone with expenses in this period + active visible wallets)
    const custodianMap = new Map<
      string,
      {
        holderId: string;
        holderName: string;
        shortName: string;
        limit: number;
        currentBalance: number;
        periodExpense: number;
      }
    >();

    for (const h of dashboardDetails.visibleHolderSummaries) {
      const shortName = (h.holderName || "").trim().split(/\s+/)[0] || h.holderName;
      custodianMap.set(h.holderId, {
        holderId: h.holderId,
        holderName: h.holderName,
        shortName,
        limit: getHolderLimit(h.holderId, h.isAccounting),
        currentBalance: Math.round((Number(h.currentBalance) || 0) * 100) / 100,
        periodExpense: 0,
      });
    }

    for (const t of expenseItems) {
      if (!custodianMap.has(t.holderId)) {
        const shortName = (t.holderName || "").trim().split(/\s+/)[0] || t.holderName;
        custodianMap.set(t.holderId, {
          holderId: t.holderId,
          holderName: t.holderName,
          shortName,
          limit: getHolderLimit(t.holderId, false),
          currentBalance: 0,
          periodExpense: 0,
        });
      }
      const cEntry = custodianMap.get(t.holderId)!;
      cEntry.periodExpense =
        Math.round((cEntry.periodExpense + (Number(t.amount) || 0)) * 100) / 100;
    }

    // Prioritize custodians who actually have expenses or balance
    const custodians = Array.from(custodianMap.values()).filter(
      (c) =>
        holderFilter !== "ALL" ||
        c.periodExpense > 0 ||
        c.currentBalance !== 0 ||
        custodianMap.size <= 4
    );

    const formatCategoryLabel = (t: any) => {
      if (t.vehiclePlate && !String(t.category || "").includes(t.vehiclePlate)) {
        return `${t.category}: ${t.vehiclePlate}`;
      }
      return t.category || "อื่นๆ";
    };

    // Section 2: Pivot Matrix (Category x Custodian)
    const categoryOrder: string[] = [];
    const pivotByCategory = new Map<string, Record<string, number>>();
    for (const t of expenseItems) {
      const catLabel = formatCategoryLabel(t);
      if (!pivotByCategory.has(catLabel)) {
        pivotByCategory.set(catLabel, {});
        categoryOrder.push(catLabel);
      }
      const row = pivotByCategory.get(catLabel)!;
      row[t.holderId] = Math.round(((row[t.holderId] || 0) + (Number(t.amount) || 0)) * 100) / 100;
    }

    const pivotRows = categoryOrder.map((cat) => {
      const byHolder = pivotByCategory.get(cat) || {};
      const rowTotal =
        Math.round(
          Object.values(byHolder).reduce((s, v) => s + (Number(v) || 0), 0) * 100
        ) / 100;
      return { category: cat, byHolder, rowTotal };
    });

    const totalQuotaLimit =
      Math.round(custodians.reduce((s, c) => s + c.limit, 0) * 100) / 100;
    const totalNetCashBalance =
      Math.round(custodians.reduce((s, c) => s + c.currentBalance, 0) * 100) / 100;

    const selectedHolderLabel =
      holderFilter === "ALL"
        ? "ผู้รับผิดชอบทุกคน"
        : custodianMap.get(holderFilter)?.holderName ||
          holderSummaries.find((h) => h.holderId === holderFilter)?.holderName ||
          holderFilter;
    const selectedCategoryLabel =
      categoryFilter === "ALL" ? "ทุกหมวด" : categoryFilter;
    const isSingleCustodian =
      holderFilter !== "ALL" || !canApproveOrTopUp || custodians.length === 1;

    return {
      thaiPeriodLabel,
      printedDateBE,
      selectedHolderLabel,
      selectedCategoryLabel,
      isSingleCustodian,
      totalQuotaLimit,
      totalExpenseInPeriod,
      totalNetCashBalance,
      thaiBahtTotalText: toThaiBahtText(totalExpenseInPeriod),
      expenseItems,
      custodians,
      pivotRows,
      formatCategoryLabel,
    };
  }, [
    dateFrom,
    dateTo,
    filteredTransactions,
    dashboardDetails.visibleHolderSummaries,
    holderFilter,
    categoryFilter,
    holderSummaries,
  ]);

  // ── Fuel & Vehicle Analytics (แยกตามทะเบียนรถ + กราฟ) ──────────────────
  const fuelAnalytics = useMemo(() => {
    const isFuelCategory = (cat?: string | null, desc?: string | null) => {
      const c = (cat || "").toLowerCase();
      const d = (desc || "").toLowerCase();
      if (c.includes("fuel") || c.includes("น้ำมัน") || c.includes("transport")) return true;
      if (!c && (d.includes("petrol") || d.includes("diesel") || d.includes("น้ำมัน"))) return true;
      return false;
    };
    const isMaintCategory = (cat?: string | null) => {
      const c = (cat || "").toLowerCase();
      return c.includes("maintenance") || c.includes("ซ่อม") || c.includes("อะไหล่") || c.includes("parts");
    };
    const resolvePlate = (tx: PettyCashTx): string => {
      if (tx.vehiclePlate && tx.vehiclePlate.trim()) return tx.vehiclePlate.trim();
      const desc = tx.description || "";
      const normDesc = desc.replace(/[\s-]/g, "").toLowerCase();
      for (const vp of vehiclePlates) {
        const normVp = vp.replace(/[\s-]/g, "").toLowerCase();
        if (normVp && normDesc.includes(normVp)) return vp;
      }
      const plateMatch = desc.match(/\b\d?[ก-ฮ]{2}\s*\d{3,4}(?:กทม|ชม|ภก|ชบ)?\b/i);
      if (plateMatch) return plateMatch[0].trim();
      return "ไม่ระบุทะเบียน (Unspecified)";
    };

    const matchedTxs: Array<PettyCashTx & { resolvedPlate: string; isFuel: boolean; isMaint: boolean }> = [];
    const byPlateMap = new Map<
      string,
      {
        plate: string;
        fuelAmount: number;
        maintAmount: number;
        totalAmount: number;
        billCount: number;
        fuelCount: number;
        maintCount: number;
        lastDate: string;
      }
    >();
    const byDateMap = new Map<string, { dateKey: string; label: string; fuelAmount: number; maintAmount: number; totalAmount: number; count: number }>();

    filteredTransactions.forEach((tx) => {
      if (tx.status === "REJECTED" || tx.status === "VOID") return;
      if (tx.direction !== "DEBIT" || tx.type === "TRANSFER_OUT") return;
      const isFuel = isFuelCategory(tx.category, tx.description);
      const isMaint = isMaintCategory(tx.category);
      if (!isFuel && !(fuelIncludeMaintenance && isMaint)) return;

      const amt = Number(tx.amount) || 0;
      const resolvedPlate = resolvePlate(tx);
      matchedTxs.push({ ...tx, resolvedPlate, isFuel, isMaint });

      const dt = new Date(tx.transactionDate || tx.createdAt);
      const dateKey = isNaN(dt.getTime()) ? "unknown" : format(dt, "yyyy-MM-dd");
      const dateLabel = isNaN(dt.getTime()) ? "-" : format(dt, "dd/MM");

      const pEntry = byPlateMap.get(resolvedPlate) || {
        plate: resolvedPlate,
        fuelAmount: 0,
        maintAmount: 0,
        totalAmount: 0,
        billCount: 0,
        fuelCount: 0,
        maintCount: 0,
        lastDate: dateKey,
      };
      if (isFuel) {
        pEntry.fuelAmount = Math.round((pEntry.fuelAmount + amt) * 100) / 100;
        pEntry.fuelCount += 1;
      } else if (isMaint) {
        pEntry.maintAmount = Math.round((pEntry.maintAmount + amt) * 100) / 100;
        pEntry.maintCount += 1;
      }
      pEntry.totalAmount = Math.round((pEntry.totalAmount + amt) * 100) / 100;
      pEntry.billCount += 1;
      if (dateKey > pEntry.lastDate || pEntry.lastDate === "unknown") pEntry.lastDate = dateKey;
      byPlateMap.set(resolvedPlate, pEntry);

      const dEntry = byDateMap.get(dateKey) || {
        dateKey,
        label: dateLabel,
        fuelAmount: 0,
        maintAmount: 0,
        totalAmount: 0,
        count: 0,
      };
      if (isFuel) dEntry.fuelAmount = Math.round((dEntry.fuelAmount + amt) * 100) / 100;
      else if (isMaint) dEntry.maintAmount = Math.round((dEntry.maintAmount + amt) * 100) / 100;
      dEntry.totalAmount = Math.round((dEntry.totalAmount + amt) * 100) / 100;
      dEntry.count += 1;
      byDateMap.set(dateKey, dEntry);
    });

    const plateRows = Array.from(byPlateMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const dailyRows = Array.from(byDateMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    const totalFuelAmount = Math.round(plateRows.reduce((s, r) => s + r.fuelAmount, 0) * 100) / 100;
    const totalMaintAmount = Math.round(plateRows.reduce((s, r) => s + r.maintAmount, 0) * 100) / 100;
    const totalAmount = Math.round((totalFuelAmount + totalMaintAmount) * 100) / 100;
    const totalCount = matchedTxs.length;
    const totalFuelCount = matchedTxs.filter((t) => t.isFuel).length;
    const avgPerBill = totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0;
    const maxPlateAmount = plateRows.length > 0 ? Math.max(...plateRows.map((r) => r.totalAmount)) : 0;
    const maxDailyAmount = dailyRows.length > 0 ? Math.max(...dailyRows.map((r) => r.totalAmount)) : 0;

    return {
      matchedTxs,
      plateRows,
      dailyRows,
      totalFuelAmount,
      totalMaintAmount,
      totalAmount,
      totalCount,
      totalFuelCount,
      avgPerBill,
      maxPlateAmount,
      maxDailyAmount,
    };
  }, [filteredTransactions, vehiclePlates, fuelIncludeMaintenance]);

  // Export CSV (Clean Detailed Transaction Ledger)
  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) {
      toast.error("ไม่มีรายการสำหรับ Export");
      return;
    }

    const summaryRows: any[][] = [
      ["รายงานสรุปเงินสดย่อย (PETTY CASH REPLENISHMENT & USAGE REPORT)"],
      ["ช่วงเวลาที่เลือก (Period)", periodLabel],
      ["วันที่ส่งออก (Exported At)", format(new Date(), "dd/MM/yyyy HH:mm")],
      ["ผู้ส่งออก (Exported By)", currentUser?.name || currentUser?.email || "-"],
      [],
      ["รายการเดินบัญชีละเอียด (DETAILED TRANSACTION LEDGER)"],
    ];

    const headers = [
      "Tx No.",
      "Date",
      "Category",
      "Vehicle Plate (ทะเบียนรถ)",
      "Description",
      "Method",
      "Amount (THB)",
      "Balance Before",
      "Balance After",
      "Created By",
      "Approved By",
    ];
    const rows = filteredTransactions.map((t) => {
      const signedAmt = t.direction === "CREDIT" ? t.amount : -t.amount;
      return [
        t.txNumber || t.id,
        format(new Date(t.transactionDate), "dd/MM/yyyy HH:mm"),
        t.category,
        t.vehiclePlate || "-",
        t.description,
        t.paymentMethod || "-",
        signedAmt.toFixed(2),
        t.balanceBefore.toFixed(2),
        t.balanceAfter.toFixed(2),
        t.createdByName || "-",
        t.approvedByName || "-",
      ];
    });

    const csvContent =
      "\uFEFF" +
      [...summaryRows, headers, ...rows]
        .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petty-cash-report-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  // Export PDF (Thai Accounting A4 Summary + Pivot Matrix + Baht Text + 3 Signature Boxes)
  const handleExportPdf = () => {
    setExportMenuOpen(false);
    const rep = thaiAccountingReport;
    if (rep.expenseItems.length === 0 && rep.custodians.length === 0) {
      toast.error("ไม่มีรายการสำหรับ Export PDF");
      return;
    }

    const escapeHtml = (str: any) =>
      String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const fmtMoney = (n: number) =>
      Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fileTitle = `petty-cash-report-${format(new Date(), "yyyyMMdd-HHmm")}`;
    const isSingle = rep.isSingleCustodian;
    const colCount = isSingle ? 1 : rep.custodians.length;
    // Shrink table font cleanly when many custodians are present so A4 portrait never overflows
    const pivotFontPx = colCount >= 7 ? 7.5 : colCount >= 5 ? 8.5 : 9.5;
    const pivotPadPx = colCount >= 7 ? "4px 4px" : colCount >= 5 ? "5px 5px" : "6px 8px";

    const section1RowsHtml =
      rep.expenseItems.length > 0
        ? rep.expenseItems
            .map((t, idx) => {
              const catLabel = rep.formatCategoryLabel(t);
              const dateIso = format(new Date(t.transactionDate), "yyyy-MM-dd");
              const shortHolder = (t.holderName || "").trim().split(/\s+/)[0] || t.holderName;
              const vendor = t.vendorName || "–";
              const billNo = t.invoiceNo || t.txNumber || "–";
              return `
                <tr>
                  <td style="text-align:center;color:#475569;">${idx + 1}</td>
                  <td style="white-space:nowrap;color:#334155;">${escapeHtml(dateIso)}</td>
                  ${isSingle ? "" : `<td style="color:#0f172a;font-weight:500;">${escapeHtml(shortHolder)}</td>`}
                  <td style="color:#0f172a;">${escapeHtml(catLabel)}</td>
                  <td style="color:#1e293b;">${escapeHtml(t.description || "–")}</td>
                  <td style="color:#334155;">${escapeHtml(vendor)}</td>
                  <td style="white-space:nowrap;color:#475569;">${escapeHtml(billNo)}</td>
                  <td class="num" style="font-weight:600;color:#0f172a;">฿${fmtMoney(t.amount)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="${isSingle ? 7 : 8}" style="text-align:center;color:#94a3b8;padding:14px;">ไม่มีรายการค่าใช้จ่ายในงวดที่เลือก</td></tr>`;

    const pivotHeadersHtml = isSingle
      ? ""
      : rep.custodians
          .map((c, idx) => `<th class="num">${idx + 1}. ${escapeHtml(c.shortName)} (บาท)</th>`)
          .join("");

    const pivotRowsHtml =
      rep.pivotRows.length > 0
        ? rep.pivotRows
            .map((r) => {
              const cells = isSingle
                ? ""
                : rep.custodians
                    .map((c) => {
                      const val = r.byHolder[c.holderId] || 0;
                      return `<td class="num">${val > 0 ? `฿${fmtMoney(val)}` : "-"}</td>`;
                    })
                    .join("");
              return `
                <tr>
                  <td style="color:#0f172a;font-weight:500;">${escapeHtml(r.category)}</td>
                  ${cells}
                  <td class="num" style="font-weight:700;color:#0f172a;background:#f8fafc;">฿${fmtMoney(r.rowTotal)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="${isSingle ? 2 : rep.custodians.length + 2}" style="text-align:center;color:#94a3b8;padding:12px;">ไม่มีข้อมูลค่าใช้จ่าย</td></tr>`;

    const pivotExpenseTotalsHtml = isSingle
      ? ""
      : rep.custodians
          .map((c) => `<td class="num" style="font-weight:700;color:#0f172a;">฿${fmtMoney(c.periodExpense)}</td>`)
          .join("");

    const pivotNetBalanceTotalsHtml = isSingle
      ? ""
      : rep.custodians
          .map(
            (c) =>
              `<td class="num" style="font-weight:700;color:${c.currentBalance < 0 ? "#be123c" : "#047857"};">฿${fmtMoney(c.currentBalance)}</td>`
          )
          .join("");

    const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 11mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: 'Noto Sans Thai', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 10px;
      line-height: 1.4;
      background: #ffffff;
    }
    th.num, td.num, .num {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .company-name {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 2px 0;
    }
    .report-sub {
      font-size: 10.5px;
      color: #475569;
      margin: 0;
    }
    .period-right {
      text-align: right;
    }
    .period-pill {
      display: inline-block;
      border: 1px solid #94a3b8;
      border-radius: 5px;
      padding: 3px 9px;
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
      background: #ffffff;
    }
    .print-date {
      font-size: 9px;
      color: #64748b;
      margin-top: 3px;
    }
    .summary-bar {
      display: grid;
      grid-template-columns: 1.15fr 1fr 1fr 1fr 1fr;
      gap: 8px;
      align-items: center;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 10px;
      margin-bottom: 12px;
      background: #ffffff;
      font-size: 9.5px;
    }
    .summary-item-label {
      color: #64748b;
      font-size: 8.5px;
    }
    .summary-item-val {
      font-weight: 700;
      color: #0f172a;
      margin-top: 1px;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
      margin: 10px 0 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      border: 1px solid #cbd5e1;
    }
    .tbl-items { font-size: 9.2px; }
    .tbl-items th, .tbl-items td {
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #f1f5f9;
      padding: 5px 6px;
      vertical-align: top;
      text-align: left;
    }
    .tbl-items th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1.5px solid #94a3b8;
      white-space: nowrap;
    }
    .tbl-pivot { font-size: ${pivotFontPx}px; }
    .tbl-pivot th, .tbl-pivot td {
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      padding: ${pivotPadPx};
      vertical-align: middle;
      text-align: left;
    }
    .tbl-pivot th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1.5px solid #94a3b8;
    }
    .row-total td {
      background: #f8fafc;
      border-top: 1.5px solid #94a3b8;
    }
    .row-net td {
      background: #dcfce7 !important;
      border-top: 1px solid #86efac;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 18px;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      text-align: center;
      padding: 8px 10px 10px 10px;
      font-size: 9.5px;
      color: #334155;
    }
    .sig-line {
      border-bottom: 1px solid #64748b;
      height: 28px;
      width: 82%;
      margin: 0 auto 6px auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="company-name">บริษัท แดท ลอนดรี้ ช็อป จำกัด</h1>
      <p class="report-sub">รายงานสรุปค่าใช้จ่ายเงินสดย่อย</p>
    </div>
    <div class="period-right">
      <div class="period-pill">ประจำงวด: ${escapeHtml(rep.thaiPeriodLabel)}</div>
      <div class="print-date">วันที่พิมพ์: ${escapeHtml(rep.printedDateBE)}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div>
      <span class="summary-item-label">ผู้รับผิดชอบ:</span>
      <div class="summary-item-val" style="${isSingle ? "font-size:13px;font-weight:800;" : ""}">${escapeHtml(rep.selectedHolderLabel)}</div>
    </div>
    <div>
      <span class="summary-item-label">หมวดหมู่:</span>
      <div class="summary-item-val">${escapeHtml(rep.selectedCategoryLabel)}</div>
    </div>
    <div>
      <span class="summary-item-label">วงเงินที่ตั้งไว้:</span>
      <div class="summary-item-val">฿${fmtMoney(rep.totalQuotaLimit)}</div>
    </div>
    <div>
      <span class="summary-item-label">ยอดจ่ายรวมในงวดนี้:</span>
      <div class="summary-item-val" style="color:#be123c;">฿${fmtMoney(rep.totalExpenseInPeriod)}</div>
    </div>
    <div>
      <span class="summary-item-label">เงินสดคงเหลือ:</span>
      <div class="summary-item-val" style="color:${rep.totalNetCashBalance < 0 ? "#be123c" : "#047857"};">฿${fmtMoney(rep.totalNetCashBalance)}</div>
    </div>
  </div>

  <div class="section-title">• 1. รายการใบเสร็จและรายละเอียดค่าใช้จ่ายตามเงื่อนไขที่เลือก</div>
  <table class="tbl-items">
    <thead>
      <tr>
        <th style="text-align:center;width:32px;">ลำดับ</th>
        <th style="width:70px;">วันที่</th>
        ${isSingle ? "" : `<th style="width:68px;">ผู้รับผิดชอบ</th>`}
        <th style="width:105px;">หมวดหมู่</th>
        <th>รายละเอียดรายการ</th>
        <th style="width:100px;">ผู้รับเงิน / ร้านค้า</th>
        <th style="width:74px;">เลขที่บิล</th>
        <th class="num" style="width:80px;">จำนวนเงิน (บาท)</th>
      </tr>
    </thead>
    <tbody>
      ${section1RowsHtml}
      <tr class="row-total">
        <td colspan="${isSingle ? 6 : 7}" style="text-align:right;font-weight:700;color:#0f172a;">รวมจ่ายค่าใช้จ่าย:</td>
        <td class="num" style="font-weight:800;color:#0f172a;">฿${fmtMoney(rep.totalExpenseInPeriod)}</td>
      </tr>
      <tr>
        <td colspan="${isSingle ? 4 : 5}" style="text-align:right;color:#64748b;">จำนวนเงินตัวอักษร:</td>
        <td colspan="3" style="text-align:right;font-weight:700;font-style:italic;color:#0f172a;white-space:nowrap;">${escapeHtml(rep.thaiBahtTotalText)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">${
    isSingle
      ? "• 2. ตารางสรุปยอดค่าใช้จ่ายตามหมวดหมู่"
      : "• 2. ตารางสรุปยอดค่าใช้จ่าย (หมวดหมู่ค่าใช้จ่าย X ผู้รับผิดชอบ)"
  }</div>
  <table class="tbl-pivot">
    <thead>
      <tr>
        <th>หมวดหมู่</th>
        ${pivotHeadersHtml}
        <th class="num" style="background:#e2e8f0;">${isSingle ? "รวม (บาท)" : "รวมทุกรายคน (บาท)"}</th>
      </tr>
    </thead>
    <tbody>
      ${pivotRowsHtml}
      <tr class="row-total">
        <td style="font-weight:700;color:#0f172a;">รวมจ่ายค่าใช้จ่ายและรอเบิกจ่าย (บาท):</td>
        ${pivotExpenseTotalsHtml}
        <td class="num" style="font-weight:800;color:#0f172a;background:#e2e8f0;">฿${fmtMoney(rep.totalExpenseInPeriod)}</td>
      </tr>
      <tr class="row-net">
        <td style="font-weight:700;color:#065f46;">เงินสดคงเหลือสุทธิ (บาท):</td>
        ${pivotNetBalanceTotalsHtml}
        <td class="num" style="font-weight:800;color:${rep.totalNetCashBalance < 0 ? "#be123c" : "#065f46"};">฿${fmtMoney(rep.totalNetCashBalance)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sig-grid">
    <div class="sig-box">
      <div style="font-weight:600;">ผู้จัดทำรายงาน</div>
      <div class="sig-line"></div>
      <div>วันที่ ____ / ____ / ________</div>
    </div>
    <div class="sig-box">
      <div style="font-weight:600;">ผู้ตรวจสอบบัญชี</div>
      <div class="sig-line"></div>
      <div>วันที่ ____ / ____ / ________</div>
    </div>
    <div class="sig-box">
      <div style="font-weight:600;">ผู้อนุมัติ</div>
      <div class="sig-line"></div>
      <div>วันที่ ____ / ____ / ________</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

    const printWin = window.open("", "_blank");
    if (!printWin) {
      toast.error("กรุณาอนุญาต Pop-up เพื่อเปิดหน้าต่าง Export PDF");
      return;
    }
    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  return (
    <div className="space-y-4 pb-12 font-sans text-slate-900">
      {/* ── 1. MODERN MINIMALIST HEADER & DATE / ACTION BAR ───────────────────── */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Wallet size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                Petty Cash
              </h1>
              <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                ระบบบริหารเงินสดย่อย
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[10.5px] font-semibold whitespace-nowrap">
                {holderSummaries.length} Wallets
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Custodian wallets, instant expense tracking & replenishment
            </p>
          </div>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-1.5 shrink-0">
          {/* Compact Date Filter Segment */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-100/80 border border-slate-200/70 rounded-xl p-1">
            {(() => {
              const todayStr = format(new Date(), "yyyy-MM-dd");
              const now = new Date();
              const thisMonthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
              const thisMonthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
              const lastMonthStart = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), "yyyy-MM-dd");
              const lastMonthEnd = format(new Date(now.getFullYear(), now.getMonth(), 0), "yyyy-MM-dd");

              const isAll = !dateFrom && !dateTo;
              const isToday = dateFrom === todayStr && dateTo === todayStr;
              const isThisMonth = dateFrom === thisMonthStart && dateTo === thisMonthEnd;
              const isLastMonth = dateFrom === lastMonthStart && dateTo === lastMonthEnd;

              return (
                <div className="flex items-center gap-0.5">
                  {[
                    { label: "All", active: isAll, onClick: () => { setDateFrom(""); setDateTo(""); } },
                    { label: "Today", active: isToday, onClick: () => { setDateFrom(todayStr); setDateTo(todayStr); } },
                    { label: "This Month", active: isThisMonth, onClick: () => { setDateFrom(thisMonthStart); setDateTo(thisMonthEnd); } },
                    { label: "Last Month", active: isLastMonth, onClick: () => { setDateFrom(lastMonthStart); setDateTo(lastMonthEnd); } },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={p.onClick}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        p.active
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 w-[108px] text-[11px] font-mono rounded-lg border-transparent bg-white/80 hover:bg-white px-1.5"
                title="From Date"
              />
              <span className="text-slate-400 text-xs">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 w-[108px] text-[11px] font-mono rounded-lg border-transparent bg-white/80 hover:bg-white px-1.5"
                title="To Date"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="h-9 w-8 p-0 border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-xl cursor-pointer shrink-0"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin text-indigo-600" : ""} />
          </Button>

          {canApproveOrTopUp && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditableCategories([...categories]);
                  setNewCategoryInput("");
                  setCatModalOpen(true);
                }}
                className="h-9 px-2.5 text-[11.5px] font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Settings2 size={13.5} className="text-slate-400" />
                <span>Categories</span>
              </Button>

              <div className="relative shrink-0" ref={exportMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  className="h-9 px-2.5 text-[11.5px] font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Download size={13.5} className="text-slate-500" />
                  <span>Export</span>
                  <ChevronDown size={12.5} className={`text-slate-400 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
                </Button>

                {exportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50 text-xs">
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      <FileText size={14} className="text-emerald-600 shrink-0" />
                      <span>Export Excel (.csv)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      <FileText size={14} className="text-rose-600 shrink-0" />
                      <span>Print / PDF Report</span>
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() =>
                  handleOpenCreateModal("TOPUP", {
                    id: currentUser?.id || holderSummaries[0]?.holderId || "",
                    name: currentUser?.name || holderSummaries[0]?.holderName || "Custodian",
                    branchId: currentUser?.branchId || holderSummaries[0]?.branchId || "HQ",
                  })
                }
                className="h-9 px-2.5 text-[11.5px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus size={13.5} />
                <span>Top-up (เติมเงิน)</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenSubmitReportModal()}
                className="h-9 px-2.5 text-[11.5px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                title="สรุป Report การใช้จ่ายของรอบนี้เพื่อขอเบิกชดเชยเงินสดย่อย"
              >
                <Files size={13.5} />
                <span>Submit Report (สรุปเบิกเงินสดย่อย)</span>
              </Button>
            </>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenCreateModal("EXPENSE", undefined, "EXPENSE_DOC")}
            className="h-9 px-2.5 text-[11.5px] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl gap-1 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowUpRight size={13.5} />
            <span>Record Expense (เบิกจ่าย)</span>
          </Button>
        </div>
      </div>

      {/* ── 2. CLEAN 4-CARD KPI SUMMARY STRIP ─────────────────────────────────── */}
      {canApproveOrTopUp ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Balance */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Total Balance (คงเหลือรวม)
              </span>
              <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Wallet size={16} />
              </span>
            </div>
            <div className="mt-2">
              <div
                className={`text-2xl font-extrabold font-mono tracking-tight ${
                  (holderFilter === "ALL" ? dashboardDetails.totalWalletBalanceAll : kpiStats.netBalance) < 0
                    ? "text-rose-600"
                    : "text-slate-900"
                }`}
              >
                ฿{(holderFilter === "ALL" ? dashboardDetails.totalWalletBalanceAll : kpiStats.netBalance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                <span>
                  Accounting: <strong className="text-slate-700 font-mono">฿{kpiStats.accountingPoolBalance.toLocaleString()}</strong>
                </span>
                <span>
                  Stores: <strong className="text-slate-700 font-mono">฿{kpiStats.storePoolBalance.toLocaleString()}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Replenished / Inflow */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Total Replenished (ยอดเติมเงิน)
              </span>
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft size={16} />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold font-mono text-emerald-600 tracking-tight">
                +฿{kpiStats.companyTopupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                <span>
                  To Stores: <strong className="text-sky-600 font-mono">฿{kpiStats.transferredToStoreTotal.toLocaleString()}</strong>
                </span>
                <span>
                  Quota: <strong className="text-slate-700 font-mono">฿{dashboardDetails.totalLimitAll.toLocaleString()}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Expenses */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Total Expenses (เบิกจ่ายจริง)
              </span>
              <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold font-mono text-rose-600 tracking-tight">
                -฿{kpiStats.realExpenseTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                <span>
                  Approved: <strong className="text-slate-700 font-mono">฿{dashboardDetails.approvedExpenseTotal.toLocaleString()}</strong>
                </span>
                <span>{dashboardDetails.expenseTxCount} bills</span>
              </div>
            </div>
          </div>

          {/* Card 4: Pending Review & Replenish Needed */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Pending Audit (รอตรวจบิล)
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveViewTab("ledger");
                  setStatusFilter(statusFilter === "PENDING" ? "ALL" : "PENDING");
                }}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-colors cursor-pointer ${
                  statusFilter === "PENDING"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {statusFilter === "PENDING" ? "Showing Pending" : "Filter Pending"}
              </button>
            </div>
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-amber-600 tracking-tight">
                  {kpiStats.pendingCount}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  (฿{kpiStats.pendingAmount.toLocaleString()})
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                <span>
                  To Replenish: <strong className="text-amber-700 font-mono">฿{dashboardDetails.totalShortfallAll.toLocaleString()}</strong>
                </span>
                <span>Slips: {dashboardDetails.attachmentCompliancePct}%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">My Balance (คงเหลือของคุณ)</span>
              <div className={`text-2xl font-extrabold font-mono mt-1 ${currentUserBalance < 0 ? "text-rose-600" : "text-slate-900"}`}>
                ฿{currentUserBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">
                {currentUser?.name || "You"} • {getBranchDisplayName(currentUser?.branchId)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Wallet size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">Received (ยอดรับโอน)</span>
              <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
                +฿{(currentUserSummary?.totalTopup ?? kpiStats.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Replenished to your wallet</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">Spent (ยอดเบิกจ่าย)</span>
              <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">
                -฿{(currentUserSummary?.totalExpense ?? kpiStats.realExpenseTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-amber-600 font-medium">
                Pending review: {kpiStats.pendingCount} bills
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </div>
      )}

      {/* ── 3. VIEW NAVIGATION TABS + COMPACT WALLET PILLS ───────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Segmented View Switcher */}
        <div className="inline-flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 self-start">
          {(canApproveOrTopUp
            ? [
                { id: "ledger", label: "Transactions (รายการเดินบัญชี)", count: filteredTransactions.length, badgeColor: "" },
                { id: "wallets", label: "Custodian Wallets (กระเป๋ารายบุคคล)", count: holderSummaries.length, badgeColor: "" },
                {
                  id: "claims",
                  label: "Replenishment Claims (สรุปเบิกเงินสดย่อย)",
                  count: replenishmentReports.filter((r) => r.status === "PENDING_APPROVAL").length || replenishmentReports.length,
                  badgeColor: replenishmentReports.some((r) => r.status === "PENDING_APPROVAL")
                    ? "bg-amber-600 text-white"
                    : "",
                },
                { id: "report", label: "Summary & Analytics (ตารางสรุปยอด)", count: null, badgeColor: "" },
                { id: "fuel", label: "Fuel & Vehicle (สรุปค่าน้ำมัน)", count: fuelAnalytics.totalCount, badgeColor: "bg-sky-100 text-sky-700" },
              ]
            : [
                { id: "ledger", label: "My Transactions (รายการเดินบัญชี)", count: filteredTransactions.length, badgeColor: "" },
                {
                  id: "claims",
                  label: "My Replenishment Claims (ประวัติสรุปเบิกเงินสดย่อย)",
                  count: replenishmentReports.filter((r) => r.holderId === currentUser?.id).length,
                  badgeColor: "",
                },
                { id: "fuel", label: "Fuel & Vehicle (สรุปค่าน้ำมัน)", count: fuelAnalytics.totalCount, badgeColor: "bg-sky-100 text-sky-700" },
              ]
          ).map((t) => {
            const isActive = activeViewTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveViewTab(t.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{t.label}</span>
                {t.count !== null && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      t.badgeColor
                        ? t.badgeColor
                        : isActive
                          ? "bg-slate-900 text-white"
                          : "bg-slate-200/80 text-slate-600"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Reset / Active Filter Indicator on Tab Bar */}
        {canApproveOrTopUp && (holderFilter !== "ALL" || branchFilter !== "ALL" || statusFilter !== "ALL" || typeFilter !== "ALL" || dateFrom || dateTo || searchQuery.trim()) && (
          <button
            type="button"
            onClick={() => {
              setHolderFilter("ALL");
              setBranchFilter("ALL");
              setCategoryFilter("ALL");
              setStatusFilter("ALL");
              setTypeFilter("ALL");
              setDateFrom("");
              setDateTo("");
              setSearchQuery("");
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer self-start sm:self-auto"
          >
            ล้างตัวกรองทั้งหมด (Show All Transactions)
          </button>
        )}
      </div>

      {/* ── 3B. CLEAR WALLET SELECTOR BAR (คลิกเลือกกระเป๋าเพื่อดูรายการเดินบัญชีของแต่ละคน) ── */}
      {canApproveOrTopUp && holderSummaries.length > 0 && (activeViewTab === "ledger" || activeViewTab === "report" || activeViewTab === "fuel" || activeViewTab === "claims") && (
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Wallet size={14} className="text-indigo-600" />
                <span>เลือกกระเป๋าเงินสดย่อย (Select Wallet to View Transactions):</span>
              </span>
              <span className="text-[11px] text-slate-500">
                คลิกที่ชื่อเพื่อกรองดูรายการเดินบัญชีของคนนั้น หรือเลือก &ldquo;ดูรวมทุกกระเป๋า&rdquo;
              </span>
            </div>
            {holderFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => {
                  setHolderFilter("ALL");
                  setClaimsHolderFilter("ALL");
                  setBranchFilter("ALL");
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 cursor-pointer"
              >
                ← ดูรวมทุกกระเป๋า (Show All {transactions.length} Transactions)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {/* Card 0: All Wallets Combined */}
            {(() => {
              const isAllSelected = holderFilter === "ALL";
              const totalTxCount = holderSummaries.reduce((s, h) => s + h.txCount, 0);
              const totalPending = holderSummaries.reduce((s, h) => s + h.pendingCount, 0);
              return (
                <div
                  onClick={() => {
                    setHolderFilter("ALL");
                    setClaimsHolderFilter("ALL");
                    setBranchFilter("ALL");
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isAllSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-900/15"
                      : "bg-slate-50/70 hover:bg-white text-slate-800 border-slate-200/90 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <span>ดูรวมทุกกระเป๋า</span>
                        {isAllSelected && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9.5px] font-bold">
                            กำลังดู
                          </span>
                        )}
                      </div>
                      <div className={`text-[10.5px] mt-0.5 ${isAllSelected ? "text-slate-300" : "text-slate-500"}`}>
                        All Wallets ({holderSummaries.length} คน)
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded-md font-mono text-[10.5px] font-bold ${
                        isAllSelected ? "bg-white/15 text-white" : "bg-slate-200/80 text-slate-700"
                      }`}
                    >
                      {totalTxCount} รายการ
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-1 border-t border-slate-200/20">
                    <div>
                      <span className={`text-[10px] block ${isAllSelected ? "text-slate-300" : "text-slate-400"}`}>
                        ยอดคงเหลือรวม
                      </span>
                      <span className="font-mono font-extrabold text-sm">
                        ฿{dashboardDetails.totalWalletBalanceAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {totalPending > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">
                        ⏳ {totalPending} รอตรวจ
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Individual Custodian Cards */}
            {holderSummaries.map((h) => {
              const isSelected = holderFilter === h.holderId;
              const limit = getHolderLimit(h.holderId, h.isAccounting);
              const branchName = getBranchDisplayName(h.branchId);
              return (
                <div
                  key={h.holderId}
                  onClick={() => {
                    const nextHolder = isSelected ? "ALL" : h.holderId;
                    setHolderFilter(nextHolder);
                    setClaimsHolderFilter(nextHolder);
                    setBranchFilter("ALL");
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? "bg-indigo-50/90 border-indigo-500 text-indigo-950 shadow-sm ring-2 ring-indigo-500/20"
                      : "bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 text-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate flex items-center gap-1.5">
                        <span className="truncate">{h.holderName}</span>
                        {isSelected && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-600 text-white text-[9.5px] font-bold shrink-0">
                            กำลังดู
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.1 rounded text-[9.5px] font-bold ${
                            h.isAccounting ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {h.isAccounting ? "Accounting" : "Store"}
                        </span>
                        <span className="truncate">• {branchName}</span>
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded-md font-mono text-[10.5px] font-bold shrink-0 ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {h.txCount} รายการ
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block">
                        คงเหลือ / วงเงิน ฿{limit.toLocaleString()}
                      </span>
                      <span
                        className={`font-mono font-extrabold text-sm ${
                          h.currentBalance <= 0 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {h.pendingCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                          ⏳ {h.pendingCount}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSubmitReportModal(h.holderId);
                        }}
                        className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-[10px] font-bold border border-indigo-200 transition-colors cursor-pointer"
                        title={`สร้างใบสรุปเบิกเงินสดย่อยของ ${h.holderName}`}
                      >
                        สรุปเบิก
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCreateModal("TOPUP", {
                            id: h.holderId,
                            name: h.holderName,
                            branchId: h.branchId,
                          });
                        }}
                        className="w-5 h-5 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center border border-emerald-200 transition-colors cursor-pointer"
                        title={`Top-up เติมเงินให้ ${h.holderName}`}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: REPLENISHMENT CLAIMS (สรุป Report การใช้จ่ายเพื่อขอเบิกเงินสดย่อย) ── */}
      {activeViewTab === "claims" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Files size={16} className="text-indigo-600" />
                  <span>Replenishment Reports & Approval (ใบสรุปการใช้จ่ายเพื่อขอเบิกเงินสดย่อย)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {canApproveOrTopUp
                    ? "แสดงรายการขอเบิกเงินสดย่อยของพนักงานทุกคน เพื่อตรวจสอบและ Approve ก่อนโอนเติมเงินชดเชย"
                    : "ผู้ถือเงินสดย่อยสรุปบิลค่าใช้จ่ายในรอบนั้นส่งให้ฝ่ายบัญชีตรวจสอบและ Approve ก่อนโอนเติมเงินชดเชย"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenSubmitReportModal()}
                className="h-9 px-3.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1.5 shadow-2xs cursor-pointer self-start sm:self-auto"
              >
                <Plus size={14} />
                <span>+ Create Replenishment Report (สร้างใบสรุปขอเบิก)</span>
              </Button>
            </div>

            {canApproveOrTopUp && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "ALL", label: `All (${replenishmentReports.length})` },
                      {
                        id: "PENDING_APPROVAL",
                        label: `Pending (${replenishmentReports.filter((r) => r.status === "PENDING_APPROVAL").length})`,
                      },
                      {
                        id: "DISBURSED",
                        label: `Approved & Replenished (${replenishmentReports.filter((r) => r.status === "DISBURSED" || r.status === "APPROVED").length})`,
                      },
                      {
                        id: "REJECTED",
                        label: `Rejected (${replenishmentReports.filter((r) => r.status === "REJECTED").length})`,
                      },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setClaimsStatusFilter(st.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        claimsStatusFilter === st.id
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <select
                  value={claimsHolderFilter}
                  onChange={(e) => {
                    setClaimsHolderFilter(e.target.value);
                    setHolderFilter(e.target.value);
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Custodians (ทุกคน)</option>
                  {Array.from(new Map(replenishmentReports.map((r) => [r.holderId, r.holderName])).entries()).map(
                    ([hId, hName]) => (
                      <option key={hId} value={hId}>
                        {hName}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Report No. / Submitted</th>
                  <th className="py-3 px-4">Custodian & Branch</th>
                  <th className="py-3 px-4">Expense Cycle & Summary</th>
                  <th className="py-3 px-4 text-center">Bills Included</th>
                  <th className="py-3 px-4 text-right">Total Spent</th>
                  <th className="py-3 px-4 text-right">Requested Top-up</th>
                  <th className="py-3 px-4 text-right">Status & Accounting Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const visibleReports = replenishmentReports.filter((r) => {
                    if (!canApproveOrTopUp) return r.holderId === currentUser?.id;
                    if (claimsHolderFilter !== "ALL" && r.holderId !== claimsHolderFilter) return false;
                    if (claimsStatusFilter === "PENDING_APPROVAL" && r.status !== "PENDING_APPROVAL") return false;
                    if (
                      claimsStatusFilter === "DISBURSED" &&
                      r.status !== "DISBURSED" &&
                      r.status !== "APPROVED"
                    )
                      return false;
                    if (claimsStatusFilter === "REJECTED" && r.status !== "REJECTED") return false;
                    return true;
                  });

                  if (visibleReports.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="py-14 text-center text-slate-400">
                          <Files size={26} className="mx-auto mb-2 text-slate-300" />
                          <p className="font-semibold text-slate-600">ยังไม่มีใบสรุปขอเบิกเงินสดย่อย (No Replenishment Reports)</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            กดปุ่ม &quot;+ Create Replenishment Report&quot; เพื่อรวบรวมบิลค่าใช้จ่ายรอบนี้ส่งให้ฝ่ายบัญชีตรวจสอบและอนุมัติ
                          </p>
                        </td>
                      </tr>
                    );
                  }

                  return visibleReports.map((rep) => {
                    const branchName = getBranchDisplayName(rep.branchId);
                    const pStartStr = rep.periodStart ? format(new Date(rep.periodStart), "dd MMM yyyy") : "-";
                    const pEndStr = rep.periodEnd ? format(new Date(rep.periodEnd), "dd MMM yyyy") : "-";
                    return (
                      <tr key={rep.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-indigo-700">{rep.reportNumber}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {format(new Date(rep.submittedAt), "dd MMM yyyy, HH:mm")}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{rep.holderName}</div>
                          <div className="text-[11px] text-slate-400">{branchName}</div>
                        </td>
                        <td className="py-3 px-4 max-w-[300px]">
                          <div className="text-[11px] font-semibold text-slate-700">
                            Period: {pStartStr} – {pEndStr}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(rep.categorySummary || []).slice(0, 3).map((c, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                              >
                                {c.category.split("(")[0].trim()}: ฿{Number(c.amount).toLocaleString()}
                              </span>
                            ))}
                            {(rep.categorySummary || []).length > 3 && (
                              <span className="text-[10px] text-slate-400">
                                +{(rep.categorySummary || []).length - 3} more
                              </span>
                            )}
                          </div>
                          {rep.note && (
                            <div className="text-[11px] text-slate-500 mt-1 italic">Note: {rep.note}</div>
                          )}
                          {rep.rejectReason && (
                            <div className="text-[11px] text-rose-600 mt-1 font-medium">
                              Reject Reason: {rep.rejectReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[11px]">
                            {rep.expenseTxIds?.length || 0} bills
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold text-rose-600">
                          -฿{rep.totalExpenseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-extrabold text-emerald-700 text-sm">
                          ฿{rep.requestedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            {rep.status === "PENDING_APPROVAL" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/70 text-[10.5px] font-bold">
                                <Clock size={11} /> Pending Accounting Approval
                              </span>
                            ) : rep.status === "DISBURSED" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[10.5px] font-bold">
                                <CheckCircle2 size={11} /> Approved & Replenished
                              </span>
                            ) : rep.status === "APPROVED" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/70 text-[10.5px] font-bold">
                                <CheckCircle2 size={11} /> Approved (Waiting Top-up)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70 text-[10.5px] font-bold">
                                <XCircle size={11} /> Rejected
                              </span>
                            )}

                            <Button
                              type="button"
                              size="sm"
                              variant={rep.status === "PENDING_APPROVAL" && canApproveOrTopUp ? "default" : "outline"}
                              onClick={() => handleOpenReviewReportModal(rep)}
                              className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                                rep.status === "PENDING_APPROVAL" && canApproveOrTopUp
                                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                  : "border-slate-200 text-slate-700"
                              }`}
                            >
                              {rep.status === "PENDING_APPROVAL" && canApproveOrTopUp
                                ? "Review & Approve"
                                : "View Report"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: CUSTODIAN WALLETS GRID ─────────────────────────────────────── */}
      {canApproveOrTopUp && activeViewTab === "wallets" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {holderSummaries.map((h) => {
            const isSelected = holderFilter === h.holderId;
            const branchName = getBranchDisplayName(h.branchId);
            const limit = getHolderLimit(h.holderId, h.isAccounting);
            const shortfall = Math.max(0, Math.round((limit - h.currentBalance) * 100) / 100);
            const fillPct = limit > 0 ? Math.min(100, Math.max(0, Math.round((h.currentBalance / limit) * 100))) : 0;
            const initials = (h.holderName || "U")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("");

            return (
              <div
                key={h.holderId}
                className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          h.isAccounting
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/70"
                            : "bg-slate-100 text-slate-700 border border-slate-200/70"
                        }`}
                      >
                        {initials || "PC"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                          <span className="truncate">{h.holderName}</span>
                          {h.holderId === currentUser?.id && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {h.department || h.roleLabel} • {branchName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-medium text-slate-400 block">Balance</span>
                      <span
                        className={`font-mono font-extrabold text-lg ${
                          h.currentBalance < 0
                            ? "text-rose-600"
                            : h.currentBalance === 0
                              ? "text-slate-500"
                              : "text-slate-900"
                        }`}
                      >
                        ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Clean Quota Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        Quota: <strong className="font-mono text-slate-700">฿{limit.toLocaleString()}</strong>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {shortfall > 0 ? `Shortfall: ฿${shortfall.toLocaleString()}` : "Full Quota"}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          fillPct < 25 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.max(fillPct, h.currentBalance > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Compact 3-Metric Row */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">Received</span>
                      <span className="font-mono font-bold text-emerald-600">
                        +฿{h.totalTopup.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">Spent</span>
                      <span className="font-mono font-bold text-rose-600">
                        -฿{h.totalExpense.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">Pending</span>
                      <span className="font-mono font-bold text-amber-600">
                        {h.pendingCount} bills
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHolderFilter(isSelected ? "ALL" : h.holderId);
                      setActiveViewTab("ledger");
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    View {h.txCount} transactions →
                  </button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleOpenCreateModal(
                          "EXPENSE",
                          { id: h.holderId, name: h.holderName, branchId: h.branchId },
                          "EXPENSE_DOC"
                        )
                      }
                      className="h-8 px-2 text-xs font-semibold rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      - Expense
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenSubmitReportModal(h.holderId)}
                      className="h-8 px-2.5 text-xs font-bold rounded-lg border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                      title="สรุป Report ค่าใช้จ่ายของกระเป๋านี้เพื่อขอเบิกชดเชย"
                    >
                      สรุปเบิก
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        handleOpenCreateModal("TOPUP", {
                          id: h.holderId,
                          name: h.holderName,
                          branchId: h.branchId,
                        })
                      }
                      className="h-8 px-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1 cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>Top-up</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 3: SUMMARY & ANALYTICS REPORT (แบบฟอร์มรายงานสรุปค่าใช้จ่ายเงินสดย่อย) ──────── */}
      {canApproveOrTopUp && activeViewTab === "report" && (
        <div className="space-y-4">
          <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
            {/* Report Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  บริษัท แดท ลอนดรี้ ช็อป จำกัด
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  รายงานสรุปค่าใช้จ่ายเงินสดย่อย
                </p>
              </div>
              <div className="flex flex-col sm:items-end gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block border border-slate-400 rounded-md px-2.5 py-1 text-xs font-bold text-slate-900 bg-white">
                    ประจำงวด: {thaiAccountingReport.thaiPeriodLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-7.5 text-xs font-semibold border-slate-200 rounded-lg gap-1 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Excel (.csv)</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleExportPdf}
                    className="h-7.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg gap-1 cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>Print / PDF</span>
                  </Button>
                </div>
                <span className="text-[11px] text-slate-400">
                  วันที่พิมพ์: {thaiAccountingReport.printedDateBE}
                </span>
              </div>
            </div>

            {/* Filter & Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">ผู้รับผิดชอบ:</span>
                <span
                  className={`font-extrabold text-slate-900 ${
                    thaiAccountingReport.isSingleCustodian ? "text-base" : "text-xs"
                  }`}
                >
                  {thaiAccountingReport.selectedHolderLabel}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">หมวดหมู่:</span>
                <span className="font-bold text-slate-900">
                  {thaiAccountingReport.selectedCategoryLabel}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">วงเงินที่ตั้งไว้:</span>
                <span className="font-mono font-extrabold text-slate-900">
                  ฿{thaiAccountingReport.totalQuotaLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">ยอดจ่ายรวมในงวดนี้:</span>
                <span className="font-mono font-extrabold text-rose-700">
                  ฿{thaiAccountingReport.totalExpenseInPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">เงินสดคงเหลือ:</span>
                <span
                  className={`font-mono font-extrabold ${
                    thaiAccountingReport.totalNetCashBalance < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  ฿{thaiAccountingReport.totalNetCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Section 1: Detailed Expense Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-900">
                • 1. รายการใบเสร็จและรายละเอียดค่าใช้จ่ายตามเงื่อนไขที่เลือก
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-800">
                      <th className="py-2.5 px-2.5 text-center w-12">ลำดับ</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap">วันที่</th>
                      {!thaiAccountingReport.isSingleCustodian && (
                        <th className="py-2.5 px-2.5 whitespace-nowrap">ผู้รับผิดชอบ</th>
                      )}
                      <th className="py-2.5 px-2.5">หมวดหมู่</th>
                      <th className="py-2.5 px-2.5">รายละเอียดรายการ</th>
                      <th className="py-2.5 px-2.5">ผู้รับเงิน / ร้านค้า</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap">เลขที่บิล</th>
                      <th className="py-2.5 px-2.5 text-right whitespace-nowrap">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {thaiAccountingReport.expenseItems.length > 0 ? (
                      thaiAccountingReport.expenseItems.map((t, idx) => (
                        <tr key={t.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-2.5 text-center text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono text-slate-700">
                            {format(new Date(t.transactionDate), "yyyy-MM-dd")}
                          </td>
                          {!thaiAccountingReport.isSingleCustodian && (
                            <td className="py-2 px-2.5 font-medium text-slate-900 whitespace-nowrap">
                              {(t.holderName || "").trim().split(/\s+/)[0] || t.holderName}
                            </td>
                          )}
                          <td className="py-2 px-2.5 text-slate-800">
                            {thaiAccountingReport.formatCategoryLabel(t)}
                          </td>
                          <td className="py-2 px-2.5 text-slate-700">{t.description || "–"}</td>
                          <td className="py-2 px-2.5 text-slate-600">{t.vendorName || "–"}</td>
                          <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {t.invoiceNo || t.txNumber || "–"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            ฿{Number(t.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={thaiAccountingReport.isSingleCustodian ? 7 : 8}
                          className="py-6 text-center text-slate-400"
                        >
                          ไม่มีรายการค่าใช้จ่ายในงวดที่เลือก
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 border-t border-slate-300 font-bold text-slate-900">
                      <td
                        colSpan={thaiAccountingReport.isSingleCustodian ? 6 : 7}
                        className="py-2.5 px-2.5 text-right"
                      >
                        รวมจ่ายค่าใช้จ่าย:
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono font-extrabold whitespace-nowrap">
                        ฿{thaiAccountingReport.totalExpenseInPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="bg-white text-slate-600">
                      <td
                        colSpan={thaiAccountingReport.isSingleCustodian ? 4 : 5}
                        className="py-2 px-2.5 text-right text-[11px]"
                      >
                        จำนวนเงินตัวอักษร:
                      </td>
                      <td
                        colSpan={3}
                        className="py-2 px-2.5 text-right font-bold italic text-slate-900 text-[11px] whitespace-nowrap"
                      >
                        {thaiAccountingReport.thaiBahtTotalText}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Pivot Matrix (Category x Custodian) */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-900">
                {thaiAccountingReport.isSingleCustodian
                  ? "• 2. ตารางสรุปยอดค่าใช้จ่ายตามหมวดหมู่"
                  : "• 2. ตารางสรุปยอดค่าใช้จ่าย (หมวดหมู่ค่าใช้จ่าย X ผู้รับผิดชอบ)"}
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table
                  className={`w-full text-left border-collapse ${
                    thaiAccountingReport.custodians.length >= 6 ? "text-[11px]" : "text-xs"
                  }`}
                >
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                      <th className="py-2.5 px-3">หมวดหมู่</th>
                      {!thaiAccountingReport.isSingleCustodian &&
                        thaiAccountingReport.custodians.map((c, idx) => (
                          <th key={c.holderId} className="py-2.5 px-2.5 text-right whitespace-nowrap">
                            {idx + 1}. {c.shortName} (บาท)
                          </th>
                        ))}
                      <th className="py-2.5 px-3 text-right bg-slate-200/70 whitespace-nowrap">
                        {thaiAccountingReport.isSingleCustodian ? "รวม (บาท)" : "รวมทุกรายคน (บาท)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {thaiAccountingReport.pivotRows.length > 0 ? (
                      thaiAccountingReport.pivotRows.map((r) => (
                        <tr key={r.category} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-medium text-slate-900">{r.category}</td>
                          {!thaiAccountingReport.isSingleCustodian &&
                            thaiAccountingReport.custodians.map((c) => {
                              const val = r.byHolder[c.holderId] || 0;
                              return (
                                <td
                                  key={c.holderId}
                                  className="py-2 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap"
                                >
                                  {val > 0
                                    ? `฿${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : "-"}
                                </td>
                              );
                            })}
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50 whitespace-nowrap">
                            ฿{r.rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={thaiAccountingReport.isSingleCustodian ? 2 : thaiAccountingReport.custodians.length + 2}
                          className="py-5 text-center text-slate-400"
                        >
                          ไม่มีข้อมูลค่าใช้จ่าย
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 border-t border-slate-300 font-bold text-slate-900">
                      <td className="py-2.5 px-3">รวมจ่ายค่าใช้จ่ายและรอเบิกจ่าย (บาท):</td>
                      {!thaiAccountingReport.isSingleCustodian &&
                        thaiAccountingReport.custodians.map((c) => (
                          <td
                            key={c.holderId}
                            className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap"
                          >
                            ฿{c.periodExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        ))}
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold bg-slate-200/70 whitespace-nowrap">
                        ฿{thaiAccountingReport.totalExpenseInPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/90 border-t border-emerald-200 font-bold">
                      <td className="py-2.5 px-3 text-emerald-900">เงินสดคงเหลือสุทธิ (บาท):</td>
                      {!thaiAccountingReport.isSingleCustodian &&
                        thaiAccountingReport.custodians.map((c) => (
                          <td
                            key={c.holderId}
                            className={`py-2.5 px-2.5 text-right font-mono whitespace-nowrap ${
                              c.currentBalance < 0 ? "text-rose-700" : "text-emerald-800"
                            }`}
                          >
                            ฿{c.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        ))}
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-extrabold bg-emerald-100/90 whitespace-nowrap ${
                          thaiAccountingReport.totalNetCashBalance < 0
                            ? "text-rose-700"
                            : "text-emerald-900"
                        }`}
                      >
                        ฿{thaiAccountingReport.totalNetCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Footer Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {["ผู้จัดทำรายงาน", "ผู้ตรวจสอบบัญชี", "ผู้อนุมัติ"].map((roleTitle) => (
                <div
                  key={roleTitle}
                  className="border border-dashed border-slate-300 rounded-xl p-3 text-center text-xs text-slate-700"
                >
                  <div className="font-semibold">{roleTitle}</div>
                  <div className="border-b border-slate-400 h-7 w-4/5 mx-auto mb-1.5" />
                  <div className="text-[11px] text-slate-500">วันที่ ____ / ____ / ________</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: FUEL & VEHICLE SUMMARY + GRAPHS (สรุปค่าน้ำมันตามทะเบียนรถ) ── */}
      {activeViewTab === "fuel" && (
        <div className="space-y-4">
          {/* Header & Mode Toggle */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shrink-0">
                <Car size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Fuel &amp; Vehicle Expense Summary (สรุปค่าน้ำมันแยกตามทะเบียนรถ)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  แสดงยอดเบิกจ่ายค่าน้ำมันแยกตามเลขทะเบียนรถและกราฟแนวโน้มรายวัน (อ้างอิงตามช่วงวันที่/สาขา/ผู้ถือวงเงินที่เลือกด้านบน)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                <button
                  type="button"
                  onClick={() => setFuelIncludeMaintenance(false)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    !fuelIncludeMaintenance ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Fuel Only (เฉพาะค่าน้ำมัน)
                </button>
                <button
                  type="button"
                  onClick={() => setFuelIncludeMaintenance(true)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    fuelIncludeMaintenance ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Fuel + Maintenance (รวมค่าซ่อมรถ)
                </button>
              </div>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">
                {fuelIncludeMaintenance ? "Total Vehicle Spend (รวมทั้งหมด)" : "Total Fuel Spend (ค่าน้ำมันรวม)"}
              </span>
              <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1.5">
                ฿{fuelAnalytics.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {fuelIncludeMaintenance && (
                <div className="text-[11px] text-slate-400 mt-1">
                  ค่าน้ำมัน ฿{fuelAnalytics.totalFuelAmount.toLocaleString()} • ค่าซ่อม ฿{fuelAnalytics.totalMaintAmount.toLocaleString()}
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">Total Refuels / Bills (จำนวนบิล)</span>
              <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1.5">
                {fuelAnalytics.totalCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                เฉลี่ย ฿{fuelAnalytics.avgPerBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / บิล
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">Vehicles Active (จำนวนทะเบียนรถ)</span>
              <div className="text-2xl font-extrabold font-mono text-sky-600 mt-1.5">
                {fuelAnalytics.plateRows.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                คลิกที่แท่งกราฟหรือตารางเพื่อดูบิลรายคัน
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">Top Vehicle (คันที่ใช้งบสูงสุด)</span>
              <div className="text-lg font-extrabold font-mono text-amber-600 mt-1.5 truncate">
                {fuelAnalytics.plateRows[0]?.plate || "-"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {fuelAnalytics.plateRows[0]
                  ? `฿${fuelAnalytics.plateRows[0].totalAmount.toLocaleString()} (${fuelAnalytics.plateRows[0].billCount} บิล)`
                  : "ยังไม่มีข้อมูล"}
              </div>
            </div>
          </div>

          {/* Graphs Row: Bar Chart by License Plate + Daily Trend Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Graph 1: Spend by Vehicle License Plate */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <BarChart3 size={15} className="text-sky-600" />
                    <span>Spend by Vehicle Plate (กราฟเปรียบเทียบรายทะเบียนรถ)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    แสดงยอดใช้จ่ายแยกตามทะเบียนรถแต่ละคัน (คลิกเพื่อกรองรายการ)
                  </p>
                </div>
              </div>

              {fuelAnalytics.plateRows.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  ไม่มีข้อมูลค่าน้ำมันในช่วงเวลาที่เลือก
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {fuelAnalytics.plateRows.map((row, idx) => {
                    const pctWidth = fuelAnalytics.maxPlateAmount > 0
                      ? Math.round((row.totalAmount / fuelAnalytics.maxPlateAmount) * 100)
                      : 0;
                    const fuelPctOfRow = row.totalAmount > 0 ? Math.round((row.fuelAmount / row.totalAmount) * 100) : 100;
                    const sharePct = fuelAnalytics.totalAmount > 0
                      ? Math.round((row.totalAmount / fuelAnalytics.totalAmount) * 1000) / 10
                      : 0;
                    const isSelected = selectedFuelPlate === row.plate;
                    const barColors = [
                      "bg-sky-600",
                      "bg-indigo-600",
                      "bg-emerald-600",
                      "bg-amber-500",
                      "bg-purple-600",
                      "bg-rose-500",
                    ];
                    return (
                      <button
                        key={row.plate}
                        type="button"
                        onClick={() => setSelectedFuelPlate(isSelected ? "ALL" : row.plate)}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "border-sky-500 bg-sky-50/50 ring-1 ring-sky-200"
                            : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-extrabold text-slate-900 truncate">{row.plate}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {row.billCount} บิล ({sharePct}%)
                            </span>
                          </div>
                          <span className="font-mono font-black text-rose-600 shrink-0">
                            ฿{row.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                          {fuelIncludeMaintenance ? (
                            <>
                              <div
                                className="h-full bg-sky-600 transition-all duration-300"
                                style={{ width: `${Math.max((pctWidth * fuelPctOfRow) / 100, row.fuelAmount > 0 ? 3 : 0)}%` }}
                                title={`ค่าน้ำมัน: ฿${row.fuelAmount.toLocaleString()}`}
                              />
                              <div
                                className="h-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${Math.max((pctWidth * (100 - fuelPctOfRow)) / 100, row.maintAmount > 0 ? 3 : 0)}%` }}
                                title={`ค่าซ่อมบำรุง: ฿${row.maintAmount.toLocaleString()}`}
                              />
                            </>
                          ) : (
                            <div
                              className={`h-full ${barColors[idx % barColors.length]} rounded-full transition-all duration-300`}
                              style={{ width: `${Math.max(pctWidth, 4)}%` }}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {fuelIncludeMaintenance && (
                    <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" /> ค่าน้ำมัน (Fuel)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> ค่าซ่อมบำรุง (Maintenance)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Graph 2: Daily Fuel Trend Chart */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar size={15} className="text-indigo-600" />
                  <span>Daily Spend Trend (กราฟยอดเบิกจ่ายรายวัน)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  แนวโน้มค่าใช้จ่ายค่าน้ำมันในแต่ละวันของช่วงเวลาที่เลือก
                </p>
              </div>

              {fuelAnalytics.dailyRows.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  ไม่มีข้อมูลกราฟรายวันในช่วงเวลาที่เลือก
                </div>
              ) : (
                <div className="pt-2">
                  <div className="h-52 flex items-end gap-2 border-b border-slate-200 pb-2 px-1 overflow-x-auto">
                    {fuelAnalytics.dailyRows.map((d) => {
                      const heightPct = fuelAnalytics.maxDailyAmount > 0
                        ? Math.max(8, Math.round((d.totalAmount / fuelAnalytics.maxDailyAmount) * 100))
                        : 8;
                      return (
                        <div
                          key={d.dateKey}
                          className="flex-1 min-w-[44px] h-full flex flex-col items-center justify-end group"
                          title={`${d.label}: ฿${d.totalAmount.toLocaleString()} (${d.count} บิล)`}
                        >
                          <span className="text-[10px] font-mono font-bold text-slate-600 mb-1 opacity-90 group-hover:text-sky-700 whitespace-nowrap">
                            ฿{d.totalAmount.toLocaleString()}
                          </span>
                          <div className="w-full max-w-[36px] flex-1 flex items-end">
                            <div
                              className="w-full rounded-t-lg bg-gradient-to-t from-sky-600 to-indigo-500 group-hover:from-sky-500 group-hover:to-indigo-400 transition-all shadow-2xs"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-1.5 px-1 overflow-x-auto">
                    {fuelAnalytics.dailyRows.map((d) => (
                      <div key={d.dateKey} className="flex-1 min-w-[44px] text-center">
                        <div className="text-[10px] font-bold text-slate-600">{d.label}</div>
                        <div className="text-[9px] text-slate-400">{d.count} บิล</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary Table by License Plate */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Summary by License Plate (ตารางสรุปยอดค่าน้ำมันแยกตามทะเบียนรถ)
                </h3>
              </div>
              {selectedFuelPlate !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSelectedFuelPlate("ALL")}
                  className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold hover:bg-sky-100 cursor-pointer"
                >
                  Showing: {selectedFuelPlate} (Clear)
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-center w-10">#</th>
                    <th className="px-4 py-2.5">License Plate (ทะเบียนรถ)</th>
                    <th className="px-4 py-2.5 text-center">Bills (จำนวนครั้ง)</th>
                    <th className="px-4 py-2.5 text-right">Fuel (ค่าน้ำมัน)</th>
                    {fuelIncludeMaintenance && (
                      <th className="px-4 py-2.5 text-right">Maintenance (ค่าซ่อม)</th>
                    )}
                    <th className="px-4 py-2.5 text-right">Total (รวมทั้งหมด)</th>
                    <th className="px-4 py-2.5 text-right">Avg / Bill (เฉลี่ย/ครั้ง)</th>
                    <th className="px-4 py-2.5 text-right">Share (%)</th>
                    <th className="px-4 py-2.5 text-center">Last Refuel (ล่าสุด)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fuelAnalytics.plateRows.length === 0 ? (
                    <tr>
                      <td colSpan={fuelIncludeMaintenance ? 9 : 8} className="px-4 py-8 text-center text-slate-400">
                        ไม่มีข้อมูลค่าน้ำมันในช่วงเวลาที่เลือก
                      </td>
                    </tr>
                  ) : (
                    fuelAnalytics.plateRows.map((row, idx) => {
                      const avg = row.billCount > 0 ? row.totalAmount / row.billCount : 0;
                      const share = fuelAnalytics.totalAmount > 0 ? (row.totalAmount / fuelAnalytics.totalAmount) * 100 : 0;
                      const isSelected = selectedFuelPlate === row.plate;
                      return (
                        <tr
                          key={row.plate}
                          onClick={() => setSelectedFuelPlate(isSelected ? "ALL" : row.plate)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-sky-50/70" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-4 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-mono font-extrabold text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              <Car size={13} className="text-sky-600" />
                              {row.plate}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-slate-700">{row.billCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">
                            ฿{row.fuelAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {fuelIncludeMaintenance && (
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">
                              ฿{row.maintAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900">
                            ฿{row.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                            ฿{avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-600">
                            {share.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-500 font-mono">{row.lastDate}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Fuel Bills Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Fuel Expense Bills (รายการบิลค่าน้ำมัน{selectedFuelPlate !== "ALL" ? ` • ${selectedFuelPlate}` : ""})
              </h3>
              <span className="text-xs font-bold text-slate-400">
                {fuelAnalytics.matchedTxs.filter((t) => selectedFuelPlate === "ALL" || t.resolvedPlate === selectedFuelPlate).length} รายการ
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Ref No.</th>
                    <th className="px-4 py-2.5">License Plate</th>
                    <th className="px-4 py-2.5">Holder / Branch</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5">Invoice No.</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fuelAnalytics.matchedTxs
                    .filter((t) => selectedFuelPlate === "ALL" || t.resolvedPlate === selectedFuelPlate)
                    .map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {format(new Date(tx.transactionDate || tx.createdAt), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{tx.txNumber || "-"}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-mono font-bold text-[11px]">
                            {tx.resolvedPlate}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-slate-800">{tx.holderName}</div>
                          <div className="text-[10.5px] text-slate-400">{getBranchDisplayName(tx.branchId)}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{tx.description}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{tx.invoiceNo || "-"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">
                          -฿{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              tx.status === "APPROVED"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 1 (DEFAULT): STREAMLINED TRANSACTIONS LEDGER ─────────────────── */}
      {activeViewTab === "ledger" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Active Wallet Context Banner */}
          {canApproveOrTopUp && holderFilter !== "ALL" && (() => {
            const activeHolder = holderSummaries.find((h) => h.holderId === holderFilter);
            if (!activeHolder) return null;
            const limit = getHolderLimit(activeHolder.holderId, activeHolder.isAccounting);
            return (
              <div className="px-4 py-2.5 bg-indigo-50/80 border-b border-indigo-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-bold text-[10.5px]">
                    กำลังดูเฉพาะกระเป๋า
                  </span>
                  <strong className="text-indigo-950 font-extrabold text-sm">
                    {activeHolder.holderName}
                  </strong>
                  <span className="text-indigo-700 font-medium">
                    ({activeHolder.isAccounting ? "Accounting" : "Store"} • {getBranchDisplayName(activeHolder.branchId)})
                  </span>
                  <span className="text-slate-600">
                    • คงเหลือ <strong className="font-mono text-emerald-700">฿{activeHolder.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> / วงเงิน <strong className="font-mono">฿{limit.toLocaleString()}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenCreateModal(
                        "EXPENSE",
                        { id: activeHolder.holderId, name: activeHolder.holderName, branchId: activeHolder.branchId },
                        "EXPENSE_DOC"
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-[11px] cursor-pointer"
                  >
                    + เบิกจ่ายในชื่อ {activeHolder.holderName}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHolderFilter("ALL");
                      setBranchFilter("ALL");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
                  >
                    แสดงทุกกระเป๋า (Show All Wallets)
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Clean Filter Bar */}
          <div className="p-3.5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Type Pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: "ALL", label: "All", count: filteredTransactions.length },
                { id: "EXPENSE", label: "Expenses", count: dashboardDetails.expenseTxCount },
                { id: "TOPUP", label: "Top-ups", count: dashboardDetails.topupTxCount },
                { id: "TRANSFER_OUT", label: "Transfers", count: dashboardDetails.transferTxCount },
              ].map((tab) => {
                const active = typeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      active
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/70"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        active ? "bg-white/20 text-white" : "bg-white text-slate-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}

              {(holderFilter !== "ALL" ||
                branchFilter !== "ALL" ||
                categoryFilter !== "ALL" ||
                statusFilter !== "ALL" ||
                typeFilter !== "ALL" ||
                dateFrom !== "" ||
                dateTo !== "" ||
                searchQuery.trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setHolderFilter("ALL");
                    setBranchFilter("ALL");
                    setCategoryFilter("ALL");
                    setStatusFilter("ALL");
                    setTypeFilter("ALL");
                    setDateFrom("");
                    setDateTo("");
                    setSearchQuery("");
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Reset All
                </button>
              )}
            </div>

            {/* Right: Search & Compact Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search description, vendor, bill..."
                  className="h-8.5 pl-8 text-xs rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                />
              </div>

              {canApproveOrTopUp && (
                <>
                  <select
                    value={holderFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHolderFilter(val);
                      if (val !== "ALL") setBranchFilter("ALL");
                    }}
                    className={`h-8.5 rounded-xl border px-2.5 text-xs font-semibold outline-none cursor-pointer ${
                      holderFilter !== "ALL"
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <option value="ALL">All Wallets (ทุกกระเป๋า)</option>
                    {holderSummaries.map((h) => (
                      <option key={h.holderId} value={h.holderId}>
                        {h.holderName} ({h.txCount} รายการ • ฿{h.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>

                  <select
                    value={branchFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBranchFilter(val);
                      if (val !== "ALL" && holderFilter !== "ALL") {
                        const curH = holderSummaries.find((h) => h.holderId === holderFilter);
                        if (curH && (curH.branchId || "HQ") !== val) {
                          setHolderFilter("ALL");
                        }
                      }
                    }}
                    className="h-8.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="ALL">All Branches</option>
                    <option value="HQ">Head Quarter</option>
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8.5 max-w-[180px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-400 cursor-pointer truncate"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-400 cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending ({kpiStats.pendingCount})</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="VOID">Void</option>
              </select>
            </div>
          </div>

          {/* Streamlined 7-Column Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Date / Ref</th>
                  <th className="py-3 px-4">Custodian</th>
                  <th className="py-3 px-4">Details & Category</th>
                  <th className="py-3 px-4 text-center">Receipts / Slips</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-right">Status & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <Loader2 size={22} className="animate-spin mx-auto mb-2 text-slate-400" />
                      <span>Loading transactions...</span>
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 space-y-2.5">
                      <div className="font-semibold text-slate-700">
                        ไม่พบรายการเดินบัญชีตามตัวกรองที่เลือก (No transactions found for the selected filters)
                      </div>
                      {(holderFilter !== "ALL" || branchFilter !== "ALL" || categoryFilter !== "ALL" || statusFilter !== "ALL" || typeFilter !== "ALL" || dateFrom || dateTo || searchQuery.trim()) && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setHolderFilter("ALL");
                              setBranchFilter("ALL");
                              setCategoryFilter("ALL");
                              setStatusFilter("ALL");
                              setTypeFilter("ALL");
                              setDateFrom("");
                              setDateTo("");
                              setSearchQuery("");
                            }}
                            className="mt-1 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                          >
                            ล้างตัวกรองเพื่อดูรายการทั้งหมด ({transactions.length} รายการ)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isCredit = tx.direction === "CREDIT";
                    const isRejectedOrVoid = tx.status === "REJECTED" || tx.status === "VOID";
                    const branchName = getBranchDisplayName(tx.branchId);
                    const allFiles = [...(tx.receiptUrls || []), ...(tx.slipUrls || [])];

                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isRejectedOrVoid ? "opacity-50 bg-slate-50/30" : ""
                        }`}
                      >
                        {/* 1. Date & Ref */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {format(new Date(tx.transactionDate), "dd MMM yyyy, HH:mm")}
                          </div>
                          <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">
                            {tx.txNumber || tx.id.slice(0, 8)}
                          </div>
                        </td>

                        {/* 2. Custodian & Branch */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (!canApproveOrTopUp) return;
                              setHolderFilter(holderFilter === tx.holderId ? "ALL" : tx.holderId);
                              setBranchFilter("ALL");
                            }}
                            className={`text-left ${canApproveOrTopUp ? "hover:text-indigo-600 cursor-pointer" : ""}`}
                            title={canApproveOrTopUp ? `คลิกเพื่อกรองดูเฉพาะกระเป๋าของ ${tx.holderName}` : undefined}
                          >
                            <div className="font-semibold text-slate-900 hover:underline">{tx.holderName}</div>
                            <div className="text-[11px] text-slate-400">{branchName}</div>
                          </button>
                        </td>

                        {/* 3. Details & Category */}
                        <td className="py-3 px-4 max-w-[340px]">
                          <div className="font-semibold text-slate-900 break-words">
                            {tx.description}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                tx.type === "TRANSFER_OUT" || tx.type === "TRANSFER_IN"
                                  ? "bg-indigo-50 text-indigo-700"
                                  : isCredit
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {tx.category}
                            </span>
                            {tx.vendorName && (
                              <span className="text-[10.5px] text-slate-500">
                                • {tx.vendorName}
                              </span>
                            )}
                            {tx.invoiceNo && (
                              <span className="text-[10.5px] font-mono text-slate-400">
                                #{tx.invoiceNo}
                              </span>
                            )}
                            {tx.vehiclePlate && (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded">
                                🚗 {tx.vehiclePlate}
                              </span>
                            )}
                            {tx.replenishmentReportId && (() => {
                              const linkedRep = replenishmentReports.find((r) => r.id === tx.replenishmentReportId);
                              if (!linkedRep) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReviewReportModal(linkedRep)}
                                  className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 px-1.5 py-0.2 rounded cursor-pointer"
                                  title="Included in Replenishment Report — click to view"
                                >
                                  📋 {linkedRep.reportNumber}
                                </button>
                              );
                            })()}
                          </div>
                          {tx.rejectReason && (
                            <div className="text-[10.5px] text-rose-600 mt-1">
                              Reason: {tx.rejectReason.replace(/\s*\[Task:\s*[^\]]+\]/gi, "")}
                            </div>
                          )}
                        </td>

                        {/* 4. Attachments (with inline thumbnail preview) */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {allFiles.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setPreviewTx(tx)}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              {!isPdfOrDocUrl(allFiles[0]) ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={allFiles[0]}
                                  alt="Attachment"
                                  className="w-6 h-6 rounded object-cover border border-slate-200"
                                />
                              ) : (
                                <FileText size={13} className="text-indigo-600" />
                              )}
                              <span>{allFiles.length} file{allFiles.length > 1 ? "s" : ""}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPreviewTx(tx)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-[11px] font-medium cursor-pointer"
                              title="Click to attach or paste receipt/slip via Ctrl+V"
                            >
                              <Upload size={11} />
                              <span>+ Attach</span>
                            </button>
                          )}
                        </td>

                        {/* 5. Amount */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            className={`font-mono font-bold text-sm ${
                              isRejectedOrVoid
                                ? "line-through text-slate-400"
                                : isCredit
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {isCredit ? "+" : "-"}฿
                            {tx.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </td>

                        {/* 6. Balance */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-800">
                            ฿{tx.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>

                        {/* 7. Status & Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            {tx.status === "APPROVED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] font-semibold">
                                <CheckCircle2 size={11} /> Approved
                              </span>
                            ) : tx.status === "PENDING" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10.5px] font-semibold">
                                <Clock size={11} /> Pending
                              </span>
                            ) : tx.status === "REJECTED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10.5px] font-semibold">
                                <XCircle size={11} /> Rejected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-semibold">
                                Void
                              </span>
                            )}

                            {canApproveOrTopUp && tx.status === "PENDING" && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isReviewing}
                                  onClick={() => handleQuickApprove(tx)}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-semibold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={isReviewing}
                                  onClick={() => {
                                    setRejectTargetTx(tx);
                                    setRejectActionType("REJECT");
                                    setRejectReason("");
                                    setRejectModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10.5px] font-semibold cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(tx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Edit transaction"
                            >
                              <Edit2 size={13} />
                            </button>

                            {canApproveOrTopUp && tx.status === "APPROVED" && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isReviewing}
                                  onClick={() => {
                                    setRejectTargetTx(tx);
                                    setRejectActionType("REJECT");
                                    setRejectReason("");
                                    setRejectModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10.5px] font-semibold cursor-pointer"
                                  title="Reject retroactively & refund to wallet (ปฏิเสธย้อนหลังและคืนเงินเข้า Wallet)"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectTargetTx(tx);
                                    setRejectActionType("VOID");
                                    setRejectReason("");
                                    setRejectModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Void transaction"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT TRANSACTION MODAL ───────────────────────── */}
      <Dialog open={txModalOpen} onOpenChange={setTxModalOpen}>
        <DialogContent className={`${txMode === "TOPUP" && !editingTx ? "sm:max-w-lg" : "w-[95vw] sm:max-w-3xl"} bg-white rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-5 sm:p-6`}>
          {txMode === "TOPUP" && !editingTx ? (
            (() => {
              const recipientSummary = holderSummaries.find((h) => h.holderId === formHolderId);
              const recipientBalance = recipientSummary?.currentBalance ?? 0;
              const effectiveLimit = (() => {
                const parsed = parseFloat(formHolderLimit);
                return !isNaN(parsed) && parsed >= 0 ? parsed : getHolderLimit(formHolderId);
              })();
              const shortfall = Math.max(0, Math.round((effectiveLimit - recipientBalance) * 100) / 100);
              const topupAmt = parseFloat(formAmount);
              const validTopupAmt = !isNaN(topupAmt) && topupAmt > 0 ? topupAmt : 0;
              const balanceAfterAdjust = Math.round((recipientBalance + validTopupAmt) * 100) / 100;

              return (
                <>
                  <DialogHeader className="pb-2">
                    <DialogTitle className="text-xl font-bold text-slate-800">
                      Replenish / Top-up Petty Cash
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Custodian: <strong className="text-slate-700">{formHolderName}</strong> ({getBranchDisplayName(formBranchId)})
                    </DialogDescription>
                  </DialogHeader>

                  {/* Approved / Pending Replenishment Report Notice inside Top-up Modal */}
                  {(() => {
                    const holderReports = replenishmentReports.filter((r) => r.holderId === formHolderId);
                    const pendingRep = holderReports.find((r) => r.status === "PENDING_APPROVAL");
                    const approvedRep = holderReports.find((r) => r.status === "APPROVED");
                    if (pendingRep) {
                      return (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 flex items-center justify-between gap-2 text-xs">
                          <div className="text-amber-900">
                            <strong>📋 มีใบสรุปขอเบิกรอตรวจ ({pendingRep.reportNumber})</strong>
                            <div className="text-[11px] text-amber-700">
                              ยอดขอเบิกชดเชย ฿{pendingRep.requestedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({pendingRep.expenseTxIds.length} บิล) — กรุณาตรวจและ Approve ก่อนโอนเติม
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setTxModalOpen(false);
                              handleOpenReviewReportModal(pendingRep);
                            }}
                            className="h-7 px-2.5 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shrink-0 cursor-pointer"
                          >
                            Review & Approve
                          </Button>
                        </div>
                      );
                    }
                    if (approvedRep) {
                      return (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/90 flex items-center justify-between gap-2 text-xs">
                          <div className="text-emerald-900">
                            <strong>✅ อนุมัติใบสรุปแล้ว ({approvedRep.reportNumber})</strong>
                            <div className="text-[11px] text-emerald-700">
                              ยอดอนุมัติ ฿{approvedRep.requestedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({approvedRep.expenseTxIds.length} บิล)
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setFormAmount(approvedRep.requestedAmount.toFixed(2))}
                            className="h-7 px-2.5 text-[11px] font-bold border-emerald-400 text-emerald-800 bg-white hover:bg-emerald-100 rounded-lg shrink-0 cursor-pointer"
                          >
                            Use ฿{approvedRep.requestedAmount.toLocaleString()}
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>ยังไม่มีใบสรุปค่าใช้จ่ายที่ส่งอนุมัติสำหรับรอบนี้</span>
                        <button
                          type="button"
                          onClick={() => {
                            setTxModalOpen(false);
                            handleOpenSubmitReportModal(formHolderId);
                          }}
                          className="font-bold text-indigo-600 hover:underline shrink-0 cursor-pointer"
                        >
                          + สร้างใบสรุป Report ก่อนเบิก →
                        </button>
                      </div>
                    );
                  })()}

                  <div className="space-y-4 py-2 text-sm text-slate-800">
                    {/* Top-up Date */}
                    <div className="grid grid-cols-12 items-center gap-3">
                      <label className="col-span-4 font-bold text-slate-800">Top-up Date:</label>
                      <div className="col-span-8">
                        <Input
                          type="date"
                          value={formDate ? formDate.slice(0, 10) : format(new Date(), "yyyy-MM-dd")}
                          onChange={(e) => {
                            const d = e.target.value;
                            const timePart = formDate && formDate.includes("T") ? formDate.slice(11, 16) : format(new Date(), "HH:mm");
                            setFormDate(d ? `${d}T${timePart}` : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
                          }}
                          className="h-10 rounded-md border-slate-300 text-sm text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Petty Cash Limit (Editable by Accounting/Admin) */}
                    <div className="grid grid-cols-12 items-center gap-3">
                      <label className="col-span-4 font-bold text-slate-800">Petty Cash Limit:</label>
                      <div className="col-span-8 flex items-center justify-between gap-2">
                        {isEditingLimit && canApproveOrTopUp ? (
                          <div className="flex items-center gap-2 w-full">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={formHolderLimit}
                              onChange={(e) => setFormHolderLimit(e.target.value)}
                              className="h-9 rounded-md border-indigo-400 font-mono text-sm"
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={isSavingLimit}
                              onClick={() => handleSaveHolderLimit(formHolderId, formHolderLimit)}
                              className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md shrink-0 cursor-pointer"
                            >
                              {isSavingLimit ? <Loader2 size={13} className="animate-spin" /> : "Save"}
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormHolderLimit(String(getHolderLimit(formHolderId)));
                                setIsEditingLimit(false);
                              }}
                              className="text-xs text-slate-500 hover:text-slate-700 px-1.5 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium text-slate-800">
                              {effectiveLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {canApproveOrTopUp && (
                              <button
                                type="button"
                                onClick={() => setIsEditingLimit(true)}
                                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                                title="Set petty cash limit for this custodian"
                              >
                                <Edit2 size={12} />
                                Edit Limit
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Current Balance */}
                    <div className="grid grid-cols-12 items-center gap-3">
                      <label className="col-span-4 font-bold text-slate-800">Current Balance:</label>
                      <div className="col-span-8 font-medium text-slate-800">
                        {recipientBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <hr className="border-slate-200 my-1" />

                    {/* (Top-up X,XXX.XX to reach full limit) + Top-up Amount */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-4" />
                        <div className="col-span-8">
                          <button
                            type="button"
                            onClick={() => {
                              if (shortfall > 0) setFormAmount(shortfall.toFixed(2));
                            }}
                            className="text-xs text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer text-left"
                            title="Click to auto-fill shortfall amount"
                          >
                            (Top-up {shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to reach full limit)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-center gap-3">
                        <label className="col-span-4 font-bold text-slate-800">Top-up Amount:</label>
                        <div className="col-span-8">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            placeholder="0.00"
                            className="h-10 rounded-t-md rounded-b-none border-slate-300 text-sm text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Balance After Top-up */}
                      <div className="grid grid-cols-12 items-center gap-3 -mt-1.5">
                        <label className="col-span-4 font-bold text-slate-800">Balance After Top-up:</label>
                        <div className="col-span-8">
                          <div className="h-10 px-3 rounded-b-md border border-t-0 border-slate-300 bg-slate-100 flex items-center text-sm text-slate-700 select-none">
                            {balanceAfterAdjust.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Source Account */}
                    <div className="grid grid-cols-12 items-center gap-3 pt-1">
                      <label className="col-span-4 font-bold text-slate-800">Source Account:</label>
                      <div className="col-span-8">
                        <select
                          value={formTopupSourceAccount}
                          onChange={(e) => setFormTopupSourceAccount(e.target.value)}
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select payment channel</option>
                          <option value="Bank Account">Bank Account</option>
                          <option value="Cash">Cash</option>
                          <option value="Petty Cash Wallet">Petty Cash Wallet</option>
                        </select>
                      </div>
                    </div>

                    {/* If "Petty Cash Wallet" is selected, choose the source wallet to deduct from */}
                    {formTopupSourceAccount === "Petty Cash Wallet" && (
                      <div className="grid grid-cols-12 items-center gap-3 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-200/80">
                        <label className="col-span-4 text-xs font-bold text-indigo-950">
                          Deduct From Wallet:
                        </label>
                        <div className="col-span-8">
                          <select
                            value={formSourceHolderId}
                            onChange={(e) => setFormSourceHolderId(e.target.value)}
                            className="h-9 w-full rounded-md border border-indigo-300 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                          >
                            <option value="">-- Select Source Wallet --</option>
                            {holderOptions
                              .filter((h) => h.id !== formHolderId)
                              .map((h) => {
                                const bal = holderSummaries.find((s) => s.holderId === h.id)?.currentBalance ?? 0;
                                return (
                                  <option key={h.id} value={h.id}>
                                    {h.name} (Balance: ฿{bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Remark & Attach Transfer Slip (Optional, supports Ctrl+V) */}
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-12 items-center gap-3">
                        <label className="col-span-4 text-xs font-bold text-slate-600">
                          Remark / Slip:
                          <span className="block text-[10px] font-semibold text-emerald-700">
                            (Ctrl+V to Paste Slip)
                          </span>
                        </label>
                        <div className="col-span-8 flex items-center gap-2">
                          <Input
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            placeholder="Optional remark / note..."
                            className="h-9 rounded-md border-slate-300 text-xs"
                          />
                          <input
                            ref={slipInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              handleUploadFiles(
                                e.target.files,
                                "slips",
                                (urls) => setFormSlipUrls((prev) => [...prev, ...urls]),
                                setIsUploadingSlips
                              );
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isUploadingSlips}
                            onClick={() => slipInputRef.current?.click()}
                            title="Click to upload or press Ctrl+V anywhere in this modal to paste transfer slip"
                            className="h-9 px-2.5 text-xs font-bold rounded-md shrink-0 cursor-pointer gap-1 border-dashed border-emerald-400 text-emerald-800 bg-emerald-50/40 hover:bg-emerald-100/60"
                          >
                            {isUploadingSlips ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Upload size={12} />
                            )}
                            Slip / Ctrl+V ({formSlipUrls.length})
                          </Button>
                        </div>
                      </div>

                      {formSlipUrls.length > 0 && (
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-4" />
                          <div className="col-span-8 flex flex-wrap gap-2">
                            {formSlipUrls.map((url, idx) => (
                              <div
                                key={idx}
                                className="relative group flex items-center gap-1.5 p-1 rounded-lg border border-emerald-200 bg-emerald-50/50 text-[10.5px]"
                              >
                                {isPdfOrDocUrl(url) ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 px-1.5 py-0.5 text-emerald-700 font-bold hover:underline"
                                  >
                                    <FileText size={12} />
                                    <span className="max-w-[110px] truncate">
                                      {getFileDisplayName(url, idx)}
                                    </span>
                                  </a>
                                ) : (
                                  <a href={url} target="_blank" rel="noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt={`Slip ${idx + 1}`}
                                      className="w-12 h-12 rounded object-cover border border-emerald-300"
                                    />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormSlipUrls((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center cursor-pointer"
                                  title="Remove slip"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <hr className="border-slate-200 my-1" />

                  <DialogFooter className="gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTxModalOpen(false)}
                      className="h-9 px-4 text-xs font-bold rounded-md cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={isSubmittingTx || isUploadingReceipts || isUploadingSlips}
                      onClick={handleSubmitTransaction}
                      className="h-9 px-5 text-xs font-bold rounded-md bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    >
                      {isSubmittingTx && <Loader2 size={13} className="animate-spin mr-1.5" />}
                      Save
                    </Button>
                  </DialogFooter>
                </>
              );
            })()
          ) : (
            <>
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2.5">
              {txMode === "TOPUP" ? (
                <>
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowDownLeft size={18} />
                  </div>
                  <span>{editingTx ? "Edit Company Top-up (แก้ไขรายการรับเงินบริษัท)" : "Company Top-up (รับเงินโอนจากบริษัท)"}</span>
                </>
              ) : txMode === "TRANSFER" ? (
                <>
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowLeftRight size={18} />
                  </div>
                  <span>{editingTx ? "Edit Transfer (แก้ไขรายการโอนวงเงินสดย่อย)" : "Transfer Petty Cash (โอนวงเงินสดย่อย)"}</span>
                </>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ArrowUpRight size={18} />
                  </div>
                  <span>
                    {editingTx
                      ? "Edit Expense (แก้ไขรายการเบิกจ่าย)"
                      : `Record Expense — ${EXPENSE_DOC_TYPE_CONFIG[expenseDocType].label}`}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pl-11.5">
              {txMode === "TOPUP"
                ? "Record petty cash received from the company into the selected custodian's wallet (บันทึกยอดโอนจากบริษัทเข้ากระเป๋าผู้ถือเงินสดย่อย)"
                : txMode === "TRANSFER"
                  ? "Deducts from your wallet and credits the recipient's wallet automatically (หักยอดจากกระเป๋าของคุณและเพิ่มเข้ากระเป๋าผู้รับโอนอัตโนมัติ)"
                  : EXPENSE_DOC_TYPE_CONFIG[expenseDocType].subtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Section 1: Holder, Branch & Payment Summary */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3.5">
              {/* Row 1: Holder / Recipient & Branch */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center justify-between gap-2">
                    <span className="truncate">
                      {txMode === "TRANSFER"
                        ? "From Holder (ผู้โอนต้นทาง)"
                        : txMode === "TOPUP"
                          ? "Recipient (ผู้รับเงินโอนจากบริษัท)"
                          : "Petty Cash Holder (ผู้ถือเงินสดย่อย)"}{" "}
                      <span className="text-rose-500">*</span>
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[10.5px] font-mono font-bold text-emerald-700 whitespace-nowrap shrink-0">
                      คงเหลือ: ฿{(
                        txMode === "TOPUP"
                          ? (holderSummaries.find((h) => h.holderId === formHolderId)?.currentBalance ?? 0)
                          : currentUserBalance
                      ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </Label>
                  {txMode === "TOPUP" && canApproveOrTopUp ? (
                    <select
                      value={formHolderId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setFormHolderId(id);
                        const found = holderOptions.find((h) => h.id === id);
                        if (found) {
                          setFormHolderName(found.name);
                          setFormBranchId(found.branchId || "HQ");
                        }
                      }}
                      className="h-10 w-full rounded-xl border border-emerald-300 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 shadow-2xs"
                    >
                      {holderOptions.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.roleLabel}) — {getBranchDisplayName(h.branchId)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-xs font-bold text-slate-700 flex items-center justify-between gap-2 select-none cursor-not-allowed">
                      <span className="truncate">
                        {formHolderName || currentUser?.name || currentUser?.email || "Current User"}
                        {currentUser?.role && (!editingTx || editingTx.holderId === currentUser?.id)
                          ? ` (${String(currentUser.role).toUpperCase()})`
                          : ""}
                      </span>
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-bold px-2 py-0.5 shrink-0">
                        Fixed User
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center h-[21px]">
                    {txMode === "TRANSFER" ? "Source Branch (สาขาต้นทาง)" : "Branch (สาขา)"}
                  </Label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
                  >
                    <option value="HQ">Head Quarter (สำนักงานใหญ่)</option>
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 1.5 (Only in TRANSFER mode): Target Store/Branch Recipient & Target Branch */}
              {txMode === "TRANSFER" && !editingTx && (
                <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200/90 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-indigo-950">
                      Transfer To (ผู้รับโอนปลายทาง) <span className="text-rose-500">*</span>
                    </Label>
                    <select
                      value={formTargetHolderId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setFormTargetHolderId(id);
                        const found = transferRecipientOptions.find((h) => h.id === id);
                        if (found) {
                          setFormTargetHolderName(found.name);
                          setFormTargetBranchId(found.branchId || "HQ");
                        }
                      }}
                      className="h-10 w-full rounded-xl border border-indigo-300 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    >
                      <option value="">-- Select Recipient (เลือกผู้รับโอน) --</option>
                      {transferRecipientOptions.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.isAccounting ? "💼 " : "🏪 "}
                          {h.name} ({h.roleLabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-indigo-950">Recipient Branch (สาขาผู้รับ)</Label>
                    <select
                      value={formTargetBranchId}
                      onChange={(e) => setFormTargetBranchId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-indigo-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-indigo-600"
                    >
                      <option value="HQ">Head Quarter (สำนักงานใหญ่)</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Row 2: Amount, Payment Method (1-click pills), Date */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                <div className="md:col-span-4 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700">
                    Amount (จำนวนเงิน) <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 pointer-events-none">
                      ฿
                    </span>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-10 pl-7 rounded-xl font-mono font-black text-base bg-white border-slate-300 focus:border-indigo-500 shadow-2xs"
                    />
                  </div>
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700">Payment Method (ช่องทางจ่าย)</Label>
                  <div className="h-10 grid grid-cols-3 gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
                    {[
                      { value: "Cash", label: "เงินสด" },
                      { value: "Transfer", label: "โอนเงิน" },
                      { value: "QR", label: "QR สแกน" },
                    ].map((pm) => (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => setFormPaymentMethod(pm.value)}
                        className={`rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                          formPaymentMethod === pm.value
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700">Date (วันที่)</Label>
                  <Input
                    type="date"
                    value={formDate ? formDate.slice(0, 10) : format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => { const d = e.target.value; const timePart = formDate && formDate.includes("T") ? formDate.slice(11, 16) : format(new Date(), "HH:mm"); setFormDate(d ? `${d}T${timePart}` : format(new Date(), "yyyy-MM-dd'T'HH:mm")); }}
                    className="h-10 rounded-xl text-xs font-mono bg-white border-slate-200 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Category (with quick add button) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold text-slate-700">
                  Category (หมวดหมู่รายการ) <span className="text-rose-500">*</span>
                </Label>
                {txMode === "EXPENSE" && canApproveOrTopUp && (
                  <button
                    type="button"
                    onClick={() => setShowQuickAddCategory(!showQuickAddCategory)}
                    className="text-[10.5px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {showQuickAddCategory ? "Close (ปิดช่องเพิ่มหมวดหมู่)" : "+ Add Category (พิมพ์เพิ่มหมวดหมู่ใหม่)"}
                  </button>
                )}
              </div>

              {txMode === "TOPUP" || txMode === "TRANSFER" ? (
                <Input
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="h-9 rounded-xl text-xs font-bold bg-slate-50"
                />
              ) : (
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  {formCategory && !categories.includes(formCategory) && (
                    <option value={formCategory}>{formCategory}</option>
                  )}
                </select>
              )}

              {showQuickAddCategory && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newQuickCategory}
                    onChange={(e) => setNewQuickCategory(e.target.value)}
                    placeholder="New category name... (เช่น Parking Fee (ค่าที่จอดรถ))"
                    className="h-8 text-xs rounded-lg"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleQuickAddCategory}
                    className="h-8 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shrink-0 cursor-pointer"
                  >
                    Save (บันทึก)
                  </Button>
                </div>
              )}
            </div>

            {/* Row 3.5: Vehicle License Plate (shown when Category is Transport/Fuel or Maintenance/Repair) */}
            {txMode === "EXPENSE" && isVehicleExpenseCategory(formCategory) && (
              <div className="space-y-1 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/90">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                    <span>🚗 Vehicle License Plate (เลขทะเบียนรถ)</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddPlate(!showQuickAddPlate)}
                    className="text-[10.5px] font-bold text-amber-700 hover:underline cursor-pointer"
                  >
                    {showQuickAddPlate ? "Close (ปิดช่องเพิ่มทะเบียน)" : "+ Add Plate (เพิ่มเลขทะเบียนรถใหม่)"}
                  </button>
                </div>

                <select
                  value={formVehiclePlate}
                  onChange={(e) => setFormVehiclePlate(e.target.value)}
                  className="h-9 w-full rounded-xl border border-amber-300 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-amber-600"
                >
                  <option value="">-- Select Vehicle License Plate (เลือกเลขทะเบียนรถ / ไม่ระบุ) --</option>
                  {availableVehiclePlateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {formVehiclePlate && !availableVehiclePlateOptions.some((o) => o.value === formVehiclePlate) && (
                    <option value={formVehiclePlate}>{formVehiclePlate}</option>
                  )}
                </select>

                {showQuickAddPlate && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      value={newQuickPlate}
                      onChange={(e) => setNewQuickPlate(e.target.value)}
                      placeholder="ระบุเลขทะเบียนรถใหม่... (เช่น 1กข 1234 กทม)"
                      className="h-8 text-xs rounded-lg bg-white border-amber-300"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleQuickAddPlate}
                      className="h-8 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shrink-0 cursor-pointer"
                    >
                      Save (บันทึก)
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Row 4 & 5: Description & Invoice No. side-by-side */}
            <div className={`grid grid-cols-1 ${txMode === "EXPENSE" ? "md:grid-cols-12" : ""} gap-3.5`}>
              <div className={`${txMode === "EXPENSE" ? "md:col-span-7" : ""} space-y-1.5`}>
                <Label className="text-[11px] font-bold text-slate-700">
                  Description (รายละเอียดรายการ) {txMode !== "TRANSFER" && <span className="text-rose-500">*</span>}
                </Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    txMode === "TOPUP"
                      ? "e.g. Weekly petty cash top-up from company (รับโอนวงเงินสดย่อยประจำสัปดาห์)..."
                      : txMode === "TRANSFER"
                        ? "e.g. Petty cash allocation to store (โอนวงเงินสดย่อยให้หน้าร้าน)..."
                        : EXPENSE_DOC_TYPE_CONFIG[expenseDocType].descriptionPlaceholder
                  }
                  className="h-10 rounded-xl text-xs"
                />
              </div>

              {txMode === "EXPENSE" && (
                <div className="md:col-span-5 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700 truncate block">
                    {EXPENSE_DOC_TYPE_CONFIG[expenseDocType].invoiceLabel}
                  </Label>
                  <Input
                    value={formInvoiceNo}
                    onChange={(e) => setFormInvoiceNo(e.target.value)}
                    placeholder={EXPENSE_DOC_TYPE_CONFIG[expenseDocType].invoicePlaceholder}
                    className="h-10 rounded-xl text-xs font-mono"
                  />
                </div>
              )}
            </div>

            {/* Row 6: Upload Documents / Receipts & Transfer Slips (Click or Hover box to target Ctrl+V) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Box 1: Receipt / Invoice Documents */}
              <div
                onClick={() => setPasteTarget("receipts")}
                onMouseEnter={() => setPasteTarget("receipts")}
                className={`p-3.5 rounded-2xl border transition-all space-y-2.5 cursor-pointer ${
                  pasteTarget === "receipts"
                    ? "bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/30"
                    : "bg-slate-50/80 border-slate-200/90 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[11.5px] font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    <Receipt size={14} className="text-amber-600 shrink-0" />
                    <span>Receipts / Docs</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono">
                      {formReceiptUrls.length}
                    </span>
                  </Label>
                  <input
                    ref={receiptInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      handleUploadFiles(
                        e.target.files,
                        "receipts",
                        (urls) => setFormReceiptUrls((prev) => [...prev, ...urls]),
                        setIsUploadingReceipts
                      );
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isUploadingReceipts}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPasteTarget("receipts");
                      receiptInputRef.current?.click();
                    }}
                    className="h-7 px-2.5 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1 shrink-0 whitespace-nowrap"
                  >
                    {isUploadingReceipts ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    Upload / Ctrl+V
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-slate-400 truncate">Images & Docs (.jpg, .png, .pdf, .xlsx)</span>
                  {pasteTarget === "receipts" ? (
                    <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap shrink-0">
                      Ctrl+V Active (พร้อมวางรูป)
                    </span>
                  ) : (
                    <span className="text-slate-400 whitespace-nowrap shrink-0">คลิกหรือชี้เพื่อวางรูป</span>
                  )}
                </div>

                {formReceiptUrls.length > 0 && (
                  <div className="space-y-1.5 pt-1 max-h-36 overflow-y-auto">
                    {formReceiptUrls.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-[10.5px]"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-indigo-600 hover:underline truncate"
                        >
                          {isPdfOrDocUrl(url) ? (
                            <FileText size={14} className="shrink-0" />
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={url}
                              alt={`Receipt ${idx + 1}`}
                              className="w-7 h-7 rounded object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <span className="truncate">{getFileDisplayName(url, idx)}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setFormReceiptUrls((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Box 2: Transfer Slips */}
              <div
                onClick={() => setPasteTarget("slips")}
                onMouseEnter={() => setPasteTarget("slips")}
                className={`p-3.5 rounded-2xl border transition-all space-y-2.5 cursor-pointer ${
                  pasteTarget === "slips"
                    ? "bg-emerald-50/50 border-emerald-400 ring-1 ring-emerald-400/30"
                    : "bg-slate-50/80 border-slate-200/90 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[11.5px] font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    <Banknote size={14} className="text-emerald-600 shrink-0" />
                    <span>Transfer Slips (สลิป)</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono">
                      {formSlipUrls.length}
                    </span>
                  </Label>
                  <input
                    ref={slipInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleUploadFiles(
                        e.target.files,
                        "slips",
                        (urls) => setFormSlipUrls((prev) => [...prev, ...urls]),
                        setIsUploadingSlips
                      );
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isUploadingSlips}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPasteTarget("slips");
                      slipInputRef.current?.click();
                    }}
                    className="h-7 px-2.5 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1 shrink-0 whitespace-nowrap"
                  >
                    {isUploadingSlips ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    Upload / Ctrl+V
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-slate-400 truncate">Bank transfer / PromptPay slip</span>
                  {pasteTarget === "slips" ? (
                    <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap shrink-0">
                      Ctrl+V Active (พร้อมวางสลิป)
                    </span>
                  ) : (
                    <span className="text-slate-400 whitespace-nowrap shrink-0">คลิกหรือชี้เพื่อวางสลิป</span>
                  )}
                </div>

                {formSlipUrls.length > 0 && (
                  <div className="space-y-1.5 pt-1 max-h-36 overflow-y-auto">
                    {formSlipUrls.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-[10.5px]"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-emerald-700 hover:underline truncate"
                        >
                          {isPdfOrDocUrl(url) ? (
                            <FileText size={14} className="shrink-0" />
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={url}
                              alt={`Slip ${idx + 1}`}
                              className="w-7 h-7 rounded object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <span className="truncate">{getFileDisplayName(url, idx)}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setFormSlipUrls((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTxModalOpen(false)}
              className="h-10 px-4 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              type="button"
              disabled={isSubmittingTx || isUploadingReceipts || isUploadingSlips}
              onClick={handleSubmitTransaction}
              className={`h-10 px-5 text-xs font-bold rounded-xl text-white cursor-pointer shadow-sm ${
                txMode === "TOPUP"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isSubmittingTx && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {editingTx
                ? "Save Changes (บันทึกการแก้ไข)"
                : txMode === "TOPUP"
                  ? "Confirm Top-up (ยืนยันรับเงินจากบริษัท)"
                  : txMode === "TRANSFER"
                    ? "Confirm Transfer (ยืนยันโอนเงินให้หน้าร้าน)"
                    : "Confirm Expense (ยืนยันเบิกจ่าย-ตัดยอดทันที)"}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MANAGE CATEGORIES MODAL ───────────────────────────────── */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Tag size={16} className="text-indigo-600" />
              Petty Cash Categories (จัดการหมวดหมู่เงินสดย่อย)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add new custom categories or remove unused ones (เพิ่มหรือลบหมวดหมู่ค่าใช้จ่ายได้ตามต้องการ)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
              <Input
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategoryInput.trim()) {
                    e.preventDefault();
                    setEditableCategories((prev) =>
                      Array.from(new Set([...prev, newCategoryInput.trim()]))
                    );
                    setNewCategoryInput("");
                  }
                }}
                placeholder="New category... (เช่น Parking Fee (ค่าที่จอดรถ))"
                className="h-8 text-xs rounded-xl"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!newCategoryInput.trim()) return;
                  setEditableCategories((prev) =>
                    Array.from(new Set([...prev, newCategoryInput.trim()]))
                  );
                  setNewCategoryInput("");
                }}
                className="h-8 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shrink-0 cursor-pointer"
              >
                <Plus size={13} className="mr-1" /> Add (เพิ่ม)
              </Button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {editableCategories.map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800"
                >
                  {editingCategoryIdx === idx ? (
                    <>
                      <Input
                        value={editingCategoryValue}
                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const trimmed = editingCategoryValue.trim();
                            if (trimmed) {
                              setEditableCategories((prev) =>
                                prev.map((c, i) => (i === idx ? trimmed : c))
                              );
                            }
                            setEditingCategoryIdx(null);
                            setEditingCategoryValue("");
                          } else if (e.key === "Escape") {
                            setEditingCategoryIdx(null);
                            setEditingCategoryValue("");
                          }
                        }}
                        autoFocus
                        className="h-7 text-xs rounded-lg bg-white flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = editingCategoryValue.trim();
                            if (trimmed) {
                              setEditableCategories((prev) =>
                                prev.map((c, i) => (i === idx ? trimmed : c))
                              );
                            }
                            setEditingCategoryIdx(null);
                            setEditingCategoryValue("");
                          }}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          title="Confirm edit (ยืนยันแก้ไข)"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryIdx(null);
                            setEditingCategoryValue("");
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="Cancel edit (ยกเลิก)"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="truncate flex-1">{cat}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryIdx(idx);
                            setEditingCategoryValue(cat);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                          title="Edit category (แก้ไขหมวดหมู่นี้)"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditableCategories((prev) => prev.filter((_, i) => i !== idx));
                            if (editingCategoryIdx === idx) {
                              setEditingCategoryIdx(null);
                              setEditingCategoryValue("");
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Delete category (ลบหมวดหมู่นี้)"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCatModalOpen(false)}
              className="h-8 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              type="button"
              disabled={isSavingCategories}
              onClick={handleSaveCategoriesModal}
              className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
            >
              {isSavingCategories && <Loader2 size={12} className="animate-spin mr-1.5" />}
              Save Categories (บันทึกหมวดหมู่)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REJECT / VOID CONFIRMATION MODAL ──────────────────────── */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-2xl overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm font-black text-rose-600 flex items-center gap-2">
              <AlertCircle size={16} />
              {rejectActionType === "REJECT"
                ? "Reject Expense & Refund Balance (ปฏิเสธรายการและคืนยอด)"
                : "Void Transaction (ยกเลิกรายการ)"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {rejectActionType === "REJECT"
                ? "The amount will be automatically refunded to the holder's balance and a follow-up Task will be opened (ระบบจะคืนยอดเงินกลับเข้าวงเงินของผู้ถืออัตโนมัติ และเปิด Task แจ้งเตือนทันที)"
                : "The amount will be automatically restored to the holder's balance (ระบบจะปรับคืนยอดเงินกลับเข้ากระเป๋าของผู้ถืออัตโนมัติ)"}
            </DialogDescription>
          </DialogHeader>

          {rejectTargetTx && (
            <div className="space-y-3 py-1 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Holder (ผู้ถือเงินสดย่อย):</span>
                  <span className="font-bold text-slate-900">{rejectTargetTx.holderName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Description (รายการ):</span>
                  <span className="font-bold text-slate-800">{rejectTargetTx.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount (จำนวนเงิน):</span>
                  <span className="font-mono font-black text-rose-600">
                    ฿{rejectTargetTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  Reason (ระบุเหตุผล) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Unclear receipt, wrong amount, duplicate entry (ระบุเหตุผล)..."
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              className="h-8 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              type="button"
              disabled={isReviewing || !rejectReason.trim()}
              onClick={handleConfirmRejectOrVoid}
              className="h-8 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
            >
              {isReviewing && <Loader2 size={12} className="animate-spin mr-1.5" />}
              Confirm (ยืนยันดำเนินการ)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ATTACHMENT PREVIEW MODAL (Receipts & Slips) ───────────── */}
      <Dialog open={!!previewTx} onOpenChange={(open) => !open && setPreviewTx(null)}>
        <DialogContent className="sm:max-w-2xl bg-white rounded-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" />
              Receipts & Transfer Slips (ใบเสร็จและสลิปโอนเงิน) — {previewTx?.txNumber || ""} ({previewTx?.holderName})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {previewTx?.category}: {previewTx?.description} (฿
              {previewTx?.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })})
            </DialogDescription>
          </DialogHeader>

          {previewTx && (
            <div className="space-y-4 py-2">
              {/* Receipts Section */}
              <div
                onClick={() => setPreviewPasteTarget("receipts")}
                onMouseEnter={() => setPreviewPasteTarget("receipts")}
                className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                  previewPasteTarget === "receipts"
                    ? "bg-amber-50/40 border-amber-300"
                    : "bg-slate-50/60 border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Receipt size={14} className="text-amber-600" />
                    <span>
                      Receipts / Documents (ใบเสร็จรับเงิน: {previewTx.receiptUrls?.length || 0})
                    </span>
                    {previewPasteTarget === "receipts" && (
                      <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        Ctrl+V Active
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={previewReceiptInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                      className="hidden"
                      onChange={(e) => {
                        handleUploadFiles(
                          e.target.files,
                          "receipts",
                          async (urls) => {
                            const next = [...(previewTx.receiptUrls || []), ...urls];
                            await handleUpdatePreviewTxAttachments("receipts", next);
                          },
                          setIsUploadingReceipts
                        );
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isUploadingReceipts}
                      onClick={() => {
                        setPreviewPasteTarget("receipts");
                        previewReceiptInputRef.current?.click();
                      }}
                      className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-white border-dashed border-amber-400 text-amber-800 hover:bg-amber-50 cursor-pointer gap-1"
                    >
                      {isUploadingReceipts ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Upload size={11} />
                      )}
                      + Attach Receipt / Ctrl+V
                    </Button>
                  </div>
                </div>

                {!previewTx.receiptUrls || previewTx.receiptUrls.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No receipt files attached — click &quot;+ Attach Receipt&quot; or press{" "}
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-bold not-italic">
                      Ctrl+V
                    </kbd>{" "}
                    to paste a photo (กด Ctrl+V เพื่อวางรูปใบเสร็จได้ทันที)
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewTx.receiptUrls.map((url, idx) => (
                      <div key={idx} className="relative group">
                        {isPdfOrDocUrl(url) ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-3 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-xs font-bold text-indigo-700"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <FileText size={16} />
                              <span className="truncate">{getFileDisplayName(url, idx)}</span>
                            </span>
                            <ExternalLink size={14} className="shrink-0" />
                          </a>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl overflow-hidden border border-slate-200 bg-white"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Receipt ${idx + 1}`}
                              className="w-full h-56 object-contain bg-white"
                            />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const next = (previewTx.receiptUrls || []).filter((_, i) => i !== idx);
                            await handleUpdatePreviewTxAttachments("receipts", next);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-600/90 hover:bg-rose-700 text-white flex items-center justify-center shadow cursor-pointer"
                          title="Remove attachment"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transfer Slips Section */}
              <div
                onClick={() => setPreviewPasteTarget("slips")}
                onMouseEnter={() => setPreviewPasteTarget("slips")}
                className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                  previewPasteTarget === "slips"
                    ? "bg-emerald-50/40 border-emerald-300"
                    : "bg-slate-50/60 border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Banknote size={14} className="text-emerald-600" />
                    <span>
                      Transfer Slips (รูปสลิปโอนเงิน: {previewTx.slipUrls?.length || 0})
                    </span>
                    {previewPasteTarget === "slips" && (
                      <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Ctrl+V Active
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={previewSlipInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleUploadFiles(
                          e.target.files,
                          "slips",
                          async (urls) => {
                            const next = [...(previewTx.slipUrls || []), ...urls];
                            await handleUpdatePreviewTxAttachments("slips", next);
                          },
                          setIsUploadingSlips
                        );
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isUploadingSlips}
                      onClick={() => {
                        setPreviewPasteTarget("slips");
                        previewSlipInputRef.current?.click();
                      }}
                      className="h-7 px-2.5 text-[11px] font-bold rounded-lg bg-white border-dashed border-emerald-400 text-emerald-800 hover:bg-emerald-50 cursor-pointer gap-1"
                    >
                      {isUploadingSlips ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Upload size={11} />
                      )}
                      + Attach Slip / Ctrl+V
                    </Button>
                  </div>
                </div>

                {!previewTx.slipUrls || previewTx.slipUrls.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No transfer slips attached — click &quot;+ Attach Slip&quot; or hover here and press{" "}
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-bold not-italic">
                      Ctrl+V
                    </kbd>{" "}
                    to paste a slip (ชี้ที่กล่องนี้แล้วกด Ctrl+V เพื่อวางสลิปโอนเงิน)
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewTx.slipUrls.map((url, idx) => (
                      <div key={idx} className="relative group">
                        {isPdfOrDocUrl(url) ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-3 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 text-xs font-bold text-emerald-700"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <FileText size={16} />
                              <span className="truncate">{getFileDisplayName(url, idx)}</span>
                            </span>
                            <ExternalLink size={14} className="shrink-0" />
                          </a>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl overflow-hidden border border-slate-200 bg-white"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Slip ${idx + 1}`}
                              className="w-full h-56 object-contain bg-white"
                            />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const next = (previewTx.slipUrls || []).filter((_, i) => i !== idx);
                            await handleUpdatePreviewTxAttachments("slips", next);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-600/90 hover:bg-rose-700 text-white flex items-center justify-center shadow cursor-pointer"
                          title="Remove slip"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── REPLENISHMENT REPORT SUBMISSION MODAL (สรุป Report การใช้จ่ายของรอบเพื่อขอเบิกเงินสดย่อย) ── */}
      <Dialog open={submitReportModalOpen} onOpenChange={setSubmitReportModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
          {(() => {
            const unclaimedTxs = getUnclaimedExpenseTxsForHolder(reportHolderId);
            const selectedTxs = unclaimedTxs.filter((t) => reportSelectedTxIds.includes(t.id));
            const totalSelectedSpent =
              Math.round(selectedTxs.reduce((s, t) => s + getNetClaimDelta(t), 0) * 100) / 100;
            const hSum = holderSummaries.find((h) => h.holderId === reportHolderId);
            const limit = getHolderLimit(reportHolderId, hSum?.isAccounting);
            const currentBal = hSum?.currentBalance ?? 0;
            const shortfall = Math.max(0, Math.round((limit - currentBal) * 100) / 100);

            const catPreviewMap = new Map<string, { category: string; amount: number; count: number }>();
            selectedTxs.forEach((t) => {
              const cat = t.category || "Uncategorized";
              const cur = catPreviewMap.get(cat) || { category: cat, amount: 0, count: 0 };
              cur.amount = Math.round((cur.amount + getNetClaimDelta(t)) * 100) / 100;
              cur.count += 1;
              catPreviewMap.set(cat, cur);
            });
            const catPreviewList = Array.from(catPreviewMap.values()).sort((a, b) => b.amount - a.amount);

            return (
              <div className="min-w-0 space-y-4">
                <DialogHeader className="pr-8">
                  <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Files size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate">Submit Petty Cash Replenishment Report</div>
                      <div className="text-xs font-medium text-slate-500">
                        สรุปรายงานการใช้จ่ายเงินสดย่อยประจำรอบ เพื่อส่งให้แผนกบัญชีตรวจสอบและอนุมัติเบิกชดเชย
                      </div>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1 text-xs min-w-0">
                  {/* Custodian Selector & Wallet Snapshot */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <Label className="text-xs font-bold text-slate-700">
                        Custodian Wallet (กระเป๋าผู้ขอเบิกชดเชย):
                      </Label>
                      {canApproveOrTopUp ? (
                        <select
                          value={reportHolderId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setReportHolderId(nextId);
                            const nextUnclaimed = getUnclaimedExpenseTxsForHolder(nextId);
                            setReportSelectedTxIds(nextUnclaimed.map((t) => t.id));
                            const nextExp =
                              Math.round(
                                nextUnclaimed.reduce((s, t) => s + getNetClaimDelta(t), 0) * 100
                              ) / 100;
                            const nextSum = holderSummaries.find((h) => h.holderId === nextId);
                            const nextLim = getHolderLimit(nextId, nextSum?.isAccounting);
                            const nextShort = Math.max(
                              0,
                              Math.round((nextLim - (nextSum?.currentBalance ?? 0)) * 100) / 100
                            );
                            const defAmt = nextExp > 0 ? nextExp : nextShort;
                            setReportRequestedAmount(defAmt > 0 ? defAmt.toFixed(2) : "");
                          }}
                          className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                        >
                          {holderOptions.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} ({getBranchDisplayName(h.branchId)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold text-slate-900 text-sm">
                          {hSum?.holderName || currentUser?.name || "You"} (
                          {getBranchDisplayName(hSum?.branchId || currentUser?.branchId)})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10.5px] text-slate-400 block">Quota Limit (วงเงินตั้งต้น)</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          ฿{limit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10.5px] text-slate-400 block">Current Balance (คงเหลือ)</span>
                        <span className="font-mono font-bold text-emerald-600 text-sm">
                          ฿{currentBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10.5px] text-slate-400 block">Shortfall (ขาดอีกเต็มวงเงิน)</span>
                        <span className="font-mono font-bold text-amber-600 text-sm">
                          ฿{shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expense Bills Selection Table */}
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-bold text-slate-800">
                        1. Select Expense Bills in this Cycle (เลือกรายการใช้จ่ายในรอบนี้:{" "}
                        <span className="text-indigo-600">{selectedTxs.length}</span> / {unclaimedTxs.length} บิล)
                      </Label>
                      {unclaimedTxs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (reportSelectedTxIds.length === unclaimedTxs.length) {
                              setReportSelectedTxIds([]);
                              setReportRequestedAmount("0.00");
                            } else {
                              const allIds = unclaimedTxs.map((t) => t.id);
                              setReportSelectedTxIds(allIds);
                              const sumAll =
                                Math.round(
                                  unclaimedTxs.reduce((s, t) => s + getNetClaimDelta(t), 0) * 100
                                ) / 100;
                              setReportRequestedAmount(sumAll.toFixed(2));
                            }
                          }}
                          className="text-[11px] font-bold text-indigo-600 hover:underline shrink-0 cursor-pointer"
                        >
                          {reportSelectedTxIds.length === unclaimedTxs.length ? "Deselect All" : "Select All"}
                        </button>
                      )}
                    </div>

                    {unclaimedTxs.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
                        ไม่มีบิลค่าใช้จ่ายที่อนุมัติแล้ว (Approved) และค้างสรุปเบิกสำหรับกระเป๋านี้ (รายการ PENDING / REJECTED จะไม่ถูกดึงเข้า Report)
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {unclaimedTxs.map((tx) => {
                          const checked = reportSelectedTxIds.includes(tx.id);
                          const filesCount = (tx.receiptUrls?.length || 0) + (tx.slipUrls?.length || 0);
                          return (
                            <label
                              key={tx.id}
                              className={`flex items-center justify-between gap-3 p-2.5 cursor-pointer transition-colors ${
                                checked ? "bg-indigo-50/40" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const nextIds = checked
                                      ? reportSelectedTxIds.filter((id) => id !== tx.id)
                                      : [...reportSelectedTxIds, tx.id];
                                    setReportSelectedTxIds(nextIds);
                                    const nextSum =
                                      Math.round(
                                        unclaimedTxs
                                          .filter((item) => nextIds.includes(item.id))
                                          .reduce((s, item) => s + getNetClaimDelta(item), 0) * 100
                                      ) / 100;
                                    setReportRequestedAmount(nextSum.toFixed(2));
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                                    {tx.status === "PENDING" && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9.5px] font-extrabold shrink-0">
                                        PENDING • Auto-Approve
                                      </span>
                                    )}
                                    {tx.type === "TRANSFER_OUT" && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9.5px] font-extrabold shrink-0">
                                        Transfer → {tx.counterpartyName || "Staff"}
                                      </span>
                                    )}
                                    {tx.direction === "CREDIT" && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9.5px] font-extrabold shrink-0">
                                        Return ← {tx.counterpartyName || "Store"}
                                      </span>
                                    )}
                                    <span className="truncate">{tx.description}</span>
                                  </div>
                                  <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono">
                                      {format(new Date(tx.transactionDate), "dd/MM/yyyy")}
                                    </span>
                                    <span>•</span>
                                    <span className="truncate">{tx.category}</span>
                                    {filesCount > 0 ? (
                                      <span className="text-emerald-600 font-semibold">
                                        • 📎 {filesCount} file(s)
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 font-semibold">
                                        • ⚠️ No receipt
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className={`font-mono font-bold shrink-0 ${tx.direction === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                                {tx.direction === "CREDIT" ? "+" : "-"}฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Direct Expenses vs Staff Transfers Out vs Returned In Breakdown */}
                  {(() => {
                    const directTxs = selectedTxs.filter((t) => t.direction === "DEBIT" && t.type !== "TRANSFER_OUT");
                    const transferOutTxs = selectedTxs.filter((t) => t.type === "TRANSFER_OUT");
                    const returnInTxs = selectedTxs.filter((t) => t.direction === "CREDIT");
                    if (transferOutTxs.length === 0 && returnInTxs.length === 0) return null;
                    const directSum = directTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const transferOutSum = transferOutTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const returnInSum = returnInTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const netClaim = Math.round((directSum + transferOutSum - returnInSum) * 100) / 100;
                    return (
                      <div className={`p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 grid grid-cols-1 ${returnInTxs.length > 0 && transferOutTxs.length > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-2 text-[11px]`}>
                        <div className="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
                          <span className="text-[10px] text-slate-500 block">Direct Expenses ({directTxs.length})</span>
                          <span className="font-mono font-bold text-rose-600">
                            -฿{directSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {transferOutTxs.length > 0 && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
                            <span className="text-[10px] text-indigo-600 font-semibold block">
                              Transfers Out ({transferOutTxs.length})
                            </span>
                            <span className="font-mono font-bold text-indigo-700">
                              -฿{transferOutSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {returnInTxs.length > 0 && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-emerald-100">
                            <span className="text-[10px] text-emerald-700 font-semibold block">
                              Returned In ({returnInTxs.length})
                            </span>
                            <span className="font-mono font-bold text-emerald-600">
                              +฿{returnInSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div className="bg-white rounded-lg px-2.5 py-1.5 border border-emerald-200">
                          <span className="text-[10px] text-emerald-700 font-semibold block">Net Replenishment</span>
                          <span className="font-mono font-extrabold text-emerald-700">
                            ฿{netClaim.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Category Summary Preview */}
                  {catPreviewList.length > 0 && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                      <div className="font-bold text-slate-700 text-[11px]">
                        2. Expense Summary by Category (สรุปยอดใช้จ่ายแยกตามหมวดหมู่):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {catPreviewList.map((c) => (
                          <div
                            key={c.category}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/70 text-[11px]"
                          >
                            <span className="truncate font-medium text-slate-700">
                              {c.category} ({c.count})
                            </span>
                            <span className={`font-mono font-bold shrink-0 ${Number(c.amount) < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              ฿{Math.abs(Number(c.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Requested Amount & Note */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-bold text-slate-800">
                          Requested Replenishment ฿ <span className="text-rose-500">*</span>
                        </Label>
                        <button
                          type="button"
                          onClick={() => setReportRequestedAmount(totalSelectedSpent.toFixed(2))}
                          className="text-[10.5px] font-semibold text-indigo-600 hover:underline shrink-0 cursor-pointer"
                        >
                          Use Spent (฿{totalSelectedSpent.toLocaleString()})
                        </button>
                      </div>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={reportRequestedAmount}
                        onChange={(e) => setReportRequestedAmount(e.target.value)}
                        className="h-9 rounded-xl font-mono font-extrabold text-sm border-slate-300"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-800">
                        Note / Remark to Accounting (หมายเหตุถึงฝ่ายบัญชี)
                      </Label>
                      <Input
                        value={reportNote}
                        onChange={(e) => setReportNote(e.target.value)}
                        placeholder="e.g. สรุปเบิกเงินสดย่อยประจำสัปดาห์ พร้อมแนบใบเสร็จครบ..."
                        className="h-9 rounded-xl text-xs border-slate-300"
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSubmitReportModalOpen(false)}
                    className="h-9 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmittingReport || selectedTxs.length === 0}
                    onClick={handleConfirmSubmitReport}
                    className="h-9 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
                  >
                    {isSubmittingReport && <Loader2 size={13} className="animate-spin mr-1.5" />}
                    Submit Report for Approval (ส่งสรุปเบิกให้บัญชีอนุมัติ)
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── ACCOUNTING REVIEW & APPROVE REPLENISHMENT REPORT MODAL ── */}
      <Dialog
        open={!!reviewReportTarget}
        onOpenChange={(open) => !open && setReviewReportTarget(null)}
      >
        <DialogContent className="sm:max-w-2xl bg-white rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
          {reviewReportTarget && (() => {
            const includedTxs = transactions.filter((t) =>
              (reviewReportTarget.expenseTxIds || []).includes(t.id)
            );
            const isPendingApproval = reviewReportTarget.status === "PENDING_APPROVAL";

            return (
              <div className="min-w-0 space-y-4">
                <DialogHeader className="pr-8">
                  <DialogTitle className="text-base font-extrabold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Files size={17} className="text-indigo-600 shrink-0" />
                      <span className="truncate">
                        Replenishment Report #{reviewReportTarget.reportNumber}
                      </span>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                        reviewReportTarget.status === "PENDING_APPROVAL"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : reviewReportTarget.status === "DISBURSED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : reviewReportTarget.status === "APPROVED"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {reviewReportTarget.status === "PENDING_APPROVAL"
                        ? "PENDING APPROVAL"
                        : reviewReportTarget.status}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Custodian: <strong className="text-slate-800">{reviewReportTarget.holderName}</strong> (
                    {getBranchDisplayName(reviewReportTarget.branchId)}) • Submitted{" "}
                    {format(new Date(reviewReportTarget.submittedAt), "dd MMM yyyy, HH:mm")}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1 text-xs min-w-0">
                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                      <span className="text-[10px] text-slate-400 block truncate">Quota Limit</span>
                      <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm block truncate">
                        ฿{reviewReportTarget.quotaLimit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                      <span className="text-[10px] text-slate-400 block truncate">Balance at Submit</span>
                      <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm block truncate">
                        ฿{reviewReportTarget.currentBalanceAtSubmit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/70 min-w-0">
                      <span className="text-[10px] text-rose-600 block truncate">
                        Total Expenses ({includedTxs.length} bills)
                      </span>
                      <span className="font-mono font-extrabold text-rose-600 text-xs sm:text-sm block truncate">
                        -฿{reviewReportTarget.totalExpenseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 min-w-0">
                      <span className="text-[10px] text-emerald-700 block truncate">Requested Top-up</span>
                      <span className="font-mono font-extrabold text-emerald-700 text-xs sm:text-sm block truncate">
                        +฿{reviewReportTarget.requestedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Direct Expenses vs Staff Transfers Out vs Returned In Breakdown */}
                  {(() => {
                    const directTxs = includedTxs.filter((t) => t.direction === "DEBIT" && t.type !== "TRANSFER_OUT");
                    const transferOutTxs = includedTxs.filter((t) => t.type === "TRANSFER_OUT");
                    const returnInTxs = includedTxs.filter((t) => t.direction === "CREDIT");
                    if (transferOutTxs.length === 0 && returnInTxs.length === 0) return null;
                    const directSum = directTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const transferOutSum = transferOutTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const returnInSum = returnInTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const netClaim = Math.round((directSum + transferOutSum - returnInSum) * 100) / 100;
                    return (
                      <div className={`p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 grid grid-cols-1 ${returnInTxs.length > 0 && transferOutTxs.length > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-2 text-[11px] min-w-0`}>
                        <div className="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100 min-w-0">
                          <span className="text-[10px] text-slate-500 block truncate">Direct Expenses ({directTxs.length})</span>
                          <span className="font-mono font-bold text-rose-600">
                            -฿{directSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {transferOutTxs.length > 0 && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100 min-w-0">
                            <span className="text-[10px] text-indigo-600 font-semibold block truncate">
                              Transfers Out ({transferOutTxs.length})
                            </span>
                            <span className="font-mono font-bold text-indigo-700">
                              -฿{transferOutSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {returnInTxs.length > 0 && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-emerald-100 min-w-0">
                            <span className="text-[10px] text-emerald-700 font-semibold block truncate">
                              Returned In ({returnInTxs.length})
                            </span>
                            <span className="font-mono font-bold text-emerald-600">
                              +฿{returnInSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div className="bg-white rounded-lg px-2.5 py-1.5 border border-emerald-200 min-w-0">
                          <span className="text-[10px] text-emerald-700 font-semibold block truncate">Net Replenishment</span>
                          <span className="font-mono font-extrabold text-emerald-700">
                            ฿{netClaim.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Category Breakdown */}
                  {(reviewReportTarget.categorySummary || []).length > 0 && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 min-w-0">
                      <div className="font-bold text-slate-700 text-[11px]">
                        Category Breakdown (สรุปตามหมวดหมู่ค่าใช้จ่าย):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {reviewReportTarget.categorySummary.map((c, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/70 min-w-0"
                          >
                            <span className="text-slate-700 font-medium truncate">
                              {c.category} ({c.count} บิล)
                            </span>
                            <span className={`font-mono font-bold shrink-0 ${Number(c.amount) < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              ฿{Math.abs(Number(c.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Included Expense Bills List (Accounting can click to inspect receipts) */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="font-bold text-slate-800">
                      Included Expense Bills & Receipts (รายการบิลในรอบเบิกนี้ — คลิกเพื่อดูรูปใบเสร็จ):
                    </div>
                    <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {includedTxs.map((tx) => {
                        const allFiles = [...(tx.receiptUrls || []), ...(tx.slipUrls || [])];
                        return (
                          <div
                            key={tx.id}
                            className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 min-w-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                                {tx.type === "TRANSFER_OUT" && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9.5px] font-extrabold shrink-0">
                                    Transfer → {tx.counterpartyName || "Staff"}
                                  </span>
                                )}
                                {tx.direction === "CREDIT" && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9.5px] font-extrabold shrink-0">
                                    Return ← {tx.counterpartyName || "Store"}
                                  </span>
                                )}
                                <span className="truncate">{tx.description}</span>
                              </div>
                              <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono">
                                  {tx.txNumber || tx.id.slice(0, 8)} •{" "}
                                  {format(new Date(tx.transactionDate), "dd/MM/yyyy HH:mm")}
                                </span>
                                <span>• {tx.category}</span>
                                {tx.vendorName && <span>• {tx.vendorName}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewTx(tx)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[10.5px] font-semibold cursor-pointer"
                              >
                                📎 {allFiles.length} file(s)
                              </button>
                              <span className={`font-mono font-bold whitespace-nowrap ${tx.direction === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                                {tx.direction === "CREDIT" ? "+" : "-"}฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accounting Approval & Disbursement Controls */}
                  {canApproveOrTopUp && (isPendingApproval || reviewReportTarget.status === "APPROVED") && (
                    <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-3 min-w-0">
                      <div className="font-bold text-indigo-950 text-xs">
                        Accounting Verification & Replenishment (ส่วนสำหรับฝ่ายบัญชีตรวจสอบและอนุมัติจ่ายชดเชย)
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-[11px] font-bold text-slate-700">
                            Approved Amount ฿ (ยอดอนุมัติเติมเงิน)
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={reviewApprovedAmount}
                            onChange={(e) => setReviewApprovedAmount(e.target.value)}
                            className="h-9 rounded-xl bg-white font-mono font-bold text-sm"
                          />
                        </div>

                        <div className="space-y-1 min-w-0">
                          <Label className="text-[11px] font-bold text-slate-700">
                            Source Channel (ช่องทางโอนเติมเงินชดเชย)
                          </Label>
                          <select
                            value={reviewTopupChannel}
                            onChange={(e) => setReviewTopupChannel(e.target.value)}
                            className="h-9 w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                          >
                            <option value="Bank Account">Bank Account (บัญชีธนาคารบริษัท)</option>
                            <option value="Cash">Cash (เงินสด)</option>
                            <option value="Petty Cash Wallet">Petty Cash Wallet (โอนจากกระเป๋าฝ่ายบัญชี)</option>
                          </select>
                        </div>
                      </div>

                      {reviewTopupChannel === "Petty Cash Wallet" && (
                        <div className="space-y-1 min-w-0">
                          <Label className="text-[11px] font-bold text-indigo-950">
                            Deduct From Accounting Wallet (ตัดยอดจากกระเป๋าต้นทาง):
                          </Label>
                          <select
                            value={reviewSourceHolderId}
                            onChange={(e) => setReviewSourceHolderId(e.target.value)}
                            className="h-9 w-full rounded-xl border border-indigo-300 bg-white px-2.5 text-xs font-bold text-slate-800"
                          >
                            <option value="">-- Select Source Wallet --</option>
                            {holderOptions
                              .filter((h) => h.id !== reviewReportTarget.holderId)
                              .map((h) => {
                                const bal =
                                  holderSummaries.find((s) => s.holderId === h.id)?.currentBalance ?? 0;
                                return (
                                  <option key={h.id} value={h.id}>
                                    {h.name} (Bal: ฿{bal.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      )}

                      {/* Attach Transfer Slip (supports Ctrl+V) */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-600">
                          Transfer Slip (แนบสลิปโอนเงิน หรือกด <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-bold">Ctrl+V</kbd> เพื่อวางรูป):
                        </span>
                        <div className="shrink-0">
                          <input
                            ref={reviewSlipInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              handleUploadFiles(
                                e.target.files,
                                "slips",
                                (urls) => setReviewSlipUrls((prev) => [...prev, ...urls]),
                                setIsUploadingSlips
                              );
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isUploadingSlips}
                            onClick={() => reviewSlipInputRef.current?.click()}
                            className="h-8 px-2.5 text-xs font-bold rounded-lg bg-white border-dashed border-emerald-400 text-emerald-800 cursor-pointer gap-1"
                          >
                            {isUploadingSlips ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            + Slip / Ctrl+V ({reviewSlipUrls.length})
                          </Button>
                        </div>
                      </div>

                      {reviewSlipUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {reviewSlipUrls.map((url, idx) => (
                            <div key={idx} className="relative flex items-center gap-1 p-1 bg-white rounded-lg border border-emerald-200">
                              <a href={url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Slip" className="w-12 h-12 object-cover rounded" />
                              </a>
                              <button
                                type="button"
                                onClick={() => setReviewSlipUrls((prev) => prev.filter((_, i) => i !== idx))}
                                className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {isPendingApproval && (
                        <div className="space-y-1 pt-2 border-t border-indigo-200/60">
                          <Label className="text-[11px] font-semibold text-rose-700">
                            Reject Reason (ระบุเฉพาะกรณีไม่อนุมัติ / ตีกลับให้แก้ไข):
                          </Label>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <Input
                              value={reviewRejectReason}
                              onChange={(e) => setReviewRejectReason(e.target.value)}
                              placeholder="ระบุเหตุผลที่ตีกลับใบสรุปนี้..."
                              className="h-8 rounded-lg bg-white text-xs border-rose-200 flex-1 min-w-0"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isReviewingReport}
                              onClick={() => handleConfirmReviewReport("REJECT")}
                              className="h-8 px-3 text-xs font-bold border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
                            >
                              Reject Report
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReviewReportTarget(null)}
                    className="h-9 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Close
                  </Button>
                  {canApproveOrTopUp && isPendingApproval && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isReviewingReport}
                      onClick={() => handleConfirmReviewReport("APPROVE")}
                      className="h-9 px-3 text-xs font-bold border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-xl cursor-pointer"
                    >
                      Approve Report Only (อนุมัติใบสรุปไว้ก่อน)
                    </Button>
                  )}
                  {canApproveOrTopUp && (isPendingApproval || reviewReportTarget.status === "APPROVED") && (
                    <Button
                      type="button"
                      disabled={isReviewingReport}
                      onClick={() => handleConfirmReviewReport("APPROVE_AND_DISBURSE")}
                      className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer"
                    >
                      {isReviewingReport && <Loader2 size={13} className="animate-spin mr-1.5" />}
                      Approve & Top-up Now (อนุมัติและเติมเงินทันที)
                    </Button>
                  )}
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
