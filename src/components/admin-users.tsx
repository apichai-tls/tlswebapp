"use client";

import { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  User,
  Users,
  ShieldCheck,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  UserX,
  UserCheck,
  Building2,
  Tag,
  Lock,
  Loader2,
  Search,
  LayoutGrid,
  List,
  Layers,
  Crown,
  Mail,
  KeyRound,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getUsers, createUser, updateUser, deleteUser } from "@/actions/users";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  type DepartmentItem,
} from "@/actions/departments";
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  type RoleItem,
} from "@/actions/roles";
import { useAuth } from "@/providers/auth-provider";
import { shopStore } from "@/lib/store";
import { BranchFilterDropdown, getUserAssignedBranchIds, UserBranchBadge } from "@/components/branch-filter-dropdown";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
  isDepartmentHead?: boolean;
  password?: string;
  permissions: string;
  area?: string | null;
  branchId?: string | null;
  isActive?: boolean;
}

export const COLOR_CONFIG: Record<
  string,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    topBorderClass: string;
    avatarClass: string;
    softBgClass: string;
  }
> = {
  indigo: {
    label: "Indigo",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
    dotClass: "bg-indigo-500",
    topBorderClass: "border-t-indigo-500",
    avatarClass: "bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-indigo-200",
    softBgClass: "bg-indigo-50/60 border-indigo-100",
  },
  sky: {
    label: "Sky Blue",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    dotClass: "bg-sky-500",
    topBorderClass: "border-t-sky-500",
    avatarClass: "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sky-200",
    softBgClass: "bg-sky-50/60 border-sky-100",
  },
  emerald: {
    label: "Emerald",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
    topBorderClass: "border-t-emerald-500",
    avatarClass: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-200",
    softBgClass: "bg-emerald-50/60 border-emerald-100",
  },
  amber: {
    label: "Amber",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
    topBorderClass: "border-t-amber-500",
    avatarClass: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-200",
    softBgClass: "bg-amber-50/60 border-amber-100",
  },
  rose: {
    label: "Rose",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
    dotClass: "bg-rose-500",
    topBorderClass: "border-t-rose-500",
    avatarClass: "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-rose-200",
    softBgClass: "bg-rose-50/60 border-rose-100",
  },
  purple: {
    label: "Purple",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
    dotClass: "bg-purple-500",
    topBorderClass: "border-t-purple-500",
    avatarClass: "bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-purple-200",
    softBgClass: "bg-purple-50/60 border-purple-100",
  },
  teal: {
    label: "Teal",
    badgeClass: "bg-teal-100 text-teal-800 border-teal-200",
    dotClass: "bg-teal-500",
    topBorderClass: "border-t-teal-500",
    avatarClass: "bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-teal-200",
    softBgClass: "bg-teal-50/60 border-teal-100",
  },
  slate: {
    label: "Slate",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-500",
    topBorderClass: "border-t-slate-400",
    avatarClass: "bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-slate-200",
    softBgClass: "bg-slate-50/80 border-slate-200",
  },
};

export function getBadgeClass(color?: string) {
  return COLOR_CONFIG[color || "slate"]?.badgeClass || COLOR_CONFIG.slate.badgeClass;
}

export function getColorConfig(color?: string) {
  return COLOR_CONFIG[color || "slate"] || COLOR_CONFIG.slate;
}

function getInitials(name?: string) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const MENU_PERMISSIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pos", label: "POS" },
  { id: "services", label: "Service Settings" },
  { id: "jobs", label: "All Jobs" },
  { id: "customers", label: "Customers (CRM)" },
  { id: "dispatch", label: "Dispatch Schedule" },
  { id: "billing", label: "Billing Photo Upload" },
  { id: "riders", label: "Riders" },
  { id: "map", label: "Live Map" },
  { id: "calculator", label: "Distance Calculator" },
  { id: "petty-cash", label: "Petty Cash (เงินสดย่อย)" },
  { id: "reports", label: "Reports & Analytics" },
  { id: "marketing", label: "Marketing & Analytics" },
  { id: "activity-logs", label: "Activity Logs" },
  { id: "settings", label: "Settings" },
  { id: "users", label: "Manage Users" },
];

export const ACTION_PERMISSIONS = [
  {
    id: "adjust-wallet",
    label: "Adjust Wallet Balance",
    shortLabel: "Adjust Wallet",
    icon: "⚡",
    badgeClass: "text-amber-800 bg-amber-100/90 border-amber-300",
    labelTh: "ปรับยอดเงินใน Wallet ลูกค้า",
    description: "สิทธิ์ในการเพิ่มหรือหักลดเงิน Wallet ลูกค้าแบบ Manual (สำหรับแก้ไขเคสหรือชดเชย)",
  },
  {
    id: "approve-wallet",
    label: "Approve Wallet Transactions",
    shortLabel: "Approve Wallet",
    icon: "✅",
    badgeClass: "text-emerald-800 bg-emerald-100/90 border-emerald-300",
    labelTh: "อนุมัติรายการ Wallet",
    description: "สิทธิ์ในการ Approve / Reject รายการ Wallet ของลูกค้า Member",
  },
  {
    id: "refund-job",
    label: "Refund & Correct Jobs",
    shortLabel: "Refund Job",
    icon: "↩️",
    badgeClass: "text-rose-800 bg-rose-100/90 border-rose-300",
    labelTh: "Refund & แก้ไขยอด Job",
    description: "สิทธิ์ในการ Refund และแก้ไขยอดชำระเงินของ Job ที่ชำระแล้ว",
  },
  {
    id: "cso",
    label: "CSO",
    shortLabel: "CSO",
    icon: "💼",
    badgeClass: "text-blue-800 bg-blue-100/90 border-blue-300",
    labelTh: "CSO",
    description: "สิทธิ์การทำงาน CSO (กรอก/แก้ไขเลขบิล Bill No., ขอใบกำกับภาษี Req Tax Inv, Stuck, จัดการสถานะชำระเงินและออเดอร์)",
  },
  {
    id: "approve-petty-cash",
    label: "Approve & Top-up Petty Cash",
    shortLabel: "Petty Cash Admin",
    icon: "💰",
    badgeClass: "text-violet-800 bg-violet-100/90 border-violet-300",
    labelTh: "อนุมัติและโอนเติมเงินสดย่อย (Petty Cash)",
    description: "สิทธิ์ฝ่ายบัญชีในการโอนเติมวงเงินสดย่อยรายบุคคล อนุมัติ/ปฏิเสธรายการเบิกจ่าย และจัดการหมวดหมู่",
  },
];

/**
 * Department Priority Order:
 * 1. Accounting
 * 2. Branch Operations
 * 3. Logistics Fleet / Drivers
 * 4. Super Admin / Management
 * 5+. Other departments
 */
export function getDepartmentRank(
  deptKey?: string | null,
  role?: string | null,
  deptsList?: DepartmentItem[]
): number {
  let effectiveKey = deptKey;
  if (!effectiveKey) {
    if (role === "admin") effectiveKey = "management";
    else if (role === "cso") effectiveKey = "accounting_cso";
    else if (role === "rider") effectiveKey = "logistics";
    else effectiveKey = "branch_ops";
  }

  const keyLower = (effectiveKey || "").toLowerCase();
  const deptObj = deptsList?.find((d) => d.key === effectiveKey);
  const nameLower = `${deptObj?.name || ""} ${deptObj?.nameTh || ""}`.toLowerCase();

  // Priority 1: Accounting
  if (
    keyLower.includes("accounting") ||
    keyLower.includes("cso") ||
    nameLower.includes("accounting") ||
    nameLower.includes("บัญชี") ||
    nameLower.includes("cso")
  ) {
    return 1;
  }

  // Priority 2: Branch Operations
  if (
    keyLower.includes("branch") ||
    keyLower.includes("ops") ||
    keyLower.includes("operation") ||
    nameLower.includes("branch") ||
    nameLower.includes("ปฏิบัติการ") ||
    nameLower.includes("สาขา")
  ) {
    return 2;
  }

  // Priority 3: Logistics Driver
  if (
    keyLower.includes("logistics") ||
    keyLower.includes("driver") ||
    keyLower.includes("rider") ||
    keyLower.includes("fleet") ||
    nameLower.includes("logistics") ||
    nameLower.includes("ขนส่ง") ||
    nameLower.includes("ไรเดอร์") ||
    nameLower.includes("driver")
  ) {
    return 3;
  }

  // Priority 4: Super Admin / Management
  if (
    keyLower.includes("management") ||
    keyLower.includes("admin") ||
    keyLower.includes("super_admin") ||
    nameLower.includes("management") ||
    nameLower.includes("admin") ||
    nameLower.includes("บริหาร") ||
    nameLower.includes("ไอที")
  ) {
    return 4;
  }

  return 5 + (deptObj?.order || 99);
}

export function sortUsersByDeptAndHead(userList: AdminUser[], deptsList: DepartmentItem[]): AdminUser[] {
  return [...userList].sort((a, b) => {
    // 1. Department Order: Accounting -> Branch Oper -> Logistics Driver -> Super Admin
    const rankA = getDepartmentRank(a.department, a.role, deptsList);
    const rankB = getDepartmentRank(b.department, b.role, deptsList);
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // 2. Same rank but different specific department key (e.g. BKK vs PTY Branch Ops)
    const deptA = a.department || "";
    const deptB = b.department || "";
    if (deptA !== deptB) {
      return deptA.localeCompare(deptB);
    }

    // 3. Department Head First within the same department
    const isHeadA = a.isDepartmentHead ? 1 : 0;
    const isHeadB = b.isDepartmentHead ? 1 : 0;
    if (isHeadA !== isHeadB) {
      return isHeadB - isHeadA; // 1 (Head) comes before 0 (Staff)
    }

    // 4. Alphabetical order by Name
    return (a.name || "").localeCompare(b.name || "", ["th", "en"]);
  });
}

export function AdminUsers() {
  const { user: currentUser } = useAuth();
  const shopLocations = useSyncExternalStore(
    shopStore.subscribe,
    shopStore.getSnapshot,
    shopStore.getSnapshot
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"active" | "departments" | "roles" | "resigned">("active");

  // Search, Filter & Layout State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [userLayout, setUserLayout] = useState<"grouped" | "grid" | "table">("grouped");

  const activeUsers = useMemo(
    () => sortUsersByDeptAndHead(users.filter((u) => u.isActive !== false), departments),
    [users, departments]
  );
  const resignedUsers = useMemo(
    () => sortUsersByDeptAndHead(users.filter((u) => u.isActive === false), departments),
    [users, departments]
  );
  const baseDisplayedUsers = viewMode === "active" ? activeUsers : resignedUsers;

  // Filtered Users by Search & Department Pill
  const displayedUsers = useMemo(() => {
    return baseDisplayedUsers.filter((u) => {
      if (selectedDeptFilter !== "ALL") {
        const effectiveDept =
          u.department ||
          (u.role === "admin"
            ? "management"
            : u.role === "cso"
            ? "accounting_cso"
            : u.role === "rider"
            ? "logistics"
            : "branch_ops");
        if (effectiveDept !== selectedDeptFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const deptObj = departments.find((d) => d.key === u.department);
        const roleObj = roles.find((r) => r.key === u.role);
        let perms: string[] = [];
        try {
          perms = JSON.parse(u.permissions);
        } catch {}
        const permLabels = perms
          .map(
            (p) =>
              MENU_PERMISSIONS.find((mp) => mp.id === p)?.label ||
              ACTION_PERMISSIONS.find((ap) => ap.id === p)?.label ||
              p
          )
          .join(" ")
          .toLowerCase();

        const haystack = `${u.name} ${u.email} ${u.role} ${deptObj?.name || ""} ${deptObj?.nameTh || ""} ${roleObj?.name || ""} ${roleObj?.nameTh || ""} ${permLabels}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [baseDisplayedUsers, selectedDeptFilter, searchQuery, departments, roles]);

  // Group displayed users by Department for the "grouped" card view
  const groupedUsersByDept = useMemo(() => {
    const groups: {
      key: string;
      dept: DepartmentItem | undefined;
      title: string;
      titleTh?: string | null;
      icon: string;
      color: string;
      members: AdminUser[];
    }[] = [];

    const map = new Map<string, AdminUser[]>();
    for (const u of displayedUsers) {
      const effectiveKey =
        u.department ||
        (u.role === "admin"
          ? "management"
          : u.role === "cso"
          ? "accounting_cso"
          : u.role === "rider"
          ? "logistics"
          : "branch_ops");
      if (!map.has(effectiveKey)) {
        map.set(effectiveKey, []);
      }
      map.get(effectiveKey)!.push(u);
    }

    for (const [key, members] of map.entries()) {
      const deptObj = departments.find((d) => d.key === key);
      groups.push({
        key,
        dept: deptObj,
        title: deptObj?.name || key.replace(/_/g, " ").toUpperCase(),
        titleTh: deptObj?.nameTh,
        icon: deptObj?.icon || "🏢",
        color: deptObj?.color || "slate",
        members,
      });
    }

    return groups;
  }, [displayedUsers, departments]);

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const headsCount = activeUsers.filter((u) => u.isDepartmentHead).length;
    const ridersCount = activeUsers.filter(
      (u) => u.role === "rider" || (u.department || "").toLowerCase().includes("logistics")
    ).length;
    const privilegedCount = activeUsers.filter((u) => {
      if (u.role === "admin") return true;
      try {
        const p: string[] = JSON.parse(u.permissions);
        return ACTION_PERMISSIONS.some((ap) => p.includes(ap.id));
      } catch {
        return false;
      }
    }).length;
    return {
      activeCount: activeUsers.length,
      officeAndBranchCount: Math.max(0, activeUsers.length - ridersCount),
      ridersCount,
      headsCount,
      privilegedCount,
      resignedCount: resignedUsers.length,
    };
  }, [activeUsers, resignedUsers]);

  // User Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [department, setDepartment] = useState("branch_ops");
  const [isDepartmentHead, setIsDepartmentHead] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Department Modal State
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deptKey, setDeptKey] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptNameTh, setDeptNameTh] = useState("");
  const [deptIcon, setDeptIcon] = useState("🏢");
  const [deptColor, setDeptColor] = useState("indigo");
  const [deptOrder, setDeptOrder] = useState(1);
  const [isSavingDept, setIsSavingDept] = useState(false);

  // Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleKey, setRoleKey] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleNameTh, setRoleNameTh] = useState("");
  const [roleColor, setRoleColor] = useState("slate");
  const [roleOrder, setRoleOrder] = useState(1);
  const [isSavingRole, setIsSavingRole] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [usersRes, deptsRes, rolesRes] = await Promise.all([
        getUsers(),
        getDepartments(true),
        getRoles(true),
      ]);

      if (usersRes?.success) {
        setUsers(usersRes.data as AdminUser[]);
      } else {
        toast.error(usersRes?.error || "Failed to load users");
      }

      if (deptsRes?.success) {
        setDepartments(deptsRes.data as DepartmentItem[]);
        if (deptsRes.data && deptsRes.data.length > 0 && !department) {
          setDepartment(deptsRes.data[0].key);
        }
      }

      if (rolesRes?.success) {
        setRoles(rolesRes.data as RoleItem[]);
        if (rolesRes.data && rolesRes.data.length > 0 && !role) {
          setRole(rolesRes.data[0].key);
        }
      }
    } catch (error: any) {
      toast.error("Network error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setRole(roles[0]?.key || "staff");
    setDepartment(departments[0]?.key || "branch_ops");
    setIsDepartmentHead(false);
    setSelectedBranchIds(shopLocations.map((s) => s.id));
    setSelectedPerms([]);
    setEditingId(null);
    setIsEditing(false);
  };

  const handleEdit = (u: AdminUser) => {
    setEmail(u.email);
    setPassword("");
    setName(u.name);
    setRole(u.role || "staff");
    setDepartment(
      u.department ||
        (u.role === "admin"
          ? "management"
          : u.role === "cso"
          ? "accounting_cso"
          : u.role === "rider"
          ? "logistics"
          : "branch_ops")
    );
    setIsDepartmentHead(u.isDepartmentHead ?? false);
    setSelectedBranchIds(getUserAssignedBranchIds(u, shopLocations));
    try {
      setSelectedPerms(JSON.parse(u.permissions));
    } catch (e) {
      setSelectedPerms([]);
    }
    setEditingId(u.id);
    setIsEditing(true);
  };

  const togglePermission = (id: string) => {
    if (selectedPerms.includes(id)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== id));
    } else {
      setSelectedPerms([...selectedPerms, id]);
    }
  };

  const selectAllPerms = () => {
    const existingActions = selectedPerms.filter((p) => ACTION_PERMISSIONS.some((ap) => ap.id === p));
    setSelectedPerms([...MENU_PERMISSIONS.map((p) => p.id), ...existingActions]);
  };

  const clearAllPerms = () => {
    const existingActions = selectedPerms.filter((p) => ACTION_PERMISSIONS.some((ap) => ap.id === p));
    setSelectedPerms(existingActions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return toast.error("Email and Name are required");

    const isAll =
      selectedBranchIds.length === shopLocations.length ||
      selectedBranchIds.length === 0;
    const userArea = isAll ? "ALL" : selectedBranchIds.join(",");
    const userBranchId = isAll ? null : (selectedBranchIds[0] || null);

    setIsSavingUser(true);
    try {
      if (editingId) {
        const res = await updateUser(editingId, {
          name,
          email,
          password: password || undefined,
          role,
          department,
          isDepartmentHead,
          area: userArea,
          branchId: userBranchId,
          permissions: selectedPerms,
        });
        if (!res?.success) throw new Error(res?.error || "Failed to update user");

        // If updating self, sync localStorage immediately
        if (typeof window !== "undefined" && currentUser?.id === editingId) {
          try {
            const raw = localStorage.getItem("authUser");
            if (raw) {
              const parsed = JSON.parse(raw);
              parsed.permissions = selectedPerms;
              parsed.area = userArea;
              parsed.branchId = userBranchId;
              localStorage.setItem("authUser", JSON.stringify(parsed));
            }
          } catch {}
        }

        toast.success("User updated successfully");
      } else {
        if (!password) return toast.error("Password is required for new users");
        const res = await createUser({
          name,
          email,
          password,
          role,
          department,
          isDepartmentHead,
          area: userArea,
          branchId: userBranchId,
          permissions: selectedPerms,
        });
        if (!res?.success) throw new Error(res?.error || "Failed to create user");
        toast.success("User created successfully");
      }
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Operation failed");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await deleteUser(id, currentUser?.email || "");
      if (!res?.success) throw new Error(res?.error || "Failed to delete user");

      toast.success("User deleted successfully");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    }
  };

  const handleToggleResign = async (u: AdminUser) => {
    const isResigning = u.isActive !== false;
    if (!confirm(`Are you sure you want to ${isResigning ? "resign" : "reactivate"} ${u.name}?`)) return;
    try {
      const res = await updateUser(u.id, {
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department || null,
        area: u.area || null,
        branchId: u.branchId || null,
        permissions: JSON.parse(u.permissions),
        isActive: !isResigning,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to update user");
      toast.success(`User ${isResigning ? "resigned" : "reactivated"}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Operation failed");
    }
  };

  // ─── Department Handlers ────────────────────────────────────────────────────

  const openCreateDeptModal = () => {
    setEditingDept(null);
    setDeptKey("");
    setDeptName("");
    setDeptNameTh("");
    setDeptIcon("🏢");
    setDeptColor("indigo");
    setDeptOrder(departments.length + 1);
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (d: DepartmentItem) => {
    setEditingDept(d);
    setDeptKey(d.key);
    setDeptName(d.name);
    setDeptNameTh(d.nameTh || "");
    setDeptIcon(d.icon || "🏢");
    setDeptColor(d.color || "indigo");
    setDeptOrder(d.order ?? 1);
    setIsDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) return toast.error("Department Name is required");

    setIsSavingDept(true);
    try {
      if (editingDept) {
        const res = await updateDepartment(editingDept.id, {
          name: deptName,
          nameTh: deptNameTh || null,
          icon: deptIcon,
          color: deptColor,
          order: Number(deptOrder),
        });
        if (!res.success) throw new Error(res.error || "Failed to update department");
        toast.success("Department updated successfully");
      } else {
        const res = await createDepartment({
          key: deptKey || undefined,
          name: deptName,
          nameTh: deptNameTh || undefined,
          icon: deptIcon,
          color: deptColor,
          order: Number(deptOrder),
        });
        if (!res.success) throw new Error(res.error || "Failed to create department");
        toast.success("Department created successfully");
      }

      setIsDeptModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setIsSavingDept(false);
    }
  };

  const handleDeleteDepartment = async (d: DepartmentItem) => {
    if (d.userCount && d.userCount > 0) {
      return toast.error(
        `Cannot delete '${d.name}'. There are ${d.userCount} staff assigned to this department. Please reassign them first.`
      );
    }
    if (!confirm(`Are you sure you want to delete department "${d.name}"?`)) return;

    try {
      const res = await deleteDepartment(d.id);
      if (!res.success) throw new Error(res.error || "Failed to delete department");
      toast.success("Department deleted successfully");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete department");
    }
  };

  // ─── Role Handlers ──────────────────────────────────────────────────────────

  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleKey("");
    setRoleName("");
    setRoleNameTh("");
    setRoleColor("slate");
    setRoleOrder(roles.length + 1);
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (r: RoleItem) => {
    setEditingRole(r);
    setRoleKey(r.key);
    setRoleName(r.name);
    setRoleNameTh(r.nameTh || "");
    setRoleColor(r.color || "slate");
    setRoleOrder(r.order ?? 1);
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return toast.error("Role Name is required");

    setIsSavingRole(true);
    try {
      if (editingRole) {
        const res = await updateRole(editingRole.id, {
          name: roleName,
          nameTh: roleNameTh || null,
          color: roleColor,
          order: Number(roleOrder),
        });
        if (!res.success) throw new Error(res.error || "Failed to update role");
        toast.success("Role updated successfully");
      } else {
        const res = await createRole({
          key: roleKey || undefined,
          name: roleName,
          nameTh: roleNameTh || undefined,
          color: roleColor,
          order: Number(roleOrder),
        });
        if (!res.success) throw new Error(res.error || "Failed to create role");
        toast.success("Role created successfully");
      }

      setIsRoleModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteRole = async (r: RoleItem) => {
    if (r.isSystem) {
      return toast.error(`System role '${r.name}' is protected and cannot be deleted.`);
    }
    if (r.userCount && r.userCount > 0) {
      return toast.error(
        `Cannot delete '${r.name}'. There are ${r.userCount} staff assigned to this role. Please reassign them first.`
      );
    }
    if (!confirm(`Are you sure you want to delete role "${r.name}"?`)) return;

    try {
      const res = await deleteRole(r.id);
      if (!res.success) throw new Error(res.error || "Failed to delete role");
      toast.success("Role deleted successfully");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete role");
    }
  };

  // Helper to render an individual Staff Card
  const renderStaffCard = (u: AdminUser) => {
    let perms: string[] = [];
    try {
      perms = JSON.parse(u.permissions);
    } catch {}

    const deptObj = departments.find((d) => d.key === u.department);
    const roleObj = roles.find((r) => r.key === u.role);
    const colorCfg = getColorConfig(deptObj?.color || (u.role === "admin" ? "indigo" : "slate"));
    const isSelf = currentUser?.id === u.id;
    const isResigned = u.isActive === false;
    const isRider =
      u.role === "rider" ||
      (u.department || "").toLowerCase().includes("logistics") ||
      (roleObj?.name || "").toLowerCase().includes("driver");

    const menuPerms = perms.filter((p) => !ACTION_PERMISSIONS.some((ap) => ap.id === p));
    const actionPerms = ACTION_PERMISSIONS.filter((ap) => perms.includes(ap.id));

    return (
      <div
        key={u.id}
        className={`group relative bg-white rounded-2xl border border-slate-200/90 border-t-4 ${colorCfg.topBorderClass} shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden ${
          isResigned ? "opacity-75 bg-slate-50/50" : ""
        }`}
      >
        <div>
          {/* Top Identity Row */}
          <div className="p-4 pb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* Avatar Initials Circle */}
              <div className="relative shrink-0">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm tracking-tight shadow-xs ${colorCfg.avatarClass}`}
                >
                  {getInitials(u.name)}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    isResigned ? "bg-slate-400" : "bg-emerald-500"
                  }`}
                  title={isResigned ? "Resigned" : "Active Account"}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-extrabold text-slate-900 text-sm truncate max-w-[180px]" title={u.name}>
                    {u.name}
                  </h4>
                  {u.isDepartmentHead && (
                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5 shadow-2xs shrink-0">
                      <span>👑</span>
                      <span>HEAD</span>
                    </span>
                  )}
                  {isSelf && (
                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-indigo-600 text-white shrink-0">
                      YOU
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mt-0.5 truncate" title={u.email}>
                  <Mail size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">{u.email}</span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 border border-slate-200/70 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => handleEdit(u)}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                title="Edit User & Permissions"
              >
                <Edit size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleToggleResign(u)}
                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                title={u.isActive !== false ? "Resign Staff" : "Reactivate Staff"}
              >
                {u.isActive !== false ? <UserX size={14} /> : <UserCheck size={14} />}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(u.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                title="Delete User"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Role, Department & Branch Strip */}
          <div className="px-4 pb-3">
            <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {deptObj ? (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 ${getBadgeClass(
                      deptObj.color
                    )}`}
                  >
                    <span>{deptObj.icon}</span>
                    <span>{deptObj.name}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md border bg-slate-100 text-slate-600 border-slate-200">
                    Unassigned Dept
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border ${getBadgeClass(
                    roleObj?.color || (u.role === "admin" ? "indigo" : "slate")
                  )}`}
                >
                  {roleObj?.name || u.role}
                </span>
              </div>

              <div className="shrink-0">
                <UserBranchBadge user={u} branches={shopLocations} />
              </div>
            </div>
          </div>

          {/* Special Action Permissions (if any) */}
          {actionPerms.length > 0 && (
            <div className="px-4 pb-2.5">
              <div className="text-[9px] font-black uppercase tracking-wider text-amber-700/90 mb-1.5 flex items-center gap-1">
                <Sparkles size={10} />
                <span>Special Action Privileges ({actionPerms.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {actionPerms.map((ap) => (
                  <span
                    key={ap.id}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shadow-2xs flex items-center gap-1 ${ap.badgeClass}`}
                    title={ap.description}
                  >
                    <span>{ap.icon}</span>
                    <span>{ap.shortLabel}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Menu Access Permissions */}
          <div className="px-4 pb-3">
            {u.role === "admin" ? (
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-50/90 to-violet-50/90 border border-indigo-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-indigo-600 shrink-0" />
                  <div>
                    <div className="text-[11px] font-extrabold text-indigo-950">Full System Administrator</div>
                    <div className="text-[10px] font-medium text-indigo-700">
                      Unrestricted access to all {MENU_PERMISSIONS.length} modules & settings
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                  All Access
                </span>
              </div>
            ) : menuPerms.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Menu Access ({menuPerms.length}/{MENU_PERMISSIONS.length})
                  </span>
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((menuPerms.length / MENU_PERMISSIONS.length) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {menuPerms.map((p) => {
                    const label = MENU_PERMISSIONS.find((mp) => mp.id === p)?.label || p;
                    return (
                      <span
                        key={p}
                        className="text-[10px] font-bold text-slate-700 bg-slate-100/90 hover:bg-slate-200/70 px-2 py-0.5 rounded-md border border-slate-200/90 transition-colors"
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : isRider ? (
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🛵</span>
                  <div>
                    <div className="text-[11px] font-bold text-amber-950">Logistics & Rider Portal</div>
                    <div className="text-[10px] text-amber-800/90">
                      Assigned to Pickup & Delivery dispatch routes (No Admin Console menus)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/60 flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-700">No Admin Console Menu Access</span>
                <button
                  type="button"
                  onClick={() => handleEdit(u)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  + Grant Access
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer */}
        <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <KeyRound size={11} />
            <span className="font-mono tracking-widest text-[10px]">••••••••</span>
          </div>
          <button
            type="button"
            onClick={() => handleEdit(u)}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            <span>Configure Access</span>
            <span>→</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/70 p-4 sm:p-6 overflow-auto space-y-5">
      {/* ─── Executive Command Header ───────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Manage Users & Organization
              </h1>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                RBAC & Directory
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Staff accounts, dynamic departments, custom role labels, and granular menu & financial permissions
            </p>
          </div>
        </div>

        {/* Quick Create Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={openCreateDeptModal}
            className="h-9 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer rounded-xl"
          >
            <Building2 size={14} className="mr-1.5 text-indigo-600" />
            + Department
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={openCreateRoleModal}
            className="h-9 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer rounded-xl"
          >
            <Tag size={14} className="mr-1.5 text-indigo-600" />
            + Role Label
          </Button>
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setIsEditing(true);
            }}
            className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs cursor-pointer rounded-xl px-4"
          >
            <Plus size={15} className="mr-1.5" />
            Add Staff Account
          </Button>
        </div>
      </div>

      {/* ─── Organization KPI Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setViewMode("active");
            setSelectedDeptFilter("ALL");
          }}
          className={`text-left bg-white p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewMode === "active" && selectedDeptFilter === "ALL"
              ? "border-indigo-500 ring-2 ring-indigo-500/15 shadow-xs"
              : "border-slate-200/90 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active Staff</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users size={14} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpiStats.activeCount}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span>🏢 {kpiStats.officeAndBranchCount} Office/Branch</span>
            <span>•</span>
            <span>🛵 {kpiStats.ridersCount} Riders</span>
          </div>
        </button>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Department Heads</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Crown size={14} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpiStats.headsCount}</div>
          <div className="text-[11px] font-semibold text-amber-700 mt-0.5">
            👑 Team supervisors & leads
          </div>
        </div>

        <button
          type="button"
          onClick={() => setViewMode("departments")}
          className={`text-left bg-white p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewMode === "departments"
              ? "border-indigo-500 ring-2 ring-indigo-500/15 shadow-xs"
              : "border-slate-200/90 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Departments</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 size={14} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{departments.length}</div>
          <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
            Click to manage org units →
          </div>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("roles")}
          className={`text-left bg-white p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewMode === "roles"
              ? "border-indigo-500 ring-2 ring-indigo-500/15 shadow-xs"
              : "border-slate-200/90 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Roles & Privileges</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Tag size={14} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{roles.length}</div>
          <div className="text-[11px] font-semibold text-purple-700 mt-0.5">
            ⚡ {kpiStats.privilegedCount} staff with special actions
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewMode("resigned");
            setSelectedDeptFilter("ALL");
          }}
          className={`text-left bg-white p-3.5 rounded-2xl border transition-all cursor-pointer col-span-2 lg:col-span-1 ${
            viewMode === "resigned"
              ? "border-rose-500 ring-2 ring-rose-500/15 shadow-xs"
              : "border-slate-200/90 hover:border-slate-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resigned / Inactive</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <UserX size={14} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpiStats.resignedCount}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
            Archived staff accounts
          </div>
        </button>
      </div>

      {/* ─── User Create / Edit Popup Modal ─────────────────────────────────── */}
      <Dialog
        open={isEditing}
        onOpenChange={(open, eventDetails) => {
          if (!open && eventDetails?.reason === "outside-press") {
            return;
          }
          if (!open) resetForm();
        }}
        disablePointerDismissal={true}
      >
        <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-white rounded-3xl z-50">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <User size={18} />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>{editingId ? `Edit User: ${name || email}` : "Create New User Account"}</span>
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {editingId
                    ? "Update staff credentials, department, role, and granular menu permissions."
                    : "Add a new staff member account and configure system access permissions."}
                </p>
              </div>
            </div>
          </DialogHeader>

          <form id="user-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Somchai S." required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email (Login ID) *</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="e.g. staff1@tls.com" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Password {editingId && <span className="text-slate-400 font-normal lowercase">(leave blank to keep)</span>}
                </label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder={editingId ? "••••••••" : "Password"} required={!editingId} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10 cursor-pointer"
                >
                  {departments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.icon} {d.name} {d.nameTh ? `(${d.nameTh})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Role Label</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10 cursor-pointer"
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} {r.nameTh ? `(${r.nameTh})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Assigned Branch (สาขาที่สังกัด)
                </label>
                <BranchFilterDropdown
                  branches={shopLocations}
                  selectedIds={selectedBranchIds}
                  onChange={setSelectedBranchIds}
                  includeUnassigned={false}
                  placeholder="All Branches (ทุกสาขา)"
                  className="w-full"
                  triggerClassName="w-full h-10 bg-slate-50 border-slate-200 text-slate-900 font-bold"
                />
              </div>
            </div>

            {/* Department Head Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl">
              <div>
                <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5 cursor-pointer">
                  <span>🌟 Department Head (หัวหน้าแผนก)</span>
                  {isDepartmentHead && (
                    <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                      👑 Active Head
                    </span>
                  )}
                </label>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  เปิดใช้งานหากต้องการให้พนักงานท่านนี้เป็นหัวหน้าแผนก สามารถมองเห็นและติดตาม Task ของลูกน้องทุกคนในแผนกเดียวกันได้
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isDepartmentHead}
                  onChange={(e) => setIsDepartmentHead(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Menu Access Permissions</label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllPerms} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded hover:bg-indigo-100 cursor-pointer">
                    Select All
                  </button>
                  <button type="button" onClick={clearAllPerms} className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded hover:bg-slate-200 cursor-pointer">
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {MENU_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all border ${
                      selectedPerms.includes(perm.id)
                        ? "bg-indigo-50/90 border-indigo-200 shadow-2xs text-indigo-950"
                        : "bg-white border-slate-200/80 hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4"
                    />
                    <span className="text-xs font-bold">
                      {perm.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action & Financial Permissions */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider">
                    Action & Financial Permissions
                  </label>
                  <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                    สิทธิ์การทำรายการพิเศษ / การเงิน
                  </span>
                </div>
              </div>

              <div className="space-y-2 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-4 rounded-2xl border border-amber-200/80 shadow-2xs">
                {ACTION_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.id}
                    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                      selectedPerms.includes(perm.id)
                        ? "bg-white border-amber-400 shadow-sm text-slate-900 ring-1 ring-amber-400/30"
                        : "bg-white/70 border-slate-200/80 hover:bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 h-4 w-4 mt-0.5 shrink-0 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{perm.label}</span>
                        <span className="text-[11px] text-amber-800 font-semibold">({perm.labelTh})</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{perm.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </form>

          <DialogFooter className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2.5 shrink-0">
            <Button type="button" variant="outline" onClick={resetForm} className="font-bold border-slate-200 cursor-pointer">
              Cancel
            </Button>
            <Button
              type="submit"
              form="user-form"
              disabled={isSavingUser}
              className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs text-white cursor-pointer"
            >
              {isSavingUser ? <Loader2 size={16} className="animate-spin mr-1.5" /> : <Save size={16} className="mr-1.5" />}
              {editingId ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Main Directory & Organization Container ────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar & Controls */}
        <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 sm:px-6 pt-3.5 pb-3 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Primary View Mode Pills */}
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-2xl w-fit max-w-full overflow-x-auto">
              <button
                type="button"
                onClick={() => setViewMode("active")}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  viewMode === "active"
                    ? "bg-white text-indigo-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <User size={14} />
                <span>Active Staff</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    viewMode === "active" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {activeUsers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("departments")}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  viewMode === "departments"
                    ? "bg-white text-indigo-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Building2 size={14} />
                <span>Departments</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    viewMode === "departments" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {departments.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("roles")}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  viewMode === "roles"
                    ? "bg-white text-indigo-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Tag size={14} />
                <span>Roles</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    viewMode === "roles" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {roles.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("resigned")}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  viewMode === "resigned"
                    ? "bg-white text-rose-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserX size={14} />
                <span>Resigned</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    viewMode === "resigned" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {resignedUsers.length}
                </span>
              </button>
            </div>

            {/* Search Input & Layout Switcher (Only for Active / Resigned tabs) */}
            {(viewMode === "active" || viewMode === "resigned") && (
              <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, email, role, permission..."
                    className="w-full h-9 pl-8 pr-8 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Layout Toggle */}
                <div className="flex items-center bg-slate-200/70 p-0.5 rounded-xl border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setUserLayout("grouped")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      userLayout === "grouped"
                        ? "bg-white text-indigo-600 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Group Cards by Department"
                  >
                    <Layers size={13} />
                    <span className="hidden sm:inline">By Dept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserLayout("grid")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      userLayout === "grid"
                        ? "bg-white text-indigo-600 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Flat Card Grid"
                  >
                    <LayoutGrid size={13} />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserLayout("table")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      userLayout === "table"
                        ? "bg-white text-indigo-600 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Compact Table View"
                  >
                    <List size={13} />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Department Quick-Filter Pills (For Active / Resigned tabs) */}
          {(viewMode === "active" || viewMode === "resigned") && departments.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedDeptFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedDeptFilter === "ALL"
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>All Departments</span>
                <span
                  className={`px-1.5 py-0.1 rounded-full text-[9px] font-black ${
                    selectedDeptFilter === "ALL" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {baseDisplayedUsers.length}
                </span>
              </button>

              {departments.map((d) => {
                const count = baseDisplayedUsers.filter((u) => {
                  const effectiveKey =
                    u.department ||
                    (u.role === "admin"
                      ? "management"
                      : u.role === "cso"
                      ? "accounting_cso"
                      : u.role === "rider"
                      ? "logistics"
                      : "branch_ops");
                  return effectiveKey === d.key;
                }).length;
                if (count === 0 && viewMode === "resigned") return null;
                const isSelected = selectedDeptFilter === d.key;

                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDeptFilter(isSelected ? "ALL" : d.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>{d.icon}</span>
                    <span>{d.name}</span>
                    <span
                      className={`px-1.5 py-0.1 rounded-full text-[9px] font-black ${
                        isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── TAB 1 & 4: USERS DIRECTORY (GROUPED CARDS / FLAT CARDS / TABLE) ─ */}
        {viewMode === "active" || viewMode === "resigned" ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={28} className="animate-spin text-indigo-600" />
                <span className="text-xs font-bold text-slate-500">Loading staff directory...</span>
              </div>
            ) : displayedUsers.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Users size={22} />
                </div>
                <p className="text-sm font-bold text-slate-700">No staff accounts match your filter</p>
                <p className="text-xs text-slate-400 mt-1">
                  Try clearing your search query or switching the department filter.
                </p>
                {(searchQuery || selectedDeptFilter !== "ALL") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedDeptFilter("ALL");
                    }}
                    className="mt-3 text-xs font-bold"
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            ) : userLayout === "grouped" ? (
              /* ── GROUPED BY DEPARTMENT CARD LAYOUT ── */
              <div className="space-y-7">
                {groupedUsersByDept.map((group) => {
                  const colorCfg = getColorConfig(group.color);
                  const headsCount = group.members.filter((m) => m.isDepartmentHead).length;

                  return (
                    <div key={group.key} className="space-y-3">
                      {/* Department Group Header Bar */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 shadow-2xs">
                            {group.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                                {group.title}
                              </h3>
                              {group.titleTh && (
                                <span className="text-xs font-semibold text-slate-400">
                                  ({group.titleTh})
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${colorCfg.badgeClass}`}
                              >
                                {group.members.length} {group.members.length === 1 ? "Member" : "Members"}
                              </span>
                              {headsCount > 0 && (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200 hidden sm:inline-flex items-center gap-1">
                                  👑 {headsCount} {headsCount === 1 ? "Head" : "Heads"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {group.dept && (
                          <button
                            type="button"
                            onClick={() => openEditDeptModal(group.dept!)}
                            className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                          >
                            <Edit size={12} />
                            <span className="hidden sm:inline">Edit Dept</span>
                          </button>
                        )}
                      </div>

                      {/* Department Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {group.members.map((u) => renderStaffCard(u))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : userLayout === "grid" ? (
              /* ── FLAT CARD GRID LAYOUT ── */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedUsers.map((u) => renderStaffCard(u))}
              </div>
            ) : (
              /* ── COMPACT TABLE VIEW ── */
              <div className="overflow-x-auto -mx-4 sm:-mx-6">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-y border-slate-200 uppercase text-[10px] font-black tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Staff Member</th>
                      <th className="px-6 py-3.5">Department & Role</th>
                      <th className="px-6 py-3.5 hidden md:table-cell">Permissions & Privileges</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedUsers.map((u) => {
                      let perms: string[] = [];
                      try {
                        perms = JSON.parse(u.permissions);
                      } catch {}

                      const deptObj = departments.find((d) => d.key === u.department);
                      const roleObj = roles.find((r) => r.key === u.role);
                      const colorCfg = getColorConfig(deptObj?.color);
                      const menuPerms = perms.filter((p) => !ACTION_PERMISSIONS.some((ap) => ap.id === p));
                      const actionPerms = ACTION_PERMISSIONS.filter((ap) => perms.includes(ap.id));
                      const isRider =
                        u.role === "rider" ||
                        (u.department || "").toLowerCase().includes("logistics");

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${colorCfg.avatarClass}`}
                              >
                                {getInitials(u.name)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">{u.name}</span>
                                  {u.isDepartmentHead && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded-md bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                                      👑 Head
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex flex-col items-start gap-1">
                              {deptObj ? (
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 ${getBadgeClass(
                                    deptObj.color
                                  )}`}
                                >
                                  <span>{deptObj.icon}</span>
                                  <span>{deptObj.name}</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md border bg-slate-100 text-slate-600 border-slate-200">
                                  -
                                </span>
                              )}
                              <div className="flex items-center gap-1">
                                <span
                                  className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full border ${getBadgeClass(
                                    roleObj?.color || (u.role === "admin" ? "indigo" : "slate")
                                  )}`}
                                >
                                  {roleObj?.name || u.role}
                                </span>
                                <UserBranchBadge user={u} branches={shopLocations} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1 items-center">
                              {u.role === "admin" ? (
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                                  🛡️ Full System Admin (All Access)
                                </span>
                              ) : (
                                menuPerms.map((p) => {
                                  const label = MENU_PERMISSIONS.find((mp) => mp.id === p)?.label || p;
                                  return (
                                    <span
                                      key={p}
                                      className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200"
                                    >
                                      {label}
                                    </span>
                                  );
                                })
                              )}
                              {actionPerms.map((ap) => (
                                <span
                                  key={ap.id}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs flex items-center gap-0.5 ${ap.badgeClass}`}
                                >
                                  <span>{ap.icon}</span>
                                  <span>{ap.shortLabel}</span>
                                </span>
                              ))}
                              {u.role !== "admin" && perms.length === 0 && (
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    isRider
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-rose-50 text-rose-600 border-rose-200"
                                  }`}
                                >
                                  {isRider ? "🛵 Rider App Access" : "No Menu Access"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleEdit(u)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit User"
                              >
                                <Edit size={15} />
                              </button>
                              <button
                                onClick={() => handleToggleResign(u)}
                                title={u.isActive !== false ? "Resign User" : "Reactivate User"}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              >
                                {u.isActive !== false ? <UserX size={15} /> : <UserCheck size={15} />}
                              </button>
                              <button
                                onClick={() => handleDelete(u.id)}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete User"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : viewMode === "departments" ? (
          // ─── TAB 2: DEPARTMENTS MANAGEMENT ─────────────────────────────────
          <div className="overflow-x-auto flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Building2 size={16} className="text-indigo-600" />
                  <span>Company Departments ({departments.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage department names, icons, color themes, and view member distribution.
                </p>
              </div>
              <Button onClick={openCreateDeptModal} size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs cursor-pointer rounded-xl">
                <Plus size={14} className="mr-1" /> Add Department
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {departments.map((dept) => {
                const colorCfg = getColorConfig(dept.color);
                const deptMembers = activeUsers.filter((u) => u.department === dept.key);
                const deptHeads = deptMembers.filter((u) => u.isDepartmentHead);

                return (
                  <div
                    key={dept.id}
                    className={`bg-white border border-slate-200/90 border-t-4 ${colorCfg.topBorderClass} rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-2xl p-2.5 bg-slate-50 border border-slate-100 rounded-2xl shadow-2xs">
                          {dept.icon}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDeptModal(dept)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Department Name / Color"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDepartment(dept)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Department"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-extrabold text-slate-900 text-sm">{dept.name}</h4>
                      {dept.nameTh && <p className="text-xs font-semibold text-slate-500 mt-0.5">{dept.nameTh}</p>}
                      <p className="text-[10px] font-mono text-slate-400 mt-1">Key: {dept.key}</p>

                      {/* Department Heads Display */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                          👑 Department Head(s)
                        </span>
                        {deptHeads.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {deptHeads.map((h) => (
                              <span
                                key={h.id}
                                className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md"
                              >
                                <span>👑</span>
                                <span>{h.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No head assigned</span>
                        )}
                      </div>

                      {/* Member Avatars Preview */}
                      {deptMembers.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100/80">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Active Team ({deptMembers.length})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {deptMembers.slice(0, 6).map((m) => (
                              <span
                                key={m.id}
                                className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80"
                              >
                                {m.name.split(" ")[0]}
                              </span>
                            ))}
                            {deptMembers.length > 6 && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200">
                                +{deptMembers.length - 6} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${colorCfg.badgeClass}`}>
                        {colorCfg.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeptFilter(dept.key);
                          setViewMode("active");
                        }}
                        className="font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-0.5 rounded-full text-[11px] transition-colors cursor-pointer"
                      >
                        👥 View {dept.userCount || 0} Staff →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // ─── TAB 3: ROLES MANAGEMENT ───────────────────────────────────────
          <div className="overflow-x-auto flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Tag size={16} className="text-indigo-600" />
                  <span>Custom Role Labels ({roles.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Customize job title labels, color tags, and configure staff positions.
                </p>
              </div>
              <Button onClick={openCreateRoleModal} size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs cursor-pointer rounded-xl">
                <Plus size={14} className="mr-1" /> Add Role
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {roles.map((r) => {
                const colorCfg = getColorConfig(r.color);
                const roleMembers = activeUsers.filter((u) => u.role === r.key);

                return (
                  <div
                    key={r.id}
                    className={`bg-white border border-slate-200/90 border-t-4 ${colorCfg.topBorderClass} rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${colorCfg.badgeClass}`}>
                          {r.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditRoleModal(r)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Role Label"
                          >
                            <Edit size={14} />
                          </button>
                          {!r.isSystem && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(r)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Role"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="font-extrabold text-slate-900 text-sm">{r.name}</h4>
                      {r.nameTh && <p className="text-xs font-semibold text-slate-500 mt-0.5">{r.nameTh}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] font-mono text-slate-400">Key: {r.key}</span>
                        {r.isSystem && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                            <Lock size={9} /> System
                          </span>
                        )}
                      </div>

                      {roleMembers.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Assigned Staff
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {roleMembers.slice(0, 5).map((m) => (
                              <span
                                key={m.id}
                                className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80"
                              >
                                {m.name.split(" ")[0]}
                              </span>
                            ))}
                            {roleMembers.length > 5 && (
                              <span className="text-[10px] font-bold text-slate-500">+{roleMembers.length - 5}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[10px] font-semibold">Order: #{r.order}</span>
                      <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full text-[11px]">
                        👥 {r.userCount || 0} Staff
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Department Create / Edit Modal ─────────────────────────────────── */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 size={18} className="text-indigo-600" />
                <span>{editingDept ? `Edit Department: ${editingDept.name}` : "Create New Department"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Department Name (English) *
                </label>
                <Input
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Finance & Accounting"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Department Name (Thai)
                </label>
                <Input
                  value={deptNameTh}
                  onChange={(e) => setDeptNameTh(e.target.value)}
                  placeholder="e.g. ฝ่ายการเงิน & บัญชี"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Icon (Emoji)
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={deptIcon}
                      onChange={(e) => setDeptIcon(e.target.value)}
                      placeholder="🏢"
                      className="w-16 text-center text-lg"
                      maxLength={4}
                    />
                    <div className="flex gap-1">
                      {["🏢", "💼", "🧺", "🛵", "📊", "🛠️"].map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setDeptIcon(em)}
                          className="p-1 hover:bg-slate-100 rounded text-sm cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Display Order
                  </label>
                  <Input
                    type="number"
                    value={deptOrder}
                    onChange={(e) => setDeptOrder(Number(e.target.value))}
                    min={1}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Color Theme Badge
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(COLOR_CONFIG).map(([cKey, cVal]) => (
                    <button
                      key={cKey}
                      type="button"
                      onClick={() => setDeptColor(cKey)}
                      className={`p-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                        deptColor === cKey
                          ? `${cVal.badgeClass} ring-2 ring-indigo-500 scale-105 shadow-2xs`
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {cVal.label}
                    </button>
                  ))}
                </div>
              </div>

              {!editingDept && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    System Key / Code (Optional)
                  </label>
                  <Input
                    value={deptKey}
                    onChange={(e) => setDeptKey(e.target.value)}
                    placeholder="Auto-generated if blank e.g. finance_dept"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="font-bold border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingDept}
                  className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs"
                >
                  <Save size={15} className="mr-1.5" />
                  {editingDept ? "Save Changes" : "Create Department"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Role Create / Edit Modal ───────────────────────────────────────── */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Tag size={18} className="text-indigo-600" />
                <span>{editingRole ? `Edit Role: ${editingRole.name}` : "Create New Role"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Role Name (English) *
                </label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Branch Supervisor"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Role Name (Thai)
                </label>
                <Input
                  value={roleNameTh}
                  onChange={(e) => setRoleNameTh(e.target.value)}
                  placeholder="e.g. หัวหน้างานประจำสาขา"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Display Order
                </label>
                <Input
                  type="number"
                  value={roleOrder}
                  onChange={(e) => setRoleOrder(Number(e.target.value))}
                  min={1}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Color Theme Badge
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(COLOR_CONFIG).map(([cKey, cVal]) => (
                    <button
                      key={cKey}
                      type="button"
                      onClick={() => setRoleColor(cKey)}
                      className={`p-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                        roleColor === cKey
                          ? `${cVal.badgeClass} ring-2 ring-indigo-500 scale-105 shadow-2xs`
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {cVal.label}
                    </button>
                  ))}
                </div>
              </div>

              {!editingRole && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    System Key / Code (Optional)
                  </label>
                  <Input
                    value={roleKey}
                    onChange={(e) => setRoleKey(e.target.value)}
                    placeholder="Auto-generated if blank e.g. supervisor"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="font-bold border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingRole}
                  className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs"
                >
                  <Save size={15} className="mr-1.5" />
                  {editingRole ? "Save Changes" : "Create Role"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
