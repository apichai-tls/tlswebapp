"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2, Clock, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const REMEMBER_CRED_KEY = "tls_remembered_cred_v2";
const REMEMBER_CRED_MASK = "ThatLaundryShop_RememberMe_2026_Mask";

function encodeRememberedPassword(plain: string): string {
  try {
    const bytes = new TextEncoder().encode(plain);
    const mask = new TextEncoder().encode(REMEMBER_CRED_MASK);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ mask[i % mask.length];
    }
    let bin = "";
    for (let i = 0; i < out.length; i++) {
      bin += String.fromCharCode(out[i]);
    }
    return btoa(bin);
  } catch {
    return "";
  }
}

function decodeRememberedPassword(encoded: string): string {
  try {
    const bin = atob(encoded);
    const mask = new TextEncoder().encode(REMEMBER_CRED_MASK);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i) ^ mask[i % mask.length];
    }
    return new TextDecoder().decode(out);
  } catch {
    return "";
  }
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const logoutReason = searchParams.get("reason");

  const redirectAuthenticatedUser = useCallback(
    (targetUser: { role: string }) => {
      const rawRedirect = searchParams.get("redirect");
      const safeRedirect =
        rawRedirect &&
        rawRedirect.startsWith("/") &&
        !rawRedirect.startsWith("//") &&
        !rawRedirect.startsWith("/\\")
          ? rawRedirect
          : null;

      if (safeRedirect) {
        window.location.href = safeRedirect;
      } else {
        // If it's a native platform and NOT a rider, default to /billing (BILL APK)
        import("@capacitor/core")
          .then(({ Capacitor }) => {
            if (Capacitor.isNativePlatform() && targetUser.role !== "rider") {
              router.push("/billing");
            } else {
              window.location.href = targetUser.role === "rider" ? "/rider" : "/admin";
            }
          })
          .catch(() => {
            window.location.href = targetUser.role === "rider" ? "/rider" : "/admin";
          });
      }
    },
    [router, searchParams]
  );

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("rememberedEmail");
      const savedEncPwd = localStorage.getItem(REMEMBER_CRED_KEY);
      const legacyPlainPwd = localStorage.getItem("rememberedPassword");

      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }

      if (savedEncPwd) {
        const decoded = decodeRememberedPassword(savedEncPwd);
        if (decoded) {
          setPassword(decoded);
          setRememberMe(true);
        }
      } else if (legacyPlainPwd) {
        setPassword(legacyPlainPwd);
        setRememberMe(true);
        const enc = encodeRememberedPassword(legacyPlainPwd);
        if (enc) localStorage.setItem(REMEMBER_CRED_KEY, enc);
        localStorage.removeItem("rememberedPassword");
      }
    } catch {}
  }, []);

  // Automatically redirect if user already has an active remembered session
  useEffect(() => {
    if (!isLoading && user && !logoutReason) {
      redirectAuthenticatedUser(user);
    }
  }, [isLoading, user, logoutReason, redirectAuthenticatedUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    if (!password.trim()) {
      toast.error("Please enter a password");
      return;
    }

    setIsSubmitting(true);

    try {
      const loggedInUser = await login(email.trim(), password, rememberMe);

      localStorage.removeItem("rememberedPassword");
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email.trim());
        const encoded = encodeRememberedPassword(password);
        if (encoded) {
          localStorage.setItem(REMEMBER_CRED_KEY, encoded);
        }
      } else {
        localStorage.removeItem("rememberedEmail");
        localStorage.removeItem(REMEMBER_CRED_KEY);
      }

      toast.success(`Welcome back, ${loggedInUser.role}!`);
      redirectAuthenticatedUser(loggedInUser);
    } catch (error: any) {
      toast.error(error.message || "Login failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      {logoutReason === "timeout" && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
          <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-950">เซสชันหมดอายุ (Session Timed Out)</p>
            <p className="text-amber-800">ไม่มีการเคลื่อนไหวเกินเวลาที่กำหนด กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>
          </div>
        </div>
      )}

      {logoutReason === "new_deploy" && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium">
          <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-indigo-950">อัปเดตระบบเวอร์ชันใหม่ (System Updated)</p>
            <p className="text-indigo-800">ระบบมีการอัปเดตเวอร์ชันใหม่ กรุณาเข้าสู่ระบบใหม่อีกครั้งเพื่อใช้งานเวอร์ชันล่าสุด</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            id="email"
            type="email"
            placeholder="admin@tls.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 h-12 bg-slate-50 border-transparent focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all rounded-xl shadow-sm text-base"
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Password
          </Label>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="pl-10 pr-10 h-12 bg-slate-50 border-transparent focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all rounded-xl shadow-sm text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          id="rememberMe"
          checked={rememberMe}
          onChange={(e) => {
            const checked = e.target.checked;
            setRememberMe(checked);
            if (!checked) {
              localStorage.removeItem("rememberedEmail");
              localStorage.removeItem(REMEMBER_CRED_KEY);
              localStorage.removeItem("rememberedPassword");
            }
          }}
          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
        />
        <Label htmlFor="rememberMe" className="text-sm font-medium text-slate-600 cursor-pointer select-none">
          Remember Me
        </Label>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm shadow-indigo-600/20 transition-all group border-none text-base mt-4 cursor-pointer"
      >
        {isSubmitting ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <>
            Sign In
            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform opacity-80" size={18} />
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50 px-4 py-12 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full bg-gradient-to-tr from-indigo-200/40 via-sky-100/30 to-transparent blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 backdrop-blur-xl px-8 py-10 shadow-xl shadow-slate-900/5"
      >
        <div className="flex justify-center mb-8">
          <Logo className="h-24" />
        </div>

        <div className="text-center mb-8 space-y-1.5">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Sign in to your account</h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500">
            Welcome back to That Laundry Shop Workspace
          </p>
        </div>

        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={24} /></div>}>
          <LoginForm />
        </Suspense>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs font-medium text-slate-400">
            &copy; {new Date().getFullYear()} That Laundry Shop.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
