"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { toast } from "sonner";
import {
  CalendarPlus,
  MapPin,
  Building2,
  CheckCircle2,
  Loader2,
  ShoppingBag,
  Camera,
  X,
  Ticket,
  Minus,
  Plus,
  Shirt,
} from "lucide-react";

const TIME_SLOTS = [
  { id: "09:00 - 12:00", labelEn: "09:00 - 12:00", subEn: "Morning", subTh: "ช่วงเช้า" },
  { id: "13:00 - 16:00", labelEn: "13:00 - 16:00", subEn: "Afternoon", subTh: "ช่วงบ่าย" },
  { id: "16:00 - 19:00", labelEn: "16:00 - 19:00", subEn: "Evening", subTh: "ช่วงเย็น" },
];

const EXPRESS_OPTIONS = [
  {
    id: "Standard: Next Day Deliver Any Time Before 18:00 (No Fixed Time)",
    titleEn: "Standard: Next Day Deliver Any Time Before 18:00 (No Fixed Time)",
    titleTh: "Standard: ส่งคืนวันถัดไป ก่อน 18:00 น. (ไม่ระบุเวลาตายตัว)",
    subEn: "",
    subTh: "",
  },
  {
    id: "Express 50: Deliver Same Day Before at 18:00",
    titleEn: "Express 50: Deliver Same Day Before at 18:00",
    titleTh: "Express 50: ส่งคืนภายในวันเดียวกัน ก่อน 18:00 น.",
    subEn: "(+50% Surcharge, if picked up before 12:00)",
    subTh: "(+50% ค่ารบริการด่วน เมื่อรับผ้าก่อน 12:00 น.)",
  },
  {
    id: "Express 50: Deliver (Next Day) at 12:00",
    titleEn: "Express 50: Deliver (Next Day) at 12:00",
    titleTh: "Express 50: ส่งคืนวันถัดไป เวลา 12:00 น.",
    subEn: "(+50% Surcharge, if picked up before 16:00)",
    subTh: "(+50% ค่าบริการด่วน เมื่อรับผ้าก่อน 16:00 น.)",
  },
  {
    id: "Express 100: Deliver Same Day Before 19:00",
    titleEn: "Express 100: Deliver Same Day Before 19:00",
    titleTh: "Express 100: ส่งคืนภายในวันเดียวกัน ก่อน 19:00 น.",
    subEn: "(+100% Surcharge Pickup anytime before 15:00-Subject to availability)",
    subTh: "(+100% ค่าบริการด่วน รับผ้าก่อน 15:00 น. ขึ้นอยู่กับคิวว่าง)",
  },
];

const LAUNDRY_TYPES = [
  {
    id: "Wash & Fold (Weight)",
    labelEn: "Wash & Fold (Weight)",
    labelTh: "ซัก อบ พับ (ชั่งน้ำหนัก)",
  },
  {
    id: "Wash, Iron & Fold (Weight)",
    labelEn: "Wash, Iron & Fold (Weight)",
    labelTh: "ซัก รีด และพับ (ชั่งน้ำหนัก)",
  },
  {
    id: "Wash, Iron & Hang (Weight)",
    labelEn: "Wash, Iron & Hang (Weight)",
    labelTh: "ซัก รีด และใส่ไม้แขวน (ชั่งน้ำหนัก)",
  },
  {
    id: "Dry cleaning",
    labelEn: "Dry cleaning",
    labelTh: "ซักแห้ง (Dry cleaning)",
  },
  {
    id: "Linens & Beddings",
    labelEn: "Linens & Beddings",
    labelTh: "ชุดเครื่องนอนและผ้านวม",
  },
  {
    id: "Mixed Service",
    labelEn: "Mixed Service",
    labelTh: "บริการแบบผสม (Mixed Service)",
  },
  {
    id: "Ironing & Pressing only",
    labelEn: "Ironing & Pressing only",
    labelTh: "รีดอย่างเดียว (Ironing only)",
  },
  {
    id: "Others",
    labelEn: "Others",
    labelTh: "อื่นๆ (Others)",
  },
];

export default function PortalBookPickupPage() {
  const router = useRouter();
  const { customer, lang, portalFetch, refreshCustomer } = useCustomerAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Address selection state
  const [selectedAddressId, setSelectedAddressId] = useState<string>("custom");
  const [condoName, setCondoName] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  // Express Service Option state
  const [expressOption, setExpressOption] = useState<string>(EXPRESS_OPTIONS[0].id);

  // Schedule state
  const [scheduledDate, setScheduledDate] = useState(tomorrowStr);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0].id);

  // Type of Laundry, Bags & Photos state
  const [selectedServices, setSelectedServices] = useState<string[]>([
    "Wash & Fold (Weight)",
  ]);
  const [bagCount, setBagCount] = useState<number>(1);
  const [bagImageUrls, setBagImageUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Juristic & Voucher & Notes state
  const [leaveWithJuristic, setLeaveWithJuristic] = useState(true);
  const [juristicTagOrDesk, setJuristicTagOrDesk] = useState("");
  const [activeVouchers, setActiveVouchers] = useState<any[]>([]);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initialize default selected address from customer profile
  useEffect(() => {
    if (!customer) return;
    if (customer.addresses && customer.addresses.length > 0) {
      setSelectedAddressId(customer.addresses[0].id);
      setRoomNumber(customer.addresses[0].roomNumber || customer.roomNo || "");
    } else if (customer.defaultAddress) {
      setSelectedAddressId("pos_default");
      setRoomNumber(customer.roomNo || "");
    } else {
      setSelectedAddressId("custom");
      setRoomNumber(customer.roomNo || "");
    }
  }, [customer]);

  // Fetch customer's active vouchers so they can apply one to the booking
  useEffect(() => {
    if (!customer) return;
    portalFetch("/api/portal/wallet", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.vouchers) {
          const active = data.vouchers.filter((v: any) => v.status === "ACTIVE");
          setActiveVouchers(active);
        }
      })
      .catch(() => {});
  }, [customer, portalFetch]);

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((s) => s !== id)
          : prev
        : [...prev, id]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("subType", "bags");

        const res = await portalFetch("/api/portal/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.url) {
          setBagImageUrls((prev) => [...prev, data.url]);
        } else {
          toast.error(data.error || "Could not upload photo");
        }
      }
      toast.success(
        lang === "en" ? "Bag photo attached!" : "แนบรูปถุงผ้าเรียบร้อยแล้ว"
      );
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeBagPhoto = (urlToRemove: string) => {
    setBagImageUrls((prev) => prev.filter((u) => u !== urlToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      selectedAddressId === "custom" &&
      !condoName.trim() &&
      !customAddress.trim()
    ) {
      toast.error(
        lang === "en"
          ? "Please enter your Condo/Building name or pickup address"
          : "กรุณาระบุชื่อคอนโดหรือที่อยู่รับผ้า"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await portalFetch("/api/portal/orders", {
        method: "POST",
        body: JSON.stringify({
          addressId: selectedAddressId,
          condoName: condoName.trim() || null,
          customAddress: customAddress.trim() || null,
          roomNumber: roomNumber.trim() || null,
          saveNewAddress,
          tripType: "full_service",
          expressOption,
          scheduledDate,
          timeSlot,
          serviceTypes: selectedServices,
          bagCount,
          bagImageUrls,
          voucherCode: selectedVoucherCode || null,
          leaveWithJuristic,
          juristicTagOrDesk: juristicTagOrDesk.trim() || null,
          note: note.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not schedule pickup");
        return;
      }

      if (selectedAddressId === "custom" && saveNewAddress) {
        refreshCustomer().catch(() => {});
      }

      toast.success(
        lang === "en"
          ? "Pickup booked! Our team and rider have been notified."
          : "จองคิวรับผ้าสำเร็จ! ข้อมูลส่งเข้าหน้าร้านและทีมไรเดอร์แล้ว"
      );
      router.push(`/portal/orders/${data.order.id}`);
    } catch {
      toast.error("Failed to book pickup. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const savedAddresses = customer?.addresses || [];
  const hasPosDefaultAddress = Boolean(customer?.defaultAddress);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          {lang === "en"
            ? "Schedule a Laundry Pickup"
            : "จองคิวเรียกรถเข้ารับผ้า"}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {lang === "en"
            ? "Our rider will collect your laundry bag from your condo juristic desk or lobby and return it fresh."
            : "ไรเดอร์จะเข้าไปรับถุงผ้าที่นิติบุคคลคอนโดหรือล็อบบี้ตามวันและเวลาที่คุณนัดหมาย"}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6"
      >
        {/* STEP 1: PICKUP LOCATION / CONDO */}
        <div className="space-y-3">
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">
            1. {lang === "en" ? "Pickup & Delivery Location" : "สถานที่รับ-ส่งผ้า / คอนโด"}
          </label>

          <div className="grid grid-cols-1 gap-2.5">
            {hasPosDefaultAddress && savedAddresses.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedAddressId("pos_default");
                  setRoomNumber(customer?.roomNo || "");
                }}
                className={`text-left p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  selectedAddressId === "pos_default"
                    ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/15"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <MapPin
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      selectedAddressId === "pos_default"
                        ? "text-sky-600"
                        : "text-slate-400"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">
                        {lang === "en" ? "Registered Address" : "ที่อยู่หลักในระบบ"}
                      </span>
                      {customer?.roomNo && (
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                          Room {customer.roomNo}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {customer?.defaultAddress}
                    </div>
                  </div>
                </div>
                {selectedAddressId === "pos_default" && (
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                )}
              </button>
            )}

            {savedAddresses.map((addr) => {
              const active = selectedAddressId === addr.id;
              return (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => {
                    setSelectedAddressId(addr.id);
                    setRoomNumber(addr.roomNumber || customer?.roomNo || "");
                  }}
                  className={`text-left p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                    active
                      ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/15"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <MapPin
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        active ? "text-sky-600" : "text-slate-400"
                      }`}
                    />
                    <div>
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {addr.placeName || addr.label}{" "}
                        {addr.roomNumber ? `• Room ${addr.roomNumber}` : ""}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {addr.address}
                      </div>
                    </div>
                  </div>
                  {active && (
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                  )}
                </button>
              );
            })}

            {(hasPosDefaultAddress || savedAddresses.length > 0) && (
              <button
                type="button"
                onClick={() => setSelectedAddressId("custom")}
                className={`text-left p-3 rounded-2xl border text-xs font-bold transition-all ${
                  selectedAddressId === "custom"
                    ? "border-sky-500 bg-sky-50/60 text-sky-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                +{" "}
                {lang === "en"
                  ? "Use a New Condo / Another Address"
                  : "เพิ่มคอนโดหรือระบุที่อยู่อื่น"}
              </button>
            )}
          </div>

          {selectedAddressId !== "custom" ? (
            <div className="pt-1">
              <label className="block text-xs font-bold text-slate-600 mb-1">
                {lang === "en"
                  ? "Room / Unit Number (Confirm for Rider & Bill)"
                  : "เลขห้องพัก (ระบุเพื่อให้ไรเดอร์และแคชเชียร์อ้างอิง)"}
              </label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder={lang === "en" ? "e.g. 12A / 1204" : "เช่น 1204"}
                className="w-full sm:w-64 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold"
              />
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    <Building2 className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                    {lang === "en"
                      ? "Condo / Building / Hotel Name *"
                      : "ชื่อคอนโด / อาคาร / โรงแรม *"}
                  </label>
                  <input
                    type="text"
                    value={condoName}
                    onChange={(e) => setCondoName(e.target.value)}
                    placeholder={
                      lang === "en"
                        ? "e.g. Park Origin Thonglor"
                        : "เช่น พาร์ค ออริจิ้น ทองหล่อ"
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {lang === "en" ? "Room / Unit No. *" : "เลขห้อง *"}
                  </label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. 24/105"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  {lang === "en"
                    ? "Street / Soi / Tower Details"
                    : "ถนน / ซอย / อาคาร (เช่น Tower B)"}
                </label>
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  placeholder={
                    lang === "en"
                      ? "e.g. Sukhumvit 55, Tower B"
                      : "เช่น สุขุมวิท 55 อาคาร B"
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={saveNewAddress}
                  onChange={(e) => setSaveNewAddress(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600"
                />
                <span className="text-xs font-semibold text-slate-600">
                  {lang === "en"
                    ? "Save this address to my profile for future bookings"
                    : "บันทึกที่อยู่นี้ไว้ในสมุดที่อยู่สำหรับครั้งถัดไป"}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* STEP 2: PICKUP DATE & TIME WINDOW */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">
            2. {lang === "en" ? "Pickup Date & Time Window" : "วันและเวลานัดรับผ้า"}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {lang === "en" ? "Pickup Date" : "วันที่ให้เข้ารับผ้า"}
              </label>
              <input
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {lang === "en" ? "Pickup Time Window" : "รอบเวลาเข้ารับผ้า"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const active = timeSlot === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setTimeSlot(slot.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        active
                          ? "border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-500/15"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-xs font-extrabold">{slot.labelEn}</div>
                      <div className="text-[10px] text-slate-500">
                        {lang === "en" ? slot.subEn : slot.subTh}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* STEP 3: EXPRESS SERVICE OPTION (4 CARDS MATCHING SCREENSHOT) */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <h2 className="text-base font-bold text-slate-800">
            {lang === "en" ? "Express Service Option" : "ตัวเลือกความเร็วในการส่งคืน (Express Service Option)"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPRESS_OPTIONS.map((opt) => {
              const selected = expressOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpressOption(opt.id)}
                  className={`p-4 rounded-2xl border text-center flex flex-col items-center justify-center min-h-[112px] transition-all ${
                    selected
                      ? "bg-[#1e2638] border-[#1e2638] text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <div
                    className={`text-xs sm:text-sm font-bold leading-snug ${
                      selected ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {lang === "en" ? opt.titleEn : opt.titleTh}
                  </div>
                  {(opt.subEn || opt.subTh) && (
                    <div
                      className={`text-[11px] italic mt-1.5 leading-snug ${
                        selected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {lang === "en" ? opt.subEn : opt.subTh}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 4: TYPE OF LAUNDRY (8 CARDS IN 2-COLUMN GRID MATCHING SCREENSHOT) */}
        <div className="space-y-3.5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Shirt className="w-5 h-5 text-slate-700 fill-slate-700/15" />
            <h2 className="text-base sm:text-lg font-extrabold text-slate-800">
              {lang === "en" ? "Type of Laundry" : "ประเภทการซักรีด (Type of Laundry)"}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LAUNDRY_TYPES.map((srv) => {
              const checked = selectedServices.includes(srv.id);
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => toggleService(srv.id)}
                  className={`py-4 px-4 rounded-2xl border text-center text-xs sm:text-sm font-semibold transition-all ${
                    checked
                      ? "bg-[#1e2638] border-[#1e2638] text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  {lang === "en" ? srv.labelEn : srv.labelTh}
                </button>
              );
            })}
          </div>

          {/* Bag Count & Bag Photo Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {lang === "en" ? "Number of Bags" : "จำนวนถุงผ้าที่ฝาก"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {lang === "en" ? "For rider verification" : "เพื่อให้ไรเดอร์ตรวจนับ"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBagCount((c) => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center font-extrabold text-sm text-slate-900">
                  {bagCount}
                </span>
                <button
                  type="button"
                  onClick={() => setBagCount((c) => Math.min(20, c + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {lang === "en"
                      ? "Photo of Laundry Bag"
                      : "ถ่ายรูปถุงผ้า / จุดที่ฝาก"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {lang === "en"
                      ? "Optional — helps rider spot your bag"
                      : "ช่วยให้ไรเดอร์หยิบถูกถุงที่นิติ"}
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-indigo-600 shrink-0 shadow-2xs"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : lang === "en" ? (
                  "Add Photo"
                ) : (
                  "แนบรูป"
                )}
              </button>
            </div>
          </div>

          {bagImageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2.5 pt-1">
              {bagImageUrls.map((url, idx) => (
                <div
                  key={idx}
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Bag ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeBagPhoto(url)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 5: JURISTIC HANDOVER, VOUCHER & NOTES */}
        <div className="space-y-3.5 pt-4 border-t border-slate-100">
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">
            5. {lang === "en" ? "Handover, Voucher & Instructions" : "การฝากนิติบุคคล คูปอง และหมายเหตุ"}
          </label>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={leaveWithJuristic}
                onChange={(e) => setLeaveWithJuristic(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                {lang === "en"
                  ? "Leave / Collect via Condo Juristic or Lobby Concierge"
                  : "ฝากรับ-ส่งผ้าไว้ที่นิติบุคคล / ล็อบบี้คอนโด"}
              </span>
            </label>

            {leaveWithJuristic && (
              <div>
                <input
                  type="text"
                  value={juristicTagOrDesk}
                  onChange={(e) => setJuristicTagOrDesk(e.target.value)}
                  placeholder={
                    lang === "en"
                      ? "Tower / Juristic Desk or Tag No. (e.g. Tower A Lobby, Tag #42)"
                      : "ระบุอาคาร/จุดฝาก หรือเลขใบรับฝากนิติ (ถ้ามี)"
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                />
              </div>
            )}
          </div>

          {activeVouchers.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                <Ticket className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
                {lang === "en"
                  ? "Apply Member Voucher / Coupon (Optional)"
                  : "เลือกใช้คูปองส่วนลดที่มี (ถ้ามี)"}
              </label>
              <select
                value={selectedVoucherCode}
                onChange={(e) => setSelectedVoucherCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-200 bg-amber-50/40 text-xs sm:text-sm font-bold text-slate-800"
              >
                <option value="">
                  {lang === "en"
                    ? "-- Do not use a voucher for this order --"
                    : "-- ไม่ใช้คูปองในออเดอร์นี้ --"}
                </option>
                {activeVouchers.map((v) => (
                  <option key={v.id} value={v.code}>
                    [{v.code}] {v.name} (
                    {v.discountType === "PERCENTAGE"
                      ? `${v.discountValue}% OFF`
                      : `฿${v.discountValue} OFF`}
                    )
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              {lang === "en"
                ? "Special Care Instructions (Optional)"
                : "คำแนะนำพิเศษสำหรับการซักหรือส่งผ้า (ถ้ามี)"}
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                lang === "en"
                  ? "e.g. Please use low heat dryer, white linen shirt has a coffee stain on cuff"
                  : "เช่น ขออบอุณหภูมิต่ำ เสื้อเชิ้ตสีขาวมีรอยเปื้อนกาแฟที่แขนเสื้อ"
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || uploadingPhoto}
          className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-sky-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CalendarPlus className="w-4 h-4" />
              <span>
                {lang === "en"
                  ? "Confirm Pickup Booking"
                  : "ยืนยันการจองคิวรับผ้า"}
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
