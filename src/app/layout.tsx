import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { StoreProvider } from "@/providers/store-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "TLS Admin — That Laundry Shop",
  description: "Admin Dashboard & Rider Management System for That Laundry Shop",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TLS Admin",
  },
  formatDetection: {
    telephone: false,
  },
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
