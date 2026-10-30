"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CustomerAuthProvider,
  useCustomerAuth,
} from "@/providers/customer-auth-provider";
import {
  Home,
  Package,
  CalendarPlus,
  Wallet,
  User,
  Sparkles,
  Globe,
  MessageCircle,
  LogOut,
  Smartphone,
  Tablet,
  Monitor,
  RotateCcw,
  Wifi,
  BatteryCharging,
  Signal,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";

type DevicePreset = "iphone" | "max" | "ipad_portrait" | "ipad_landscape";

function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    customer,
    lang,
    setLang,
    logout,
    isLoading,
    portalEnabled,
    portalAllowed,
    isStaffPreview,
    enableStaffPreview,
    disableStaffPreview,
  } = useCustomerAuth();
  const isLoginPage = pathname?.startsWith("/portal/login");

  const [mounted, setMounted] = useState(false);
  const [isInsideIframe, setIsInsideIframe] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(false);
  const [simulatorMode, setSimulatorMode] = useState<boolean>(true);
  const [devicePreset, setDevicePreset] = useState<DevicePreset>("iphone");
  const [iframePath, setIframePath] = useState<string>(pathname || "/portal");
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [clockStr, setClockStr] = useState<string>("09:41");

  useEffect(() => {
    setMounted(true);
    const inFrame = typeof window !== "undefined" && window.self !== window.top;
    setIsInsideIframe(inFrame);

    const checkScreen = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    checkScreen();
    window.addEventListener("resize", checkScreen);

    try {
      const savedSim = localStorage.getItem("tls_portal_sim_mode");
      if (savedSim !== null) {
        setSimulatorMode(savedSim === "true");
      }
    } catch {}

    const updateClock = () => {
      const now = new Date();
      setClockStr(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);

    return () => {
      window.removeEventListener("resize", checkScreen);
      clearInterval(timer);
    };
  }, []);

  // Notify parent frame when navigating inside the iframe
  useEffect(() => {
    if (isInsideIframe && pathname && typeof window !== "undefined") {
      try {
        window.parent.postMessage(
          { type: "TLS_PORTAL_PATH_CHANGE", pathname },
          window.location.origin
        );
      } catch {}
    }
  }, [isInsideIframe, pathname]);

  // Listen to path changes from inside the simulator iframe
  useEffect(() => {
    if (isInsideIframe || typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "TLS_PORTAL_PATH_CHANGE" && event.data?.pathname) {
        setIframePath(event.data.pathname);
        if (window.location.pathname !== event.data.pathname) {
          window.history.replaceState(null, "", event.data.pathname);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isInsideIframe]);

  const toggleSimulatorMode = (nextVal: boolean) => {
    setSimulatorMode(nextVal);
    try {
      localStorage.setItem("tls_portal_sim_mode", String(nextVal));
    } catch {}
    if (!nextVal && iframePath && iframePath !== pathname) {
      router.replace(iframePath);
    } else if (nextVal && pathname) {
      setIframePath(pathname);
    }
  };

  // Render Mobile / iPad App Simulator Frame when on Desktop & Simulator Mode is ON & not already inside the iframe
  if (mounted && !isInsideIframe && !isMobileScreen && simulatorMode) {
    const isIpad = devicePreset === "ipad_portrait" || devicePreset === "ipad_landscape";
    const frameWidth =
      devicePreset === "iphone"
        ? 393
        : devicePreset === "max"
        ? 430
        : devicePreset === "ipad_portrait"
        ? 744
        : 1024;
    const frameHeight =
      devicePreset === "iphone"
        ? 844
        : devicePreset === "max"
        ? 900
        : devicePreset === "ipad_portrait"
        ? 1024
        : 740;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-between p-3 sm:p-5 select-none">
        {/* Top Simulator Control Bar */}
        <div className="w-full max-w-5xl bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white">
              {isIpad ? <Tablet className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>{isIpad ? "Customer iPad App Simulator" : "Customer Mobile App Simulator"}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    portalEnabled
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {portalEnabled ? "Public Live" : "Public Closed (Preview)"}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {iframePath}
              </div>
            </div>
          </div>

          {/* Device Size Presets */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setDevicePreset("iphone")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                devicePreset === "iphone"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>iPhone (393px)</span>
            </button>
            <button
              type="button"
              onClick={() => setDevicePreset("max")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                devicePreset === "max"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Pro Max (430px)</span>
            </button>
            <button
              type="button"
              onClick={() => setDevicePreset("ipad_portrait")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                devicePreset === "ipad_portrait"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Tablet className="w-3.5 h-3.5" />
              <span>iPad Portrait (744px)</span>
            </button>
            <button
              type="button"
              onClick={() => setDevicePreset("ipad_landscape")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                devicePreset === "ipad_landscape"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Tablet className="w-3.5 h-3.5 rotate-90" />
              <span>iPad Landscape (1024px)</span>
            </button>
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              title="Reload Device Frame"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Switch to Full Web View */}
          <button
            type="button"
            onClick={() => toggleSimulatorMode(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/10 transition-colors"
          >
            <Monitor className="w-3.5 h-3.5 text-sky-400" />
            <span>Full Web View</span>
          </button>
        </div>

        {/* Realistic Phone / iPad Bezel */}
        <div className="my-auto py-3 flex items-center justify-center w-full overflow-x-auto">
          <div
            className={`relative ${
              isIpad ? "rounded-[38px] p-3.5" : "rounded-[52px] p-3"
            } bg-slate-900 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.75)] border-[3px] border-slate-700/80 ring-1 ring-white/10 transition-all duration-200`}
            style={{
              width: `min(${frameWidth + 28}px, calc(100vw - 24px))`,
              height: `min(${frameHeight + 28}px, calc(100vh - 96px))`,
            }}
          >
            {/* Side Hardware Buttons */}
            {!isIpad && (
              <>
                <div className="absolute -left-[5px] top-28 w-[3px] h-8 bg-slate-700 rounded-l-md" />
                <div className="absolute -left-[5px] top-40 w-[3px] h-14 bg-slate-700 rounded-l-md" />
                <div className="absolute -left-[5px] top-56 w-[3px] h-14 bg-slate-700 rounded-l-md" />
                <div className="absolute -right-[5px] top-44 w-[3px] h-20 bg-slate-700 rounded-r-md" />
              </>
            )}

            {/* Inner Screen */}
            <div
              className={`w-full h-full ${
                isIpad ? "rounded-[26px]" : "rounded-[40px]"
              } bg-white overflow-hidden flex flex-col relative`}
            >
              {/* iOS / iPadOS Status Bar */}
              <div
                className={`${
                  isIpad ? "h-8 px-5" : "h-11 px-6"
                } bg-white flex items-center justify-between shrink-0 border-b border-slate-100 select-none z-20`}
              >
                <div className="flex items-center gap-2 w-28">
                  <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                    {clockStr}
                  </span>
                  {isIpad && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      iPadOS
                    </span>
                  )}
                </div>

                {isIpad ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800 ring-2 ring-slate-200" />
                ) : (
                  <div className="w-24 h-6 rounded-full bg-slate-950 flex items-center justify-end pr-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-950 ring-1 ring-slate-800" />
                  </div>
                )}

                <div className="flex items-center justify-end gap-1.5 text-slate-900 w-28">
                  {isIpad && <span className="text-[10px] font-bold">100%</span>}
                  <Signal className="w-3.5 h-3.5" />
                  <Wifi className="w-3.5 h-3.5" />
                  <BatteryCharging className="w-4 h-4" />
                </div>
              </div>

              {/* Actual Viewport Iframe */}
              <iframe
                key={iframeKey}
                src={iframePath}
                title="Customer App Preview"
                className="w-full flex-1 border-0 bg-slate-50"
              />

              {/* Bottom Home Indicator Bar */}
              <div className="h-5 bg-white flex items-center justify-center shrink-0">
                <div
                  className={`${
                    isIpad ? "w-44" : "w-32"
                  } h-1 rounded-full bg-slate-900/80`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If Customer Portal is closed in Admin Settings and visitor is NOT in Staff Preview Mode -> Show Coming Soon Gate
  if (!isLoading && !portalAllowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between p-6">
        <div className="max-w-md w-full mx-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-md flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="That Laundry Shop"
                className="h-7 w-auto object-contain"
              />
            </div>
            <span className="font-extrabold text-sm tracking-tight">That Laundry Shop</span>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold border border-white/10 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>{lang === "en" ? "EN / ไทย" : "ไทย / EN"}</span>
          </button>
        </div>

        <div className="max-w-md w-full mx-auto my-auto py-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-white/95 px-6 py-4 rounded-3xl shadow-2xl shadow-black/40 border border-white/20 inline-flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="That Laundry Shop Logo"
                className="h-20 w-auto object-contain"
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === "en" ? "Launching Soon" : "เตรียมพบกันเร็วๆ นี้"}</span>
          </div>

          <div className="space-y-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              {lang === "en"
                ? "New Customer Portal & Laundry Tracker"
                : "ระบบสมาชิกและติดตามผ้าออนไลน์โฉมใหม่"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {lang === "en"
                ? "We are putting the finishing touches on our new digital customer experience. Soon you will be able to book pickups, track orders live, and view digital receipts."
                : "เรากำลังเตรียมเปิดให้บริการระบบสมาชิกออนไลน์โฉมใหม่ ให้คุณสามารถนัดรับ-ส่งผ้า เช็คสถานะผ้าแบบเรียลไทม์ และดูบิลดิจิทัลได้สะดวกยิ่งขึ้น"}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-2.5">
            {[
              lang === "en"
                ? "Real-time 6-step laundry status & photo proof"
                : "ติดตามสถานะผ้าแบบเรียลไทม์ 6 ขั้นตอน พร้อมรูปถ่ายยืนยัน",
              lang === "en"
                ? "Instant online pickup booking & Express options"
                : "จองคิวรับ-ส่งผ้าออนไลน์ พร้อมตัวเลือกบริการด่วน Express",
              lang === "en"
                ? "Digital proforma invoices, receipts & member wallet"
                : "ดูใบแจ้งหนี้ ใบเสร็จดิจิทัล เช็คยอดเงินคงเหลือและคูปองส่วนลด",
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 pt-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {lang === "en"
                ? "Need laundry pickup today? Contact our concierge:"
                : "ต้องการเรียกไรเดอร์รับผ้าวันนี้ ติดต่อทีมงานได้ทันที:"}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href="https://wa.me/66614122245"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <a
                href="tel:0614122245"
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/15 transition-all"
              >
                <PhoneCall className="w-4 h-4 text-sky-400" />
                <span>061-412-2245</span>
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-md w-full mx-auto pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span>© That Laundry Shop</span>
          <button
            type="button"
            onClick={enableStaffPreview}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 font-semibold transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>{lang === "en" ? "Staff Preview" : "สำหรับทีมงานทดสอบ"}</span>
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      href: "/portal",
      labelEn: "Home",
      labelTh: "หน้าหลัก",
      icon: Home,
      exact: true,
    },
    {
      href: "/portal/orders",
      labelEn: "Orders",
      labelTh: "รายการซัก",
      icon: Package,
      exact: false,
    },
    {
      href: "/portal/book",
      labelEn: "Book Pickup",
      labelTh: "นัดรับผ้า",
      icon: CalendarPlus,
      exact: false,
      highlight: true,
    },
    {
      href: "/portal/wallet",
      labelEn: "Wallet",
      labelTh: "กระเป๋าเงิน",
      icon: Wallet,
      exact: false,
    },
    {
      href: "/portal/profile",
      labelEn: "Profile",
      labelTh: "โปรไฟล์",
      icon: User,
      exact: false,
    },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (!pathname) return false;
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const staffPreviewBanner = !portalEnabled && isStaffPreview && (
    <div className="bg-amber-950 text-amber-100 border-b border-amber-800/80 px-3 py-1.5 text-[11px] flex items-center justify-between gap-2 z-50">
      <div className="flex items-center gap-1.5 font-semibold truncate">
        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="truncate">
          {lang === "en"
            ? "Staff Preview Mode (Closed to public — Enable in Admin Settings)"
            : "โหมดทดสอบสำหรับทีมงาน (ยังไม่เปิดให้ลูกค้าทั่วไปใช้งาน)"}
        </span>
      </div>
      <button
        type="button"
        onClick={disableStaffPreview}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-800/80 hover:bg-amber-700 text-amber-100 font-bold text-[10px] shrink-0 transition-colors cursor-pointer"
        title="ดูหน้า Coming Soon ที่ลูกค้าทั่วไปเห็น"
      >
        <EyeOff className="w-3 h-3" />
        <span>{lang === "en" ? "View Public Screen" : "ดูหน้าลูกค้าทั่วไป"}</span>
      </button>
    </div>
  );

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-slate-50 relative flex flex-col">
        {staffPreviewBanner}
        {mounted && !isInsideIframe && !isMobileScreen && (
          <div className="fixed bottom-4 right-4 z-50">
            <button
              type="button"
              onClick={() => toggleSimulatorMode(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold shadow-xl border border-slate-700 transition-all"
            >
              <Smartphone className="w-4 h-4 text-sky-400" />
              <span>Mobile App Simulator</span>
            </button>
          </div>
        )}
        <div className="flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 md:pb-8">
      {staffPreviewBanner}
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <Link href="/portal" className="flex items-center gap-2.5 group">
            {customer?.brand === "noname_laundry" ? (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/logo.png"
                alt="That Laundry Shop"
                className="h-10 w-auto object-contain group-hover:scale-105 transition-transform"
              />
            )}
            <div>
              <div className="font-bold text-slate-900 tracking-tight leading-none text-base">
                {customer?.brand === "noname_laundry"
                  ? "Noname Laundry"
                  : "That Laundry Shop"}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                {lang === "en" ? "Customer Portal" : "ระบบสมาชิกซักรีด"}
              </div>
            </div>
          </Link>

          {/* Desktop Center Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? "bg-white text-sky-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{lang === "en" ? item.labelEn : item.labelTh}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: Simulator Button + Language Switcher + WhatsApp Support + Logout */}
          <div className="flex items-center gap-2">
            {mounted && !isInsideIframe && !isMobileScreen && (
              <button
                type="button"
                onClick={() => toggleSimulatorMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors"
                title="Open Mobile App Simulator"
              >
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                <span>Mobile View</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "th" : "en")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              title="Switch Language"
            >
              <Globe className="w-3.5 h-3.5 text-sky-600" />
              <span>{lang === "en" ? "EN" : "TH"}</span>
            </button>

            <a
              href="https://wa.me/66614122245"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 text-xs font-semibold transition-colors"
              title="WhatsApp Concierge Support"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>

            {customer && (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title={lang === "en" ? "Sign out" : "ออกจากระบบ"}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-5">
        {isLoading && !customer ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-sky-600 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-500 font-medium">
              {lang === "en" ? "Loading your laundry portal..." : "กำลังโหลดข้อมูลของคุณ..."}
            </p>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 safe-area-inset-bottom shadow-lg">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center -mt-4"
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-transform active:scale-95 ${
                      active
                        ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                        : "bg-gradient-to-r from-sky-600 to-indigo-600 text-white"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] font-semibold mt-1 ${
                      active ? "text-indigo-600" : "text-slate-600"
                    }`}
                  >
                    {lang === "en" ? "Pickup" : "นัดรับผ้า"}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                  active ? "text-sky-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.5px]" : ""}`} />
                <span className="text-[10px] font-semibold mt-0.5">
                  {lang === "en" ? item.labelEn : item.labelTh}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CustomerAuthProvider>
      <PortalShell>{children}</PortalShell>
    </CustomerAuthProvider>
  );
}
