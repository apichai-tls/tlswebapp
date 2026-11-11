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
  transactionDate: string | Date;
  createdById?: string | null;
  createdByName?: string | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | Date | null;
  rejectReason?: string | null;
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
  const [showSummaryTable, setShowSummaryTable] = useState<boolean>(true);
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

  // Upload files helper (supports images + PDF/docs via /api/upload-url or /api/upload-local)
  const handleUploadFiles = async (
    files: FileList | null,
    subType: "receipts" | "slips",
    onSuccessUrls: (urls: string[]) => void,
    setUploading: (val: boolean) => void
  ) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    const entityId = editingTx?.id || `pc-${Date.now()}`;

    try {
      for (const file of Array.from(files)) {
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
          const fd = new FormData();
          fd.append("file", file);
          fd.append("entityType", "system");
          fd.append("entityId", entityId);
          fd.append("subType", subType);
          const localRes = await fetch("/api/upload-local", { method: "POST", body: fd });
          const localData = await localRes.json();
          if (localData.success && localData.publicUrl) {
            publicUrl = localData.publicUrl;
          } else {
            throw new Error(localData.error || `อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ`);
          }
        }

        if (publicUrl) {
          uploaded.push(publicUrl);
        }
      }

      if (uploaded.length > 0) {
        onSuccessUrls(uploaded);
        toast.success(`อัปโหลดไฟล์สำเร็จ (${uploaded.length} ไฟล์)`);
      }
    } catch (err: any) {
      toast.error(err?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

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
    <div className="space-y-5 pb-12 font-sans">
      {/* ── 1. EXECUTIVE COMMAND HEADER & PRIMARY ACTIONS ──────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <Wallet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Petty Cash Management (ระบบบริหารเงินสดย่อย)
                </h1>
                <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-black px-2 py-0.5 rounded-full">
                  ⚡ Auto-Deduct (ตัดยอดทันที)
                </Badge>
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {holderSummaries.length} Active Wallets
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Individual custodian wallets, 2-tier replenishment (Company ➔ Accounting ➔ Store), expense vouchers & receipt audit trail
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Filter Pill Strip */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700 rounded-xl p-1">
              <Calendar size={14} className="text-indigo-600 ml-2 shrink-0" />
              <div className="flex items-center gap-0.5 bg-slate-200/70 dark:bg-slate-700 p-0.5 rounded-lg">
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
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          isAll ? "bg-white text-indigo-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All Time
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom(todayStr);
                          setDateTo(todayStr);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          isToday ? "bg-white text-indigo-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom(thisMonthStart);
                          setDateTo(thisMonthEnd);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          isThisMonth ? "bg-white text-indigo-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        This Month
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom(lastMonthStart);
                          setDateTo(lastMonthEnd);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          isLastMonth ? "bg-white text-indigo-700 shadow-xs font-black" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Last Month
                      </button>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1 pr-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-7 w-[122px] text-[11px] font-mono rounded-lg border-slate-200 bg-white px-2"
                  title="ตั้งแต่วันที่ (From Date)"
                />
                <span className="text-slate-400 text-xs font-bold">–</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-7 w-[122px] text-[11px] font-mono rounded-lg border-slate-200 bg-white px-2"
                  title="ถึงวันที่ (To Date)"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded-md cursor-pointer"
                    title="ล้างตัวกรองวันที่"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="h-9 px-2.5 text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              title="Refresh Data (รีเฟรชข้อมูล)"
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
                  className="h-9 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl gap-1.5 cursor-pointer"
                >
                  <Settings2 size={14} className="text-indigo-500" />
                  Categories ({categories.length})
                </Button>

                <div className="relative" ref={exportMenuRef}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="h-9 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl gap-1.5 cursor-pointer"
                  >
                    <Download size={14} className="text-emerald-600" />
                    Export
                    <ChevronDown size={14} className={`ml-0.5 text-slate-400 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
                  </Button>

                  {exportMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-50 text-xs">
                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer"
                      >
                        <FileText size={14} className="text-emerald-600 shrink-0" />
                        <span>Export Excel / CSV (.csv)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPdf}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer"
                      >
                        <FileText size={14} className="text-rose-600 shrink-0" />
                        <span>Print / Export PDF (.pdf)</span>
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
                  className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus size={14} />
                  Top-up Wallet (เติมเงิน)
                </Button>
              </>
            )}

            <Button
              type="button"
              size="sm"
              onClick={() => handleOpenCreateModal("EXPENSE", undefined, "EXPENSE_DOC")}
              className="h-9 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl gap-1.5 shadow-sm cursor-pointer"
            >
              <ArrowUpRight size={14} />
              - Record Expense (บันทึกเบิกจ่าย)
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. EXECUTIVE KPI CARDS (5-COLUMN DETAILED FINANCIAL METRICS) ────── */}
      {canApproveOrTopUp ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {/* KPI 1: Total Balance & Quota */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-indigo-600 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Total Balance (คงเหลือรวม)
                </span>
                <div
                  className={`text-2xl font-black font-mono tracking-tight ${
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
              </div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <Wallet size={20} />
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  วงเงินรวม (Total Limit): <strong className="font-mono text-slate-800">฿{dashboardDetails.totalLimitAll.toLocaleString()}</strong>
                </span>
                <span className="text-[10px] font-black font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {dashboardDetails.totalLimitAll > 0
                    ? `${Math.min(100, Math.round((Math.max(0, dashboardDetails.totalWalletBalanceAll) / dashboardDetails.totalLimitAll) * 100))}% Full`
                    : "0%"}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      dashboardDetails.totalLimitAll > 0
                        ? Math.min(100, Math.max(0, (dashboardDetails.totalWalletBalanceAll / dashboardDetails.totalLimitAll) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* KPI 2: Accounting Pool */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-emerald-500 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Accounting Pool (ฝ่ายบัญชี)
                </span>
                <div className="text-2xl font-black font-mono text-emerald-600 tracking-tight">
                  ฿{kpiStats.accountingPoolBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <ArrowDownLeft size={20} />
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">
                รับจากบริษัท: <strong className="font-mono text-emerald-600">+฿{kpiStats.companyTopupTotal.toLocaleString()}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                {accountingCustodians.length} บัญชี/HQ
              </span>
            </div>
          </div>

          {/* KPI 3: Store Wallets */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-sky-500 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Store Wallets (คงเหลือหน้าร้าน)
                </span>
                <div className="text-2xl font-black font-mono text-sky-600 tracking-tight">
                  ฿{kpiStats.storePoolBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <ArrowLeftRight size={20} />
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">
                โอนให้สาขา: <strong className="font-mono text-sky-700">฿{kpiStats.transferredToStoreTotal.toLocaleString()}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">
                {storeCustodians.length} หน้าร้าน
              </span>
            </div>
          </div>

          {/* KPI 4: Total Disbursed Expenses */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-rose-500 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Total Expenses (เบิกจ่ายจริง)
                </span>
                <div className="text-2xl font-black font-mono text-rose-600 tracking-tight">
                  -฿{kpiStats.realExpenseTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ArrowUpRight size={20} />
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">
                อนุมัติแล้ว: <strong className="font-mono text-slate-800">฿{dashboardDetails.approvedExpenseTotal.toLocaleString()}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] font-mono">
                {dashboardDetails.expenseTxCount} รายการ
              </span>
            </div>
          </div>

          {/* KPI 5: Audit Queue & Receipt Compliance */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-amber-500 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-1 min-w-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Pending Audit (รอตรวจบิล)
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black font-mono text-amber-600 tracking-tight">
                    {kpiStats.pendingCount}
                  </span>
                  <span className="text-xs font-bold text-slate-400 font-mono">
                    (฿{kpiStats.pendingAmount.toLocaleString()})
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Receipt size={20} />
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">
                แนบใบเสร็จ/สลิป: <strong className="font-mono text-emerald-600">{dashboardDetails.attachmentCompliancePct}%</strong>
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "PENDING" ? "ALL" : "PENDING")}
                className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[10px] transition-colors cursor-pointer"
              >
                {statusFilter === "PENDING" ? "แสดงทั้งหมด" : "กรองรอตรวจ"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-indigo-600 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">
                My Balance (ยอดคงเหลือของคุณ)
              </span>
              <div
                className={`text-2xl font-black font-mono mt-1 ${
                  currentUserBalance < 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                ฿{currentUserBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500">
                Holder (ผู้ถือ): {currentUser?.name || "You"} ({getBranchDisplayName(currentUser?.branchId)})
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet size={22} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-emerald-500 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Total Received (ยอดรับโอนสะสม)
              </span>
              <div className="text-2xl font-black font-mono text-emerald-600 mt-1">
                +฿{(currentUserSummary?.totalTopup ?? kpiStats.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500">
                Received from Accounting (รับจากฝ่ายบัญชี)
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft size={22} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 border-t-4 border-t-rose-500 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                My Expenses (เบิกจ่ายสะสม)
              </span>
              <div className="text-2xl font-black font-mono text-rose-600 mt-1">
                -฿{(currentUserSummary?.totalExpense ?? kpiStats.realExpenseTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-amber-600 font-bold">
                ⏳ Pending Review (รอตรวจบิล): {kpiStats.pendingCount} items (฿{kpiStats.pendingAmount.toLocaleString()})
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </div>
      )}

      {/* ── 3. CUSTODIAN WALLETS (กระเป๋าเงินสดย่อยรายบุคคล — DETAILED MODERN CARDS) ─── */}
      {canApproveOrTopUp && holderSummaries.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                <User size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
                    Custodian Wallets (กระเป๋าเงินสดย่อยรายบุคคล — {holderSummaries.length} คน)
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Total Quota: ฿{dashboardDetails.totalLimitAll.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  คลิกที่การ์ดผู้ถือเงินสดย่อยเพื่อกรองรายการเดินบัญชีเฉพาะบุคคล หรือกด +Top-up เพื่อเติมเงินให้ครบวงเงิน
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummaryTable((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showSummaryTable
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                }`}
              >
                <FileText size={13} />
                <span>
                  {showSummaryTable
                    ? "ซ่อนตารางสรุปยอดเติม-ใช้ไป (Hide Summary Table)"
                    : "ดูตารางสรุปยอดเติม-ใช้ไป (Show Summary Table)"}
                </span>
              </button>
              {holderFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setHolderFilter("ALL")}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  ✕ Clear Filter (แสดงทุกคน)
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 ${
              holderSummaries.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"
            } gap-4`}
          >
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

              const statusBadge =
                h.currentBalance <= 0
                  ? { label: "Needs Top-up (รอเติมวงเงิน)", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                  : fillPct < 25
                    ? { label: "Low Balance (ใกล้หมด)", cls: "bg-rose-50 text-rose-700 border-rose-200" }
                    : { label: "Active (พร้อมใช้งาน)", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };

              return (
                <div
                  key={h.holderId}
                  onClick={() => setHolderFilter(isSelected ? "ALL" : h.holderId)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                    isSelected
                      ? "bg-indigo-50/40 border-indigo-500 ring-2 ring-indigo-500/15 shadow-sm"
                      : "bg-gradient-to-b from-white to-slate-50/50 border-slate-200/90 hover:border-indigo-300 hover:shadow-md"
                  }`}
                >
                  {/* Top Row: Avatar, Name, Role/Branch & Balance */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs border ${
                            h.isAccounting
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          }`}
                        >
                          {initials || "PC"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 text-sm truncate flex items-center gap-1.5">
                            <span className="truncate">{h.holderName}</span>
                            {h.holderId === currentUser?.id && (
                              <Badge className="bg-indigo-600 text-white text-[9px] px-1.5 py-0 rounded-md shrink-0">
                                You (คุณ)
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                            <span className="font-semibold text-slate-600">{h.department || h.roleLabel}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Building2 size={11} className="text-slate-400" />
                              {branchName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block">
                          Current Balance
                        </span>
                        <span
                          className={`font-mono font-black text-lg leading-tight block ${
                            h.currentBalance < 0
                              ? "text-rose-600"
                              : h.currentBalance === 0
                                ? "text-slate-600"
                                : "text-indigo-700"
                          }`}
                        >
                          ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Quota Utilization Progress Bar */}
                    <div className="mt-3.5 bg-white/90 border border-slate-200/70 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-bold text-slate-600 flex items-center gap-1.5">
                          <span>Quota Limit: <strong className="font-mono text-slate-900">฿{limit.toLocaleString()}</strong></span>
                          <span className={`px-1.5 py-0.2 rounded border text-[9.5px] font-bold ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </span>
                        <span className="font-mono font-bold text-slate-500">
                          {fillPct}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            fillPct < 25 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.max(fillPct, h.currentBalance > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                        <span>
                          ต้องเติมเพิ่ม (Shortfall): <strong className="font-mono text-indigo-600">฿{shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        </span>
                        <span>
                          {dateFrom || dateTo ? `${h.txCount} รายการในงวด (${h.allTimeTxCount} สะสม)` : `${h.allTimeTxCount} รายการสะสม`}
                        </span>
                      </div>
                    </div>

                    {/* 3-Column Mini Financial Ledger */}
                    <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg py-1.5 px-2">
                        <span className="text-[9.5px] font-bold text-emerald-700 uppercase block">
                          {dateFrom || dateTo ? "Received (รับในงวด)" : "Received (รับสะสม)"}
                        </span>
                        <span className="font-mono font-black text-xs text-emerald-700">
                          +฿{h.totalTopup.toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-rose-50/50 border border-rose-100 rounded-lg py-1.5 px-2">
                        <span className="text-[9.5px] font-bold text-rose-700 uppercase block">
                          {dateFrom || dateTo ? "Spent (ใช้ในงวด)" : "Spent (ใช้สะสม)"}
                        </span>
                        <span className="font-mono font-black text-xs text-rose-600">
                          -฿{h.totalExpense.toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-amber-50/50 border border-amber-100 rounded-lg py-1.5 px-2">
                        <span className="text-[9.5px] font-bold text-amber-700 uppercase block">Pending (รอตรวจ)</span>
                        <span className="font-mono font-black text-xs text-amber-700">
                          {h.pendingCount} บิล
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">
                      {isSelected ? "✓ กำลังกรองรายการของผู้ถือนี้" : "คลิกเพื่อดูประวัติรายการ"}
                    </span>

                    {canApproveOrTopUp && (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCreateModal(
                              "EXPENSE",
                              { id: h.holderId, name: h.holderName, branchId: h.branchId },
                              "EXPENSE_DOC"
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10.5px] transition-colors cursor-pointer"
                          title="Record expense for this custodian"
                        >
                          - เบิกจ่าย
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenCreateModal("TOPUP", {
                              id: h.holderId,
                              name: h.holderName,
                              branchId: h.branchId,
                            })
                          }
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-[10.5px] shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                          title="Replenish / Top-up Petty Cash"
                        >
                          <Plus size={11} /> Top-up (เติมเงิน)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3B. PETTY CASH REPLENISHMENT & USAGE SUMMARY REPORT TABLE (ตารางสรุปยอดเติมเข้า vs ใช้ไป & ยอดต้องเบิกชดเชย) ─── */}
      {showSummaryTable && dashboardDetails.visibleHolderSummaries.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                <FileText size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
                    รายงานสรุปยอดเติมเงิน vs ยอดใช้จ่าย & ยอดต้องเบิกชดเชย (Replenishment & Usage Report)
                  </h2>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                    ช่วงเวลา: {periodLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  สรุปเปรียบเทียบวงเงินตั้งต้น ยอดยกมา ยอดเติมเงินเข้าในงวด ยอดเบิกจ่ายจริง คงเหลือปัจจุบัน และยอดที่ต้องเบิกชดเชยคืนเข้าวงเงินรายกระเป๋า
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="h-8 text-xs font-bold border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 rounded-xl gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                Export Excel (.csv)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                className="h-8 text-xs font-bold border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100 rounded-xl gap-1.5 cursor-pointer"
              >
                <FileText size={13} />
                Print / Export PDF Report
              </Button>
            </div>
          </div>

          {/* Executive Flow Summary Strip (Top-up vs Spent vs Replenishment Needed) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
                  1. เติมเงินจากบริษัทในงวด (+Company Top-up)
                </span>
                <span className="font-mono font-black text-base text-emerald-700">
                  +฿{kpiStats.companyTopupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-emerald-600/90 block">
                  {dashboardDetails.topupTxCount} รายการเติมเข้าฝ่ายบัญชี
                </span>
              </div>
              <ArrowDownLeft size={20} className="text-emerald-600 shrink-0" />
            </div>

            <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200/70 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 block">
                  2. โอนเติมให้หน้าร้านในงวด (Store Transfers)
                </span>
                <span className="font-mono font-black text-base text-sky-700">
                  ฿{kpiStats.transferredToStoreTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-sky-600/90 block">
                  {dashboardDetails.transferTxCount} รายการโอนวงเงินให้สาขา
                </span>
              </div>
              <ArrowLeftRight size={20} className="text-sky-600 shrink-0" />
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/70 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">
                  3. ใช้จ่ายจริงรวมในงวด (-Total Spent)
                </span>
                <span className="font-mono font-black text-base text-rose-600">
                  -฿{kpiStats.realExpenseTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-rose-600/90 block">
                  {dashboardDetails.expenseTxCount} บิล (อนุมัติแล้ว ฿{dashboardDetails.approvedExpenseTotal.toLocaleString()})
                </span>
              </div>
              <ArrowUpRight size={20} className="text-rose-600 shrink-0" />
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                  4. ต้องเบิกชดเชยเข้าวงเงิน (Replenishment Needed)
                </span>
                <span className="font-mono font-black text-base text-amber-700">
                  ฿{dashboardDetails.totalShortfallAll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-amber-700/90 block">
                  เพื่อให้ครบวงเงินรวม ฿{dashboardDetails.totalLimitAll.toLocaleString()}
                </span>
              </div>
              <Wallet size={20} className="text-amber-600 shrink-0" />
            </div>
          </div>

          {/* Custodian Summary Table */}
          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3 text-center w-9">#</th>
                  <th className="py-2.5 px-3">ผู้ถือเงินสดย่อย (Custodian)</th>
                  <th className="py-2.5 px-3">แผนก / สาขา</th>
                  <th className="py-2.5 px-3 text-right">วงเงินตั้งต้น (Quota)</th>
                  <th className="py-2.5 px-3 text-right">ยอดยกมาต้นงวด</th>
                  <th className="py-2.5 px-3 text-right text-emerald-700">เติมจากบริษัท (+)</th>
                  <th className="py-2.5 px-3 text-right text-sky-700">รับโอนจากบัญชี (+)</th>
                  <th className="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/40">รวมเติมเข้าในงวด (+)</th>
                  <th className="py-2.5 px-3 text-right text-indigo-700">โอนให้สาขา (-)</th>
                  <th className="py-2.5 px-3 text-right text-rose-700 bg-rose-50/40">ใช้จ่ายจริงในงวด (-)</th>
                  <th className="py-2.5 px-3 text-right">คงเหลือปัจจุบัน</th>
                  <th className="py-2.5 px-3 text-right text-amber-700 bg-amber-50/40">ต้องเติมเพิ่ม (Shortfall)</th>
                  {canApproveOrTopUp && <th className="py-2.5 px-3 text-center">เติมวงเงิน</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardDetails.visibleHolderSummaries.map((h, idx) => {
                  const branchName = getBranchDisplayName(h.branchId);
                  const limit = getHolderLimit(h.holderId, h.isAccounting);
                  const shortfall = Math.max(0, Math.round((limit - h.currentBalance) * 100) / 100);
                  const isSelected = holderFilter === h.holderId;

                  return (
                    <tr
                      key={h.holderId}
                      onClick={() => setHolderFilter(isSelected ? "ALL" : h.holderId)}
                      className={`transition-colors cursor-pointer ${
                        isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{h.holderName}</span>
                          {h.pendingCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9.5px] font-bold">
                              รอตรวจ {h.pendingCount} บิล
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-700">{h.department || h.roleLabel}</span>
                        <span className="text-slate-400 mx-1">•</span>
                        <span className="text-slate-500 text-[11px]">{branchName}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                        ฿{limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        ฿{h.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600">
                        {h.companyTopup > 0
                          ? `+฿${h.companyTopup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sky-600">
                        {h.transferIn > 0
                          ? `+฿${h.transferIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/30">
                        +฿{h.totalTopup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-600">
                        {h.transferOut > 0
                          ? `-฿${h.transferOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-600 bg-rose-50/30">
                        -฿{h.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-black ${
                          h.currentBalance < 0 ? "text-rose-600" : "text-slate-900"
                        }`}
                      >
                        ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-amber-700 bg-amber-50/30">
                        ฿{shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {canApproveOrTopUp && (
                        <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenCreateModal("TOPUP", {
                                id: h.holderId,
                                name: h.holderName,
                                branchId: h.branchId,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Plus size={10} /> เติมเงิน
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const list = dashboardDetails.visibleHolderSummaries;
                  const totLimit = list.reduce((s, h) => s + getHolderLimit(h.holderId, h.isAccounting), 0);
                  const totOpening = list.reduce((s, h) => s + h.openingBalance, 0);
                  const totCompTopup = list.reduce((s, h) => s + h.companyTopup, 0);
                  const totTransIn = list.reduce((s, h) => s + h.transferIn, 0);
                  const totTopup = list.reduce((s, h) => s + h.totalTopup, 0);
                  const totTransOut = list.reduce((s, h) => s + h.transferOut, 0);
                  const totExp = list.reduce((s, h) => s + h.totalExpense, 0);
                  const totBal = list.reduce((s, h) => s + h.currentBalance, 0);
                  const totShortfall = list.reduce((s, h) => {
                    const lim = getHolderLimit(h.holderId, h.isAccounting);
                    return s + Math.max(0, lim - h.currentBalance);
                  }, 0);

                  return (
                    <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-black text-slate-900">
                      <td colSpan={3} className="py-2.5 px-3 text-right">
                        รวมทั้งหมด ({list.length} กระเป๋า):
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        ฿{totLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        ฿{totOpening.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        +฿{totCompTopup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sky-700">
                        +฿{totTransIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 bg-emerald-100/50">
                        +฿{totTopup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-700">
                        -฿{totTransOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700 bg-rose-100/50">
                        -฿{totExp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                        ฿{totBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-800 bg-amber-100/50">
                        ฿{totShortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {canApproveOrTopUp && <td />}
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. CATEGORY SPEND BREAKDOWN (WHEN EXPENSES EXIST) ───────────── */}
      {dashboardDetails.categoryBreakdown.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag size={15} className="text-indigo-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Expense Breakdown by Category (สรุปยอดเบิกจ่ายแยกตามหมวดหมู่)
              </h3>
            </div>
            {categoryFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setCategoryFilter("ALL")}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Show All Categories
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {dashboardDetails.categoryBreakdown.slice(0, 8).map((item) => {
              const pct =
                kpiStats.realExpenseTotal > 0
                  ? Math.round((item.amount / kpiStats.realExpenseTotal) * 100)
                  : 0;
              const isSelectedCat = categoryFilter === item.category;
              return (
                <div
                  key={item.category}
                  onClick={() => setCategoryFilter(isSelectedCat ? "ALL" : item.category)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelectedCat
                      ? "bg-indigo-50/70 border-indigo-400"
                      : "bg-slate-50/70 border-slate-200/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800 truncate">{item.category}</span>
                    <span className="font-mono font-black text-rose-600 shrink-0">
                      ฿{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden my-1.5">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{item.count} รายการ</span>
                    <span className="font-mono font-bold">{pct}% ของค่าใช้จ่าย</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 5. UNIFIED LEDGER FILTER BAR & QUICK TABS ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Top Quick-Filter Tabs */}
        <div className="px-4 pt-3.5 pb-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "ALL", label: "ทั้งหมด (All)", count: filteredTransactions.length },
              { id: "EXPENSE", label: "เบิกจ่าย (Expenses)", count: dashboardDetails.expenseTxCount },
              { id: "TOPUP", label: "เติมเงิน (Top-ups)", count: dashboardDetails.topupTxCount },
              { id: "TRANSFER_OUT", label: "โอนวงเงิน (Transfers)", count: dashboardDetails.transferTxCount },
            ].map((tab) => {
              const active = typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black ${
                      active ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-600"
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
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                ✕ Reset Filters
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
            <span>
              Showing <strong className="font-mono text-slate-800">{filteredTransactions.length}</strong> transactions
            </span>
            {(dateFrom || dateTo) && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[10.5px] font-bold">
                📅 {dateFrom || "..."} ➔ {dateTo || "..."}
              </span>
            )}
          </div>
        </div>

        {/* 5-Column Search & Filter Controls */}
        <div className="p-3.5 border-b border-slate-100 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Tx No., description, vendor, invoice... (ค้นหา)"
                className="h-9 pl-8 text-xs rounded-xl border-slate-200"
              />
            </div>

            {/* Holder Filter */}
            {canApproveOrTopUp ? (
              <select
                value={holderFilter}
                onChange={(e) => setHolderFilter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">👤 All Holders (ผู้ถือทั้งหมด)</option>
                {holderOptions.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.roleLabel})
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-9 rounded-xl border border-slate-200 bg-slate-100/80 px-2.5 text-xs font-bold text-slate-700 flex items-center justify-between select-none">
                <span className="truncate">👤 {currentUser?.name || "My Wallet"}</span>
                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-500 shrink-0">
                  Only You (เฉพาะคุณ)
                </span>
              </div>
            )}

            {/* Branch Filter */}
            {canApproveOrTopUp ? (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">🏢 All Branches (ทุกสาขา)</option>
                <option value="HQ">Head Quarter (สำนักงานใหญ่)</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-9 rounded-xl border border-slate-200 bg-slate-100/80 px-2.5 text-xs font-medium text-slate-600 flex items-center truncate select-none">
                🏢 {getBranchDisplayName(currentUser?.branchId)}
              </div>
            )}

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">🏷️ All Categories (ทุกหมวดหมู่)</option>
              <option value="Company Top-up (รับเงินโอนจากบริษัท)">Company Top-up (รับเงินบริษัท)</option>
              <option value="Transfer to Store (โอนวงเงินให้หน้าร้าน)">Transfer to Store (โอนให้หน้าร้าน)</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">📌 All Status (ทุกสถานะ)</option>
              <option value="PENDING">⏳ Pending (รอตรวจบิล)</option>
              <option value="APPROVED">✅ Approved (อนุมัติแล้ว)</option>
              <option value="REJECTED">❌ Rejected (ปฏิเสธ/คืนยอด)</option>
              <option value="VOID">🚫 Void (ยกเลิก)</option>
            </select>
          </div>
        </div>

        {/* ── 6. TRANSACTIONS LEDGER TABLE ────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Date & Tx No. (วัน-เวลา/เลขที่)</th>
                <th className="py-3.5 px-4">Holder / Branch (ผู้ถือ/สาขา)</th>
                <th className="py-3.5 px-4">Type / Category (ประเภท/หมวดหมู่)</th>
                <th className="py-3.5 px-4">Description / Vendor (รายละเอียด)</th>
                <th className="py-3.5 px-4 text-center">Attachments (ใบเสร็จ/สลิป)</th>
                <th className="py-3.5 px-4 text-right">Amount (จำนวนเงิน)</th>
                <th className="py-3.5 px-4 text-right">Balance (คงเหลือ)</th>
                <th className="py-3.5 px-4 text-center">Status (สถานะ)</th>
                <th className="py-3.5 px-4 text-right">Actions (จัดการ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2.5 text-indigo-500" />
                    <span className="font-semibold">Loading petty cash ledger... (กำลังโหลดข้อมูลรายการเงินสดย่อย)</span>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No petty cash transactions found (ยังไม่มีรายการเงินสดย่อย)
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isCredit = tx.direction === "CREDIT";
                  const isRejectedOrVoid = tx.status === "REJECTED" || tx.status === "VOID";
                  const branchName = getBranchDisplayName(tx.branchId);
                  const totalDocs = (tx.receiptUrls?.length || 0) + (tx.slipUrls?.length || 0);

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isRejectedOrVoid ? "opacity-55 bg-slate-50/40" : ""
                      }`}
                    >
                      {/* Date & Tx Number */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {format(new Date(tx.transactionDate), "dd/MM/yyyy HH:mm")}
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.2 rounded inline-block mt-0.5">
                          {tx.txNumber || tx.id.slice(0, 8)}
                        </div>
                      </td>

                      {/* Holder & Branch */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{tx.holderName}</div>
                        <div className="text-[10.5px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 size={10} className="text-slate-400" />
                          <span>{branchName}</span>
                        </div>
                      </td>

                      {/* Type & Category */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            className={`text-[9.5px] font-bold px-1.5 py-0 border ${
                              tx.type === "TRANSFER_OUT"
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : tx.type === "TRANSFER_IN"
                                  ? "bg-sky-50 text-sky-700 border-sky-200"
                                  : isCredit
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            {tx.type === "TOPUP"
                              ? "Company Top-up (รับเงินบริษัท)"
                              : tx.type === "TRANSFER_OUT"
                                ? `Transfer Out (โอนให้ ➔ ${tx.counterpartyName || tx.vendorName || ""})`
                                : tx.type === "TRANSFER_IN"
                                  ? `Transfer In (รับโอนจาก ⬅ ${tx.counterpartyName || tx.vendorName || ""})`
                                  : tx.type === "RETURN"
                                    ? "Return (คืนเงิน)"
                                    : "Expense (เบิกจ่าย)"}
                          </Badge>
                          {tx.paymentMethod && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                              {tx.paymentMethod}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-slate-700 mt-1">{tx.category}</div>
                      </td>

                      {/* Description / Vendor / Invoice */}
                      <td className="py-3.5 px-4 max-w-[280px]">
                        <div className="font-medium text-slate-900 break-words">{tx.description}</div>
                        {(tx.vehiclePlate || tx.vendorName || tx.invoiceNo) && (
                          <div className="text-[10.5px] text-slate-500 mt-1 flex flex-wrap gap-1.5">
                            {tx.vehiclePlate && (
                              <span className="bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-amber-800 font-bold">
                                🚗 ทะเบียน: {tx.vehiclePlate}
                              </span>
                            )}
                            {tx.vendorName && (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">
                                🏪 {tx.vendorName}
                              </span>
                            )}
                            {tx.invoiceNo && (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">
                                🧾 #{tx.invoiceNo}
                              </span>
                            )}
                          </div>
                        )}
                        {tx.rejectReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-1 bg-rose-50 px-2 py-1 rounded border border-rose-200 flex flex-wrap items-center justify-between gap-1.5">
                            <span>
                              Reason (เหตุผล): {tx.rejectReason.replace(/\s*\[Task:\s*[^\]]+\]/gi, "")}
                            </span>
                            {/\[Task:\s*([^\]]+)\]/i.test(tx.rejectReason) && (
                              <a
                                href="#tasks"
                                onClick={() => {
                                  window.location.hash = "tasks";
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9.5px] font-bold hover:bg-rose-700 transition-colors"
                                title="คลิกเพื่อไปยังหน้า Tasks"
                              >
                                📋 Task Opened (เปิด Task แล้ว)
                              </a>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Attachments (Receipts / Documents / Slips) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {totalDocs > 0 ? (
                          <button
                            type="button"
                            onClick={() => setPreviewTx(tx)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-bold transition-colors cursor-pointer"
                          >
                            <FileText size={12} />
                            <span>
                              Receipt ({tx.receiptUrls?.length || 0}) / Slip ({tx.slipUrls?.length || 0})
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-semibold cursor-pointer"
                          >
                            <Upload size={11} />
                            <span>Attach (แนบไฟล์)</span>
                          </button>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-black text-sm ${
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

                      {/* Running Balance After */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-800">
                          ฿
                          {tx.balanceAfter.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-[9.5px] font-mono text-slate-400">
                          จาก ฿{tx.balanceBefore.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {tx.status === "APPROVED" ? (
                          <div className="inline-flex flex-col items-center">
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9.5px] font-bold gap-1">
                              <CheckCircle2 size={10} /> Approved (อนุมัติแล้ว)
                            </Badge>
                            {tx.approvedByName && (
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                by {tx.approvedByName}
                              </span>
                            )}
                          </div>
                        ) : tx.status === "PENDING" ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[9.5px] font-bold gap-1">
                            <Clock size={10} /> Pending (รอตรวจบิล)
                          </Badge>
                        ) : tx.status === "REJECTED" ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[9.5px] font-bold gap-1">
                            <XCircle size={10} /> Rejected (คืนยอด)
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-200 text-slate-700 border-slate-300 text-[9.5px] font-bold">
                            Void (ยกเลิก)
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canApproveOrTopUp && tx.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={isReviewing}
                                onClick={() => handleQuickApprove(tx)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
                                title="อนุมัติรายการ"
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
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer"
                                title="ปฏิเสธและคืนยอดเงิน"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(tx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="แก้ไขรายการ / แนบใบเสร็จหรือสลิปเพิ่ม"
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
                              title="ยกเลิกรายการ (Void)"
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

      {/* ── CREATE / EDIT TRANSACTION MODAL ───────────────────────── */}
      <Dialog open={txModalOpen} onOpenChange={setTxModalOpen}>
        <DialogContent className={`${txMode === "TOPUP" && !editingTx ? "max-w-lg" : "max-w-xl"} bg-white rounded-2xl max-h-[92vh] overflow-y-auto`}>
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

                    {/* Remark & Attach Transfer Slip (Optional) */}
                    <div className="grid grid-cols-12 items-center gap-3 pt-1">
                      <label className="col-span-4 text-xs font-bold text-slate-600">Remark / Slip:</label>
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
                          className="h-9 px-2.5 text-xs font-bold rounded-md shrink-0 cursor-pointer gap-1"
                        >
                          {isUploadingSlips ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                          Slip ({formSlipUrls.length})
                        </Button>
                      </div>
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

            {/* Row 6: Upload Documents / Receipts & Transfer Slips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Box 1: Receipt / Invoice Documents */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Receipt size={13} className="text-amber-600" />
                    Receipts / Docs (ใบเสร็จ: {formReceiptUrls.length})
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
                    onClick={() => receiptInputRef.current?.click()}
                    className="h-7 px-2.5 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1"
                  >
                    {isUploadingReceipts ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    Upload (อัปโหลดใบเสร็จ)
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Images (.jpg, .png) & Documents (.pdf, .xlsx, .docx)
                </p>

                {formReceiptUrls.length > 0 && (
                  <div className="space-y-1.5 pt-1 max-h-32 overflow-y-auto">
                    {formReceiptUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-[10.5px]"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-indigo-600 hover:underline truncate"
                        >
                          {isPdfOrDocUrl(url) ? <FileText size={13} /> : <ImageIcon size={13} />}
                          <span className="truncate">{getFileDisplayName(url, idx)}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setFormReceiptUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Box 2: Transfer Slips */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Banknote size={13} className="text-emerald-600" />
                    Transfer Slips (สลิปโอนเงิน: {formSlipUrls.length})
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
                    onClick={() => slipInputRef.current?.click()}
                    className="h-7 px-2.5 text-[10.5px] font-bold rounded-lg bg-white cursor-pointer gap-1"
                  >
                    {isUploadingSlips ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    Upload Slip (แนบสลิป)
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Attach bank transfer or PromptPay slip (แนบรูปสลิปเงินโอน)
                </p>

                {formSlipUrls.length > 0 && (
                  <div className="space-y-1.5 pt-1 max-h-32 overflow-y-auto">
                    {formSlipUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-[10.5px]"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-emerald-700 hover:underline truncate"
                        >
                          {isPdfOrDocUrl(url) ? <FileText size={13} /> : <ImageIcon size={13} />}
                          <span className="truncate">{getFileDisplayName(url, idx)}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setFormSlipUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
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
        <DialogContent className="max-w-md bg-white rounded-2xl">
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
        <DialogContent className="max-w-md bg-white rounded-2xl">
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
        <DialogContent className="max-w-2xl bg-white rounded-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="space-y-2">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Receipt size={14} className="text-amber-600" />
                  Receipts / Documents (ใบเสร็จรับเงิน: {previewTx.receiptUrls?.length || 0})
                </h3>
                {!previewTx.receiptUrls || previewTx.receiptUrls.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No receipt files attached (ไม่มีไฟล์ใบเสร็จแนบ)</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewTx.receiptUrls.map((url, idx) =>
                      isPdfOrDocUrl(url) ? (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-xs font-bold text-indigo-700"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <FileText size={16} />
                            <span className="truncate">{getFileDisplayName(url, idx)}</span>
                          </span>
                          <ExternalLink size={14} className="shrink-0" />
                        </a>
                      ) : (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group relative"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Receipt ${idx + 1}`}
                            className="w-full h-56 object-contain bg-white"
                          />
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Transfer Slips Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Banknote size={14} className="text-emerald-600" />
                  Transfer Slips (รูปสลิปโอนเงิน: {previewTx.slipUrls?.length || 0})
                </h3>
                {!previewTx.slipUrls || previewTx.slipUrls.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No transfer slips attached (ไม่มีรูปสลิปเงินโอนแนบ)</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewTx.slipUrls.map((url, idx) =>
                      isPdfOrDocUrl(url) ? (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 text-xs font-bold text-emerald-700"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <FileText size={16} />
                            <span className="truncate">{getFileDisplayName(url, idx)}</span>
                          </span>
                          <ExternalLink size={14} className="shrink-0" />
                        </a>
                      ) : (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Slip ${idx + 1}`}
                            className="w-full h-56 object-contain bg-white"
                          />
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
