"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, Edit, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getUsers, createUser, updateUser, deleteUser } from "@/actions/users";
import { useAuth } from "@/providers/auth-provider";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  password?: string;
  permissions: string;
  area?: string | null;
  branchId?: string | null;
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
  { id: "reports", label: "Reports" },
  { id: "activity-logs", label: "Activity Logs" },
  { id: "settings", label: "Settings" },
  { id: "users", label: "Manage Users" }
];

export function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [area, setArea] = useState("BKK");
  const [branchId, setBranchId] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await getUsers();
      if (res?.success) {
        setUsers(res.data as AdminUser[]);
      } else {
        toast.error(res?.error || "Failed to load users");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error("Network error: " + msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setRole("staff");
    setArea("BKK");
    setBranchId("");
    setSelectedPerms([]);
    setEditingId(null);
    setIsEditing(false);
  };

  const handleEdit = (user: AdminUser) => {
    setEmail(user.email);
    setPassword("");
    setName(user.name);
    setRole(user.role);
    setArea(user.area || "BKK");
    setBranchId(user.branchId || "");
    try {
      setSelectedPerms(JSON.parse(user.permissions));
    } catch {
      setSelectedPerms([]);
    }
    setEditingId(user.id);
    setIsEditing(true);
  };

  const togglePermission = (id: string) => {
    if (selectedPerms.includes(id)) {
      setSelectedPerms(selectedPerms.filter(p => p !== id));
    } else {
      setSelectedPerms([...selectedPerms, id]);
    }
  };

  const selectAllPerms = () => {
    setSelectedPerms(MENU_PERMISSIONS.map(p => p.id));
  };
  
  const clearAllPerms = () => {
    setSelectedPerms([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return toast.error("Email and Name are required");

    try {
      if (editingId) {
        const res = await updateUser(editingId, { 
          name, 
          email, 
          password: password || undefined, 
          role, 
          area: area || null, 
          branchId: branchId || null, 
          permissions: selectedPerms 
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
          area: area || null, 
          branchId: branchId || null, 
          permissions: selectedPerms 
        });
        if (!res?.success) throw new Error(res?.error || "Failed to create user");
        toast.success("User created successfully");
      }
      resetForm();
      fetchUsers();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg || "Operation failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await deleteUser(id, user?.email || "");
      if (!res?.success) throw new Error(res?.error || "Failed to delete user");
      
      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg || "Failed to delete user");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Manage Users</h1>
            <p className="text-sm font-medium text-slate-500">Add staff accounts and configure menu permissions</p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-indigo-600 hover:bg-indigo-700 font-bold">
            <Plus size={18} className="mr-2" /> Add User
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "Edit User Account" : "Create New User"}
            </h2>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Somchai S." required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email (Login ID)</label>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="e.g. staff1@tls.com" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Password {editingId && <span className="text-slate-400 font-normal lowercase">(leave blank to keep current)</span>}
                </label>
                <Input value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder="Password" required={!editingId} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Role Label</label>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="cso">CSO</option>
                  <option value="staff">Staff</option>
                  <option value="rider">Rider</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Area / Region</label>
                <select 
                  value={area || "BKK"} 
                  onChange={e => setArea(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10"
                >
                  <option value="ALL">ALL (All Regions)</option>
                  <option value="BKK">BKK (Bangkok Region)</option>
                  <option value="PTY">PTY (Pattaya Region)</option>
                </select>
              </div>

            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Menu Access Permissions</label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllPerms} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">Select All</button>
                  <button type="button" onClick={clearAllPerms} className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">Clear</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {MENU_PERMISSIONS.map(perm => (
                  <label key={perm.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedPerms.includes(perm.id) ? 'bg-indigo-100' : 'hover:bg-slate-100'}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedPerms.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className={`text-sm font-bold ${selectedPerms.includes(perm.id) ? 'text-indigo-900' : 'text-slate-600'}`}>
                      {perm.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={resetForm} className="font-bold border-slate-200">
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 font-bold">
                <Save size={16} className="mr-2" />
                {editingId ? "Save Changes" : "Create User"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase text-[10px] font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role & Area</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-medium">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => {
                  let perms: string[] = [];
                  try { perms = JSON.parse(user.permissions); } catch {}
                  
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full ${
                          user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                          user.role === 'manager' ? 'bg-emerald-100 text-emerald-700' :
                          user.role === 'rider' ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {user.role}
                        </span>
                        {user.area && (
                          <span className="ml-2 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full bg-blue-100 text-blue-700">
                            {user.area}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {user.role === 'admin' ? (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">All Access</span>
                          ) : (
                            perms.map(p => {
                              const label = MENU_PERMISSIONS.find(mp => mp.id === p)?.label || p;
                              return (
                                <span key={p} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                  {label}
                                </span>
                              )
                            })
                          )}
                          {user.role !== 'admin' && perms.length === 0 && (
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
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(user.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
      </div>
    </div>
  );
}
