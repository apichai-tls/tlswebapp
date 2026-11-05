"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { toast } from "sonner";
import {
  Phone,
  Lock,
  ArrowRight,
  Search,
  UserPlus,
  Building2,
  CheckCircle2,
  Globe,
  MessageCircle,
  Loader2,
  ShieldCheck,
  Receipt,
  KeyRound,
  RefreshCw,
  Smartphone,
  Mail,
  Send,
} from "lucide-react";

type AuthMode =
  | "identifier"
  | "password"
  | "setup_password"
  | "reset_password"
  | "register";
type ActiveTab = "account" | "quick_track";
type OtpChannel = "sms" | "whatsapp" | "email";

export default function PortalLoginPage() {
  const router = useRouter();
  const { setAuthSession, lang, setLang } = useCustomerAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>("account");
  const [mode, setMode] = useState<AuthMode>("identifier");
  const [loading, setLoading] = useState(false);

  // Form states
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [maskedName, setMaskedName] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [hasEmailOnFile, setHasEmailOnFile] = useState(false);

  // OTP states
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("sms");
  const [otpEmailInput, setOtpEmailInput] = useState("");
  const [needsEmailForOtp, setNeedsEmailForOtp] = useState(false);
  const [deliveredTo, setDeliveredTo] = useState("");
  const [providerRoute, setProviderRoute] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpRefCode, setOtpRefCode] = useState("");
  const [demoOtpCode, setDemoOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendingOtp, setResendingOtp] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [email, setEmail] = useState("");
  const [condoName, setCondoName] = useState("");
  const [roomNo, setRoomNo] = useState("");

  // Quick track fields
  const [billNo, setBillNo] = useState("");
  const [trackPhone, setTrackPhone] = useState("");

  // Countdown timer for Resend OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const applyOtpChallengeData = (data: any) => {
    if (data.otpToken) setOtpToken(data.otpToken);
    if (data.refCode) setOtpRefCode(data.refCode);
    if (data.demoOtpCode) setDemoOtpCode(data.demoOtpCode);
    if (data.deliveryChannel) setOtpChannel(data.deliveryChannel);
    if (data.deliveredTo) setDeliveredTo(data.deliveredTo);
    if (data.providerRoute) setProviderRoute(data.providerRoute);
    if (typeof data.hasEmail === "boolean") setHasEmailOnFile(data.hasEmail);
    if (data.maskedEmail !== undefined) setMaskedEmail(data.maskedEmail);
    setNeedsEmailForOtp(false);
    setOtpCode("");
    setResendCooldown(60);
  };

  const handleRequestOtp = async (
    purpose: "first_setup" | "register" | "reset_password",
    requestedChannel?: OtpChannel,
    customEmail?: string
  ) => {
    if (!identifier.trim()) return false;
    const targetChannel = requestedChannel || otpChannel;
    const targetEmailToUse =
      customEmail !== undefined
        ? customEmail.trim()
        : otpEmailInput.trim() || email.trim();

    // If user switches to Email channel but has no email on file and hasn't typed one yet,
    // prompt the inline email input first before firing the API request.
    if (
      targetChannel === "email" &&
      !identifier.includes("@") &&
      !hasEmailOnFile &&
      !targetEmailToUse
    ) {
      setOtpChannel("email");
      setNeedsEmailForOtp(true);
      return false;
    }

    setResendingOtp(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_otp",
          identifier: identifier.trim(),
          purpose,
          channel: targetChannel,
          targetEmail: targetEmailToUse || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsEmailInput) {
          setOtpChannel("email");
          setNeedsEmailForOtp(true);
        }
        toast.error(data.error || "Could not send OTP");
        return false;
      }
      applyOtpChallengeData(data);
      if (targetEmailToUse && !email) {
        setEmail(targetEmailToUse);
      }
      const chLabel =
        targetChannel === "email"
          ? "Email"
          : targetChannel === "whatsapp"
          ? "WhatsApp"
          : "SMS";
      toast.success(
        lang === "en"
          ? `OTP sent via ${chLabel}! (Ref: ${data.refCode})`
          : `ส่งรหัส OTP ทาง ${chLabel} แล้ว (Ref: ${data.refCode})`
      );
      return true;
    } catch {
      toast.error("Failed to send OTP");
      return false;
    } finally {
      setResendingOtp(false);
    }
  };

  const handleSwitchOtpChannel = async (
    newChannel: OtpChannel,
    purpose: "first_setup" | "register" | "reset_password"
  ) => {
    if (resendingOtp) return;
    setOtpChannel(newChannel);
    if (
      newChannel === "email" &&
      !identifier.includes("@") &&
      !hasEmailOnFile &&
      !otpEmailInput.trim() &&
      !email.trim()
    ) {
      setNeedsEmailForOtp(true);
      return;
    }
    setNeedsEmailForOtp(false);
    await handleRequestOtp(purpose, newChannel);
  };

  const handleCheckAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error(
        lang === "en"
          ? "Please enter your phone/WhatsApp number or email"
          : "กรุณากรอกเบอร์โทรศัพท์หรืออีเมล"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_account",
          identifier: identifier.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not check account");
        return;
      }

      setHasEmailOnFile(Boolean(data.hasEmail));
      setMaskedEmail(data.maskedEmail || null);

      if (data.exists) {
        setMaskedName(data.maskedName || "");
        if (data.needsPasswordSetup) {
          applyOtpChallengeData(data);
          setMode("setup_password");
        } else {
          setMode("password");
        }
      } else {
        if (identifier.includes("@")) {
          setEmail(identifier.trim());
        } else {
          setRegisterPhone(identifier.trim());
        }
        applyOtpChallengeData(data);
        setMode("register");
      }
    } catch {
      toast.error("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartForgotPassword = async () => {
    setPassword("");
    setConfirmPassword("");
    const defaultCh: OtpChannel = identifier.includes("@") ? "email" : "sms";
    const ok = await handleRequestOtp("reset_password", defaultCh);
    if (ok) {
      setMode("reset_password");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          identifier: identifier.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invalid credentials");
        return;
      }

      setAuthSession(data.customer, data.token);
      toast.success(
        lang === "en"
          ? `Welcome back, ${data.customer.name}!`
          : `ยินดีต้อนรับคุณ ${data.customer.name}`
      );
      router.replace("/portal");
    } catch {
      toast.error("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.replace(/\D/g, "").length !== 6) {
      toast.error(
        lang === "en"
          ? "Please enter the 6-digit OTP verification code"
          : "กรุณากรอกรหัส OTP 6 หลัก"
      );
      return;
    }
    if (password.length < 4) {
      toast.error(
        lang === "en"
          ? "PIN / Password must be at least 4 characters"
          : "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร"
      );
      return;
    }
    if (password !== confirmPassword) {
      toast.error(
        lang === "en" ? "Passwords do not match" : "รหัสผ่านทั้งสองช่องไม่ตรงกัน"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setup_password",
          identifier: identifier.trim(),
          otpToken,
          otpCode: otpCode.trim(),
          password,
          deliveryChannel: otpChannel,
          otpEmail: otpEmailInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not verify OTP or set password");
        return;
      }

      setAuthSession(data.customer, data.token);
      toast.success(
        lang === "en"
          ? "Account activated! Welcome to That Laundry Shop."
          : "ยืนยัน OTP และตั้งค่ารหัสผ่านสำเร็จ ยินดีต้อนรับครับ"
      );
      router.replace("/portal");
    } catch {
      toast.error("Activation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.replace(/\D/g, "").length !== 6) {
      toast.error(
        lang === "en"
          ? "Please enter the 6-digit OTP verification code"
          : "กรุณากรอกรหัส OTP 6 หลัก"
      );
      return;
    }
    if (password.length < 4) {
      toast.error(
        lang === "en"
          ? "New PIN / Password must be at least 4 characters"
          : "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร"
      );
      return;
    }
    if (password !== confirmPassword) {
      toast.error(
        lang === "en" ? "Passwords do not match" : "รหัสผ่านทั้งสองช่องไม่ตรงกัน"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          identifier: identifier.trim(),
          otpToken,
          otpCode: otpCode.trim(),
          password,
          deliveryChannel: otpChannel,
          otpEmail: otpEmailInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not reset password");
        return;
      }

      setAuthSession(data.customer, data.token);
      toast.success(
        lang === "en"
          ? "PIN / Password reset successfully!"
          : "ตั้งรหัสผ่านใหม่สำเร็จ!"
      );
      router.replace("/portal");
    } catch {
      toast.error("Password reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.replace(/\D/g, "").length !== 6) {
      toast.error(
        lang === "en"
          ? "Please enter the 6-digit OTP code"
          : "กรุณากรอกรหัส OTP 6 หลัก"
      );
      return;
    }
    if (!fullName.trim()) {
      toast.error(lang === "en" ? "Please enter your full name" : "กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    const finalPhone = identifier.includes("@")
      ? registerPhone.trim()
      : identifier.trim();
    if (!finalPhone) {
      toast.error(
        lang === "en"
          ? "Please enter your Phone / WhatsApp number"
          : "กรุณากรอกเบอร์โทรศัพท์ / WhatsApp"
      );
      return;
    }
    if (password.length < 4) {
      toast.error(
        lang === "en"
          ? "PIN / Password must be at least 4 characters"
          : "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร"
      );
      return;
    }

    setLoading(true);
    try {
      const finalEmail = identifier.includes("@")
        ? identifier.trim()
        : otpEmailInput.trim() || email.trim() || null;

      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          identifier: identifier.trim(),
          name: fullName.trim(),
          phone: finalPhone,
          email: finalEmail,
          condoName: condoName.trim() || null,
          roomNo: roomNo.trim() || null,
          otpToken,
          otpCode: otpCode.trim(),
          password,
          deliveryChannel: otpChannel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create account");
        return;
      }

      setAuthSession(data.customer, data.token);
      toast.success(
        lang === "en" ? "Welcome to That Laundry Shop!" : "สร้างบัญชีสำเร็จ ยินดีต้อนรับครับ!"
      );
      router.replace("/portal");
    } catch {
      toast.error("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billNo.trim() || !trackPhone.trim()) {
      toast.error(
        lang === "en"
          ? "Please enter both your Bill No. and Phone Number"
          : "กรุณากรอกเลขที่บิลและเบอร์โทรศัพท์"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quick_track",
          billNo: billNo.trim(),
          phone: trackPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Order not found");
        return;
      }

      setAuthSession(data.customer, data.token);
      toast.success(lang === "en" ? "Order found!" : "พบรายการซักผ้าของคุณแล้ว");
      if (data.matchedOrderId) {
        router.replace(`/portal/orders/${data.matchedOrderId}`);
      } else {
        router.replace("/portal");
      }
    } catch {
      toast.error("Could not track order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderOtpSection = (purpose: "first_setup" | "register" | "reset_password") => {
    const isIdEmail = identifier.includes("@");
    return (
      <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90">
        {/* Multi-Channel OTP Selector (SMS / WhatsApp / Email) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {lang === "en" ? "Receive OTP Via:" : "เลือกรับรหัส OTP ทาง:"}
            </span>
            {deliveredTo && (
              <span className="text-[11px] font-medium text-slate-500 truncate max-w-[180px]">
                {lang === "en" ? "Sent to " : "ส่งไปที่ "}
                <strong className="text-slate-700">{deliveredTo}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              disabled={resendingOtp || isIdEmail}
              onClick={() => handleSwitchOtpChannel("sms", purpose)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                otpChannel === "sms"
                  ? "bg-white text-sky-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              } ${isIdEmail ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>SMS</span>
            </button>

            <button
              type="button"
              disabled={resendingOtp || isIdEmail}
              onClick={() => handleSwitchOtpChannel("whatsapp", purpose)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                otpChannel === "whatsapp"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              } ${isIdEmail ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              disabled={resendingOtp}
              onClick={() => handleSwitchOtpChannel("email", purpose)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                otpChannel === "email"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </button>
          </div>
        </div>

        {/* Inline Email Input when user chooses Email OTP and doesn't have an email on file yet */}
        {otpChannel === "email" && !isIdEmail && (needsEmailForOtp || !hasEmailOnFile) && (
          <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 space-y-2">
            <label className="block text-[11px] font-bold text-indigo-900">
              {lang === "en"
                ? "Enter your email address to receive the 6-digit OTP:"
                : "กรอกอีเมลของคุณเพื่อรับรหัส OTP 6 หลัก:"}
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Mail className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={otpEmailInput}
                  onChange={(e) => setOtpEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-indigo-200 bg-white text-xs font-medium text-slate-900 focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                type="button"
                disabled={resendingOtp || !otpEmailInput.includes("@")}
                onClick={() => handleRequestOtp(purpose, "email", otpEmailInput)}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                {resendingOtp ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{lang === "en" ? "Send OTP" : "ส่งรหัส"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Demo / Sandbox OTP Notification Preview (Kept for local testing) */}
        {demoOtpCode && (
          <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  otpChannel === "email"
                    ? "bg-indigo-500/20 text-indigo-300"
                    : otpChannel === "whatsapp"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-sky-500/20 text-sky-400"
                }`}
              >
                {otpChannel === "email" ? (
                  <Mail className="w-4 h-4" />
                ) : otpChannel === "whatsapp" ? (
                  <MessageCircle className="w-4 h-4" />
                ) : (
                  <Smartphone className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 truncate">
                  {providerRoute ||
                    (lang === "en"
                      ? `Simulate ${otpChannel.toUpperCase()} OTP`
                      : `จำลองข้อความ ${otpChannel.toUpperCase()} OTP`)}
                </div>
                <div className="text-xs font-mono font-bold truncate">
                  OTP: <span className="text-emerald-400 text-sm">{demoOtpCode}</span>{" "}
                  <span className="text-slate-400">(Ref: {otpRefCode})</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOtpCode(demoOtpCode)}
              className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold shrink-0"
            >
              {lang === "en" ? "Auto-fill" : "กรอกอัตโนมัติ"}
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-sky-600" />
              <span>
                {lang === "en" ? "6-Digit OTP Code" : "รหัสยืนยัน OTP 6 หลัก"}
              </span>
            </label>
            {otpRefCode && (
              <span className="text-[11px] font-mono font-semibold text-slate-400">
                Ref: {otpRefCode}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-sky-500 outline-none text-center font-mono text-base font-extrabold tracking-[0.3em] text-slate-900"
            />
            <button
              type="button"
              disabled={resendCooldown > 0 || resendingOtp}
              onClick={() => handleRequestOtp(purpose, otpChannel)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resendingOtp ? "animate-spin" : ""}`} />
              <span>
                {resendCooldown > 0
                  ? `${resendCooldown}s`
                  : lang === "en"
                  ? "Resend"
                  : "ส่งอีกครั้ง"}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/70 via-white to-slate-50 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="That Laundry Shop"
            className="h-10 w-auto object-contain"
          />
          <span className="font-bold text-slate-900 tracking-tight text-sm">
            That Laundry Shop
          </span>
        </div>

        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "th" : "en")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
        >
          <Globe className="w-3.5 h-3.5 text-sky-600" />
          <span>{lang === "en" ? "English" : "ภาษาไทย"}</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full mx-auto my-6">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="That Laundry Shop Logo"
              className="h-20 w-auto object-contain drop-shadow-xs"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {lang === "en" ? "Laundry Concierge Portal" : "ระบบติดตามงานซัก & สมาชิก"}
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            {lang === "en"
              ? "Track live laundry status, view digital receipts & manage your wallet"
              : "เช็คสถานะผ้าเรียลไทม์ ดูใบเสร็จ และยอดเงินคงเหลือในกระเป๋า"}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === "account"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Phone className="w-3.5 h-3.5 text-sky-600" />
            <span>{lang === "en" ? "Member Sign In" : "เข้าสู่ระบบสมาชิก"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("quick_track")}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === "quick_track"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-indigo-600" />
            <span>{lang === "en" ? "Quick Bill Tracker" : "เช็คด้วยเลขที่บิล"}</span>
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/40 p-6 sm:p-7">
          {activeTab === "account" ? (
            <>
              {/* STEP 1: Enter Phone / WhatsApp / Email */}
              {mode === "identifier" && (
                <form onSubmit={handleCheckAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {lang === "en"
                        ? "Phone / WhatsApp Number or Email"
                        : "เบอร์โทรศัพท์ / WhatsApp หรืออีเมล"}
                    </label>
                    <div className="relative">
                      {identifier.includes("@") ? (
                        <Mail className="w-4 h-4 text-indigo-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      ) : (
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      )}
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={
                          lang === "en"
                            ? "e.g. 0812345678, +447700900077 or email"
                            : "เช่น 0812345678 หรือ name@email.com"
                        }
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:ring-3 focus:ring-sky-500/15 outline-none text-sm font-medium text-slate-900 transition-all"
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {lang === "en"
                        ? "First-time visitors receive a 6-digit OTP via SMS, WhatsApp, or Email to set up their PIN. Returning members sign in directly with their PIN."
                        : "เข้าใช้งานครั้งแรกเลือกรับรหัส OTP ได้ทั้ง SMS, WhatsApp หรือ Email เพื่อตั้ง PIN ส่วนครั้งถัดไปใช้ PIN เข้าได้ทันที"}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>{lang === "en" ? "Continue" : "ดำเนินการต่อ"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 2A: Returning Customer with Password (No OTP needed unless Forgot Password) */}
              {mode === "password" && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold text-sky-600 uppercase">
                        {lang === "en" ? "Welcome back" : "ยินดีต้อนรับกลับมา"}
                      </div>
                      <div className="font-bold text-slate-900 text-sm">
                        {maskedName || identifier}
                      </div>
                      <div className="text-xs text-slate-500">{identifier}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("identifier");
                        setPassword("");
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      {lang === "en" ? "Change" : "เปลี่ยนบัญชี"}
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                        {lang === "en" ? "Your PIN or Password" : "รหัสผ่าน / PIN ของคุณ"}
                      </label>
                      <button
                        type="button"
                        disabled={resendingOtp}
                        onClick={handleStartForgotPassword}
                        className="text-xs font-bold text-sky-600 hover:underline"
                      >
                        {lang === "en" ? "Forgot PIN / Password?" : "ลืมรหัสผ่าน?"}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:ring-3 focus:ring-sky-500/15 outline-none text-sm font-medium text-slate-900"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>{lang === "en" ? "Sign In" : "เข้าสู่ระบบ"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* STEP 2B: First-Time Login for Existing POS Customer (OTP + Set PIN) */}
              {mode === "setup_password" && (
                <form onSubmit={handleSetupPassword} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {lang === "en"
                            ? `First-Time Activation: ${maskedName}`
                            : `ยืนยันตัวตนเข้าใช้งานครั้งแรก: ${maskedName}`}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          {lang === "en"
                            ? `Verify the 6-digit OTP via SMS, WhatsApp, or Email and create a PIN for future visits.`
                            : `เลือกรับและกรอกรหัส OTP 6 หลัก (ผ่าน SMS, WhatsApp หรือ Email) เพื่อตั้งรหัส PIN สำหรับครั้งถัดไป`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {renderOtpSection("first_setup")}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en"
                          ? "Create PIN / Password (4+)"
                          : "ตั้งรหัส PIN / รหัสผ่าน"}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 outline-none text-sm font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en" ? "Confirm PIN" : "ยืนยันรหัสอีกครั้ง"}
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 outline-none text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("identifier");
                        setPassword("");
                        setConfirmPassword("");
                      }}
                      className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      {lang === "en" ? "Back" : "ย้อนกลับ"}
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>
                            {lang === "en"
                              ? "Verify OTP & Activate"
                              : "ยืนยัน OTP และเข้าสู่ระบบ"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2C: Forgot Password / Reset PIN via OTP */}
              {mode === "reset_password" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80">
                    <div className="font-bold text-slate-900 text-sm">
                      {lang === "en"
                        ? `Reset PIN / Password for ${maskedName || identifier}`
                        : `ตั้งรหัสผ่านใหม่สำหรับ ${maskedName || identifier}`}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {lang === "en"
                        ? "You can receive your 6-digit OTP via SMS, WhatsApp, or Email below."
                        : "สามารถเลือกรับรหัส OTP 6 หลักได้ทั้งทาง SMS, WhatsApp หรือ Email ด้านล่าง"}
                    </p>
                  </div>

                  {renderOtpSection("reset_password")}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en" ? "New PIN / Password (4+)" : "รหัสผ่านใหม่"}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en" ? "Confirm New PIN" : "ยืนยันรหัสผ่านใหม่"}
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("password");
                        setPassword("");
                        setConfirmPassword("");
                      }}
                      className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      {lang === "en" ? "Cancel" : "ยกเลิก"}
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>
                            {lang === "en"
                              ? "Verify OTP & Save New PIN"
                              : "ยืนยัน OTP และบันทึกรหัสใหม่"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2D: New Customer Registration (with OTP) */}
              {mode === "register" && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-sky-600" />
                      <span className="font-bold text-slate-900 text-sm">
                        {lang === "en" ? "New Customer Profile" : "ลงทะเบียนลูกค้าใหม่"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMode("identifier")}
                      className="text-xs font-semibold text-sky-600 hover:underline"
                    >
                      {lang === "en" ? "Change" : "เปลี่ยนเบอร์/อีเมล"}
                    </button>
                  </div>

                  {renderOtpSection("register")}

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      {lang === "en" ? "Full Name *" : "ชื่อ - นามสกุล *"}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={lang === "en" ? "e.g. Alex Morgan" : "เช่น สมชาย ใจดี"}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      required
                    />
                  </div>

                  {identifier.includes("@") ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en"
                          ? "Phone / WhatsApp Number *"
                          : "เบอร์โทรศัพท์ / WhatsApp *"}
                      </label>
                      <input
                        type="text"
                        value={registerPhone}
                        onChange={(e) => setRegisterPhone(e.target.value)}
                        placeholder={
                          lang === "en" ? "e.g. 0812345678 or +44..." : "เช่น 0812345678"
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en" ? "Email Address (Optional)" : "อีเมล (ถ้ามี)"}
                      </label>
                      <input
                        type="email"
                        value={otpEmailInput || email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setOtpEmailInput(e.target.value);
                        }}
                        placeholder="customer@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        <Building2 className="w-3 h-3 inline mr-1 text-slate-400" />
                        {lang === "en" ? "Condo / Building" : "ชื่อคอนโด / อาคาร"}
                      </label>
                      <input
                        type="text"
                        value={condoName}
                        onChange={(e) => setCondoName(e.target.value)}
                        placeholder={lang === "en" ? "e.g. Ashton Asoke" : "ชื่อคอนโด"}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {lang === "en" ? "Room No." : "เลขห้อง"}
                      </label>
                      <input
                        type="text"
                        value={roomNo}
                        onChange={(e) => setRoomNo(e.target.value)}
                        placeholder="12A/88"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      {lang === "en"
                        ? "Create PIN / Password (4+ chars) *"
                        : "ตั้งรหัสผ่าน / PIN (4 ตัวขึ้นไป) *"}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 mt-2"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>
                          {lang === "en"
                            ? "Verify OTP & Create Account"
                            : "ยืนยัน OTP และสร้างบัญชี"}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          ) : (
            /* QUICK TRACK TAB */
            <form onSubmit={handleQuickTrack} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {lang === "en"
                    ? "Bill No. or Proforma No."
                    : "เลขที่บิล หรือ เลขใบแจ้งหนี้"}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                    placeholder="e.g. TLS-00125 or PR-TLS-00089"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 outline-none text-sm font-medium"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {lang === "en" ? "Your Phone Number" : "เบอร์โทรศัพท์ของคุณ"}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={trackPhone}
                    onChange={(e) => setTrackPhone(e.target.value)}
                    placeholder="e.g. 0812345678"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 outline-none text-sm font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>
                      {lang === "en"
                        ? "Track Order & View Receipt"
                        : "ค้นหาสถานะผ้าและดูบิล"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Support */}
      <div className="max-w-md w-full mx-auto text-center pb-4">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500">
          <span>
            {lang === "en" ? "Need assistance with your laundry?" : "ต้องการความช่วยเหลือ?"}
          </span>
          <a
            href="https://wa.me/66614122245"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-emerald-600 hover:underline"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp Concierge</span>
          </a>
        </div>
      </div>
    </div>
  );
}
