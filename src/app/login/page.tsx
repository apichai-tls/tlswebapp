"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    const savedPassword = localStorage.getItem("rememberedPassword");
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

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
    
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1200));

    try {
      const user = await login(email, password);
      
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
        localStorage.setItem("rememberedPassword", password);
      } else {
        localStorage.removeItem("rememberedEmail");
        localStorage.removeItem("rememberedPassword");
      }

      toast.success(`Welcome back, ${user.role}!`);
      
      const redirectPath = searchParams.get("redirect");
      if (redirectPath) {
        router.push(redirectPath);
      } else {
        router.push(user.role === "rider" ? "/rider" : "/admin");
      }
    } catch (error: any) {
      toast.error(error.message || "Login failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
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
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10 h-12 bg-slate-50 border-transparent focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all rounded-xl shadow-sm text-base"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <input 
          type="checkbox" 
          id="rememberMe" 
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900"
        />
        <Label htmlFor="rememberMe" className="text-sm font-medium text-slate-600 cursor-pointer select-none">
          Remember Me
        </Label>
      </div>

      <Button 
        type="submit" 
        disabled={isSubmitting}
        className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium shadow-md transition-all group border-none text-base mt-4"
      >
        {isSubmitting ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <>
            Sign In
            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform opacity-70" size={18} />
          </>
        )}
      </Button>

    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md px-8 py-10"
      >
        <div className="flex justify-center mb-10">
          <Logo className="h-28" />
        </div>

        <div className="text-center mb-10 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h1>
          <p className="text-sm text-slate-500">
            Welcome back to That Laundry Shop.
          </p>
        </div>

        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={24} /></div>}>
          <LoginForm />
        </Suspense>

        <div className="mt-12 text-center">
          <p className="text-xs font-medium text-slate-400">
            &copy; {new Date().getFullYear()} That Laundry Shop.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
