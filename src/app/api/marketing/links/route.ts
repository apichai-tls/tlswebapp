import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SETTING_KEY = "marketing_tracking_links";

export interface ClickLog {
  id: string;
  timestamp: string;
  ipHash?: string;
  device: "ios" | "android" | "desktop" | "other";
  referrer: string;
}

export interface TrackingLinkItem {
  id: string;
  title: string;
  slug: string;
  targetUrl: string;
  brand: "that_laundry_shop" | "noname_laundry" | "all";
  channel: "offline_qr" | "flyer" | "standee" | "line" | "facebook" | "tiktok" | "instagram" | "sms" | "other";
  notes?: string;
  isActive: boolean;
  totalClicks: number;
  uniqueClicks: number;
  lastClickedAt?: string;
  clickLogs: ClickLog[];
  createdAt: string;
  updatedAt: string;
}

function getDefaultLinks(): TrackingLinkItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: "lnk-1",
      title: "Storefront Standee QR (ป้ายสแตนดี้หน้าร้านสาขาทองหล่อ)",
      slug: "thonglor-standee",
      targetUrl: "https://thatlaundryshop.com?promo=THONG50",
      brand: "that_laundry_shop",
      channel: "standee",
      notes: "QR code on front acrylic standee outside Thonglor branch",
      isActive: true,
      totalClicks: 142,
      uniqueClicks: 118,
      lastClickedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      clickLogs: [
        { id: "log-1", timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(), device: "ios", referrer: "direct_qr" },
        { id: "log-2", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), device: "android", referrer: "direct_qr" },
        { id: "log-3", timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(), device: "ios", referrer: "direct_qr" },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "lnk-2",
      title: "Condo Ashton Flyer QR (ใบปลิวแจกลูกบ้านแอชตัน)",
      slug: "ashton-promo",
      targetUrl: "https://lin.ee/thatlaundryshop",
      brand: "that_laundry_shop",
      channel: "flyer",
      notes: "Flyer distribution at condo mailboxes with free 100 THB coupon",
      isActive: true,
      totalClicks: 89,
      uniqueClicks: 74,
      lastClickedAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
      clickLogs: [
        { id: "log-4", timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(), device: "ios", referrer: "direct_qr" },
        { id: "log-5", timestamp: new Date(Date.now() - 1000 * 60 * 300).toISOString(), device: "android", referrer: "direct_qr" },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "lnk-3",
      title: "TikTok Bio Link (ลิงก์หน้าโปรไฟล์ TikTok)",
      slug: "tiktok-bio",
      targetUrl: "https://thatlaundryshop.com/services/dry-clean",
      brand: "that_laundry_shop",
      channel: "tiktok",
      notes: "Main bio link placed on official TikTok profile",
      isActive: true,
      totalClicks: 312,
      uniqueClicks: 260,
      lastClickedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      clickLogs: [
        { id: "log-6", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), device: "ios", referrer: "tiktok" },
        { id: "log-7", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), device: "android", referrer: "tiktok" },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "lnk-4",
      title: "Noname Laundry Grand Opening Banner (แบนเนอร์เปิดสาขาโนเนม)",
      slug: "noname-open",
      targetUrl: "https://nonamelaundry.com",
      brand: "noname_laundry",
      channel: "facebook",
      notes: "Featured link on Facebook boost post announcing opening",
      isActive: true,
      totalClicks: 215,
      uniqueClicks: 180,
      lastClickedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      clickLogs: [
        { id: "log-8", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), device: "android", referrer: "facebook" },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// GET all tracking links
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceReset = searchParams.get("reset") === "true";

    let setting = null;
    if (!forceReset) {
      setting = await prisma.setting.findUnique({
        where: { key: SETTING_KEY },
      });
    }

    if (forceReset || !setting || !setting.value) {
      const defaultLinks = getDefaultLinks();
      await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: { value: JSON.stringify(defaultLinks) },
        create: { key: SETTING_KEY, value: JSON.stringify(defaultLinks) },
      });
      return NextResponse.json({ success: true, links: defaultLinks });
    }

    const links = JSON.parse(setting.value);
    return NextResponse.json({ success: true, links });
  } catch (error: any) {
    console.error("Error fetching tracking links:", error);
    return NextResponse.json({ success: true, links: getDefaultLinks(), fallback: true });
  }
}

// POST create a new tracking link
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { link } = body;

    if (!link || !link.title || !link.targetUrl) {
      return NextResponse.json(
        { success: false, error: "Title and Target URL are required" },
        { status: 400 }
      );
    }

    // Format slug
    let rawSlug = link.slug ? link.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "") : "";
    if (!rawSlug) {
      rawSlug = Math.random().toString(36).substring(2, 8);
    }

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let links: TrackingLinkItem[] = [];
    if (setting?.value) {
      try {
        links = JSON.parse(setting.value);
      } catch (e) {
        links = [];
      }
    } else {
      links = getDefaultLinks();
    }

    // Check slug uniqueness
    if (links.some((l) => l.slug.toLowerCase() === rawSlug.toLowerCase())) {
      rawSlug = `${rawSlug}-${Math.random().toString(36).substring(2, 5)}`;
    }

    const newLink: TrackingLinkItem = {
      id: `lnk-${Date.now()}`,
      title: link.title.trim(),
      slug: rawSlug,
      targetUrl: link.targetUrl.trim(),
      brand: link.brand || "that_laundry_shop",
      channel: link.channel || "offline_qr",
      notes: link.notes?.trim() || undefined,
      isActive: link.isActive !== undefined ? link.isActive : true,
      totalClicks: 0,
      uniqueClicks: 0,
      clickLogs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    links.unshift(newLink);

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(links) },
      create: { key: SETTING_KEY, value: JSON.stringify(links) },
    });

    return NextResponse.json({ success: true, link: newLink, links });
  } catch (error: any) {
    console.error("Error creating tracking link:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT update an existing link
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { link } = body;

    if (!link || !link.id) {
      return NextResponse.json({ success: false, error: "Link ID is required" }, { status: 400 });
    }

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let links: TrackingLinkItem[] = [];
    if (setting?.value) {
      try {
        links = JSON.parse(setting.value);
      } catch (e) {
        links = [];
      }
    } else {
      links = getDefaultLinks();
    }

    const index = links.findIndex((l) => l.id === link.id);
    if (index === -1) {
      return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    }

    // Check if slug changed and is duplicate
    if (link.slug && link.slug !== links[index].slug) {
      const cleanSlug = link.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
      const isDup = links.some((l) => l.id !== link.id && l.slug.toLowerCase() === cleanSlug);
      if (isDup) {
        return NextResponse.json(
          { success: false, error: "Slug code is already in use by another link" },
          { status: 400 }
        );
      }
      links[index].slug = cleanSlug;
    }

    links[index] = {
      ...links[index],
      ...link,
      updatedAt: new Date().toISOString(),
    };

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(links) },
      create: { key: SETTING_KEY, value: JSON.stringify(links) },
    });

    return NextResponse.json({ success: true, link: links[index], links });
  } catch (error: any) {
    console.error("Error updating tracking link:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE a link
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Link ID required" }, { status: 400 });
    }

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let links: TrackingLinkItem[] = [];
    if (setting?.value) {
      try {
        links = JSON.parse(setting.value);
      } catch (e) {
        links = [];
      }
    }

    links = links.filter((l) => l.id !== id);

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(links) },
      create: { key: SETTING_KEY, value: JSON.stringify(links) },
    });

    return NextResponse.json({ success: true, links });
  } catch (error: any) {
    console.error("Error deleting tracking link:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
