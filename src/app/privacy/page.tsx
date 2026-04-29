"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Mail, Lock, MapPin, Database } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900 cursor-pointer">
              <ArrowLeft size={16} />
              Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 md:py-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-slate-200"
        >
          <div className="flex items-center gap-3 mb-8">
             <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                <ShieldCheck size={28} />
             </div>
             <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Privacy Policy</h1>
                <p className="text-slate-500 font-medium mt-1">Last updated: March 25, 2026</p>
             </div>
          </div>

          <div className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-p:text-slate-600 prose-li:text-slate-600">
            <p className="lead text-lg text-slate-700 font-medium">
              At <strong>That Laundry Shop</strong> ("we," "our," or "us"), your privacy is our priority. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our laundry fleet management services, mobile applications, and dashboard (collectively, the "Platform").
            </p>

            <hr className="my-8 border-slate-100" />

            <h2 className="flex items-center gap-2 text-xl mt-8">
              <Database className="text-indigo-500" size={20} />
              1. Information We Collect
            </h2>
            <p>We collect personal information that you provide to us directly or that is generated automatically when you use our Platform.</p>
            <ul>
              <li><strong>Customer Data:</strong> Name, phone number, Line ID, and physical delivery addresses (Pick-up/Drop-off).</li>
              <li><strong>Rider Data:</strong> Name, National ID, vehicle license plate, vehicle type, and contact information.</li>
              <li><strong>Geolocation Data:</strong> We track active riders in real-time via GPS when they are "Online" or "Busy" to provide live fleet routing and accurate delivery ETAs. Background location access is required for riders handling active jobs.</li>
            </ul>

            <h2 className="flex items-center gap-2 text-xl mt-8">
              <MapPin className="text-indigo-500" size={20} />
              2. How We Use Your Information
            </h2>
            <p>We use the collected information for the following business and operational purposes:</p>
            <ul>
              <li>To facilitate laundry pick-up and drop-off logistics.</li>
              <li>To calculate precise delivery fees using the OSRM (Open Source Routing Machine) API.</li>
              <li>To allow administrators to monitor fleet efficiency transparently in real-time on the Admin Dashboard.</li>
              <li>To communicate with customers and riders regarding order status or delays.</li>
            </ul>

            <h2 className="flex items-center gap-2 text-xl mt-8">
              <Lock className="text-indigo-500" size={20} />
              3. Data Sharing & Disclosure
            </h2>
            <p>We do not sell, trade, or rent your personal identification information to third parties. We may share information only in the following scenarios:</p>
            <ul>
              <li><strong>Service Providers:</strong> We securely send anonymous location coordinates to mapping services (like OSRM and Leaflet/Carto) strictly to generate routing polylines.</li>
              <li><strong>Between Riders & Customers:</strong> Riders receive the corresponding customer's name, address, and phone number to fulfill the active assignment.</li>
              <li><strong>Legal Requirements:</strong> If required by Thai law or law enforcement agencies.</li>
            </ul>

            <h2 className="text-xl mt-8">4. Data Security</h2>
            <p>We implement strict operational security measures, including HTTPS encryption and secure mock databases (like Drizzle ORM/PostgreSQL in production), to protect your personal data from unauthorized access, alteration, or disclosure.</p>

            <h2 className="text-xl mt-8">5. Location Tracking Consent for Riders</h2>
            <p>
              By toggling your status to <strong>"Online"</strong> or <strong>"Busy"</strong> within the Rider App, you consent to the continuous transmission of your GPS location to our server for fleet monitoring. You may revoke this by immediately switching to <strong>"Offline."</strong>
            </p>

            <h2 className="flex items-center gap-2 text-xl mt-12 pt-8 border-t border-slate-100">
              <Mail className="text-indigo-500" size={20} />
              Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 inline-block">
              <strong>That Laundry Shop Headquarters</strong><br />
              15 Sukhumvit Residences, G/F, Sukhumvit 15<br />
              North Klongtoey Wattana, Bangkok 10110<br />
              Email: privacy@thatlaundryshop.com<br />
              Phone: 02-123-4567
            </div>
          </div>
        </motion.div>
      </main>
      
      {/* Footer */}
      <footer className="py-8 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} That Laundry Shop. All rights reserved.</p>
      </footer>
    </div>
  );
}
