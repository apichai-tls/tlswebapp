export interface RecurringScheduleItem {
  serviceId: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
}

export interface RecurringSchedule {
  id: string; // e.g. "REC-1730971234567"
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  roomNo?: string;
  branchId?: string; // "ONLINE" | branch id
  brand?: string; // "that_laundry_shop" | "noname_laundry"
  
  // Frequency & Schedule Rules
  frequencyType: "weekly" | "multi_days"; // weekly 1x or multi-day per week
  daysOfWeek: number[]; // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  timeSlot: string; // "09:00 - 11:00", "11:00 - 13:00", "13:00 - 15:00", "15:00 - 17:00", "17:00 - 19:00"
  deliveryDaysOffset: number; // 1 = Next day, 2 = 2 days later, etc.
  deliveryTimeSlot?: string;
  
  // Service Template
  serviceType: "wash_fold" | "dry_clean" | "ironing" | "bedding" | "custom";
  serviceSummary?: string; // e.g. "Wash & Fold (Standard Bag)"
  defaultItems?: RecurringScheduleItem[];
  specialInstructions?: string; // e.g. "Leave with juristic / lobby", "Call before pickup"
  
  // Automation execution settings
  autoCreateTiming: "same_day_morning" | "one_day_advance";
  status: "active" | "paused";
  pausedUntil?: string; // ISO string date
  pauseReason?: string;
  
  // Tracking
  lastGeneratedDate?: string; // "YYYY-MM-DD"
  lastJobId?: string; // e.g. "2026006745"
  totalJobsCreated: number;
  
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  createdBy?: string;
}

export const DAY_NAMES = [
  { day: 0, short: "Sun", full: "Sunday", thai: "อาทิตย์" },
  { day: 1, short: "Mon", full: "Monday", thai: "จันทร์" },
  { day: 2, short: "Tue", full: "Tuesday", thai: "อังคาร" },
  { day: 3, short: "Wed", full: "Wednesday", thai: "พุธ" },
  { day: 4, short: "Thu", full: "Thursday", thai: "พฤหัสฯ" },
  { day: 5, short: "Fri", full: "Friday", thai: "ศุกร์" },
  { day: 6, short: "Sat", full: "Saturday", thai: "เสาร์" },
];

export const TIME_SLOTS = [
  "08:00 - 10:00",
  "09:00 - 11:00",
  "10:00 - 12:00",
  "11:00 - 13:00",
  "13:00 - 15:00",
  "14:00 - 16:00",
  "15:00 - 17:00",
  "17:00 - 19:00",
  "18:00 - 20:00",
];
