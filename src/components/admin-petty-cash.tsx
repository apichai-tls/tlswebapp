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
  const [activeViewTab, setActiveViewTab] = useState<"ledger" | "claims" | "wallets" | "report">("ledger");
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
    if (role === "admin" || role === "superadmin" || role === "accounting") return true;
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
        if (t.type !== "TRANSFER_OUT") {
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

  // Unclaimed (not yet attached to a replenishment report) expense transactions for a holder
  const getUnclaimedExpenseTxsForHolder = useCallback(
    (targetHolderId: string): PettyCashTx[] => {
      if (!targetHolderId) return [];
      return transactions.filter(
        (t) =>
          t.holderId === targetHolderId &&
          t.direction === "DEBIT" &&
          t.type !== "TRANSFER_OUT" &&
          t.status !== "REJECTED" &&
          t.status !== "VOID" &&
          !t.replenishmentReportId
      );
    },
    [transactions]
  );

  // Open Submit Replenishment Report Modal
  const handleOpenSubmitReportModal = (presetHolderId?: string) => {
    const targetId = presetHolderId || (holderFilter !== "ALL" ? holderFilter : currentUser?.id || holderSummaries[0]?.holderId || "");
    setReportHolderId(targetId);
    const unclaimed = getUnclaimedExpenseTxsForHolder(targetId);
    const ids = unclaimed.map((t) => t.id);
    setReportSelectedTxIds(ids);
    const totalExp = Math.round(unclaimed.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
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

    const totalExp = Math.round(selectedTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
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
      cur.amount = Math.round((cur.amount + (Number(t.amount) || 0)) * 100) / 100;
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

    filteredTransactions.forEach((t) => {
      if (t.status === "REJECTED" || t.status === "VOID") return;
      const amt = Number(t.amount) || 0;
      const hasFiles = (t.receiptUrls?.length || 0) + (t.slipUrls?.length || 0) > 0;
      if (hasFiles) txWithAttachments += 1;

      if (t.type === "TOPUP") {
        topupTxCount += 1;
      } else if (t.type === "TRANSFER_IN" || t.type === "TRANSFER_OUT") {
        transferTxCount += 1;
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

  // Export CSV (Full Executive Summary + Custodian Summary + Category Summary + Transaction Ledger)
  const handleExportCsv = () => {
    if (filteredTransactions.length === 0 && dashboardDetails.visibleHolderSummaries.length === 0) {
      toast.error("ไม่มีรายการสำหรับ Export");
      return;
    }

    const summaryRows: any[][] = [
      ["รายงานสรุปเงินสดย่อย (PETTY CASH REPLENISHMENT & USAGE REPORT)"],
      ["ช่วงเวลาที่เลือก (Period)", periodLabel],
      ["วันที่ส่งออก (Exported At)", format(new Date(), "dd/MM/yyyy HH:mm")],
      ["ผู้ส่งออก (Exported By)", currentUser?.name || currentUser?.email || "-"],
      [],
      ["1. สรุปภาพรวมการเติมเงินและเบิกจ่าย (EXECUTIVE SUMMARY)"],
      ["หัวข้อ (Metric)", "จำนวนเงิน (THB)", "หมายเหตุ (Details)"],
      ["วงเงินรวมทั้งหมด (Total Quota Limit)", dashboardDetails.totalLimitAll.toFixed(2), `${holderSummaries.length} กระเป๋า`],
      ["ยอดคงเหลือรวมปัจจุบัน (Current Total Balance)", dashboardDetails.totalWalletBalanceAll.toFixed(2), `ฝ่ายบัญชี ฿${kpiStats.accountingPoolBalance.toFixed(2)} | หน้าร้าน ฿${kpiStats.storePoolBalance.toFixed(2)}`],
      ["ยอดเติมเงินเข้าจากบริษัทในงวด (+Company Top-up)", kpiStats.companyTopupTotal.toFixed(2), `${dashboardDetails.topupTxCount} รายการ`],
      ["ยอดโอนเติมให้หน้าร้านในงวด (Transferred to Stores)", kpiStats.transferredToStoreTotal.toFixed(2), `${dashboardDetails.transferTxCount} รายการ`],
      ["ยอดใช้จ่ายจริงรวมในงวด (-Total Real Expenses)", (-kpiStats.realExpenseTotal).toFixed(2), `${dashboardDetails.expenseTxCount} รายการ (อนุมัติแล้ว ฿${dashboardDetails.approvedExpenseTotal.toFixed(2)})`],
      ["ยอดต้องเบิกชดเชยคืนเข้าวงเงิน (Replenishment Needed)", dashboardDetails.totalShortfallAll.toFixed(2), `รอตรวจบิล ${kpiStats.pendingCount} รายการ (฿${kpiStats.pendingAmount.toFixed(2)})`],
      [],
      ["2. ตารางสรุปแยกตามผู้ถือเงินสดย่อย (CUSTODIAN WALLET SUMMARY)"],
      [
        "ผู้ถือเงินสดย่อย (Custodian)",
        "แผนก (Department)",
        "สาขา (Branch)",
        "วงเงินตั้งต้น (Quota Limit)",
        "ยอดยกมาต้นงวด (Opening Balance)",
        "เติมจากบริษัท (+Company Top-up)",
        "รับโอนจากบัญชี (+Transfer In)",
        "รวมรับเข้าในงวด (+Total Received)",
        "โอนให้สาขา (-Transfer Out)",
        "ใช้จ่ายจริงในงวด (-Real Expenses)",
        "คงเหลือปัจจุบัน (Current Balance)",
        "ต้องเติมเพิ่มให้เต็มวงเงิน (Shortfall / To Replenish)",
        "บิลรอตรวจ (Pending Bills)",
      ],
      ...dashboardDetails.visibleHolderSummaries.map((h) => {
        const limit = getHolderLimit(h.holderId, h.isAccounting);
        const shortfall = Math.max(0, Math.round((limit - h.currentBalance) * 100) / 100);
        return [
          h.holderName,
          h.department || h.roleLabel,
          getBranchDisplayName(h.branchId),
          limit.toFixed(2),
          h.openingBalance.toFixed(2),
          h.companyTopup.toFixed(2),
          h.transferIn.toFixed(2),
          h.totalTopup.toFixed(2),
          (-h.transferOut).toFixed(2),
          (-h.totalExpense).toFixed(2),
          h.currentBalance.toFixed(2),
          shortfall.toFixed(2),
          h.pendingCount,
        ];
      }),
      [],
      ["3. สรุปค่าใช้จ่ายแยกตามหมวดหมู่ (EXPENSE BREAKDOWN BY CATEGORY)"],
      ["หมวดหมู่ (Category)", "จำนวนรายการ (Count)", "ยอดใช้จ่าย (THB)", "สัดส่วน (%)"],
      ...dashboardDetails.categoryBreakdown.map((c) => {
        const pct = kpiStats.realExpenseTotal > 0 ? ((c.amount / kpiStats.realExpenseTotal) * 100).toFixed(1) : "0.0";
        return [c.category, c.count, c.amount.toFixed(2), `${pct}%`];
      }),
      [],
      ["4. รายการเดินบัญชีละเอียด (DETAILED TRANSACTION LEDGER)"],
    ];

    const headers = [
      "Tx No.",
      "Date",
      "Holder (ผู้ถือเงินสดย่อย)",
      "Branch",
      "Type",
      "Category",
      "Vehicle Plate (ทะเบียนรถ)",
      "Description",
      "Vendor / ร้านค้า",
      "Invoice / เลขที่บิล",
      "Method",
      "Direction",
      "Amount (THB)",
      "Balance Before",
      "Balance After",
      "Status",
      "Created By",
      "Approved By",
      "Receipt Files",
      "Slip Files",
    ];
    const rows = filteredTransactions.map((t) => {
      const branchName = getBranchDisplayName(t.branchId);
      const signedAmt = t.direction === "CREDIT" ? t.amount : -t.amount;
      return [
        t.txNumber || t.id,
        format(new Date(t.transactionDate), "dd/MM/yyyy HH:mm"),
        t.holderName,
        branchName,
        t.type,
        t.category,
        t.vehiclePlate || "-",
        t.description,
        t.vendorName || "-",
        t.invoiceNo || "-",
        t.paymentMethod || "-",
        t.direction,
        signedAmt.toFixed(2),
        t.balanceBefore.toFixed(2),
        t.balanceAfter.toFixed(2),
        t.status,
        t.createdByName || "-",
        t.approvedByName || "-",
        (t.receiptUrls || []).join(" | "),
        (t.slipUrls || []).join(" | "),
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

  // Export PDF (Includes Top-up vs Spent Executive Summary + Custodian Summary Table + Category Breakdown + Ledger)
  const handleExportPdf = () => {
    setExportMenuOpen(false);
    if (filteredTransactions.length === 0 && dashboardDetails.visibleHolderSummaries.length === 0) {
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

    const nowStr = format(new Date(), "dd/MM/yyyy HH:mm");
    const fileTitle = `petty-cash-report-${format(new Date(), "yyyyMMdd-HHmm")}`;

    let sumLimit = 0;
    let sumOpening = 0;
    let sumCompanyTopup = 0;
    let sumTransferIn = 0;
    let sumTotalTopup = 0;
    let sumTransferOut = 0;
    let sumExpense = 0;
    let sumCurrentBal = 0;
    let sumShortfall = 0;

    const custodianRowsHtml = dashboardDetails.visibleHolderSummaries
      .map((h, idx) => {
        const branchName = getBranchDisplayName(h.branchId);
        const limit = getHolderLimit(h.holderId, h.isAccounting);
        const shortfall = Math.max(0, Math.round((limit - h.currentBalance) * 100) / 100);
        sumLimit += limit;
        sumOpening += h.openingBalance;
        sumCompanyTopup += h.companyTopup;
        sumTransferIn += h.transferIn;
        sumTotalTopup += h.totalTopup;
        sumTransferOut += h.transferOut;
        sumExpense += h.totalExpense;
        sumCurrentBal += h.currentBalance;
        sumShortfall += shortfall;

        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${escapeHtml(h.holderName)}</strong></td>
            <td>${escapeHtml(h.department || h.roleLabel)}<br/><span style="color:#64748b;font-size:9.5px;">${escapeHtml(branchName)}</span></td>
            <td style="text-align:right;font-family:monospace;">฿${fmtMoney(limit)}</td>
            <td style="text-align:right;font-family:monospace;color:#475569;">฿${fmtMoney(h.openingBalance)}</td>
            <td style="text-align:right;font-family:monospace;color:#059669;">${h.companyTopup > 0 ? `+฿${fmtMoney(h.companyTopup)}` : "-"}</td>
            <td style="text-align:right;font-family:monospace;color:#0284c7;">${h.transferIn > 0 ? `+฿${fmtMoney(h.transferIn)}` : "-"}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;color:#059669;">+฿${fmtMoney(h.totalTopup)}</td>
            <td style="text-align:right;font-family:monospace;color:#6366f1;">${h.transferOut > 0 ? `-฿${fmtMoney(h.transferOut)}` : "-"}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;color:#e11d48;">-฿${fmtMoney(h.totalExpense)}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;color:${h.currentBalance < 0 ? "#e11d48" : "#0f172a"};">฿${fmtMoney(h.currentBalance)}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;color:${shortfall > 0 ? "#d97706" : "#059669"};">฿${fmtMoney(shortfall)}</td>
          </tr>
        `;
      })
      .join("");

    const categoryRowsHtml =
      dashboardDetails.categoryBreakdown.length > 0
        ? dashboardDetails.categoryBreakdown
            .map((c, idx) => {
              const pct =
                kpiStats.realExpenseTotal > 0
                  ? ((c.amount / kpiStats.realExpenseTotal) * 100).toFixed(1)
                  : "0.0";
              return `
                <tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td><strong>${escapeHtml(c.category)}</strong></td>
                  <td style="text-align:center;font-family:monospace;">${c.count} รายการ</td>
                  <td style="text-align:right;font-family:monospace;font-weight:700;color:#e11d48;">-฿${fmtMoney(c.amount)}</td>
                  <td style="text-align:right;font-family:monospace;">${pct}%</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">ไม่มีรายการเบิกจ่ายในช่วงเวลานี้</td></tr>`;

    const rowsHtml =
      filteredTransactions.length > 0
        ? filteredTransactions
            .map((t, idx) => {
              const branchName = getBranchDisplayName(t.branchId);
              const isCredit = t.direction === "CREDIT";
              const signedAmt = isCredit ? `+฿${fmtMoney(t.amount)}` : `-฿${fmtMoney(t.amount)}`;
              const amtColor =
                t.status === "REJECTED" || t.status === "VOID"
                  ? "#94a3b8"
                  : isCredit
                    ? "#059669"
                    : "#e11d48";
              const vendorInvoice = [t.vendorName, t.invoiceNo].filter(Boolean).join(" / ") || "-";
              return `
                <tr>
                  <td style="text-align:center;">${idx + 1}</td>
                  <td style="white-space:nowrap;font-family:monospace;">${escapeHtml(t.txNumber || t.id.slice(0, 8))}</td>
                  <td style="white-space:nowrap;">${escapeHtml(format(new Date(t.transactionDate), "dd/MM/yyyy HH:mm"))}</td>
                  <td><strong>${escapeHtml(t.holderName)}</strong><br/><span style="color:#64748b;font-size:10px;">${escapeHtml(branchName)}</span></td>
                  <td>${escapeHtml(t.type)}</td>
                  <td>${escapeHtml(t.category)}</td>
                  <td>${escapeHtml(t.description)}</td>
                  <td>${escapeHtml(vendorInvoice)}</td>
                  <td style="text-align:center;">${escapeHtml(t.paymentMethod || "-")}</td>
                  <td style="text-align:right;font-family:monospace;font-weight:700;color:${amtColor};">${signedAmt}</td>
                  <td style="text-align:right;font-family:monospace;">฿${fmtMoney(t.balanceAfter)}</td>
                  <td style="text-align:center;">${escapeHtml(t.status)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="12" style="text-align:center;color:#94a3b8;padding:12px;">ไม่มีรายการเดินบัญชีในช่วงเวลานี้</td></tr>`;

    const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 10.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .title { font-size: 17px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 11px; color: #475569; margin-top: 3px; }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #1e293b;
      margin: 12px 0 6px 0;
      padding-left: 8px;
      border-left: 3px solid #4f46e5;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 10px;
      background: #f8fafc;
    }
    .kpi-label { font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .kpi-val { font-size: 13.5px; font-weight: 700; margin-top: 2px; font-family: monospace; }
    .kpi-sub { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 10px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4.5px 6px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
    }
    tr:nth-child(even) td { background: #fafafa; }
    tfoot td {
      background: #f1f5f9 !important;
      font-weight: 700;
      border-top: 2px solid #64748b;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 22px;
      page-break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      padding-top: 28px;
      font-size: 10.5px;
      color: #334155;
    }
    .sig-line {
      border-top: 1px dashed #64748b;
      width: 75%;
      margin: 0 auto 4px auto;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">รายงานสรุปเงินสดย่อย: ยอดเติมเข้า - ยอดใช้ไป & ยอดเบิกชดเชย (Petty Cash Report)</h1>
      <div class="subtitle">
        <strong>ช่วงเวลาข้อมูล:</strong> ${escapeHtml(periodLabel)} &nbsp;|&nbsp;
        <strong>จำนวนรายการเดินบัญชี:</strong> ${filteredTransactions.length} รายการ
      </div>
    </div>
    <div style="text-align:right;font-size:10.5px;color:#475569;">
      <div><strong>วันที่พิมพ์:</strong> ${escapeHtml(nowStr)}</div>
      <div><strong>ผู้พิมพ์รายงาน:</strong> ${escapeHtml(currentUser?.name || currentUser?.email || "-")}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">คงเหลือรวมปัจจุบัน (Total Balance)</div>
      <div class="kpi-val">฿${fmtMoney(holderFilter === "ALL" ? dashboardDetails.totalWalletBalanceAll : kpiStats.netBalance)}</div>
      <div class="kpi-sub">วงเงินรวม: ฿${fmtMoney(dashboardDetails.totalLimitAll)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">เติมเงินจากบริษัท (+Company Top-up)</div>
      <div class="kpi-val" style="color:#059669;">+฿${fmtMoney(kpiStats.companyTopupTotal)}</div>
      <div class="kpi-sub">เติมเข้าบัญชี ${dashboardDetails.topupTxCount} รายการ</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">โอนเติมให้สาขา (Store Transfers)</div>
      <div class="kpi-val" style="color:#0284c7;">฿${fmtMoney(kpiStats.transferredToStoreTotal)}</div>
      <div class="kpi-sub">โอนวงเงิน ${dashboardDetails.transferTxCount} รายการ</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ใช้จ่ายจริงรวม (-Total Expenses)</div>
      <div class="kpi-val" style="color:#e11d48;">-฿${fmtMoney(kpiStats.realExpenseTotal)}</div>
      <div class="kpi-sub">อนุมัติแล้ว: ฿${fmtMoney(dashboardDetails.approvedExpenseTotal)} (${dashboardDetails.expenseTxCount} บิล)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">คงเหลือ บัญชี / หน้าร้าน</div>
      <div class="kpi-val" style="color:#4f46e5;font-size:12px;">บัญชี ฿${fmtMoney(kpiStats.accountingPoolBalance)}</div>
      <div class="kpi-sub">หน้าร้าน: ฿${fmtMoney(kpiStats.storePoolBalance)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ต้องเบิกชดเชยเพิ่ม (To Replenish)</div>
      <div class="kpi-val" style="color:#d97706;">฿${fmtMoney(dashboardDetails.totalShortfallAll)}</div>
      <div class="kpi-sub">รอตรวจบิล: ${kpiStats.pendingCount} รายการ (฿${fmtMoney(kpiStats.pendingAmount)})</div>
    </div>
  </div>

  <div class="section-title">1. ตารางสรุปยอดเติมเงิน - ยอดใช้ไป และยอดต้องเบิกชดเชย แยกตามผู้ถือเงินสดย่อย (Custodian Replenishment & Usage Summary)</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:26px;">#</th>
        <th>ผู้ถือเงินสดย่อย (Custodian)</th>
        <th>แผนก / สาขา</th>
        <th style="text-align:right;">วงเงินตั้งต้น (Quota)</th>
        <th style="text-align:right;">ยอดยกมาต้นงวด</th>
        <th style="text-align:right;">เติมจากบริษัท (+)</th>
        <th style="text-align:right;">รับโอนจากบัญชี (+)</th>
        <th style="text-align:right;">รวมเติมเข้าในงวด (+)</th>
        <th style="text-align:right;">โอนให้สาขา (-)</th>
        <th style="text-align:right;">ใช้จ่ายจริงในงวด (-)</th>
        <th style="text-align:right;">คงเหลือปัจจุบัน</th>
        <th style="text-align:right;">ต้องเติมเพิ่ม (Shortfall)</th>
      </tr>
    </thead>
    <tbody>
      ${custodianRowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;">รวมทั้งหมด (${dashboardDetails.visibleHolderSummaries.length} กระเป๋า)</td>
        <td style="text-align:right;font-family:monospace;">฿${fmtMoney(sumLimit)}</td>
        <td style="text-align:right;font-family:monospace;">฿${fmtMoney(sumOpening)}</td>
        <td style="text-align:right;font-family:monospace;color:#059669;">+฿${fmtMoney(sumCompanyTopup)}</td>
        <td style="text-align:right;font-family:monospace;color:#0284c7;">+฿${fmtMoney(sumTransferIn)}</td>
        <td style="text-align:right;font-family:monospace;color:#059669;">+฿${fmtMoney(sumTotalTopup)}</td>
        <td style="text-align:right;font-family:monospace;color:#6366f1;">-฿${fmtMoney(sumTransferOut)}</td>
        <td style="text-align:right;font-family:monospace;color:#e11d48;">-฿${fmtMoney(sumExpense)}</td>
        <td style="text-align:right;font-family:monospace;">฿${fmtMoney(sumCurrentBal)}</td>
        <td style="text-align:right;font-family:monospace;color:#d97706;">฿${fmtMoney(sumShortfall)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-title">2. สรุปค่าใช้จ่ายแยกตามหมวดหมู่ (Expense Breakdown by Category)</div>
  <table style="width:65%;">
    <thead>
      <tr>
        <th style="text-align:center;width:28px;">#</th>
        <th>หมวดหมู่ค่าใช้จ่าย (Category)</th>
        <th style="text-align:center;width:110px;">จำนวนบิล</th>
        <th style="text-align:right;width:150px;">ยอดใช้จ่ายจริง (THB)</th>
        <th style="text-align:right;width:90px;">สัดส่วน (%)</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="text-align:right;">รวมค่าใช้จ่ายจริงทั้งหมด</td>
        <td style="text-align:center;font-family:monospace;">${dashboardDetails.expenseTxCount} รายการ</td>
        <td style="text-align:right;font-family:monospace;color:#e11d48;">-฿${fmtMoney(kpiStats.realExpenseTotal)}</td>
        <td style="text-align:right;font-family:monospace;">100.0%</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-title">3. รายการเดินบัญชีเงินสดย่อยละเอียด (Detailed Transaction Ledger)</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:28px;">#</th>
        <th>เลขที่รายการ</th>
        <th>วัน-เวลา</th>
        <th>ผู้ถือเงินสดย่อย / สาขา</th>
        <th>ประเภท</th>
        <th>หมวดหมู่</th>
        <th>รายละเอียด</th>
        <th>ร้านค้า / เลขที่บิล</th>
        <th style="text-align:center;">ช่องทาง</th>
        <th style="text-align:right;">จำนวนเงิน</th>
        <th style="text-align:right;">คงเหลือหลังทำรายการ</th>
        <th style="text-align:center;">สถานะ</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"><strong>ผู้สรุป / ผู้ขอเบิกชดเชย (Prepared By)</strong></div>
      <div>วันที่ ____/____/________</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"><strong>ผู้ตรวจสอบฝ่ายบัญชี (Verified By Accounting)</strong></div>
      <div>วันที่ ____/____/________</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"><strong>ผู้อนุมัติจ่ายชดเชย (Approved By)</strong></div>
      <div>วันที่ ____/____/________</div>
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
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Wallet size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Petty Cash
              </h1>
              <span className="text-xs font-medium text-slate-400">
                ระบบบริหารเงินสดย่อย
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[10.5px] font-semibold">
                {holderSummaries.length} Wallets
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Custodian wallets, instant expense tracking & replenishment
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compact Date Filter Segment */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 border border-slate-200/70 rounded-xl p-1">
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
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
                className="h-7 w-[116px] text-[11px] font-mono rounded-lg border-transparent bg-white/80 hover:bg-white px-2"
                title="From Date"
              />
              <span className="text-slate-400 text-xs">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 w-[116px] text-[11px] font-mono rounded-lg border-transparent bg-white/80 hover:bg-white px-2"
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
            className="h-9 w-9 p-0 border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-xl cursor-pointer"
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
                className="h-9 px-3 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl gap-1.5 cursor-pointer"
              >
                <Settings2 size={14} className="text-slate-400" />
                <span>Categories</span>
              </Button>

              <div className="relative" ref={exportMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  className="h-9 px-3 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl gap-1.5 cursor-pointer"
                >
                  <Download size={14} className="text-slate-500" />
                  <span>Export</span>
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
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
                className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Top-up (เติมเงิน)</span>
              </Button>
            </>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenSubmitReportModal()}
            className="h-9 px-3.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1.5 shadow-2xs cursor-pointer"
            title="สรุป Report การใช้จ่ายของรอบนี้เพื่อขอเบิกชดเชยเงินสดย่อย"
          >
            <Files size={14} />
            <span>Submit Replenishment Report (สรุปเบิกเงินสดย่อย)</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenCreateModal("EXPENSE", undefined, "EXPENSE_DOC")}
            className="h-9 px-3.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl gap-1.5 shadow-2xs cursor-pointer"
          >
            <ArrowUpRight size={14} />
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
                {
                  id: "claims",
                  label: "Replenishment Claims (สรุปเบิกเงินสดย่อย)",
                  count: replenishmentReports.filter((r) => r.status === "PENDING_APPROVAL").length || replenishmentReports.length,
                  badgeColor: replenishmentReports.some((r) => r.status === "PENDING_APPROVAL")
                    ? "bg-amber-600 text-white"
                    : "",
                },
                { id: "wallets", label: "Custodian Wallets (กระเป๋ารายบุคคล)", count: holderSummaries.length, badgeColor: "" },
                { id: "report", label: "Summary & Analytics (ตารางสรุปยอด)", count: null, badgeColor: "" },
              ]
            : [
                { id: "ledger", label: "My Transactions (รายการเดินบัญชี)", count: filteredTransactions.length, badgeColor: "" },
                {
                  id: "claims",
                  label: "My Replenishment Claims (ประวัติสรุปเบิกเงินสดย่อย)",
                  count: replenishmentReports.filter((r) => r.holderId === currentUser?.id).length,
                  badgeColor: "",
                },
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

        {/* Quick Custodian Filter Pills when in Ledger view */}
        {canApproveOrTopUp && activeViewTab === "ledger" && holderSummaries.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setHolderFilter("ALL")}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 cursor-pointer ${
                holderFilter === "ALL"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              All Wallets
            </button>
            {holderSummaries.map((h) => {
              const isSelected = holderFilter === h.holderId;
              return (
                <div
                  key={h.holderId}
                  onClick={() => setHolderFilter(isSelected ? "ALL" : h.holderId)}
                  className={`pl-2.5 pr-1.5 py-1 rounded-xl text-xs border transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-400 text-indigo-950 font-bold"
                      : "bg-white border-slate-200/90 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="truncate max-w-[110px] font-semibold">{h.holderName}</span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      h.currentBalance <= 0 ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    ฿{h.currentBalance.toLocaleString()}
                  </span>
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
                    className="w-5 h-5 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title={`Top-up ${h.holderName}`}
                  >
                    <Plus size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TAB: REPLENISHMENT CLAIMS (สรุป Report การใช้จ่ายเพื่อขอเบิกเงินสดย่อย) ── */}
      {activeViewTab === "claims" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Files size={16} className="text-indigo-600" />
                <span>Replenishment Reports & Approval (ใบสรุปการใช้จ่ายเพื่อขอเบิกเงินสดย่อย)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ผู้ถือเงินสดย่อยสรุปบิลค่าใช้จ่ายในรอบนั้นส่งให้ฝ่ายบัญชีตรวจสอบและ Approve ก่อนโอนเติมเงินชดเชย
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
                    if (holderFilter !== "ALL" && r.holderId !== holderFilter) return false;
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

      {/* ── TAB 3: SUMMARY & ANALYTICS REPORT (ตารางสรุปยอด & หมวดหมู่) ──────── */}
      {canApproveOrTopUp && activeViewTab === "report" && (
        <div className="space-y-4">
          {dashboardDetails.visibleHolderSummaries.length > 0 && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Replenishment & Usage Summary (ตารางสรุปยอดเติมเงิน-เบิกจ่ายรายบุคคล)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Period: {periodLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-8 text-xs font-semibold border-slate-200 rounded-xl gap-1.5 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Excel (.csv)</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportPdf}
                    className="h-8 text-xs font-semibold border-slate-200 rounded-xl gap-1.5 cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>Print / PDF</span>
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500">
                      <th className="py-2.5 px-3">Custodian (ผู้ถือเงิน)</th>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3 text-right">Quota Limit</th>
                      <th className="py-2.5 px-3 text-right">Opening</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">+ Inflow</th>
                      <th className="py-2.5 px-3 text-right text-indigo-700">- Transfer Out</th>
                      <th className="py-2.5 px-3 text-right text-rose-700">- Spent</th>
                      <th className="py-2.5 px-3 text-right">Current Bal.</th>
                      <th className="py-2.5 px-3 text-right text-amber-700">To Replenish</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboardDetails.visibleHolderSummaries.map((h) => {
                      const branchName = getBranchDisplayName(h.branchId);
                      const limit = getHolderLimit(h.holderId, h.isAccounting);
                      const shortfall = Math.max(0, Math.round((limit - h.currentBalance) * 100) / 100);
                      return (
                        <tr key={h.holderId} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {h.holderName}
                            {h.pendingCount > 0 && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
                                {h.pendingCount} pending
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{branchName}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            ฿{limit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                            ฿{h.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                            +฿{h.totalTopup.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-indigo-600">
                            {h.transferOut > 0 ? `-฿${h.transferOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                            -฿{h.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                            ฿{shortfall.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenCreateModal("TOPUP", {
                                  id: h.holderId,
                                  name: h.holderName,
                                  branchId: h.branchId,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] cursor-pointer"
                            >
                              + Top-up
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Category Breakdown inside Report Tab */}
          {dashboardDetails.categoryBreakdown.length > 0 && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Expenses by Category (สรุปค่าใช้จ่ายตามหมวดหมู่)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {dashboardDetails.categoryBreakdown.map((item) => {
                  const pct =
                    kpiStats.realExpenseTotal > 0
                      ? Math.round((item.amount / kpiStats.realExpenseTotal) * 100)
                      : 0;
                  return (
                    <div
                      key={item.category}
                      onClick={() => {
                        setCategoryFilter(item.category);
                        setActiveViewTab("ledger");
                      }}
                      className="p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-slate-50/50 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate">{item.category}</span>
                        <span className="font-mono font-bold text-rose-600 shrink-0">
                          ฿{item.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden my-2">
                        <div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{item.count} items</span>
                        <span>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 1 (DEFAULT): STREAMLINED TRANSACTIONS LEDGER ─────────────────── */}
      {activeViewTab === "ledger" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
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
                searchQuery.trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setHolderFilter("ALL");
                    setBranchFilter("ALL");
                    setCategoryFilter("ALL");
                    setStatusFilter("ALL");
                    setTypeFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Reset
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
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
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
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No transactions found for the selected filters.
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
                          <div className="font-semibold text-slate-900">{tx.holderName}</div>
                          <div className="text-[11px] text-slate-400">{branchName}</div>
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
        <DialogContent className={`${txMode === "TOPUP" && !editingTx ? "sm:max-w-lg" : "sm:max-w-xl"} bg-white rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden`}>
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
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              {txMode === "TOPUP" ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                    <ArrowDownLeft size={16} />
                  </div>
                  <span>{editingTx ? "Edit Company Top-up (แก้ไขรายการรับเงินบริษัท)" : "Company Top-up (รับเงินโอนจากบริษัท)"}</span>
                </>
              ) : txMode === "TRANSFER" ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                    <ArrowLeftRight size={16} />
                  </div>
                  <span>{editingTx ? "Edit Transfer (แก้ไขรายการโอนวงเงินสดย่อย)" : "Transfer Petty Cash (โอนวงเงินสดย่อย)"}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                    <ArrowUpRight size={16} />
                  </div>
                  <span>
                    {editingTx
                      ? "Edit Expense (แก้ไขรายการเบิกจ่าย)"
                      : `Record Expense — ${EXPENSE_DOC_TYPE_CONFIG[expenseDocType].label}`}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {txMode === "TOPUP"
                ? "Record petty cash received from the company into the selected custodian's wallet (บันทึกยอดโอนจากบริษัทเข้ากระเป๋าผู้ถือเงินสดย่อย)"
                : txMode === "TRANSFER"
                  ? "Deducts from your wallet and credits the recipient's wallet automatically (หักยอดจากกระเป๋าของคุณและเพิ่มเข้ากระเป๋าผู้รับโอนอัตโนมัติ)"
                  : EXPENSE_DOC_TYPE_CONFIG[expenseDocType].subtitle}
            </DialogDescription>
          </DialogHeader>



          <div className="space-y-3.5 py-1 text-xs">
            {/* Row 1: Holder / Recipient & Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    {txMode === "TRANSFER"
                      ? "From Holder (ผู้โอนต้นทาง)"
                      : txMode === "TOPUP"
                        ? "Recipient (ผู้รับเงินโอนจากบริษัท)"
                        : "Petty Cash Holder (ผู้ถือเงินสดย่อย)"}{" "}
                    <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">
                    Bal (คงเหลือ): ฿{(
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
                    className="h-9 w-full rounded-xl border border-emerald-300 bg-emerald-50/40 px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600"
                  >
                    {holderOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.roleLabel}) — {getBranchDisplayName(h.branchId)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-9 w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 text-xs font-bold text-slate-700 flex items-center justify-between select-none cursor-not-allowed">
                    <span className="truncate">
                      {formHolderName || currentUser?.name || currentUser?.email || "Current User"}
                      {currentUser?.role && (!editingTx || editingTx.holderId === currentUser?.id)
                        ? ` (${String(currentUser.role).toUpperCase()})`
                        : ""}
                    </span>
                    <Badge className="bg-slate-200/80 text-slate-600 border-slate-300 text-[9px] font-bold px-1.5 py-0 shrink-0">
                      Fixed User
                    </Badge>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  {txMode === "TRANSFER" ? "Source Branch (สาขาต้นทาง)" : "Branch (สาขา)"}
                </Label>
                <select
                  value={formBranchId}
                  onChange={(e) => setFormBranchId(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
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
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/90 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
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
                    className="h-9 w-full rounded-xl border border-indigo-300 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
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

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-indigo-950">Recipient Branch (สาขาผู้รับ)</Label>
                  <select
                    value={formTargetBranchId}
                    onChange={(e) => setFormTargetBranchId(e.target.value)}
                    className="h-9 w-full rounded-xl border border-indigo-300 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-600"
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

            {/* Row 2: Amount & Date & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  Amount ฿ (จำนวนเงิน) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-9 rounded-xl font-mono font-black text-sm border-slate-300"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Payment Method (ช่องทางจ่าย)</Label>
                <select
                  value={formPaymentMethod}
                  onChange={(e) => setFormPaymentMethod(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                >
                  <option value="Cash">Cash (เงินสด)</option>
                  <option value="Transfer">Bank Transfer (โอนเงิน)</option>
                  <option value="QR">QR PromptPay (สแกน QR)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Date (วันที่)</Label>
                <Input
                  type="date"
                  value={formDate ? formDate.slice(0, 10) : format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => { const d = e.target.value; const timePart = formDate && formDate.includes("T") ? formDate.slice(11, 16) : format(new Date(), "HH:mm"); setFormDate(d ? `${d}T${timePart}` : format(new Date(), "yyyy-MM-dd'T'HH:mm")); }}
                  className="h-9 rounded-xl text-xs border-slate-200"
                />
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

            {/* Row 4: Description */}
            <div className="space-y-1">
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
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {/* Row 5: Invoice No. (for Expenses) */}
            {txMode === "EXPENSE" && (
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  {EXPENSE_DOC_TYPE_CONFIG[expenseDocType].invoiceLabel}
                </Label>
                <Input
                  value={formInvoiceNo}
                  onChange={(e) => setFormInvoiceNo(e.target.value)}
                  placeholder={EXPENSE_DOC_TYPE_CONFIG[expenseDocType].invoicePlaceholder}
                  className="h-8 rounded-xl text-xs font-mono"
                />
              </div>
            )}

            {/* Row 6: Upload Documents / Receipts & Transfer Slips (Click or Hover box to target Ctrl+V) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Box 1: Receipt / Invoice Documents */}
              <div
                onClick={() => setPasteTarget("receipts")}
                onMouseEnter={() => setPasteTarget("receipts")}
                className={`p-3 rounded-xl border transition-all space-y-2 cursor-pointer ${
                  pasteTarget === "receipts"
                    ? "bg-amber-50/40 border-amber-400 ring-1 ring-amber-400/30"
                    : "bg-slate-50 border-slate-200/90 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer">
                    <Receipt size={13} className="text-amber-600 shrink-0" />
                    <span>Receipts / Docs (ใบเสร็จ: {formReceiptUrls.length})</span>
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
                    className="h-7 px-2 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1 shrink-0"
                  >
                    {isUploadingReceipts ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    Upload / Ctrl+V
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Images (.jpg, .png) & Docs (.pdf, .xlsx)</span>
                  {pasteTarget === "receipts" ? (
                    <span className="font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[9.5px]">
                      Ctrl+V Active (พร้อมวางรูป)
                    </span>
                  ) : (
                    <span className="text-slate-400">Hover/click for Ctrl+V</span>
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
                className={`p-3 rounded-xl border transition-all space-y-2 cursor-pointer ${
                  pasteTarget === "slips"
                    ? "bg-emerald-50/40 border-emerald-400 ring-1 ring-emerald-400/30"
                    : "bg-slate-50 border-slate-200/90 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer">
                    <Banknote size={13} className="text-emerald-600 shrink-0" />
                    <span>Transfer Slips (สลิปโอนเงิน: {formSlipUrls.length})</span>
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
                    className="h-7 px-2 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1 shrink-0"
                  >
                    {isUploadingSlips ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    Upload / Ctrl+V
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Attach bank transfer or PromptPay slip</span>
                  {pasteTarget === "slips" ? (
                    <span className="font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[9.5px]">
                      Ctrl+V Active (พร้อมวางสลิป)
                    </span>
                  ) : (
                    <span className="text-slate-400">Hover/click for Ctrl+V</span>
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

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTxModalOpen(false)}
              className="h-9 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              type="button"
              disabled={isSubmittingTx || isUploadingReceipts || isUploadingSlips}
              onClick={handleSubmitTransaction}
              className={`h-9 text-xs font-bold rounded-xl text-white cursor-pointer ${
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
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800"
                >
                  <span className="truncate">{cat}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditableCategories((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    title="Delete category (ลบหมวดหมู่นี้)"
                  >
                    <Trash2 size={13} />
                  </button>
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
              Math.round(selectedTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
            const hSum = holderSummaries.find((h) => h.holderId === reportHolderId);
            const limit = getHolderLimit(reportHolderId, hSum?.isAccounting);
            const currentBal = hSum?.currentBalance ?? 0;
            const shortfall = Math.max(0, Math.round((limit - currentBal) * 100) / 100);

            const catPreviewMap = new Map<string, { category: string; amount: number; count: number }>();
            selectedTxs.forEach((t) => {
              const cat = t.category || "Uncategorized";
              const cur = catPreviewMap.get(cat) || { category: cat, amount: 0, count: 0 };
              cur.amount = Math.round((cur.amount + (Number(t.amount) || 0)) * 100) / 100;
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
                                nextUnclaimed.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100
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
                                  unclaimedTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100
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
                        ไม่มีบิลค่าใช้จ่ายค้างสรุปเบิกสำหรับกระเป๋านี้ (บิลทั้งหมดถูกส่งสรุปเบิกแล้ว หรือยังไม่มีรายการใช้จ่ายใหม่)
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
                                          .reduce((s, item) => s + (Number(item.amount) || 0), 0) * 100
                                      ) / 100;
                                    setReportRequestedAmount(nextSum.toFixed(2));
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {tx.description}
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
                              <div className="font-mono font-bold text-rose-600 shrink-0">
                                -฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

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
                            <span className="font-mono font-bold text-rose-600 shrink-0">
                              ฿{c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                            <span className="font-mono font-bold text-rose-600 shrink-0">
                              ฿{Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                              <div className="font-semibold text-slate-900 truncate">
                                {tx.description}
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
                              <span className="font-mono font-bold text-rose-600 whitespace-nowrap">
                                -฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
