"use client";

import { useState, useEffect } from "react";
import {
  User,
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
  isActive?: boolean;
}

export const COLOR_CONFIG: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  indigo: { label: "Indigo", badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200", dotClass: "bg-indigo-500" },
  sky: { label: "Sky Blue", badgeClass: "bg-sky-100 text-sky-800 border-sky-200", dotClass: "bg-sky-500" },
  emerald: { label: "Emerald", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200", dotClass: "bg-emerald-500" },
  amber: { label: "Amber", badgeClass: "bg-amber-100 text-amber-800 border-amber-200", dotClass: "bg-amber-500" },
  rose: { label: "Rose", badgeClass: "bg-rose-100 text-rose-800 border-rose-200", dotClass: "bg-rose-500" },
  purple: { label: "Purple", badgeClass: "bg-purple-100 text-purple-800 border-purple-200", dotClass: "bg-purple-500" },
  teal: { label: "Teal", badgeClass: "bg-teal-100 text-teal-800 border-teal-200", dotClass: "bg-teal-500" },
  slate: { label: "Slate", badgeClass: "bg-slate-150 text-slate-700 border-slate-300", dotClass: "bg-slate-500" },
};

export function getBadgeClass(color?: string) {
  return COLOR_CONFIG[color || "slate"]?.badgeClass || COLOR_CONFIG.slate.badgeClass;
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
  { id: "activity-logs", label: "Activity Logs" },
  { id: "settings", label: "Settings" },
  { id: "users", label: "Manage Users" },
];

export function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"active" | "departments" | "roles" | "resigned">("active");

  const activeUsers = users.filter((u) => u.isActive !== false);
  const resignedUsers = users.filter((u) => u.isActive === false);
  const displayedUsers = viewMode === "active" ? activeUsers : resignedUsers;

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
  const [area, setArea] = useState("BKK");
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
    setArea("BKK");
    setSelectedPerms([]);
    setEditingId(null);
    setIsEditing(false);
  };

  const handleEdit = (user: AdminUser) => {
    setEmail(user.email);
    setPassword("");
    setName(user.name);
    setRole(user.role || "staff");
    setDepartment(
      user.department ||
        (user.role === "admin"
          ? "management"
          : user.role === "cso"
          ? "accounting_cso"
          : user.role === "rider"
          ? "logistics"
          : "branch_ops")
    );
    setIsDepartmentHead(user.isDepartmentHead ?? false);
    setArea(user.area || "BKK");
    try {
      setSelectedPerms(JSON.parse(user.permissions));
    } catch (e) {
      setSelectedPerms([]);
    }
    setEditingId(user.id);
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
    setSelectedPerms(MENU_PERMISSIONS.map((p) => p.id));
  };

  const clearAllPerms = () => {
    setSelectedPerms([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return toast.error("Email and Name are required");

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
          area: area || null,
          permissions: selectedPerms,
        });
        if (!res?.success) throw new Error(res?.error || "Failed to update user");
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
          area: area || null,
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
      const res = await deleteUser(id, user?.email || "");
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

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl shrink-0 shadow-2xs">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Manage Users & Organization
            </h1>
            <p className="text-xs sm:text-sm font-medium text-slate-500">
              Staff accounts, dynamic departments, custom role labels, and menu access permissions
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {viewMode === "departments" ? (
            <Button onClick={openCreateDeptModal} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs cursor-pointer">
              <Plus size={16} className="mr-1.5" /> Add Department
            </Button>
          ) : viewMode === "roles" ? (
            <Button onClick={openCreateRoleModal} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs cursor-pointer">
              <Plus size={16} className="mr-1.5" /> Add Role
            </Button>
          ) : (
            <Button onClick={() => { resetForm(); setIsEditing(true); }} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs cursor-pointer">
              <Plus size={16} className="mr-1.5" /> Add User
            </Button>
          )}
        </div>
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Area / Branch</label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10 cursor-pointer"
                >
                  <option value="ALL">ALL (All Branches)</option>
                  <option value="BKK">BKK (Bangkok)</option>
                  <option value="PTY">PTY (Pattaya)</option>
                </select>
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

      {/* Main Tabs Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-4 gap-6 shrink-0 overflow-x-auto">
          <button
            className={`pb-3 font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "active"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setViewMode("active")}
          >
            <User size={15} />
            <span>Active Users ({activeUsers.length})</span>
          </button>
          <button
            className={`pb-3 font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "departments"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setViewMode("departments")}
          >
            <Building2 size={15} />
            <span>Departments ({departments.length})</span>
          </button>
          <button
            className={`pb-3 font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "roles"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setViewMode("roles")}
          >
            <Tag size={15} />
            <span>Roles ({roles.length})</span>
          </button>
          <button
            className={`pb-3 font-bold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === "resigned"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setViewMode("resigned")}
          >
            <UserX size={15} />
            <span>Resigned ({resignedUsers.length})</span>
          </button>
        </div>

        {/* ─── TAB 1 & 4: USERS LIST ────────────────────────────────────────── */}
        {viewMode === "active" || viewMode === "resigned" ? (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase text-[10px] font-black tracking-wider">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Department & Role</th>
                  <th className="px-6 py-4 hidden md:table-cell">Permissions</th>
                  <th className="px-6 py-4">Password</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-medium">
                      Loading users...
                    </td>
                  </tr>
                ) : displayedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-medium">
                      No users found
                    </td>
                  </tr>
                ) : (
                  displayedUsers.map((user) => {
                    let perms: string[] = [];
                    try {
                      perms = JSON.parse(user.permissions);
                    } catch (e) {}

                    const deptObj = departments.find((d) => d.key === user.department);
                    const roleObj = roles.find((r) => r.key === user.role);

                    return (
                      <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{user.name}</span>
                            {user.isDepartmentHead && (
                              <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded-md bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5 shadow-2xs">
                                👑 Head
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </td>
                        <td className="px-6 py-4">
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
                                  roleObj?.color || (user.role === "admin" ? "indigo" : "slate")
                                )}`}
                              >
                                {roleObj?.name || user.role}
                              </span>
                              {user.area && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                                  {user.area}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {user.role === "admin" ? (
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                All Access
                              </span>
                            ) : (
                              perms.map((p) => {
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
                            {user.role !== "admin" && perms.length === 0 && (
                              <span className="text-[10px] font-bold text-red-500">No Access</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-500 inline-block tracking-widest font-bold">
                            ••••••••
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(user)}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit User"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleToggleResign(user)}
                              title={user.isActive !== false ? "Resign User" : "Reactivate User"}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                            >
                              {user.isActive !== false ? <UserX size={16} /> : <UserCheck size={16} />}
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : viewMode === "departments" ? (
          // ─── TAB 2: DEPARTMENTS MANAGEMENT ─────────────────────────────────
          <div className="overflow-x-auto flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 size={16} className="text-indigo-600" />
                  <span>Company Departments ({departments.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage department names, icons, color themes, and view member distribution.
                </p>
              </div>
              <Button onClick={openCreateDeptModal} size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs">
                <Plus size={14} className="mr-1" /> Add Department
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {departments.map((dept) => {
                const badgeClass = getBadgeClass(dept.color);
                const deptHeads = activeUsers.filter((u) => u.department === dept.key && u.isDepartmentHead);

                return (
                  <div
                    key={dept.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-2xl p-2 bg-slate-50 border border-slate-100 rounded-xl shadow-2xs">
                          {dept.icon}
                        </span>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
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
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
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
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${badgeClass}`}>
                        {COLOR_CONFIG[dept.color]?.label || dept.color}
                      </span>
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                        👥 {dept.userCount || 0} Members
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // ─── TAB 3: ROLES MANAGEMENT ───────────────────────────────────────
          <div className="overflow-x-auto flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Tag size={16} className="text-indigo-600" />
                  <span>Custom Role Labels ({roles.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Customize job title labels, color tags, and configure staff positions.
                </p>
              </div>
              <Button onClick={openCreateRoleModal} size="sm" className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-2xs">
                <Plus size={14} className="mr-1" /> Add Role
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {roles.map((r) => {
                const badgeClass = getBadgeClass(r.color);
                return (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${badgeClass}`}>
                          {r.name}
                        </span>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
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
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[10px]">Order: #{r.order}</span>
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
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
