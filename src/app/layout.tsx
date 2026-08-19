import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { StoreProvider } from "@/providers/store-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "That Laundry Shop — Rider Management",
  description: "Rider Management System for That Laundry Shop",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-gray-50 text-slate-900" suppressHydrationWarning>
        <AuthProvider>
          <StoreProvider>
            {children}
            <Toaster richColors position="top-center" />
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
