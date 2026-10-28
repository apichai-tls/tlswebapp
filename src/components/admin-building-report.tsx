"use client";

import React, { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import {
  Building2,
  MapPin,
  Users,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Award,
  Sparkles,
  Search,
  ExternalLink,
  Copy,
  Check,
  Crown,
  ChevronRight,
  Flame,
  Briefcase,
  Layers,
  X,
  RefreshCw,
  FileSpreadsheet,
  Truck,
  Package,
  Navigation,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfYear } from "date-fns";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { shopStore, poiStore, jobStore, type Job, type Customer } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface AdminBuildingReportProps {
  onViewJob?: (job: Job) => void;
}

type RegionType = "bangkok" | "pattaya";
type RegionFilter = "all" | "bangkok" | "pattaya" | "compare";
type DateRangePreset = "30days" | "90days" | "180days" | "year" | "all" | "custom";
type SortField = "orders" | "revenue" | "customers" | "aov" | "bdScore";

interface ServiceStat {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

interface ResidentStat {
  key: string;
  customerId?: string;
  name: string;
  phone: string;
  rooms: string[];
  isVIP: boolean;
  isMember: boolean;
  isCorporate: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: Date;
}

interface BuildingReportRow {
  id: string;
  name: string;
  pickupDeliveryAddress: string;
  region: RegionType;
  coords: { lat: number; lng: number } | null;
  googleMapsUrl: string;
  totalOrders: number;
  pickupOrdersCount: number;
  deliveryOrdersCount: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRatePct: number;
  vipMemberCustomers: number;
  corporateCustomers: number;
  totalRevenue: number;
  paidRevenue: number;
  totalDeliveryFees: number;
  avgOrderValue: number;
  revenuePerCustomer: number;
  topService: ServiceStat | null;
  topServiceSharePct: number;
  serviceBreakdown: ServiceStat[];
  residents: ResidentStat[];
  recentJobs: Job[];
  roomsCount: number;
  firstOrderDate: Date;
  lastOrderDate: Date;
  bdScore: number;
  bdTier: "PRIME_PARTNERSHIP" | "VIP_HIGH_VALUE" | "CORPORATE_ACTIVE" | "GROWTH_PROSPECT";
}

const IGNORED_LOCATION_NAMES = new Set([
  "",
  "-",
  "walk-in",
  "walk in",
  "walkin",
  "walk-in guest",
  "in-store",
  "in store",
  "instore",
  "pos",
  "shop",
  "store",
  "branch",
  "tba",
  "n/a",
  "none",
  "unknown",
  "self pickup",
  "customer pickup",
  "ทั่วไป",
  "หน้าร้าน",
  "ลูกค้าหน้าร้าน",
  "รับเอง",
  "มารับเอง",
  "ลูกค้ามารับเอง",
  "ลูกค้ามาส่งเอง",
]);

const FEE_OR_TOPUP_ITEM_NAMES = new Set([
  "PICK UP FEES",
  "PICKUP FEES",
  "PICKUP FEE",
  "DELIVERY FEES",
  "DELIVERY FEE",
  "TOP UP",
  "TOPUP",
  "PACKAGE",
]);

function formatServiceTypeLabel(st?: string | null): string | null {
  if (!st) return null;
  const lower = st.toLowerCase();
  if (lower === "wash_fold") return "Wash & Fold";
  if (lower === "wash_iron_fold") return "Wash & Iron (Fold)";
  if (lower === "wash_iron_hanger") return "Wash & Iron (Hanger)";
  return st;
}

function cleanBuildingNameAndRoom(raw: string): { cleanName: string; extractedRoom: string | null } {
  if (!raw) return { cleanName: "", extractedRoom: null };
  let text = raw.trim();

  // Ignore bare URLs
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return { cleanName: "", extractedRoom: null };
  }

  let extractedRoom: string | null = null;
  const roomMatch = text.match(/(?:\b(?:room|rm|unit|ห้อง)\s*[:#.]?\s*([A-Za-z0-9/-]+))/i);
  if (roomMatch && roomMatch[1]) {
    extractedRoom = roomMatch[1].trim();
    text = text.replace(roomMatch[0], "").trim();
  }

  // Strip trailing parentheses if they only contained room/floor info or empty
  text = text
    .replace(/\(\s*(?:fl\.?|floor|ชั้น)?\s*\d*\s*\)/gi, "")
    .replace(/[-–—,/:\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cleanName: text, extractedRoom };
}

function normalizeBuildingKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(condo|condominium|apartment|residence|residences|hotel|tower|building|bangkok|pattaya|คอนโด|อาคาร)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AdminBuildingReport({ onViewJob }: AdminBuildingReportProps) {
  const jobs = useJobs();
  const customers = useCustomers();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);

  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("90days");
  const [customStart, setCustomStart] = useState<string>(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("orders");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [copiedPitch, setCopiedPitch] = useState<boolean>(false);

  // Compute date range bounds
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (datePreset === "30days") {
      return { startDate: startOfDay(subDays(now, 30)), endDate: endOfDay(now) };
    }
    if (datePreset === "90days") {
      return { startDate: startOfDay(subDays(now, 90)), endDate: endOfDay(now) };
    }
    if (datePreset === "180days") {
      return { startDate: startOfDay(subDays(now, 180)), endDate: endOfDay(now) };
    }
    if (datePreset === "year") {
      return { startDate: startOfYear(now), endDate: endOfDay(now) };
    }
    if (datePreset === "custom" && customStart && customEnd) {
      return {
        startDate: startOfDay(new Date(customStart)),
        endDate: endOfDay(new Date(customEnd)),
      };
    }
    return { startDate: startOfDay(subDays(now, 365)), endDate: endOfDay(now) };
  }, [datePreset, customStart, customEnd]);

  // Fetch historical jobs for the selected range
  useEffect(() => {
    let active = true;
    setIsLoadingHistory(true);
    const timer = setTimeout(() => {
      jobStore
        .fetchHistoricalJobs(startDate, endDate)
        .catch((err) => console.error("Failed to fetch historical jobs for building report:", err))
        .finally(() => {
          if (active) setIsLoadingHistory(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [startDate, endDate]);

  // Build fast lookup maps for customers, excluded branch names, and POIs
  const { customerById, customerByPhone, excludedBranchStrings, poiByExactLower, poiByNormKey } = useMemo(() => {
    const cId = new Map<string, Customer>();
    const cPhone = new Map<string, Customer>();
    for (const c of customers) {
      if (c.id) cId.set(c.id, c);
      const p1 = (c.phone || "").replace(/\D/g, "");
      if (p1.length >= 8) cPhone.set(p1.slice(-9), c);
      const p2 = (c.secondaryPhone || "").replace(/\D/g, "");
      if (p2.length >= 8) cPhone.set(p2.slice(-9), c);
    }

    // Build comprehensive set of branch names/addresses so branches are NEVER included as customer buildings
    const branchExcluded = new Set<string>();
    for (const s of shops) {
      if (s.name) {
        const lower = s.name.trim().toLowerCase();
        branchExcluded.add(lower);
        const withoutBrand = lower
          .replace(/that laundry shop/gi, "")
          .replace(/noname laundry/gi, "")
          .replace(/[()[\]]/g, "")
          .trim();
        if (withoutBrand.length >= 3) {
          branchExcluded.add(withoutBrand);
        }
      }
      if (s.address) {
        branchExcluded.add(s.address.trim().toLowerCase());
      }
    }

    const pExact = new Map<string, (typeof pois)[number]>();
    const pNorm = new Map<string, (typeof pois)[number]>();
    for (const p of pois) {
      if (!p.name) continue;
      const lower = p.name.trim().toLowerCase();
      if (branchExcluded.has(lower) || lower.includes("that laundry shop") || lower.includes("noname laundry")) {
        continue;
      }
      pExact.set(lower, p);
      const nk = normalizeBuildingKey(p.name);
      if (nk && !pNorm.has(nk)) pNorm.set(nk, p);
    }

    return {
      customerById: cId,
      customerByPhone: cPhone,
      excludedBranchStrings: branchExcluded,
      poiByExactLower: pExact,
      poiByNormKey: pNorm,
    };
  }, [customers, shops, pois]);

  // Aggregate jobs strictly by Customer Pickup Address & Delivery Address (excluding all branches)
  const buildingRows = useMemo<BuildingReportRow[]>(() => {
    const groups = new Map<
      string,
      {
        canonicalName: string;
        pickupDeliveryAddress: string;
        region: RegionType;
        coords: { lat: number; lng: number } | null;
        placeId?: string;
        jobs: Job[];
        pickupOrdersCount: number;
        deliveryOrdersCount: number;
        serviceMap: Map<string, ServiceStat>;
        residentMap: Map<string, ResidentStat>;
        roomsSet: Set<string>;
        totalRevenue: number;
        paidRevenue: number;
        totalDeliveryFees: number;
        firstOrderDate: Date;
        lastOrderDate: Date;
      }
    >();

    const isCustomerBuildingAddress = (val?: string | null): boolean => {
      if (!val) return false;
      const trimmed = val.trim();
      if (trimmed.length < 2) return false;
      const lower = trimmed.toLowerCase();
      if (IGNORED_LOCATION_NAMES.has(lower)) return false;
      if (excludedBranchStrings.has(lower)) return false;
      if (
        lower.includes("that laundry shop") ||
        lower.includes("noname laundry") ||
        lower.includes("no name laundry") ||
        lower.startsWith("tls ") ||
        lower.includes("สาขา") ||
        lower.startsWith("http://") ||
        lower.startsWith("https://")
      ) {
        return false;
      }
      return true;
    };

    // Determine Bangkok vs Pattaya strictly from the Pickup / Delivery address & coordinates
    const detectRegionFromAddress = (
      buildingName: string,
      addressStr: string,
      rawPickup: string,
      rawDelivery: string,
      coords: { lat: number; lng: number } | null
    ): RegionType => {
      // 1. Check GPS coordinates of the pickup/delivery building (Pattaya/Chonburi vs Bangkok)
      if (coords && coords.lat > 5 && coords.lng > 95) {
        if (coords.lat < 13.35 && coords.lng > 100.75) {
          return "pattaya";
        }
        if (coords.lat >= 13.45) {
          return "bangkok";
        }
      }
      // 2. Check pickup & delivery address text keywords
      const combined = `${buildingName} ${addressStr} ${rawPickup} ${rawDelivery}`.toLowerCase();
      if (
        combined.includes("pattaya") ||
        combined.includes("พัทยา") ||
        combined.includes("jomtien") ||
        combined.includes("จอมเทียน") ||
        combined.includes("naklua") ||
        combined.includes("นาเกลือ") ||
        combined.includes("pratumnak") ||
        combined.includes("พระตำหนัก") ||
        combined.includes("banglamung") ||
        combined.includes("บางละมุง") ||
        combined.includes("chonburi") ||
        combined.includes("ชลบุรี") ||
        combined.includes("nong prue") ||
        combined.includes("หนองปรือ")
      ) {
        return "pattaya";
      }
      return "bangkok";
    };

    for (const job of jobs) {
      // Exclude cancelled, returned, and wallet top-up jobs
      if (job.status === "cancel" || job.status === "return" || job.status === "topup") continue;
      if (String(job.id).toUpperCase().startsWith("TU-")) continue;

      const jobDate = new Date(job.createdAt);
      if (isNaN(jobDate.getTime())) continue;
      if (jobDate < startDate || jobDate > endDate) continue;

      // Match customer record if available
      let customer: Customer | undefined;
      if (job.customerId && customerById.has(job.customerId)) {
        customer = customerById.get(job.customerId);
      } else if (job.customerPhone) {
        const cleanPhone = job.customerPhone.replace(/\D/g, "");
        if (cleanPhone.length >= 8) {
          customer = customerByPhone.get(cleanPhone.slice(-9));
        }
      }

      // Strictly use ONLY Pickup Address (job.pickupLocation) and Delivery Address (job.deliveryAddress)
      // NEVER use job.dropoffLocation because dropoffLocation is the Shop Branch!
      const hasValidPickup = isCustomerBuildingCandidate(job.pickupLocation);
      const hasValidDelivery = isCustomerBuildingCandidate(job.deliveryAddress);

      let rawBuildingSource = "";
      if (hasValidPickup) {
        rawBuildingSource = job.pickupLocation;
      } else if (hasValidDelivery) {
        rawBuildingSource = job.deliveryAddress!;
      } else if (customer && (job.type as string) !== "in_store") {
        // Fallback to customer's saved pickup/delivery address only for delivery/pickup orders
        const addrPlace = customer.addresses?.[0]?.placeName || customer.addresses?.[0]?.label;
        if (isCustomerBuildingCandidate(addrPlace)) {
          rawBuildingSource = addrPlace!;
        } else if (isCustomerBuildingCandidate(customer.defaultAddress)) {
          rawBuildingSource = customer.defaultAddress;
        }
      }

      if (!rawBuildingSource) continue;

      const { cleanName, extractedRoom } = cleanBuildingNameAndRoom(rawBuildingSource);
      if (!isCustomerBuildingCandidate(cleanName)) continue;

      // Match against POI database for canonical building name & full address
      const lowerClean = cleanName.toLowerCase();
      const normKey = normalizeBuildingKey(cleanName);
      const matchedPoi = poiByExactLower.get(lowerClean) || (normKey ? poiByNormKey.get(normKey) : undefined);

      const canonicalName = matchedPoi ? matchedPoi.name.trim() : cleanName;
      if (!isCustomerBuildingCandidate(canonicalName)) continue;

      const groupKey = matchedPoi ? `poi:${matchedPoi.id}` : `name:${normKey || lowerClean}`;

      const coords =
        matchedPoi?.coords ||
        (job.pickupCoords && (job.pickupCoords.lat !== 13.73 || job.pickupCoords.lng !== 100.53)
          ? job.pickupCoords
          : null);

      const fullPickupDeliveryAddr =
        (matchedPoi?.address && !matchedPoi.address.startsWith("http") ? matchedPoi.address : "") ||
        (hasValidDelivery && job.deliveryAddress !== canonicalName && !job.deliveryAddress?.startsWith("http")
          ? job.deliveryAddress!
          : "") ||
        (customer?.defaultAddress && !customer.defaultAddress.startsWith("http") ? customer.defaultAddress : "") ||
        canonicalName;

      const region = detectRegionFromAddress(
        canonicalName,
        fullPickupDeliveryAddr,
        job.pickupLocation || "",
        job.deliveryAddress || "",
        coords
      );

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          canonicalName,
          pickupDeliveryAddress: fullPickupDeliveryAddr,
          region,
          coords,
          placeId: matchedPoi?.placeId,
          jobs: [],
          pickupOrdersCount: 0,
          deliveryOrdersCount: 0,
          serviceMap: new Map(),
          residentMap: new Map(),
          roomsSet: new Set(),
          totalRevenue: 0,
          paidRevenue: 0,
          totalDeliveryFees: 0,
          firstOrderDate: jobDate,
          lastOrderDate: jobDate,
        };
        groups.set(groupKey, group);
      }

      group.jobs.push(job);
      if (hasValidPickup) group.pickupOrdersCount++;
      if (hasValidDelivery || job.type === "full_service" || job.type === "delivery") group.deliveryOrdersCount++;

      if (jobDate < group.firstOrderDate) group.firstOrderDate = jobDate;
      if (jobDate > group.lastOrderDate) group.lastOrderDate = jobDate;
      if (!group.coords && coords) group.coords = coords;
      if (
        group.pickupDeliveryAddress === group.canonicalName &&
        fullPickupDeliveryAddr &&
        fullPickupDeliveryAddr !== group.canonicalName
      ) {
        group.pickupDeliveryAddress = fullPickupDeliveryAddr;
      }

      // Track room numbers
      const roomStr = job.pickupRoom || job.dropoffRoom || extractedRoom || customer?.roomNo || null;
      if (roomStr && roomStr.trim()) {
        group.roomsSet.add(roomStr.trim());
      }

      // Financials (Strictly validated non-negative per business-logic-auditor)
      const orderTotal = Math.max(0, Number(job.totalAmount) || 0);
      const orderFee = Math.max(0, Number(job.fee) || 0);
      group.totalRevenue = Math.round((group.totalRevenue + orderTotal) * 100) / 100;
      if (job.isPaid || job.isShopPaid) {
        group.paidRevenue = Math.round((group.paidRevenue + orderTotal) * 100) / 100;
      }
      group.totalDeliveryFees = Math.round((group.totalDeliveryFees + orderFee) * 100) / 100;

      // Track Resident / Customer
      const cleanPhone = (job.customerPhone || customer?.phone || "").replace(/\D/g, "");
      const residentKey =
        customer?.id ||
        job.customerId ||
        (cleanPhone.length >= 8 ? `tel:${cleanPhone.slice(-9)}` : `name:${(job.customerName || "Guest").trim().toLowerCase()}`);

      let resident = group.residentMap.get(residentKey);
      if (!resident) {
        resident = {
          key: residentKey,
          customerId: customer?.id || job.customerId,
          name: customer?.name || job.customerName || "Resident Guest",
          phone: customer?.phone || job.customerPhone || "-",
          rooms: [],
          isVIP: Boolean(customer?.isVIP || customer?.tier === "vip"),
          isMember: Boolean(customer?.isMember || customer?.tier === "member"),
          isCorporate: Boolean(customer?.isCorporate || customer?.tier === "corporate"),
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: jobDate,
        };
        group.residentMap.set(residentKey, resident);
      }
      resident.orderCount++;
      resident.totalSpent = Math.round((resident.totalSpent + orderTotal) * 100) / 100;
      if (jobDate > resident.lastOrderDate) resident.lastOrderDate = jobDate;
      if (roomStr && roomStr.trim() && !resident.rooms.includes(roomStr.trim())) {
        resident.rooms.push(roomStr.trim());
      }

      // Track Services & Items Sold in this Building
      let jobItems: any[] = [];
      if (Array.isArray(job.items) && job.items.length > 0) {
        jobItems = job.items;
      } else if (job.itemsJson) {
        try {
          const parsed = JSON.parse(job.itemsJson);
          if (Array.isArray(parsed)) jobItems = parsed;
        } catch {}
      }

      let recordedLineItem = false;
      for (const item of jobItems) {
        const rawItemName = (item.name || item.nameEn || "").trim();
        if (!rawItemName) continue;
        if (FEE_OR_TOPUP_ITEM_NAMES.has(rawItemName.toUpperCase())) continue;

        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineRev = Math.max(0, qty * (Number(item.price) || 0));
        const existingSvc = group.serviceMap.get(rawItemName) || {
          name: rawItemName,
          quantity: 0,
          revenue: 0,
          orderCount: 0,
        };
        existingSvc.quantity = Math.round((existingSvc.quantity + qty) * 100) / 100;
        existingSvc.revenue = Math.round((existingSvc.revenue + lineRev) * 100) / 100;
        existingSvc.orderCount++;
        group.serviceMap.set(rawItemName, existingSvc);
        recordedLineItem = true;
      }

      if (!recordedLineItem) {
        const serviceLabels: string[] = [];
        if (Array.isArray(job.laundryTypes) && job.laundryTypes.length > 0) {
          serviceLabels.push(...job.laundryTypes.filter(Boolean));
        } else {
          const stLabel = formatServiceTypeLabel(job.serviceType);
          if (stLabel) serviceLabels.push(stLabel);
        }
        if (serviceLabels.length === 0) {
          serviceLabels.push("Wash & Fold / Standard Laundry");
        }
        const splitRev = Math.max(0, orderTotal - orderFee) / serviceLabels.length;
        for (const label of serviceLabels) {
          const existingSvc = group.serviceMap.get(label) || {
            name: label,
            quantity: 0,
            revenue: 0,
            orderCount: 0,
          };
          existingSvc.quantity += 1;
          existingSvc.revenue = Math.round((existingSvc.revenue + splitRev) * 100) / 100;
          existingSvc.orderCount++;
          group.serviceMap.set(label, existingSvc);
        }
      }
    }

    function isCustomerBuildingCandidate(val?: string | null): boolean {
      return isCustomerBuildingAddress(val);
    }

    // Convert grouped map into enriched BuildingReportRow[]
    const rows: BuildingReportRow[] = [];
    for (const [groupKey, g] of groups.entries()) {
      const totalOrders = g.jobs.length;
      const residents = Array.from(g.residentMap.values()).sort(
        (a, b) => b.totalSpent - a.totalSpent || b.orderCount - a.orderCount
      );
      const uniqueCustomers = residents.length;
      const repeatCustomers = residents.filter((r) => r.orderCount >= 2).length;
      const repeatRatePct = uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0;
      const vipMemberCustomers = residents.filter((r) => r.isVIP || r.isMember).length;
      const corporateCustomers = residents.filter((r) => r.isCorporate).length;

      const avgOrderValue = totalOrders > 0 ? Math.round(g.totalRevenue / totalOrders) : 0;
      const revenuePerCustomer = uniqueCustomers > 0 ? Math.round(g.totalRevenue / uniqueCustomers) : 0;

      // Sort services by revenue desc, then orderCount desc
      const serviceBreakdown = Array.from(g.serviceMap.values()).sort(
        (a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount || b.quantity - a.quantity
      );
      const topService = serviceBreakdown[0] || null;
      const totalServiceRev = serviceBreakdown.reduce((sum, s) => sum + s.revenue, 0);
      const topServiceSharePct =
        topService && totalServiceRev > 0
          ? Math.min(100, Math.round((topService.revenue / totalServiceRev) * 100))
          : topService && totalOrders > 0
            ? Math.min(100, Math.round((topService.orderCount / totalOrders) * 100))
            : 0;

      // Business Development Score (0 - 100)
      const orderScore = Math.min(40, totalOrders * 4);
      const customerScore = Math.min(25, uniqueCustomers * 5);
      const revenueScore = Math.min(25, Math.round(g.totalRevenue / 400));
      const loyaltyScore = Math.min(10, Math.round(repeatRatePct / 10));
      const bdScore = Math.min(100, orderScore + customerScore + revenueScore + loyaltyScore);

      let bdTier: BuildingReportRow["bdTier"] = "GROWTH_PROSPECT";
      if (corporateCustomers > 0) {
        bdTier = "CORPORATE_ACTIVE";
      } else if (totalOrders >= 5 || (uniqueCustomers >= 3 && g.totalRevenue >= 2000)) {
        bdTier = "PRIME_PARTNERSHIP";
      } else if (avgOrderValue >= 500 || vipMemberCustomers >= 2 || g.totalRevenue >= 2500) {
        bdTier = "VIP_HIGH_VALUE";
      }

      const googleMapsUrl = g.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.canonicalName)}&query_place_id=${g.placeId}`
        : g.coords
          ? `https://www.google.com/maps/search/?api=1&query=${g.coords.lat},${g.coords.lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.canonicalName)}`;

      rows.push({
        id: groupKey,
        name: g.canonicalName,
        pickupDeliveryAddress: g.pickupDeliveryAddress,
        region: g.region,
        coords: g.coords,
        googleMapsUrl,
        totalOrders,
        pickupOrdersCount: g.pickupOrdersCount,
        deliveryOrdersCount: g.deliveryOrdersCount,
        uniqueCustomers,
        repeatCustomers,
        repeatRatePct,
        vipMemberCustomers,
        corporateCustomers,
        totalRevenue: g.totalRevenue,
        paidRevenue: g.paidRevenue,
        totalDeliveryFees: g.totalDeliveryFees,
        avgOrderValue,
        revenuePerCustomer,
        topService,
        topServiceSharePct,
        serviceBreakdown,
        residents,
        recentJobs: [...g.jobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        roomsCount: g.roomsSet.size,
        firstOrderDate: g.firstOrderDate,
        lastOrderDate: g.lastOrderDate,
        bdScore,
        bdTier,
      });
    }

    return rows;
  }, [jobs, startDate, endDate, customerById, customerByPhone, excludedBranchStrings, poiByExactLower, poiByNormKey]);

  // Apply UI filters & sorting
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return buildingRows
      .filter((r) => {
        if (regionFilter === "bangkok" && r.region !== "bangkok") return false;
        if (regionFilter === "pattaya" && r.region !== "pattaya") return false;
        if (tierFilter !== "all" && r.bdTier !== tierFilter) return false;
        if (q) {
          const matchesName = r.name.toLowerCase().includes(q);
          const matchesAddr = r.pickupDeliveryAddress.toLowerCase().includes(q);
          const matchesService = r.topService?.name.toLowerCase().includes(q);
          const matchesResident = r.residents.some(
            (res) => res.name.toLowerCase().includes(q) || res.phone.includes(q)
          );
          if (!matchesName && !matchesAddr && !matchesService && !matchesResident) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortField === "orders") return b.totalOrders - a.totalOrders || b.totalRevenue - a.totalRevenue;
        if (sortField === "revenue") return b.totalRevenue - a.totalRevenue || b.totalOrders - a.totalOrders;
        if (sortField === "customers") return b.uniqueCustomers - a.uniqueCustomers || b.totalOrders - a.totalOrders;
        if (sortField === "aov") return b.avgOrderValue - a.avgOrderValue || b.totalRevenue - a.totalRevenue;
        return b.bdScore - a.bdScore || b.totalRevenue - a.totalRevenue;
      });
  }, [buildingRows, regionFilter, tierFilter, searchQuery, sortField]);

  const bangkokTopBuildings = useMemo(
    () =>
      buildingRows
        .filter((r) => r.region === "bangkok")
        .sort((a, b) => b.totalOrders - a.totalOrders || b.totalRevenue - a.totalRevenue),
    [buildingRows]
  );

  const pattayaTopBuildings = useMemo(
    () =>
      buildingRows
        .filter((r) => r.region === "pattaya")
        .sort((a, b) => b.totalOrders - a.totalOrders || b.totalRevenue - a.totalRevenue),
    [buildingRows]
  );

  // Executive KPI Summary
  const summaryStats = useMemo(() => {
    let orders = 0;
    let customersCount = 0;
    let repeatCount = 0;
    let revenue = 0;
    let primeTargets = 0;

    for (const r of filteredRows) {
      orders += r.totalOrders;
      customersCount += r.uniqueCustomers;
      repeatCount += r.repeatCustomers;
      revenue += r.totalRevenue;
      if (r.bdTier === "PRIME_PARTNERSHIP") primeTargets++;
    }

    return {
      totalBuildings: filteredRows.length,
      bangkokBuildings: buildingRows.filter((r) => r.region === "bangkok").length,
      pattayaBuildings: buildingRows.filter((r) => r.region === "pattaya").length,
      orders,
      customersCount,
      repeatRate: customersCount > 0 ? Math.round((repeatCount / customersCount) * 100) : 0,
      revenue: Math.round(revenue),
      aov: orders > 0 ? Math.round(revenue / orders) : 0,
      primeTargets,
      topBkk: bangkokTopBuildings[0] || null,
      topPty: pattayaTopBuildings[0] || null,
    };
  }, [filteredRows, buildingRows, bangkokTopBuildings, pattayaTopBuildings]);

  const selectedBuilding = useMemo(
    () => buildingRows.find((b) => b.id === selectedBuildingId) || null,
    [buildingRows, selectedBuildingId]
  );

  const renderBdTierBadge = (tier: BuildingReportRow["bdTier"]) => {
    switch (tier) {
      case "PRIME_PARTNERSHIP":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
            <Flame size={10.5} className="text-rose-600" /> Prime B2B Target
          </span>
        );
      case "VIP_HIGH_VALUE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
            <Crown size={10.5} className="text-amber-600" /> High-Value VIP Hub
          </span>
        );
      case "CORPORATE_ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Briefcase size={10.5} className="text-indigo-600" /> Corporate Active
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <TrendingUp size={10.5} className="text-emerald-600" /> Growth Prospect
          </span>
        );
    }
  };

  const handleExportCsv = () => {
    if (filteredRows.length === 0) {
      toast.error("No building records to export");
      return;
    }

    const headers = [
      "Rank",
      "Building / Condo / Hotel Name",
      "Pickup & Delivery Address",
      "City / Region",
      "BD Priority Tier",
      "BD Score",
      "Total Customer Orders",
      "Pickup Orders",
      "Delivery Orders",
      "Unique Customers in Building",
      "Repeat Customers",
      "Repeat Rate (%)",
      "VIP / Member Residents",
      "Units / Rooms Recorded",
      "Total Transacted Revenue (THB)",
      "Avg Order Value (THB)",
      "Revenue Per Customer (THB)",
      "Total Delivery Fees Paid (THB)",
      "Top Selling Service",
      "Top Service Share (%)",
      "Top 3 Services",
      "Last Order Date",
      "Google Maps URL",
    ];

    const escapeCsv = (val: any) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(","),
      ...filteredRows.map((r, idx) =>
        [
          idx + 1,
          r.name,
          r.pickupDeliveryAddress,
          r.region === "pattaya" ? "Pattaya" : "Bangkok",
          r.bdTier,
          r.bdScore,
          r.totalOrders,
          r.pickupOrdersCount,
          r.deliveryOrdersCount,
          r.uniqueCustomers,
          r.repeatCustomers,
          `${r.repeatRatePct}%`,
          r.vipMemberCustomers,
          r.roomsCount,
          r.totalRevenue,
          r.avgOrderValue,
          r.revenuePerCustomer,
          r.totalDeliveryFees,
          r.topService?.name || "-",
          `${r.topServiceSharePct}%`,
          r.serviceBreakdown
            .slice(0, 3)
            .map((s) => `${s.name} (฿${s.revenue})`)
            .join(" | "),
          format(r.lastOrderDate, "yyyy-MM-dd"),
          r.googleMapsUrl,
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `building-bd-report-${regionFilter}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length} buildings to CSV!`);
  };

  const generateSalesPitchText = (b: BuildingReportRow) => {
    const regionLabel = b.region === "pattaya" ? "Pattaya" : "Bangkok";
    const topServicesStr = b.serviceBreakdown
      .slice(0, 3)
      .map((s) => `${s.name} (฿${s.revenue.toLocaleString()})`)
      .join(", ");

    return [
      `🏢 B2B Partnership Brief: ${b.name} (${regionLabel})`,
      `• Pickup / Delivery Address: ${b.pickupDeliveryAddress}`,
      `• Existing Resident Footprint: ${b.uniqueCustomers} active customers in this building (${b.repeatRatePct}% repeat customer retention${b.roomsCount > 0 ? `, across ${b.roomsCount} recorded rooms/units` : ""})`,
      `• Order Volume & Transacted Spend: ${b.totalOrders} customer orders (${b.pickupOrdersCount} pickups / ${b.deliveryOrdersCount} deliveries) generating ฿${b.totalRevenue.toLocaleString()} (Avg ฿${b.avgOrderValue.toLocaleString()}/order)`,
      `• Top Demanded Services: ${topServicesStr || "Wash & Fold / Ironing"}`,
      `• Recommended B2B Pitch: Approach ${b.name} Juristic / Property Management with an exclusive Resident Partner Discount or Lobby Drop-off & Scheduled Pickup Day (residents in this building have already spent ฿${b.totalDeliveryFees.toLocaleString()} on pickup/delivery fees).`,
    ].join("\n");
  };

  return (
    <div className="flex-1 bg-slate-50/70 p-4 lg:p-6 space-y-5 overflow-y-auto">
      {/* Top Header & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 text-white flex items-center justify-center shadow-sm shadow-indigo-500/20 shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Building Sales & Business Development Report
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <Sparkles size={11} /> Based on Customer Pickup & Delivery Addresses
              </span>
              {isLoadingHistory && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <RefreshCw size={11} className="animate-spin text-indigo-600" /> Syncing history...
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Ranks condos, apartments, and hotels in Bangkok & Pattaya strictly by customer pickup & delivery addresses—showing customer count, transacted amount, and top-selling services for B2B outreach.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={14} className="mr-1.5" />
            Export Sales CSV ({filteredRows.length})
          </Button>
        </div>
      </div>

      {/* Executive KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Active Customer Buildings */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Customer Buildings</span>
            <Building2 size={15} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{summaryStats.totalBuildings}</div>
          <div className="text-[10.5px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold">{summaryStats.bangkokBuildings} BKK</span>
            <span>•</span>
            <span className="text-teal-600 font-bold">{summaryStats.pattayaBuildings} PTY</span>
          </div>
        </div>

        {/* Card 2: Total Building Orders */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Pickup / Delivery Orders</span>
            <ShoppingBag size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{summaryStats.orders.toLocaleString()}</div>
          <div className="text-[10.5px] font-semibold text-slate-500 mt-1">
            {summaryStats.primeTargets} Prime B2B Target buildings
          </div>
        </div>

        {/* Card 3: Unique Building Customers */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Customers in Buildings</span>
            <Users size={15} className="text-sky-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{summaryStats.customersCount.toLocaleString()}</div>
          <div className="text-[10.5px] font-semibold text-emerald-600 mt-1">
            {summaryStats.repeatRate}% Repeat Customer Rate
          </div>
        </div>

        {/* Card 4: Total Transacted Volume */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Transacted Amount</span>
            <DollarSign size={15} className="text-violet-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-1">฿{summaryStats.revenue.toLocaleString()}</div>
          <div className="text-[10.5px] font-semibold text-slate-500 mt-1">
            Avg ฿{summaryStats.aov.toLocaleString()} per order
          </div>
        </div>

        {/* Card 5: #1 Bangkok Building */}
        <div
          onClick={() => summaryStats.topBkk && setSelectedBuildingId(summaryStats.topBkk.id)}
          className="bg-gradient-to-br from-indigo-50/90 to-white p-4 rounded-2xl border border-indigo-200/90 shadow-2xs cursor-pointer hover:border-indigo-400 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">#1 Bangkok Building</span>
            <Award size={15} className="text-indigo-600" />
          </div>
          <div className="text-sm font-black text-slate-900 truncate mt-1" title={summaryStats.topBkk?.name}>
            {summaryStats.topBkk?.name || "—"}
          </div>
          <div className="text-[10.5px] font-bold text-indigo-700 mt-1 truncate">
            {summaryStats.topBkk
              ? `${summaryStats.topBkk.totalOrders} orders • ฿${summaryStats.topBkk.totalRevenue.toLocaleString()}`
              : "No orders in range"}
          </div>
        </div>

        {/* Card 6: #1 Pattaya Building */}
        <div
          onClick={() => summaryStats.topPty && setSelectedBuildingId(summaryStats.topPty.id)}
          className="bg-gradient-to-br from-teal-50/90 to-white p-4 rounded-2xl border border-teal-200/90 shadow-2xs cursor-pointer hover:border-teal-400 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">#1 Pattaya Building</span>
            <Award size={15} className="text-teal-600" />
          </div>
          <div className="text-sm font-black text-slate-900 truncate mt-1" title={summaryStats.topPty?.name}>
            {summaryStats.topPty?.name || "—"}
          </div>
          <div className="text-[10.5px] font-bold text-teal-700 mt-1 truncate">
            {summaryStats.topPty
              ? `${summaryStats.topPty.totalOrders} orders • ฿${summaryStats.topPty.totalRevenue.toLocaleString()}`
              : "No orders in range"}
          </div>
        </div>
      </div>

      {/* Filters & Region Control Bar (No Branch Selector) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Region Tabs */}
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
            {[
              { id: "all", label: `All Buildings (${buildingRows.length})` },
              { id: "bangkok", label: `Bangkok (${summaryStats.bangkokBuildings})` },
              { id: "pattaya", label: `Pattaya (${summaryStats.pattayaBuildings})` },
              { id: "compare", label: "Bangkok vs Pattaya Top 10" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRegionFilter(tab.id as RegionFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  regionFilter === tab.id
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Range Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "30days", label: "30 Days" },
                { id: "90days", label: "90 Days" },
                { id: "180days", label: "6 Months" },
                { id: "year", label: "This Year" },
                { id: "all", label: "12 Months" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  datePreset === p.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
            {datePreset === "custom" && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                />
              </div>
            )}
          </div>
        </div>

        {/* Second Filter Row: Search, BD Tier, Sort By */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search building name, pickup/delivery address, customer, or top service..."
              className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50/90 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-9 px-3 text-xs font-bold text-slate-700 bg-slate-50/90 border border-slate-200 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="all">All BD Opportunity Tiers</option>
            <option value="PRIME_PARTNERSHIP">🔥 Prime B2B Target</option>
            <option value="VIP_HIGH_VALUE">👑 High-Value VIP Hub</option>
            <option value="CORPORATE_ACTIVE">💼 Corporate Active</option>
            <option value="GROWTH_PROSPECT">📈 Growth Prospect</option>
          </select>

          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="h-9 px-3 text-xs font-bold text-slate-700 bg-slate-50/90 border border-slate-200 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="orders">Sort by: Most Customer Orders</option>
            <option value="revenue">Sort by: Highest Transacted (฿)</option>
            <option value="customers">Sort by: Most Customers in Building</option>
            <option value="aov">Sort by: Highest Avg Order (AOV)</option>
            <option value="bdScore">Sort by: BD Opportunity Score</option>
          </select>
        </div>
      </div>

      {/* Side-by-Side Bangkok vs Pattaya Top Buildings Leaderboard */}
      {(regionFilter === "all" || regionFilter === "compare") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bangkok Leaderboard Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={16} />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Top Bangkok Buildings ({bangkokTopBuildings.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRegionFilter("bangkok")}
                className="text-[11px] font-bold text-indigo-100 hover:text-white underline cursor-pointer"
              >
                View All Bangkok →
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {bangkokTopBuildings.slice(0, regionFilter === "compare" ? 10 : 5).map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? "bg-amber-400 text-amber-950"
                          : idx === 1
                            ? "bg-slate-200 text-slate-800"
                            : idx === 2
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900 truncate">{b.name}</span>
                        {b.bdTier === "PRIME_PARTNERSHIP" && <Flame size={12} className="text-rose-500 shrink-0" />}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-medium truncate">
                        {b.uniqueCustomers} customers • Top:{" "}
                        <span className="font-bold text-slate-700">{b.topService?.name || "Wash & Fold"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-indigo-600">{b.totalOrders} orders</div>
                    <div className="text-[10.5px] font-bold text-slate-600">฿{b.totalRevenue.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {bangkokTopBuildings.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">No Bangkok building orders in this range.</div>
              )}
            </div>
          </div>

          {/* Pattaya Leaderboard Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={16} />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Top Pattaya Buildings ({pattayaTopBuildings.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRegionFilter("pattaya")}
                className="text-[11px] font-bold text-teal-100 hover:text-white underline cursor-pointer"
              >
                View All Pattaya →
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {pattayaTopBuildings.slice(0, regionFilter === "compare" ? 10 : 5).map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBuildingId(b.id)}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-teal-50/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? "bg-amber-400 text-amber-950"
                          : idx === 1
                            ? "bg-slate-200 text-slate-800"
                            : idx === 2
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900 truncate">{b.name}</span>
                        {b.bdTier === "PRIME_PARTNERSHIP" && <Flame size={12} className="text-rose-500 shrink-0" />}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-medium truncate">
                        {b.uniqueCustomers} customers • Top:{" "}
                        <span className="font-bold text-slate-700">{b.topService?.name || "Wash & Fold"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-teal-700">{b.totalOrders} orders</div>
                    <div className="text-[10.5px] font-bold text-slate-600">฿{b.totalRevenue.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {pattayaTopBuildings.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">No Pattaya building orders in this range.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Ranked Buildings Table (Based Strictly on Pickup & Delivery Address) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-slate-900">
              Customer Buildings Ranked by Pickup & Delivery Orders ({filteredRows.length})
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Click any building to view its Resident Directory, Service Demand Breakdown, and B2B Sales Pitch script.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">Building & Pickup / Delivery Address</th>
                <th className="py-3 px-3">BD Opportunity</th>
                <th className="py-3 px-3 text-right">Pickup / Delivery Orders</th>
                <th className="py-3 px-3 text-right">Customers in Building</th>
                <th className="py-3 px-4 text-right">Transacted Amount (฿)</th>
                <th className="py-3 px-4">Top Selling Service & Mix</th>
                <th className="py-3 px-4 text-right">Sales Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-slate-600">No customer buildings match your current filters</p>
                    <p className="text-[11px] mt-0.5">Try expanding the date range or clearing the search filter.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 150).map((b, idx) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBuildingId(b.id)}
                    className="hover:bg-indigo-50/35 transition-colors cursor-pointer group"
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 font-black text-slate-400">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-black ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>

                    {/* Building Name & Pickup/Delivery Address */}
                    <td className="py-3.5 px-4 max-w-[290px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 group-hover:text-indigo-700 truncate">
                          {b.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase ${
                            b.region === "pattaya"
                              ? "bg-teal-100 text-teal-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {b.region === "pattaya" ? "Pattaya" : "Bangkok"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] text-slate-500 mt-0.5 truncate">
                        <span className="truncate" title={b.pickupDeliveryAddress}>
                          {b.pickupDeliveryAddress}
                        </span>
                        <a
                          href={b.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-blue-600 hover:underline font-bold shrink-0"
                        >
                          Map <ExternalLink size={10} />
                        </a>
                      </div>
                    </td>

                    {/* BD Opportunity Tier */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col items-start gap-1">
                        {renderBdTierBadge(b.bdTier)}
                        <span className="text-[10px] font-semibold text-slate-400">
                          BD Score: <strong className="text-slate-700">{b.bdScore}/100</strong>
                        </span>
                      </div>
                    </td>

                    {/* Pickup / Delivery Orders & Repeat Loyalty */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="text-sm font-black text-slate-900">{b.totalOrders} orders</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {b.pickupOrdersCount} pickup • {b.deliveryOrdersCount} delivery
                      </div>
                      <div className="text-[10px] font-bold text-emerald-600">
                        {b.repeatRatePct}% repeat ({b.repeatCustomers} cust)
                      </div>
                    </td>

                    {/* Unique Customers in Building */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="text-sm font-black text-slate-900">{b.uniqueCustomers} customers</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {b.vipMemberCustomers > 0 ? `${b.vipMemberCustomers} VIP/Member` : "Standard tier"}
                        {b.roomsCount > 0 ? ` • ${b.roomsCount} rooms` : ""}
                      </div>
                    </td>

                    {/* Total Transacted Revenue & AOV */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-sm font-black text-indigo-600">฿{b.totalRevenue.toLocaleString()}</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        ฿{b.avgOrderValue.toLocaleString()}/order • ฿{b.revenuePerCustomer.toLocaleString()}/cust
                      </div>
                    </td>

                    {/* Top Selling Service & Mix */}
                    <td className="py-3.5 px-4 max-w-[260px]">
                      {b.topService ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-slate-800 truncate">{b.topService.name}</span>
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 shrink-0">
                              {b.topServiceSharePct}% share
                            </span>
                          </div>
                          {b.serviceBreakdown.length > 1 && (
                            <div className="text-[10px] text-slate-400 truncate">
                              Also:{" "}
                              {b.serviceBreakdown
                                .slice(1, 3)
                                .map((s) => s.name)
                                .join(", ")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBuildingId(b.id);
                        }}
                        className="h-8 px-3 text-[11px] font-bold border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 rounded-xl cursor-pointer"
                      >
                        BD Dossier <ChevronRight size={13} className="ml-1" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Building Business Development Dossier Modal */}
      <Dialog open={!!selectedBuilding} onOpenChange={(open) => !open && setSelectedBuildingId(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedBuilding && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black text-slate-900">{selectedBuilding.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            selectedBuilding.region === "pattaya"
                              ? "bg-teal-100 text-teal-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {selectedBuilding.region === "pattaya" ? "Pattaya" : "Bangkok"}
                        </span>
                        {renderBdTierBadge(selectedBuilding.bdTier)}
                      </div>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">
                        Pickup / Delivery Address: {selectedBuilding.pickupDeliveryAddress}
                      </p>
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* 4 Key Metrics inside Modal */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase">Customer Orders</div>
                    <div className="text-xl font-black text-slate-900 mt-0.5">{selectedBuilding.totalOrders}</div>
                    <div className="text-[10.5px] font-semibold text-emerald-600">
                      {selectedBuilding.pickupOrdersCount} pickup • {selectedBuilding.deliveryOrdersCount} delivery
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase">Customers in Building</div>
                    <div className="text-xl font-black text-slate-900 mt-0.5">{selectedBuilding.uniqueCustomers}</div>
                    <div className="text-[10.5px] font-semibold text-slate-500">
                      {selectedBuilding.repeatRatePct}% repeat • {selectedBuilding.vipMemberCustomers} VIP/Member
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase">Transacted Amount</div>
                    <div className="text-xl font-black text-indigo-600 mt-0.5">
                      ฿{selectedBuilding.totalRevenue.toLocaleString()}
                    </div>
                    <div className="text-[10.5px] font-semibold text-slate-500">
                      AOV ฿{selectedBuilding.avgOrderValue.toLocaleString()} • ฿
                      {selectedBuilding.revenuePerCustomer.toLocaleString()}/cust
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase">Top Selling Service</div>
                    <div className="text-sm font-black text-slate-900 mt-1 truncate" title={selectedBuilding.topService?.name}>
                      {selectedBuilding.topService?.name || "Wash & Fold"}
                    </div>
                    <div className="text-[10.5px] font-semibold text-indigo-600 mt-0.5">
                      {selectedBuilding.topServiceSharePct}% of building spend
                    </div>
                  </div>
                </div>

                {/* Ready-to-Use B2B Sales Pitch Box */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-violet-50/70 border border-indigo-200/90 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-indigo-900">
                      <Sparkles size={14} className="text-indigo-600" />
                      <span>Sales & Business Development Pitch Brief (For Juristic / Building Management)</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generateSalesPitchText(selectedBuilding));
                        setCopiedPitch(true);
                        toast.success("Sales pitch brief copied to clipboard!");
                        setTimeout(() => setCopiedPitch(false), 2000);
                      }}
                      className="h-7 px-2.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
                    >
                      {copiedPitch ? <Check size={12} className="mr-1" /> : <Copy size={12} className="mr-1" />}
                      {copiedPitch ? "Copied!" : "Copy Pitch Brief"}
                    </Button>
                  </div>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100">
                    {generateSalesPitchText(selectedBuilding)}
                  </pre>
                </div>

                {/* Two-Column Breakdown: Top Services Sold + Residents Directory */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Service Demand Breakdown */}
                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={13} className="text-indigo-600" />
                      Top Selling Services in {selectedBuilding.name}
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {selectedBuilding.serviceBreakdown.map((svc, i) => {
                        const totalSvcRev = selectedBuilding.serviceBreakdown.reduce((s, x) => s + x.revenue, 0);
                        const pct =
                          totalSvcRev > 0
                            ? Math.min(100, Math.round((svc.revenue / totalSvcRev) * 100))
                            : Math.min(100, Math.round((svc.orderCount / selectedBuilding.totalOrders) * 100));
                        return (
                          <div key={svc.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-800 truncate">
                                {i + 1}. {svc.name}
                              </span>
                              <span className="font-extrabold text-slate-700 shrink-0">
                                ฿{svc.revenue.toLocaleString()} ({svc.quantity} qty • {pct}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Residents / Customers in Building */}
                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Users size={13} className="text-emerald-600" />
                      Customers in {selectedBuilding.name} ({selectedBuilding.residents.length})
                    </h4>
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                      {selectedBuilding.residents.map((res) => (
                        <div key={res.key} className="py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">{res.name}</span>
                              {res.isVIP && (
                                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300">
                                  VIP
                                </Badge>
                              )}
                              {res.isMember && (
                                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200">
                                  MEMBER
                                </Badge>
                              )}
                              {res.isCorporate && (
                                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-indigo-100 text-indigo-800 border-indigo-200">
                                  CORP
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              {res.phone}
                              {res.rooms.length > 0 && ` • Room: ${res.rooms.join(", ")}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-indigo-600">฿{res.totalSpent.toLocaleString()}</div>
                            <div className="text-[10px] font-semibold text-slate-500">{res.orderCount} orders</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex items-center justify-between border-t border-slate-100 pt-3">
                <a
                  href={selectedBuilding.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                >
                  <MapPin size={13} /> View Pickup / Delivery Building on Google Maps <ExternalLink size={12} />
                </a>
                <Button variant="outline" onClick={() => setSelectedBuildingId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
