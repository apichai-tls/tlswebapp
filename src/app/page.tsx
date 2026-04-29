import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Smartphone } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-slate-50 px-4">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center mb-6">
          <Logo className="h-48" />
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl text-balance">
          Rider Management System
        </h1>
        <p className="max-w-md text-slate-500 text-lg text-balance">
          Manage laundry pick-up & drop-off jobs, assign riders, and track
          deliveries — all in one place.
        </p>
      </div>

      {/* Nav Cards */}
      <div className="flex flex-col gap-4 sm:flex-row mt-4">
        <Link href="/admin">
          <Button
            size="lg"
            className="w-60 gap-2 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm text-base font-semibold h-14 cursor-pointer"
          >
            <LayoutDashboard size={20} />
            Admin Dashboard
          </Button>
        </Link>
        <Link href="/rider">
          <Button
            size="lg"
            className="w-60 gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-md text-base font-semibold h-14 cursor-pointer"
          >
            <Smartphone size={20} />
            Rider App
          </Button>
        </Link>
      </div>
    </main>
  );
}
