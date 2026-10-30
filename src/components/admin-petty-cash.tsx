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
} from "@/actions/db";
import { shopStore } from "@/lib/store";
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [holderFilter, setHolderFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>(selectedBranchId || "ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

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
    const unsubShops = shopStore.subscribe(() => setShops(shopStore.getSnapshot() || []));
    return () => {
      unsubShops();
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
      { id: string; name: string; roleLabel: string; branchId?: string | null; isAccounting: boolean }
    >();
    if (currentUser?.id) {
      map.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name || currentUser.email || "Current User",
        roleLabel: (currentUser.role || "staff").toUpperCase(),
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

  // Per-Holder Balances (computed immediately from all non-rejected/non-void transactions + authorized holders!)
  const holderSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        holderId: string;
        holderName: string;
        roleLabel: string;
        isAccounting: boolean;
        branchId?: string | null;
        companyTopup: number;
        transferIn: number;
        transferOut: number;
        totalTopup: number;
        totalExpense: number;
        currentBalance: number;
        pendingCount: number;
        pendingAmount: number;
        txCount: number;
      }
    >();

    // Seed all authorized Petty Cash holders so Accounting & Store wallets are visible immediately
    holderOptions.forEach((h) => {
      map.set(h.id, {
        holderId: h.id,
        holderName: h.name,
        roleLabel: h.roleLabel,
        isAccounting: h.isAccounting,
        branchId: h.branchId || "HQ",
        companyTopup: 0,
        transferIn: 0,
        transferOut: 0,
        totalTopup: 0,
        totalExpense: 0,
        currentBalance: 0,
        pendingCount: 0,
        pendingAmount: 0,
        txCount: 0,
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
          isAccounting: matchedOpt?.isAccounting ?? false,
          branchId: t.branchId || "HQ",
          companyTopup: 0,
          transferIn: 0,
          transferOut: 0,
          totalTopup: 0,
          totalExpense: 0,
          currentBalance: 0,
          pendingCount: 0,
          pendingAmount: 0,
          txCount: 0,
        };
        map.set(t.holderId, entry);
      }
      entry.txCount += 1;
      if (t.status === "REJECTED" || t.status === "VOID") return;

      const amt = Number(t.amount) || 0;
      if (t.direction === "CREDIT") {
        entry.totalTopup = Math.round((entry.totalTopup + amt) * 100) / 100;
        entry.currentBalance = Math.round((entry.currentBalance + amt) * 100) / 100;
        if (t.type === "TRANSFER_IN") {
          entry.transferIn = Math.round((entry.transferIn + amt) * 100) / 100;
        } else {
          entry.companyTopup = Math.round((entry.companyTopup + amt) * 100) / 100;
        }
      } else {
        entry.currentBalance = Math.round((entry.currentBalance - amt) * 100) / 100;
        if (t.type === "TRANSFER_OUT") {
          entry.transferOut = Math.round((entry.transferOut + amt) * 100) / 100;
        } else {
          entry.totalExpense = Math.round((entry.totalExpense + amt) * 100) / 100;
        }
      }

      if (t.status === "PENDING") {
        entry.pendingCount += 1;
        entry.pendingAmount = Math.round((entry.pendingAmount + amt) * 100) / 100;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.currentBalance - a.currentBalance);
  }, [transactions, holderOptions]);

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
          (t.invoiceNo || "").toLowerCase().includes(q);
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

  // Open Create Modal — Sender/Holder is always fixed to the logged-in user (currentUser)
  const handleOpenCreateModal = (
    mode: "EXPENSE" | "TOPUP" | "TRANSFER" | "RETURN",
    presetRecipient?: { id: string; name: string; branchId?: string | null }
  ) => {
    setEditingTx(null);
    setTxMode(mode);
    const fixedHolderId = currentUser?.id || "";
    const fixedHolderName = currentUser?.name || currentUser?.email || "Current User";
    const fixedBranchId =
      currentUser?.branchId || (branchFilter !== "ALL" ? branchFilter : "HQ");

    setFormHolderId(fixedHolderId);
    setFormHolderName(fixedHolderName);
    setFormBranchId(fixedBranchId);

    const defaultRecipient = presetRecipient || transferRecipientOptions[0] || null;
    setFormTargetHolderId(defaultRecipient?.id || "");
    setFormTargetHolderName(defaultRecipient?.name || "");
    setFormTargetBranchId(defaultRecipient?.branchId || "HQ");

    setFormCategory(
      mode === "TOPUP"
        ? "Company Top-up (รับเงินโอนจากบริษัท)"
        : mode === "TRANSFER"
          ? "Transfer to Store (โอนวงเงินให้หน้าร้าน)"
          : mode === "RETURN"
            ? "Return Petty Cash (คืนเงินสดย่อย)"
            : categories[0] || "Store Misc (ค่าใช้จ่ายหน้าร้าน/เบ็ดเตล็ด)"
    );
    setFormAmount("");
    setFormDescription("");
    setFormVendorName("");
    setFormInvoiceNo("");
    setFormPaymentMethod(mode === "TOPUP" || mode === "TRANSFER" ? "Transfer" : "Cash");
    setFormDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setFormReceiptUrls([]);
    setFormSlipUrls([]);
    setShowQuickAddCategory(false);
    setNewQuickCategory("");
    setTxModalOpen(true);
  };

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
    setFormPaymentMethod(tx.paymentMethod || "Cash");
    setFormDate(format(new Date(tx.transactionDate), "yyyy-MM-dd'T'HH:mm"));
    setFormReceiptUrls(Array.isArray(tx.receiptUrls) ? [...tx.receiptUrls] : []);
    setFormSlipUrls(Array.isArray(tx.slipUrls) ? [...tx.slipUrls] : []);
    setShowQuickAddCategory(false);
    setNewQuickCategory("");
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

    if (!editingTx && txMode === "TRANSFER") {
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
        const res = await createPettyCashTransactionAction({
          type: txMode,
          amount: amt,
          holderId: formHolderId,
          holderName: formHolderName,
          branchId: formBranchId || null,
          category: formCategory.trim(),
          description: formDescription.trim(),
          vendorName: formVendorName.trim() || null,
          invoiceNo: formInvoiceNo.trim() || null,
          paymentMethod: formPaymentMethod,
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
            ? `รับเงินโอนจากบริษัท +฿${amt.toLocaleString()} เข้ากระเป๋า ${formHolderName} สำเร็จ`
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
            ? "ปฏิเสธรายการและคืนยอดเงินสดย่อยกลับเข้าคงเหลือเรียบร้อยแล้ว"
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

  // Export CSV
  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) {
      toast.error("ไม่มีรายการสำหรับ Export");
      return;
    }
    const headers = [
      "Tx No.",
      "Date",
      "Holder (ผู้ถือเงินสดย่อย)",
      "Branch",
      "Type",
      "Category",
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
      [headers, ...rows]
        .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petty-cash-export-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* ── HEADER & PRIMARY ACTIONS ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Wallet size={19} />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                Petty Cash Management (ระบบเงินสดย่อย)
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                  Auto-Deduct (ตัดยอดทันที)
                </Badge>
              </h1>
              <p className="text-xs text-slate-500">
                Individual petty cash wallets, expense tracking, receipt & slip attachments (บริหารวงเงินสดย่อยรายบุคคลและแนบใบเสร็จ/สลิป)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            <Settings2 size={14} className="text-slate-500" />
            Categories (หมวดหมู่: {categories.length})
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-9 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl gap-1.5 cursor-pointer"
          >
            <Download size={14} className="text-slate-500" />
            Export CSV (ส่งออกไฟล์)
          </Button>

          {canApproveOrTopUp && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenCreateModal("TOPUP")}
                className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-sm cursor-pointer"
              >
                <ArrowDownLeft size={14} />
                + Company Top-up (รับเงินบริษัท)
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenCreateModal("TRANSFER")}
                className="h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1.5 shadow-sm cursor-pointer"
              >
                <ArrowLeftRight size={14} />
                ⇄ Transfer to Store (โอนให้หน้าร้าน)
              </Button>
            </>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => handleOpenCreateModal("EXPENSE")}
            className="h-9 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl gap-1.5 shadow-sm cursor-pointer"
          >
            <ArrowUpRight size={14} />
            - Record Expense (บันทึกเบิกจ่าย)
          </Button>
        </div>
      </div>

      {/* ── KPI CARDS (ACCOUNTING VIEW vs PERSONAL STORE VIEW) ────── */}
      {canApproveOrTopUp ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Balance (คงเหลือรวม)
              </span>
              <div
                className={`text-2xl font-black font-mono mt-1 ${
                  kpiStats.netBalance < 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                ฿{kpiStats.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500">
                {holderFilter === "ALL" ? "All Wallets (รวมบัญชี + หน้าร้าน)" : "Selected Holder (เฉพาะผู้ถือที่เลือก)"}
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet size={22} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Accounting Pool (คงเหลือฝ่ายบัญชี)
              </span>
              <div className="text-2xl font-black font-mono text-emerald-600 mt-1">
                ฿{kpiStats.accountingPoolBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500">
                Company Top-up (รับจากบริษัท): +฿{kpiStats.companyTopupTotal.toLocaleString()}
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft size={22} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Store Wallets (คงเหลือหน้าร้าน)
              </span>
              <div className="text-2xl font-black font-mono text-indigo-600 mt-1">
                ฿{kpiStats.storePoolBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500">
                Transferred (โอนให้ร้านสะสม): ฿{kpiStats.transferredToStoreTotal.toLocaleString()}
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowLeftRight size={22} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Expenses (เบิกจ่ายจริง)
              </span>
              <div className="text-2xl font-black font-mono text-rose-600 mt-1">
                -฿{kpiStats.realExpenseTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-amber-600 font-bold">
                ⏳ Pending (รอตรวจบิล): {kpiStats.pendingCount} items (฿{kpiStats.pendingAmount.toLocaleString()})
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-indigo-200/90 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
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

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
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

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
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

      {/* ── 2-TIER CUSTODIAN CARDS (เฉพาะฝ่ายบัญชี / Admin เท่านั้นที่เห็นทุกคน) ─── */}
      {canApproveOrTopUp && holderSummaries.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User size={15} className="text-indigo-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
                2-Tier Custodian Wallets (กระเป๋าเงินสดย่อย: บริษัท ➔ บัญชี ➔ หน้าร้าน)
              </h2>
            </div>
            {holderFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setHolderFilter("ALL")}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Show All (แสดงทุกคน)
              </button>
            )}
          </div>

          {/* Tier 1: Accounting Staff Wallets (Multiple Accounting Staff Supported) */}
          {accountingCustodians.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                  💼 Tier 1: Accounting Custodians (แผนกบัญชี {accountingCustodians.length} คน — รับเงินบริษัท & โอนให้หน้าร้าน)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {accountingCustodians.map((h) => {
                  const isSelected = holderFilter === h.holderId;
                  const branchName = getBranchDisplayName(h.branchId);
                  return (
                    <div
                      key={h.holderId}
                      onClick={() => setHolderFilter(isSelected ? "ALL" : h.holderId)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/15"
                          : "bg-emerald-50/25 border-emerald-200/80 hover:border-emerald-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                            <span className="truncate">{h.holderName}</span>
                            {h.holderId === currentUser?.id && (
                              <Badge className="bg-indigo-600 text-white text-[8.5px] px-1.5 py-0">You (คุณ)</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {h.roleLabel} • {branchName}
                          </div>
                        </div>
                        <span
                          className={`font-mono font-black text-sm shrink-0 ${
                            h.currentBalance < 0 ? "text-rose-600" : "text-emerald-700"
                          }`}
                        >
                          ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-emerald-200/60 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-600">
                        <span>
                          Top-up (รับ): <strong className="text-emerald-700">+฿{h.companyTopup.toLocaleString()}</strong> • Transfer (โอน):{" "}
                          <strong className="text-indigo-700">-฿{h.transferOut.toLocaleString()}</strong> • Spent (จ่าย):{" "}
                          <strong className="text-rose-600">-฿{h.totalExpense.toLocaleString()}</strong>
                        </span>
                        {canApproveOrTopUp && h.holderId === currentUser?.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCreateModal("TOPUP");
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-[9.5px] cursor-pointer"
                          >
                            + Top-up (รับเงิน)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tier 2: Store / Branch Staff Wallets */}
          {storeCustodians.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  🏪 Tier 2: Store Custodians (พนักงานหน้าร้าน {storeCustodians.length} คน — รับโอนจากบัญชี & เบิกจ่าย)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {storeCustodians.map((h) => {
                  const isSelected = holderFilter === h.holderId;
                  const branchName = getBranchDisplayName(h.branchId);
                  return (
                    <div
                      key={h.holderId}
                      onClick={() => setHolderFilter(isSelected ? "ALL" : h.holderId)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/15"
                          : "bg-slate-50/60 border-slate-200/80 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                            <span className="truncate">{h.holderName}</span>
                            {h.holderId === currentUser?.id && (
                              <Badge className="bg-indigo-600 text-white text-[8.5px] px-1.5 py-0">You (คุณ)</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {h.roleLabel} • {branchName}
                          </div>
                        </div>
                        <span
                          className={`font-mono font-black text-sm shrink-0 ${
                            h.currentBalance < 0 ? "text-rose-600" : "text-indigo-700"
                          }`}
                        >
                          ฿{h.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          Received (รับโอน): <strong className="text-emerald-600">+฿{h.totalTopup.toLocaleString()}</strong> • Spent (จ่าย):{" "}
                          <strong className="text-rose-600">-฿{h.totalExpense.toLocaleString()}</strong>
                        </span>
                        {canApproveOrTopUp && h.holderId !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCreateModal("TRANSFER", {
                                id: h.holderId,
                                name: h.holderName,
                                branchId: h.branchId,
                              });
                            }}
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-[9.5px] cursor-pointer"
                          >
                            ⇄ Transfer (โอนให้)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FILTERS BAR ───────────────────────────────────────────── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
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

          {/* Holder Filter (Locked to self if not Accounting/Admin) */}
          {canApproveOrTopUp ? (
            <select
              value={holderFilter}
              onChange={(e) => setHolderFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
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
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
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
            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
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
            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
          >
            <option value="ALL">📌 All Status (ทุกสถานะ)</option>
            <option value="PENDING">⏳ Pending (รอตรวจบิล)</option>
            <option value="APPROVED">✅ Approved (อนุมัติแล้ว)</option>
            <option value="REJECTED">❌ Rejected (ปฏิเสธ/คืนยอด)</option>
            <option value="VOID">🚫 Void (ยกเลิก)</option>
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-[11px] rounded-xl border-slate-200 px-2"
              title="From Date (ตั้งแต่วันที่)"
            />
            <span className="text-slate-400 text-xs">-</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-[11px] rounded-xl border-slate-200 px-2"
              title="To Date (ถึงวันที่)"
            />
          </div>
        </div>
      </div>

      {/* ── TRANSACTIONS TABLE ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3.5">Date & Tx No. (วัน-เวลา/เลขที่)</th>
                <th className="py-3 px-3.5">Holder / Branch (ผู้ถือ/สาขา)</th>
                <th className="py-3 px-3.5">Type / Category (ประเภท/หมวดหมู่)</th>
                <th className="py-3 px-3.5">Description / Vendor (รายละเอียด)</th>
                <th className="py-3 px-3.5 text-center">Attachments (ใบเสร็จ/สลิป)</th>
                <th className="py-3 px-3.5 text-right">Amount (จำนวนเงิน)</th>
                <th className="py-3 px-3.5 text-right">Balance (คงเหลือ)</th>
                <th className="py-3 px-3.5 text-center">Status (สถานะ)</th>
                <th className="py-3 px-3.5 text-right">Actions (จัดการ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Loader2 size={22} className="animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading petty cash transactions... (กำลังโหลดข้อมูล)
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
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
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {format(new Date(tx.transactionDate), "dd/MM/yyyy HH:mm")}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {tx.txNumber || tx.id.slice(0, 8)}
                        </div>
                      </td>

                      {/* Holder & Branch */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-900">{tx.holderName}</div>
                        <div className="text-[10.5px] text-slate-500 flex items-center gap-1">
                          <Building2 size={10} />
                          <span>{branchName}</span>
                        </div>
                      </td>

                      {/* Type & Category */}
                      <td className="py-3 px-3.5">
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
                            <span className="text-[10px] text-slate-400 font-medium">
                              • {tx.paymentMethod}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-slate-700 mt-0.5">{tx.category}</div>
                      </td>

                      {/* Description / Vendor / Invoice */}
                      <td className="py-3 px-3.5 max-w-[260px]">
                        <div className="font-medium text-slate-900 break-words">{tx.description}</div>
                        {(tx.vendorName || tx.invoiceNo) && (
                          <div className="text-[10.5px] text-slate-500 mt-0.5 flex flex-wrap gap-2">
                            {tx.vendorName && <span>🏪 Vendor (ร้านค้า): {tx.vendorName}</span>}
                            {tx.invoiceNo && <span className="font-mono">🧾 Inv (เลขบิล): #{tx.invoiceNo}</span>}
                          </div>
                        )}
                        {tx.rejectReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            Reason (เหตุผล): {tx.rejectReason}
                          </div>
                        )}
                      </td>

                      {/* Attachments (Receipts / Documents / Slips) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-medium cursor-pointer"
                          >
                            <Upload size={11} />
                            <span>Attach (แนบไฟล์)</span>
                          </button>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
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
                      <td className="py-3 px-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-800">
                        ฿
                        {tx.balanceAfter.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
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
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canApproveOrTopUp && tx.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={isReviewing}
                                onClick={() => handleQuickApprove(tx)}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
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
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer"
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
        <DialogContent className="max-w-xl bg-white rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              {txMode === "TOPUP" ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                    <ArrowDownLeft size={16} />
                  </div>
                  <span>{editingTx ? "Edit Company Top-up (แก้ไขรายการรับเงินบริษัท)" : "Tier 1: Company Top-up (รับเงินโอนจากบริษัท)"}</span>
                </>
              ) : txMode === "TRANSFER" ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                    <ArrowLeftRight size={16} />
                  </div>
                  <span>{editingTx ? "Edit Store Transfer (แก้ไขรายการโอนให้หน้าร้าน)" : "Tier 2: Transfer to Store (โอนเงินต่อให้หน้าร้าน)"}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                    <ArrowUpRight size={16} />
                  </div>
                  <span>{editingTx ? "Edit Expense (แก้ไขรายการเบิกจ่าย)" : "Record Petty Cash Expense (บันทึกเบิกจ่าย-ตัดยอดทันที)"}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {txMode === "TOPUP"
                ? "Record petty cash received from the company into your accounting wallet (บันทึกยอดโอนจากบริษัทเข้ากระเป๋าบัญชีของคุณ)"
                : txMode === "TRANSFER"
                  ? "Deducts from your accounting wallet and credits the recipient's store wallet automatically (หักยอดจากบัญชีและเพิ่มเข้ากระเป๋าหน้าร้านอัตโนมัติ)"
                  : "Deducts from your wallet balance immediately upon submission (ตัดยอดออกจากคงเหลือของคุณทันที พร้อมแนบใบเสร็จ/สลิป)"}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switcher when creating new */}
          {!editingTx && (
            <div className={`grid ${canApproveOrTopUp ? "grid-cols-3" : "grid-cols-1"} gap-1.5 p-1 bg-slate-100 rounded-xl`}>
              <button
                type="button"
                onClick={() => {
                  setTxMode("EXPENSE");
                  setFormCategory(categories[0] || "Store Misc (ค่าใช้จ่ายหน้าร้าน/เบ็ดเตล็ด)");
                  setFormPaymentMethod("Cash");
                }}
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  txMode === "EXPENSE"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                - Expense (เบิกจ่าย)
              </button>
              {canApproveOrTopUp && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTxMode("TRANSFER");
                      setFormCategory("Transfer to Store (โอนวงเงินให้หน้าร้าน)");
                      setFormPaymentMethod("Transfer");
                      if (!formTargetHolderId && transferRecipientOptions[0]) {
                        setFormTargetHolderId(transferRecipientOptions[0].id);
                        setFormTargetHolderName(transferRecipientOptions[0].name);
                        setFormTargetBranchId(transferRecipientOptions[0].branchId || "HQ");
                      }
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      txMode === "TRANSFER"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    ⇄ Transfer (โอนให้หน้าร้าน)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxMode("TOPUP");
                      setFormCategory("Company Top-up (รับเงินโอนจากบริษัท)");
                      setFormPaymentMethod("Transfer");
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      txMode === "TOPUP"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    + Top-up (รับเงินบริษัท)
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-3.5 py-1 text-xs">
            {/* Row 1: Fixed Logged-in User (Sender / Holder) & Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    {txMode === "TRANSFER"
                      ? "From Accounting (ผู้โอนต้นทาง)"
                      : txMode === "TOPUP"
                        ? "Recipient (ผู้รับเงินจากบริษัท)"
                        : "Petty Cash Holder (ผู้ถือเงินสดย่อย)"}{" "}
                    <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">
                    Bal (คงเหลือ): ฿{currentUserBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </Label>
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
                <Label className="text-[11px] font-bold text-slate-700">Date & Time (วัน-เวลา)</Label>
                <Input
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
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
                {txMode === "EXPENSE" && (
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
                      : "e.g. Fabric softener 3 gallons, expressway toll (ซื้อน้ำยาปรับผ้านุ่ม, ค่าทางด่วน)..."
                }
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {/* Row 5: Vendor & Invoice No. (for Expenses) */}
            {txMode === "EXPENSE" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">
                    Vendor / Payee (ชื่อร้านค้า / ผู้รับเงิน)
                  </Label>
                  <Input
                    value={formVendorName}
                    onChange={(e) => setFormVendorName(e.target.value)}
                    placeholder="e.g. Makro, Lotus, PTT (ชื่อร้านค้า)..."
                    className="h-8 rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">
                    Invoice / Receipt No. (เลขที่ใบเสร็จ / เลขบิล)
                  </Label>
                  <Input
                    value={formInvoiceNo}
                    onChange={(e) => setFormInvoiceNo(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    className="h-8 rounded-xl text-xs font-mono"
                  />
                </div>
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
              The amount will be automatically restored to the holder&apos;s balance (ระบบจะปรับคืนยอดเงินกลับเข้ากระเป๋าของผู้ถืออัตโนมัติ)
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
