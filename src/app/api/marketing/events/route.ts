import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SETTING_KEY = 'marketing_calendar_events';

function getDefaultEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  return [
    {
      id: 'mkt-1',
      title: '10.10 Flash Sale Free Delivery (ส่งฟรีทั่วกรุงเทพฯ)',
      description: 'Free delivery campaign for all customers with min. spend 200 THB (แคมเปญส่งฟรีเมื่อสั่งขั้นต่ำ 200 บาท)',
      category: 'promo',
      channel: 'line',
      brand: 'that_laundry_shop',
      start: new Date(year, month, Math.max(1, day - 3), 9, 0).toISOString(),
      end: new Date(year, month, Math.max(1, day + 2), 21, 0).toISOString(),
      allDay: false,
      status: 'active',
      budget: 8000,
      promoCode: 'FREEDELIVERY',
      targetGoal: '350 Orders (ยอดสั่งซื้อ 350 ออเดอร์)',
      assignedTo: 'Marketing Team',
      contentUrl: 'https://canva.com',
      notes: 'Prepare push notification via LINE OA at 10:00 and boost FB post (เตรียมบรอดแคสต์ 10:00 น.)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mkt-2',
      title: 'LINE Broadcast: Rainy Season Duvet Promo (โปรซักผ้านวมหน้าฝน)',
      description: 'Broadcast to all LINE OA followers promoting 20% duvet laundry discount (บรอดแคสต์ส่วนลดซักผ้านวม 20%)',
      category: 'ads',
      channel: 'line',
      brand: 'all',
      start: new Date(year, month, day, 11, 30).toISOString(),
      end: new Date(year, month, day, 18, 0).toISOString(),
      allDay: false,
      status: 'scheduled',
      budget: 2500,
      promoCode: 'RAINY20',
      targetGoal: 'Open Rate 45%, Conversion 15%',
      assignedTo: 'Admin Somchai',
      contentUrl: '',
      notes: 'Verify rich message and copy before sending at 11:30 (ตรวจข้อความก่อนยิง)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mkt-3',
      title: 'TikTok Video: Behind the Scenes Laundry Standard (มาตรฐานซักอบแห้ง)',
      description: 'Short video highlighting hospital-grade hygiene, sorting & industrial dryer standards (วิดีโอสั้นมาตรฐานซักอบ)',
      category: 'content',
      channel: 'tiktok',
      brand: 'that_laundry_shop',
      start: new Date(year, month, day + 3, 14, 0).toISOString(),
      end: new Date(year, month, day + 3, 16, 0).toISOString(),
      allDay: false,
      status: 'draft',
      budget: 1500,
      targetGoal: '20,000 Views (ยอดวิว 20k)',
      assignedTo: 'Creator Team',
      contentUrl: '',
      notes: 'Filming at main branch in the morning (ถ่ายทำสาขาใหญ่)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mkt-4',
      title: 'Facebook Ads: Sukhumvit-Thonglor Condo Lead Gen (หาฐานลูกค้าคอนโด)',
      description: 'Targeted lead gen & LINE Add Friend ads for condo residents (โฆษณาหาลูกค้าคอนโดระยะ 5 กม.)',
      category: 'ads',
      channel: 'facebook',
      brand: 'that_laundry_shop',
      start: new Date(year, month, Math.max(1, day - 2), 0, 0).toISOString(),
      end: new Date(year, month, day + 5, 23, 59).toISOString(),
      allDay: false,
      status: 'active',
      budget: 12000,
      promoCode: 'TLSNEW100',
      targetGoal: 'CPA < 80 THB / New User',
      assignedTo: 'Media Buyer',
      contentUrl: 'https://business.facebook.com',
      notes: 'Targeting: Age 25-45 living within 5 km of Thonglor branch',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mkt-5',
      title: 'Noname Laundry: Store Grand Opening Coupon (แจกคูปองเปิดสาขาใหม่)',
      description: 'In-store launch event giving away free 1-load wash coupons for first 50 visitors (จัดกิจกรรมหน้าร้านแจกคูปอง)',
      category: 'promo',
      channel: 'offline',
      brand: 'noname_laundry',
      start: new Date(year, month, day + 4, 8, 0).toISOString(),
      end: new Date(year, month, day + 6, 20, 0).toISOString(),
      allDay: false,
      status: 'scheduled',
      budget: 5000,
      promoCode: 'NONAMEFREE',
      targetGoal: '100 New In-Store Customers (ลูกค้าใหม่ 100 ราย)',
      assignedTo: 'Store Manager',
      notes: 'Prepare standees and storefront banners (เตรียมสแตนดี้และป้ายผ้าหน้าร้าน)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mkt-6',
      title: 'Offline Booth: Ashton Asoke Resident Event (ออกบูธกิจกรรมลูกบ้าน)',
      description: 'Promotional booth offering door-to-door laundry pickup service for residents (ออกบูธแนะนำบริการรับส่งผ้า)',
      category: 'event',
      channel: 'offline',
      brand: 'that_laundry_shop',
      start: new Date(year, month, day + 8, 10, 0).toISOString(),
      end: new Date(year, month, day + 9, 18, 0).toISOString(),
      allDay: false,
      status: 'scheduled',
      budget: 6500,
      targetGoal: '40 Member Signups (สมาชิกใหม่ 40 ห้อง)',
      assignedTo: 'Event Specialist',
      notes: 'Liaison completed with juristic office (ประสานงานนิติบุคคลแล้ว)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

// GET all marketing events
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceReset = searchParams.get('reset') === 'true';

    let setting = null;
    if (!forceReset) {
      setting = await prisma.setting.findUnique({
        where: { key: SETTING_KEY },
      });
    }

    if (forceReset || !setting || !setting.value) {
      // Seed default events if empty or reset requested
      const defaultEvents = getDefaultEvents();
      await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: { value: JSON.stringify(defaultEvents) },
        create: { key: SETTING_KEY, value: JSON.stringify(defaultEvents) },
      });
      return NextResponse.json({ success: true, events: defaultEvents });
    }

    const events = JSON.parse(setting.value);
    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    console.error('Error fetching marketing events:', error);
    // Fallback to default events in case DB is unreachable
    return NextResponse.json({
      success: true,
      events: getDefaultEvents(),
      fallback: true,
    });
  }
}

// POST create a new event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event } = body;

    if (!event || !event.title) {
      return NextResponse.json(
        { success: false, error: 'Event title is required' },
        { status: 400 }
      );
    }

    const newEvent = {
      ...event,
      id: event.id || `mkt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: event.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let events: any[] = [];
    if (setting?.value) {
      try {
        events = JSON.parse(setting.value);
      } catch (e) {
        events = [];
      }
    } else {
      events = getDefaultEvents();
    }

    events.unshift(newEvent);

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(events) },
      create: { key: SETTING_KEY, value: JSON.stringify(events) },
    });

    return NextResponse.json({ success: true, event: newEvent, events });
  } catch (error: any) {
    console.error('Error creating marketing event:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT update an event (or reorder/batch)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { event, events: updatedAllEvents } = body;

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let events: any[] = [];
    if (setting?.value) {
      try {
        events = JSON.parse(setting.value);
      } catch (e) {
        events = [];
      }
    } else {
      events = getDefaultEvents();
    }

    if (updatedAllEvents && Array.isArray(updatedAllEvents)) {
      events = updatedAllEvents;
    } else if (event && event.id) {
      const index = events.findIndex((e) => e.id === event.id);
      if (index !== -1) {
        events[index] = {
          ...events[index],
          ...event,
          updatedAt: new Date().toISOString(),
        };
      } else {
        events.unshift({
          ...event,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Event or events array required' },
        { status: 400 }
      );
    }

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(events) },
      create: { key: SETTING_KEY, value: JSON.stringify(events) },
    });

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    console.error('Error updating marketing event:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE an event
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Event ID required' },
        { status: 400 }
      );
    }

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    let events: any[] = [];
    if (setting?.value) {
      try {
        events = JSON.parse(setting.value);
      } catch (e) {
        events = [];
      }
    }

    events = events.filter((e) => e.id !== id);

    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(events) },
      create: { key: SETTING_KEY, value: JSON.stringify(events) },
    });

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    console.error('Error deleting marketing event:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
