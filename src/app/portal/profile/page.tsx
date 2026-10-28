"use client";

import React, { useState, useEffect } from "react";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { toast } from "sonner";
import {
  User,
  MapPin,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Save,
  Loader2,
  Building2,
} from "lucide-react";

export default function PortalProfilePage() {
  const { customer, lang, portalFetch, refreshCustomer } = useCustomerAuth();

  const [name, setName] = useState("");
  const [nickName, setNickName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappId, setWhatsappId] = useState("");
  const [lineId, setLineId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // New Address Modal / Form
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState("Home Condo");
  const [addrCondo, setAddrCondo] = useState("");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrRoom, setAddrRoom] = useState("");
  const [addrNote, setAddrNote] = useState("");
  const [addrJuristic, setAddrJuristic] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);

  // Change PIN / Password
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name || "");
      setNickName(customer.nickName || "");
      setEmail(customer.email || "");
      setWhatsappId(customer.whatsappId || customer.phone || "");
      setLineId(customer.lineId || "");
    }
  }, [customer]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await portalFetch("/api/portal/profile", {
        method: "PUT",
        body: JSON.stringify({
          name,
          nickName,
          email,
          whatsappId,
          lineId,
          companyName,
          taxId,
        }),
      });
      if (res.ok) {
        await refreshCustomer();
        toast.success(
          lang === "en" ? "Profile saved!" : "บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว"
        );
      } else {
        const err = await res.json();
        toast.error(err.error || "Could not update profile");
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrCondo.trim() && !addrStreet.trim()) {
      toast.error(
        lang === "en" ? "Please enter Condo or Street name" : "กรุณากรอกชื่อคอนโดหรือที่อยู่"
      );
      return;
    }

    setSavingAddress(true);
    try {
      const res = await portalFetch("/api/portal/profile", {
        method: "POST",
        body: JSON.stringify({
          action: "add_address",
          label: addrLabel,
          placeName: addrCondo,
          address: addrStreet || addrCondo,
          roomNumber: addrRoom,
          deliveryNote: addrNote,
          leaveWithJuristic: addrJuristic,
          isPrimary: true,
        }),
      });
      if (res.ok) {
        await refreshCustomer();
        setShowAddAddress(false);
        setAddrCondo("");
        setAddrStreet("");
        setAddrRoom("");
        setAddrNote("");
        toast.success(lang === "en" ? "Address added" : "เพิ่มที่อยู่เรียบร้อยแล้ว");
      }
    } catch {
      toast.error("Failed to add address");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleSetPrimaryAddress = async (addressId: string) => {
    try {
      const res = await portalFetch("/api/portal/profile", {
        method: "POST",
        body: JSON.stringify({ action: "set_primary", addressId }),
      });
      if (res.ok) {
        await refreshCustomer();
        toast.success(
          lang === "en" ? "Default address updated" : "เปลี่ยนที่อยู่หลักแล้ว"
        );
      }
    } catch {}
  };

  const handleDeleteAddress = async (addressId: string) => {
    try {
      const res = await portalFetch("/api/portal/profile", {
        method: "POST",
        body: JSON.stringify({ action: "delete_address", addressId }),
      });
      if (res.ok) {
        await refreshCustomer();
        toast.success(lang === "en" ? "Address removed" : "ลบที่อยู่แล้ว");
      }
    } catch {}
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      toast.error(
        lang === "en"
          ? "New PIN/Password must be at least 4 characters"
          : "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร"
      );
      return;
    }

    setSavingPassword(true);
    try {
      const res = await portalFetch("/api/portal/profile", {
        method: "PUT",
        body: JSON.stringify({
          action: "change_password",
          newPassword,
        }),
      });
      if (res.ok) {
        setNewPassword("");
        toast.success(
          lang === "en"
            ? "PIN / Password updated!"
            : "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"
        );
      }
    } catch {
      toast.error("Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  const addresses = customer?.addresses || [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Personal Information */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 text-base">
              {lang === "en" ? "Personal Profile" : "ข้อมูลส่วนตัว"}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === "en"
                ? `Registered Phone: ${customer?.phone || "-"}`
                : `เบอร์โทรที่ลงทะเบียน: ${customer?.phone || "-"}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {lang === "en" ? "Full Name" : "ชื่อ - นามสกุล"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {lang === "en" ? "Preferred Name / Nickname" : "ชื่อเล่น"}
            </label>
            <input
              type="text"
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {lang === "en" ? "Email Address" : "อีเมล"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {lang === "en" ? "WhatsApp Number" : "เบอร์ WhatsApp"}
            </label>
            <input
              type="text"
              value={whatsappId}
              onChange={(e) => setWhatsappId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs"
          >
            {savingProfile ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{lang === "en" ? "Save Profile" : "บันทึกข้อมูล"}</span>
          </button>
        </div>
      </form>

      {/* Condo & Address Book */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-base">
                {lang === "en" ? "Saved Condos & Addresses" : "สมุดที่อยู่รับ-ส่งผ้า"}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === "en"
                  ? "Manage your condo building, room number & juristic notes"
                  : "จัดการชื่อคอนโด เลขห้อง และจุดรับฝากนิติบุคคล"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddAddress(!showAddAddress)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === "en" ? "Add Address" : "เพิ่มที่อยู่"}</span>
          </button>
        </div>

        {showAddAddress && (
          <form
            onSubmit={handleAddAddress}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  <Building2 className="w-3.5 h-3.5 inline mr-1" />
                  {lang === "en" ? "Condo / Building Name *" : "ชื่อคอนโด / อาคาร *"}
                </label>
                <input
                  type="text"
                  value={addrCondo}
                  onChange={(e) => setAddrCondo(e.target.value)}
                  placeholder="e.g. Park Origin Thonglor"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  {lang === "en" ? "Room No." : "เลขห้อง"}
                </label>
                <input
                  type="text"
                  value={addrRoom}
                  onChange={(e) => setAddrRoom(e.target.value)}
                  placeholder="e.g. 88/12"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                {lang === "en" ? "Street / Area / Note" : "ถนน / ซอย / หมายเหตุส่งผ้า"}
              </label>
              <input
                type="text"
                value={addrStreet}
                onChange={(e) => setAddrStreet(e.target.value)}
                placeholder="e.g. Sukhumvit 55, Tower B Juristic"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddAddress(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white"
              >
                {lang === "en" ? "Cancel" : "ยกเลิก"}
              </button>
              <button
                type="submit"
                disabled={savingAddress}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                {savingAddress ? "Saving..." : lang === "en" ? "Save Address" : "บันทึกที่อยู่"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {addresses.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">
              {customer?.defaultAddress
                ? `Default: ${customer.defaultAddress} ${
                    customer.roomNo ? `(Room ${customer.roomNo})` : ""
                  }`
                : lang === "en"
                ? "No saved addresses yet."
                : "ยังไม่มีที่อยู่ที่บันทึกไว้"}
            </div>
          ) : (
            addresses.map((addr) => (
              <div
                key={addr.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                  addr.isPrimary
                    ? "border-sky-300 bg-sky-50/40"
                    : "border-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {addr.placeName || addr.label}
                    </span>
                    {addr.roomNumber && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                        Room {addr.roomNumber}
                      </span>
                    )}
                    {addr.isPrimary && (
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold">
                        {lang === "en" ? "Primary" : "ที่อยู่หลัก"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {addr.address}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!addr.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimaryAddress(addr.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                      title="Set as Primary"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Security / Change PIN */}
      <form
        onSubmit={handleChangePassword}
        className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 text-base">
              {lang === "en" ? "Change PIN / Password" : "เปลี่ยนรหัสผ่าน / PIN"}
            </h2>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={
              lang === "en"
                ? "Enter new PIN or password (4+ chars)"
                : "กรอกรหัสผ่านหรือ PIN ใหม่ (4 ตัวขึ้นไป)"
            }
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
          <button
            type="submit"
            disabled={savingPassword || !newPassword}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:opacity-50"
          >
            {savingPassword
              ? "Updating..."
              : lang === "en"
              ? "Update PIN"
              : "อัปเดตรหัสผ่าน"}
          </button>
        </div>
      </form>
    </div>
  );
}
