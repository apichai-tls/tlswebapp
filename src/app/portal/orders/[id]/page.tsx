"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Truck,
  Sparkles,
  FileText,
  Printer,
  Camera,
  MapPin,
  MessageCircle,
  ExternalLink,
  X,
  Receipt,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";

const TIMELINE_STEPS = [
  {
    step: 1,
    titleEn: "Pickup Scheduled",
    titleTh: "นัดหมายรับผ้าแล้ว",
    descEn: "Pickup request confirmed with our rider team",
    descTh: "ยืนยันเวลานัดรับผ้ากับทีมไรเดอร์แล้ว",
    icon: Clock,
  },
  {
    step: 2,
    titleEn: "Picked Up by Rider",
    titleTh: "ไรเดอร์รับผ้าแล้ว",
    descEn: "Laundry bag collected and in transit to hub",
    descTh: "รับถุงผ้าจากคอนโดของคุณและกำลังนำเข้าศูนย์ซักรีด",
    icon: Truck,
  },
  {
    step: 3,
    titleEn: "Cleaning & Care in Progress",
    titleTh: "กำลังซัก อบ รีด",
    descEn: "Garments sorted and professionally cleaned",
    descTh: "คัดแยกและทำความสะอาดตามมาตรฐานวิชาชีพ",
    icon: Sparkles,
  },
  {
    step: 4,
    titleEn: "Quality Checked & Billed",
    titleTh: "ตรวจเช็คคุณภาพ & สรุปบิล",
    descEn: "Inspection complete, itemized bill generated",
    descTh: "ตรวจสอบความเรียบร้อยและออกใบแจ้งหนี้แล้ว",
    icon: FileText,
  },
  {
    step: 5,
    titleEn: "Out for Delivery",
    titleTh: "กำลังนำส่งคืน",
    descEn: "Fresh laundry is on the way back to you",
    descTh: "ไรเดอร์กำลังนำผ้าสะอาดไปส่งคืนที่คอนโด",
    icon: Truck,
  },
  {
    step: 6,
    titleEn: "Delivered",
    titleTh: "จัดส่งสำเร็จ",
    descEn: "Handed over or left safely with juristic office",
    descTh: "ส่งมอบผ้าสะอาดหรือฝากไว้ที่นิติบุคคลเรียบร้อยแล้ว",
    icon: PackageCheck,
  },
];

export default function PortalOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { lang, portalFetch } = useCustomerAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showDigitalReceipt, setShowDigitalReceipt] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalFetch(`/api/portal/orders/${id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
      }
    } catch (err) {
      console.error("Order detail fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [id, portalFetch]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-36 rounded-xl bg-slate-200/70" />
        <div className="h-64 rounded-3xl bg-slate-200/70" />
        <div className="h-56 rounded-3xl bg-slate-200/70" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
        <p className="font-bold text-slate-800">
          {lang === "en" ? "Order not found" : "ไม่พบข้อมูลรายการซักผ้า"}
        </p>
        <Link
          href="/portal/orders"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === "en" ? "Back to Orders" : "กลับไปหน้ารายการซัก"}</span>
        </Link>
      </div>
    );
  }

  const currentStep = order.tracking?.currentStep || 1;
  const allPhotos: { label: string; url: string }[] = [
    ...(order.bagImageUrls || []).map((url: string, i: number) => ({
      label: lang === "en" ? `Laundry Bag #${i + 1}` : `ถุงผ้า #${i + 1}`,
      url,
    })),
    ...(order.pickupProofUrls || []).map((url: string, i: number) => ({
      label: lang === "en" ? `Pickup Proof #${i + 1}` : `หลักฐานรับผ้า #${i + 1}`,
      url,
    })),
    ...(order.deliveryProofUrls || []).map((url: string, i: number) => ({
      label:
        lang === "en" ? `Delivery Proof #${i + 1}` : `หลักฐานส่งคืน #${i + 1}`,
      url,
    })),
  ];

  const billDocs: { type: "proforma" | "receipt"; label: string; url: string }[] = [
    ...(order.receiptUrls || []).map((url: string) => ({
      type: "receipt" as const,
      label: lang === "en" ? "Official Receipt" : "ใบเสร็จรับเงิน",
      url,
    })),
    ...(order.proformaUrls || []).map((url: string) => ({
      type: "proforma" as const,
      label: lang === "en" ? "Proforma Invoice" : "ใบแจ้งหนี้ (Proforma)",
      url,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Top Back Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/portal/orders"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === "en" ? "Back to Orders" : "กลับหน้ารายการซัก"}</span>
        </Link>

        <button
          type="button"
          onClick={() => setShowDigitalReceipt(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold transition-colors"
        >
          <Receipt className="w-4 h-4" />
          <span>
            {order.isPaid
              ? lang === "en"
                ? "Digital Receipt"
                : "ดูใบเสร็จดิจิทัล"
              : lang === "en"
              ? "Digital Bill Summary"
              : "ดูสรุปยอดบิล"}
          </span>
        </button>
      </div>

      {/* Order Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {order.billNo}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  order.isPaid
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {order.isPaid
                  ? lang === "en"
                    ? "PAID"
                    : "ชำระเงินแล้ว"
                  : order.totalAmount > 0
                  ? lang === "en"
                    ? "AWAITING PAYMENT"
                    : "รอชำระเงิน"
                  : lang === "en"
                  ? "IN INSPECTION"
                  : "กำลังตรวจเช็ครายการ"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {lang === "en" ? "Created on " : "วันที่เปิดบิล "}
              {new Date(order.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs font-semibold text-slate-400 uppercase">
              {lang === "en" ? "Total Amount" : "ยอดรวมสุทธิ"}
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {order.totalAmount > 0
                ? `฿${order.totalAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}`
                : lang === "en"
                ? "Calculating..."
                : "รอสรุปยอด"}
            </div>
            {order.paymentChannel && (
              <div className="text-[11px] font-medium text-slate-500">
                {lang === "en" ? "Paid via " : "ชำระผ่าน "}
                {order.paymentChannel}
              </div>
            )}
          </div>
        </div>

        {/* 6-Step Live Tracking Timeline */}
        <div className="pt-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            {lang === "en" ? "Order Progress Timeline" : "สถานะการดำเนินงาน 6 ขั้นตอน"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TIMELINE_STEPS.map((st) => {
              const Icon = st.icon;
              const isCompleted = currentStep > st.step || currentStep === 6;
              const isCurrent = currentStep === st.step && currentStep !== 6;

              return (
                <div
                  key={st.step}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all ${
                    isCurrent
                      ? "bg-sky-50/70 border-sky-300 ring-2 ring-sky-500/15"
                      : isCompleted
                      ? "bg-emerald-50/30 border-emerald-200/70"
                      : "bg-slate-50/50 border-slate-100 opacity-60"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isCurrent
                        ? "bg-sky-600 text-white shadow-xs"
                        : isCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400">
                        STEP {st.step}
                      </span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.2 rounded-full bg-sky-600 text-white text-[9px] font-bold">
                          {lang === "en" ? "CURRENT" : "ปัจจุบัน"}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-900 text-xs mt-0.5">
                      {lang === "en" ? st.titleEn : st.titleTh}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {lang === "en" ? st.descEn : st.descTh}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* OFFICIAL PROFORMA INVOICE / RECEIPT IMAGES FROM POS */}
      {billDocs.length > 0 && (
        <div className="bg-white rounded-3xl border border-indigo-200/80 shadow-xs p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  {lang === "en"
                    ? "Official Bill & Receipt Documents"
                    : "เอกสารใบแจ้งหนี้และใบเสร็จรับเงิน"}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === "en"
                    ? "Tap any document to view full size or save to your phone"
                    : "แตะที่รูปบิลเพื่อดูขนาดเต็มหรือบันทึกลงโทรศัพท์"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {billDocs.map((doc, idx) => (
              <div
                key={idx}
                className="group relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 hover:border-indigo-400 transition-all"
              >
                <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    {doc.label}
                  </span>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                  >
                    <span>{lang === "en" ? "Open Full" : "เปิดดู"}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewImage(doc.url)}
                  className="block w-full max-h-80 overflow-hidden bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={doc.url}
                    alt={doc.label}
                    className="w-full h-64 object-contain group-hover:scale-[1.02] transition-transform"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ITEMIZED BREAKDOWN */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
            {lang === "en" ? "Itemized Garment List" : "รายการผ้าและค่าบริการ"}
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            {order.itemsCount || 0} {lang === "en" ? "items" : "ชิ้น"}
          </span>
        </div>

        {order.items && order.items.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {order.items.map((item: any, idx: number) => (
              <div
                key={item.id || idx}
                className="py-3 flex items-center justify-between gap-4 text-sm"
              >
                <div>
                  <div className="font-bold text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-400">
                    ฿{Number(item.price || 0).toLocaleString()} × {item.quantity}
                    {item.note ? ` • ${item.note}` : ""}
                  </div>
                </div>
                <div className="font-bold text-slate-900">
                  ฿{Number(item.total || 0).toLocaleString()}
                </div>
              </div>
            ))}

            <div className="pt-4 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-500">
                <span>{lang === "en" ? "Items Subtotal" : "รวมค่าซักรีด"}</span>
                <span>฿{Number(order.itemsSubtotal || 0).toLocaleString()}</span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>
                    {lang === "en" ? "Pickup & Delivery Fee" : "ค่ารับ-ส่งผ้า"}
                  </span>
                  <span>฿{Number(order.deliveryFee).toLocaleString()}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>{lang === "en" ? "Discount" : "ส่วนลด"}</span>
                  <span>-฿{Number(order.discount).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-extrabold text-slate-900">
                <span>{lang === "en" ? "Net Total" : "ยอดรวมสุทธิ"}</span>
                <span>
                  ฿
                  {Number(order.totalAmount || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            {lang === "en"
              ? "Your laundry bag is being inspected and itemized at our hub. Itemized pricing will appear here shortly."
              : "ผ้าของคุณกำลังอยู่ระหว่างการคัดแยกและนับจำนวนที่ศูนย์ซักรีด รายการแต่ละชิ้นจะแสดงที่นี่เมื่อตรวจเช็คเสร็จสิ้น"}
          </div>
        )}
      </div>

      {/* PHOTO EVIDENCE GALLERY */}
      {allPhotos.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-4 h-4 text-sky-600" />
            <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
              {lang === "en"
                ? "Pickup, Bag & Delivery Photos"
                : "รูปถ่ายถุงผ้าและหลักฐานการรับ-ส่ง"}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allPhotos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPreviewImage(p.url)}
                className="group relative rounded-2xl overflow-hidden border border-slate-200 aspect-square bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.label}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2.5 text-left">
                  <span className="text-[11px] font-bold text-white">
                    {p.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ADDRESS & CONCIERGE HELP */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase">
              {lang === "en" ? "Pickup & Return Location" : "สถานที่รับ-ส่งผ้า"}
            </div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {order.pickupLocation}
            </div>
            {order.remark && (
              <div className="text-xs text-slate-500 mt-0.5">{order.remark}</div>
            )}
          </div>
        </div>

        <a
          href={`https://wa.me/66614122245?text=${encodeURIComponent(
            `Hi That Laundry Shop, I'm checking on my order ${order.billNo}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0"
        >
          <MessageCircle className="w-4 h-4" />
          <span>
            {lang === "en"
              ? "Ask Concierge on WhatsApp"
              : "สอบถามผ่าน WhatsApp"}
          </span>
        </a>
      </div>

      {/* FULLSCREEN IMAGE LIGHTBOX MODAL */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end gap-2 mb-2">
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{lang === "en" ? "Open Original" : "เปิดไฟล์ต้นฉบับ"}</span>
              </a>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[82vh] w-auto object-contain rounded-2xl bg-white"
            />
          </div>
        </div>
      )}

      {/* DIGITAL PRINTABLE RECEIPT / PROFORMA MODAL */}
      {showDigitalReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDigitalReceipt(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                {order.brand !== "noname_laundry" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src="/logo.png"
                    alt="That Laundry Shop"
                    className="h-10 w-auto object-contain"
                  />
                )}
                <div>
                  <div className="font-extrabold text-slate-900 text-base">
                    {order.brand === "noname_laundry"
                      ? "NONAME LAUNDRY"
                      : "THAT LAUNDRY SHOP"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {order.isPaid ? "OFFICIAL RECEIPT" : "PROFORMA INVOICE"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                  title="Print / Save PDF"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDigitalReceipt(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-xs space-y-1 text-slate-600 bg-slate-50 p-3.5 rounded-2xl">
              <div className="flex justify-between">
                <span className="text-slate-400">Document No:</span>
                <span className="font-bold text-slate-900">{order.billNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="font-bold text-slate-900">
                  {order.customerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date:</span>
                <span>
                  {new Date(order.paidAt || order.createdAt).toLocaleDateString(
                    "en-GB",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span
                  className={`font-bold ${
                    order.isPaid ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {order.isPaid ? "PAID" : "UNPAID"}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {(order.items || []).map((it: any, idx: number) => (
                <div key={idx} className="py-2 flex justify-between">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {it.name}
                    </span>{" "}
                    <span className="text-slate-400">×{it.quantity}</span>
                  </div>
                  <span className="font-bold text-slate-900">
                    ฿{Number(it.total || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Delivery Fee</span>
                  <span>฿{Number(order.deliveryFee).toLocaleString()}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>-฿{Number(order.discount).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1">
                <span>Total</span>
                <span>
                  ฿
                  {Number(order.totalAmount || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
