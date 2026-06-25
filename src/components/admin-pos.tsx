/* eslint-disable */
"use client";


import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  ShoppingCart, 
  User, 
  UserPlus,
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote, 
  Zap, 
  Shirt, 
  WashingMachine, 
  Layers, 
  PackageCheck,
  CheckCircle2,
  X,
  Eye,
  Bed,
  Sparkles,
  ShoppingBag,
  Footprints,
  Icon,
  FolderOpen,
  Wallet,
  Loader2,
  ShieldAlert,
  XCircle,
  Check,
  History,
  RefreshCw,
  Store
} from "lucide-react";
import { trousers, skirt, dress, socks } from "@lucide/lab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  customerStore,
  priceListStore,
  jobStore, 
  riderStore, 
  serviceStore,
  shopStore,
  settingsStore,
  shiftStore,
  type Customer, 
  type ServiceType,
  type ServiceItem,
  type Job,
  type CashierShift
} from "@/lib/store";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";
import { useCustomers } from "@/lib/use-customers";
import { useAuth } from "@/providers/auth-provider";
import { useJobs } from "@/lib/use-jobs";
import { AdminCustomerDialog } from "@/components/admin-customer-dialog";
import { generatePromptPayPayload } from "@/lib/promptpay";

const cleanRemarkForDisplay = (rawRemark: string | null | undefined) => {
  if (!rawRemark) return "";
  return rawRemark
    .split(" | ")
    .filter(part => !part.startsWith("VAT:") && !part.startsWith("Express"))
    .join(" | ")
    .trim();
};

const playAudioFeedback = (type: "click" | "success" | "delete") => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1400, ctx.currentTime + 0.06);
      gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc2.start(ctx.currentTime + 0.06);
      osc2.stop(ctx.currentTime + 0.16);
    } else if (type === "delete") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    // browser blocked audio
  }
};

const getTomorrowDateTimeString = (baseDate?: Date) => {
  const d = baseDate ? new Date(baseDate) : new Date(Date.now() + 86400000);
  d.setMinutes(0, 0, 0);
  
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const date = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  
  return `${year}-${month}-${date}T${hours}:${minutes}`;
};

const formatDateTimeLocalString = (val: string) => {
  if (!val) return "-";
  const [datePart, timePart] = val.split('T');
  if (!datePart || !timePart) return val;
  const dateSplit = datePart.split('-');
  if (dateSplit.length !== 3) return val;
  const [year, month, day] = dateSplit;
  return `${day}/${month}/${year} ${timePart}`;
};

const CalendarIcon = ({ size = 10, className = "" }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

const isCollectionDateEdited = (createdAt: Date | string, deliveryScheduledAt: Date | string | null | undefined) => {
  if (!deliveryScheduledAt) return false;
  const created = new Date(createdAt);
  const scheduled = new Date(deliveryScheduledAt);
  if (isNaN(created.getTime()) || isNaN(scheduled.getTime())) return false;

  const defaultUnrounded = new Date(created.getTime() + 86400000);
  const diffUnrounded = Math.abs(scheduled.getTime() - defaultUnrounded.getTime());
  if (diffUnrounded < 120000) return false;

  const defaultRounded = new Date(created.getTime() + 86400000);
  defaultRounded.setMinutes(0, 0, 0);
  const diffRounded = Math.abs(scheduled.getTime() - defaultRounded.getTime());
  if (diffRounded < 120000) return false;

  return true;
};

const getProductIcon = (iconName: string | null | undefined, name: string, nameEn?: string | null, category?: string) => {
  if (iconName === "washing_machine") return <WashingMachine className="text-sky-600" size={16} />;
  if (iconName === "shirt") return <Shirt className="text-amber-500" size={16} />;
  if (iconName === "bed") return <Bed className="text-emerald-600" size={16} />;
  if (iconName === "sparkles") return <Sparkles className="text-purple-600" size={16} />;
  if (iconName === "shopping_bag") return <ShoppingBag className="text-indigo-500" size={16} />;
  if (iconName === "footprints") return <Footprints className="text-amber-700" size={16} />;
  if (iconName === "zap") return <Zap className="text-purple-500" size={16} />;
  if (iconName === "trousers") return <Icon iconNode={trousers} size={16} className="text-amber-600" />;
  if (iconName === "skirt") return <Icon iconNode={skirt} size={16} className="text-pink-600" />;
  if (iconName === "dress") return <Icon iconNode={dress} size={16} className="text-indigo-600" />;
  if (iconName === "socks") return <Icon iconNode={socks} size={16} className="text-teal-600" />;

  if (iconName === "wallet") return <Wallet className="text-emerald-500" size={16} />;

  // Fallback to dynamic keyword matching if no custom icon selected
  const text = `${name} ${nameEn || ""} ${category || ""}`.toLowerCase();
  
  if (text.includes("topup") || text.includes("เติมเงิน")) {
    return <Wallet className="text-emerald-500" size={16} />;
  }
  if (text.includes("ซักแห้ง") || text.includes("dry clean") || text.includes("dry-clean")) {
    return <Sparkles className="text-purple-600" size={16} />;
  }
  if (text.includes("รองเท้า") || text.includes("shoe") || text.includes("sneaker")) {
    return <Footprints className="text-amber-700" size={16} />;
  }
  if (text.includes("กระเป๋า") || text.includes("bag") || text.includes("backpack")) {
    return <ShoppingBag className="text-indigo-500" size={16} />;
  }
  if (text.includes("ห่ม") || text.includes("นวม") || text.includes("เตียง") || text.includes("ปลอกหมอน") || text.includes("duvet") || text.includes("blanket") || text.includes("pillow") || text.includes("bed") || text.includes("sheet")) {
    return <Bed className="text-emerald-600" size={16} />;
  }
  if (text.includes("กางเกง") || text.includes("pants") || text.includes("trousers") || text.includes("jean") || text.includes("ยีนส์")) {
    return <Icon iconNode={trousers} size={16} className="text-amber-600" />;
  }
  if (text.includes("กระโปรง") || text.includes("skirt")) {
    return <Icon iconNode={skirt} size={16} className="text-pink-600" />;
  }
  if (text.includes("เดรส") || text.includes("ชุดแซก") || text.includes("dress") || text.includes("gown")) {
    return <Icon iconNode={dress} size={16} className="text-indigo-600" />;
  }
  if (text.includes("ถุงเท้า") || text.includes("sock") || text.includes("socks")) {
    return <Icon iconNode={socks} size={16} className="text-teal-600" />;
  }
  if (text.includes("เสื้อ") || text.includes("เชิ้ต") || text.includes("สูท") || text.includes("shirt") || text.includes("suit") || text.includes("coat")) {
    return <Shirt className="text-amber-500" size={16} />;
  }
  if (text.includes("ซัก") || text.includes("อบ") || text.includes("wash") || text.includes("dry") || text.includes("laundry")) {
    return <WashingMachine className="text-sky-600" size={16} />;
  }
  
  return <Zap className="text-purple-500" size={16} />;
};

interface CartItem {
  id: string;
  name: string;
  nameEn?: string | null;
  price: number;
  basePrice: number; // To track original rate vs override
  quantity: number;
}

interface AdminPOSProps {
  preselectedCustomer?: Customer | null;
  preselectedCategory?: string | null;
  onClearPreselected?: () => void;
}

interface ShiftHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  shifts: CashierShift[];
  currentLanguage: "th" | "en";
}

function ShiftHistoryDialog({
  isOpen,
  onOpenChange,
  isLoading,
  shifts,
  currentLanguage
}: ShiftHistoryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-5 max-h-[85vh] overflow-y-auto bg-card border border-border shadow-2xl rounded-2xl">
        <DialogHeader className="shrink-0 mb-3 border-b border-border pb-3">
          <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
            <History className="text-blue-500" size={18} />
            <span>
              {currentLanguage === "en" ? "Cashier Shift History" : "ประวัติกะและลิ้นชักเก็บเงิน"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs text-muted-foreground font-semibold">
              {currentLanguage === "en" ? "Loading shift history..." : "กำลังโหลดประวัติกะ..."}
            </p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground/60 border border-dashed border-border rounded-xl">
            {currentLanguage === "en" ? "No closed shifts found." : "ไม่พบประวัติการปิดกะในระบบ"}
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((shift) => {
              const openDateStr = shift.openedAt ? format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm") : "-";
              const closeDateStr = shift.closedAt ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm") : "-";
              const discrepancy = shift.shortageOverage || 0;
              
              return (
                <div key={shift.id} className="p-4 bg-muted/20 border border-border/80 rounded-xl space-y-3 shadow-sm hover:border-blue-500/25 transition-all text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-foreground">
                          Shift #{shift.id.split('-')[0].toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-[8.5px] font-bold py-0.5 px-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none shadow-none uppercase">
                          {shift.userName}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium">
                        {currentLanguage === "en" ? "Opened:" : "เปิดกะ:"} {openDateStr} | {currentLanguage === "en" ? "Closed:" : "ปิดกะ:"} {closeDateStr}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-semibold">
                        {currentLanguage === "en" ? "Drawer Discrepancy" : "ยอดต่างลิ้นชัก"}
                      </div>
                      {discrepancy === 0 ? (
                        <Badge variant="outline" className="text-[9px] font-bold py-0.5 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none shadow-none">
                          {currentLanguage === "en" ? "Balanced" : "ยอดตรงพอดี"}
                        </Badge>
                      ) : discrepancy < 0 ? (
                        <Badge variant="outline" className="text-[9px] font-bold py-0.5 px-2 bg-red-500/10 text-red-600 dark:text-red-400 border-none shadow-none">
                          {currentLanguage === "en" ? `Shortage: -฿${Math.abs(discrepancy).toLocaleString()}` : `เงินขาด: -฿${Math.abs(discrepancy).toLocaleString()}`}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] font-bold py-0.5 px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none shadow-none">
                          {currentLanguage === "en" ? `Overage: +฿${discrepancy.toLocaleString()}` : `เงินเกิน: +฿${discrepancy.toLocaleString()}`}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">
                        {currentLanguage === "en" ? "Starting float" : "เงินตั้งต้นกะ"}
                      </span>
                      <span className="font-mono font-black text-foreground">
                        ฿{(shift.startingCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">
                        {currentLanguage === "en" ? "Expected Cash" : "เงินสดสุทธิในกะ"}
                      </span>
                      <span className="font-mono font-black text-foreground">
                        ฿{(shift.expectedCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">
                        {currentLanguage === "en" ? "Actual Counted" : "เงินสดนับจริง"}
                      </span>
                      <span className="font-mono font-black text-foreground text-emerald-600 dark:text-emerald-400">
                        ฿{(shift.actualCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">
                        {currentLanguage === "en" ? "Total sales" : "ยอดขายรวมทุกช่องทาง"}
                      </span>
                      <span className="font-mono font-black text-foreground text-blue-600 dark:text-blue-400">
                        ฿{((shift.cashSales || 0) + (shift.transferSales || 0) + (shift.cardSales || 0) + (shift.creditSales || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Sales Breakdown */}
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/40 text-[10.5px] space-y-1">
                    <span className="font-bold text-foreground block">
                      {currentLanguage === "en" ? "Sales Breakdown by Payment Method:" : "ยอดขายจำแนกตามช่องทางชำระเงิน:"}
                    </span>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground font-mono">
                      <div className="flex justify-between">
                        <span>- Cash (เงินสด):</span>
                        <span className="font-bold text-foreground">฿{(shift.cashSales || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>- Bank Transfer (เงินโอน):</span>
                        <span className="font-bold text-foreground">฿{(shift.transferSales || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>- Credit Card (บัตร):</span>
                        <span className="font-bold text-foreground">฿{(shift.cardSales || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>- Wallet Deduct (กระเป๋าสมาชิก):</span>
                        <span className="font-bold text-foreground">฿{(shift.creditSales || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Shift Notes */}
                  {shift.notes !== undefined && shift.notes !== null && (
                    <div className="text-[10px] text-muted-foreground bg-muted/40 p-2 rounded-lg leading-relaxed border border-dashed border-border/50">
                      <span className="font-bold text-foreground block mb-0.5">
                        {currentLanguage === "en" ? "Closing Cashier Notes:" : "บันทึกสรุปยอดปิดกะ:"}
                      </span>
                      {shift.notes || (currentLanguage === "en" ? "No notes entered." : "ไม่มีการระบุบันทึกข้อความ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-border mt-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 font-bold text-xs bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl cursor-pointer"
          >
            {currentLanguage === "en" ? "Close" : "ปิดหน้าต่าง"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminPOS({ preselectedCustomer, preselectedCategory, onClearPreselected }: AdminPOSProps = {}) {
  const { user } = useAuth();
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const allShops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  
  const shops = useMemo(() => {
    if (!user) return [];
    if (!user.area || user.area === 'ALL') return allShops;
    return allShops.filter(shop => shop.area === user.area);
  }, [allShops, user]);

  const [activeBranchId, setActiveBranchId] = useState<string>("");
  
  const activeShop = useMemo(() => {
    return shops.find(s => s.id === activeBranchId) || shops[0];
  }, [shops, activeBranchId]);

  useEffect(() => {
    if (shops.length === 1) {
      setActiveBranchId(shops[0].id);
    } else if (shops.length > 1 && !activeBranchId) {
      const saved = localStorage.getItem("pos_active_branch_id");
      if (saved && shops.some(s => s.id === saved)) {
        setActiveBranchId(saved);
      }
    }
  }, [shops, activeBranchId]);

  const isStandardPlan = false;
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot);
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  
  const currentLanguage = settings?.language || "th";

  const expressRate1 = settings?.expressRate1 !== undefined ? settings.expressRate1 : "50";
  const expressRate2 = settings?.expressRate2 !== undefined ? settings.expressRate2 : "100";
  const expressRate3 = settings?.expressRate3 !== undefined ? settings.expressRate3 : "";

  const rate1Num = useMemo(() => {
    if (!expressRate1 || expressRate1.trim() === "") return null;
    const parsed = parseInt(expressRate1, 10);
    return isNaN(parsed) ? null : parsed;
  }, [expressRate1]);

  const rate2Num = useMemo(() => {
    if (!expressRate2 || expressRate2.trim() === "") return null;
    const parsed = parseInt(expressRate2, 10);
    return isNaN(parsed) ? null : parsed;
  }, [expressRate2]);

  const rate3Num = useMemo(() => {
    if (!expressRate3 || expressRate3.trim() === "") return null;
    const parsed = parseInt(expressRate3, 10);
    return isNaN(parsed) ? null : parsed;
  }, [expressRate3]);
  
  const customers = useCustomers();
  const jobs = useJobs();
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [recallTab, setRecallTab] = useState<"unpaid" | "ready">("unpaid");
  const [recallSearch, setRecallSearch] = useState("");
  const [posCancellingJob, setPosCancellingJob] = useState<Job | null>(null);
  const [posCancelReason, setPosCancelReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [confirmReturnJob, setConfirmReturnJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isMemberRate, setIsMemberRate] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [serviceSpeed, setServiceSpeed] = useState<string>("standard");
  const [proformaReceiptNumber, setProformaReceiptNumber] = useState<string>("");
  const [deliveryScheduledTime, setDeliveryScheduledTime] = useState<string>(() => getTomorrowDateTimeString());

  // Calculate valid shop hours and minutes based on settings
  const posHourPart = deliveryScheduledTime && deliveryScheduledTime.includes('T') ? deliveryScheduledTime.split('T')[1].split(':')[0] : "00";
  const posMinutePart = deliveryScheduledTime && deliveryScheduledTime.includes('T') ? deliveryScheduledTime.split('T')[1].split(':')[1] : "00";

  const openHour = settings?.shopOpenTime ? parseInt(settings.shopOpenTime.split(":")[0], 10) : 9;
  const closeHour = settings?.shopCloseTime ? parseInt(settings.shopCloseTime.split(":")[0], 10) : 19;
  const startHour = isNaN(openHour) ? 9 : openHour;
  const endHour = isNaN(closeHour) ? 19 : closeHour;

  const hoursSet = new Set<string>();
  for (let i = startHour; i <= endHour; i++) {
    hoursSet.add(String(i).padStart(2, "0"));
  }
  if (posHourPart) {
    hoursSet.add(posHourPart);
  }
  const validHours = Array.from(hoursSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const minutesSet = new Set<string>(["00", "30"]);
  if (posMinutePart) {
    minutesSet.add(posMinutePart);
  }
  const validMinutes = Array.from(minutesSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const [receivedCash, setReceivedCash] = useState("");
  const [localDeliveryPrice, setLocalDeliveryPrice] = useState("");

  const isDeliveryEnabled = settings?.enableDeliveryService === "true";
  const deliveryItem = cart.find(item => item.id === "delivery-pickup-service-item" || item.id === "delivery-only-service-item");
  const deliveryServiceType = deliveryItem 
    ? (deliveryItem.id === "delivery-pickup-service-item" ? "both" : "delivery_only")
    : null;

  const resetCartForm = () => {
    setCart([]);
    setSelectedCustomer(null);
    setRemark("");
    setPaymentMethod("cash");
    setIsPaid(true);
    setEditingPriceItemId(null);
    setServiceSpeed("standard");
    setLoadedJobId(null);
    setManualAdjustment(0);
    setDeliveryScheduledTime(getTomorrowDateTimeString());
    setReceivedCash("");
    setLocalDeliveryPrice("");
    setProformaReceiptNumber("");
  };

  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  const [remark, setRemark] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card" | "credit">("cash");
  const [isPaid, setIsPaid] = useState(true);

  useEffect(() => {
    setReceivedCash("");
  }, [paymentMethod, isPaid]);

  const getCashSuggestions = (totalVal: number) => {
    const suggestions = new Set<number>();
    
    const standardBills = [100, 500, 1000];
    standardBills.forEach(bill => {
      if (bill > totalVal) {
        suggestions.add(bill);
      }
    });

    if (totalVal > 0) {
      const next100 = Math.ceil(totalVal / 100) * 100;
      const next500 = Math.ceil(totalVal / 500) * 500;
      const next1000 = Math.ceil(totalVal / 1000) * 1000;
      
      if (next100 > totalVal) suggestions.add(next100);
      if (next500 > totalVal) suggestions.add(next500);
      if (next1000 > totalVal) suggestions.add(next1000);
    }

    // Sort bills and take top suggestions
    const sortedBills = Array.from(suggestions).sort((a, b) => a - b).slice(0, 4);
    
    // Put totalVal (Exact) at the end of suggestions
    return [...sortedBills, totalVal];
  };
  const [showReceipt, setShowReceipt] = useState(false);
  const [latestJob, setLatestJob] = useState<any>(null);
  const [isDraftPreview, setIsDraftPreview] = useState(false);
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);
  const [topUpInputVal, setTopUpInputVal] = useState("");
  const [vatRate, setVatRate] = useState<number>(7);
  const [vatType, setVatType] = useState<"none" | "inclusive" | "exclusive">("none");

  // Cashier Shift States
  const { activeShift, branchActiveShift, hasLoaded: hasLoadedShift } = useSyncExternalStore(
    shiftStore.subscribe,
    shiftStore.getSnapshot,
    shiftStore.getSnapshot
  );

  // Determine if Admin is viewing in Spectator Mode (view-only)
  const isSpectatorMode = useMemo(() => {
    if (user?.role !== 'admin') return false;
    if (!branchActiveShift) return false;
    return branchActiveShift.userId !== user.id;
  }, [user, branchActiveShift]);

  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [startingCash, setStartingCash] = useState<string>("");
  const [openShiftNotes, setOpenShiftNotes] = useState<string>("");
  const [actualCash, setActualCash] = useState<string>("");
  const [closeShiftNotes, setCloseShiftNotes] = useState<string>("");
  const [isShiftSubmitting, setIsShiftSubmitting] = useState(false);

  // Cashier Shift History States
  const [isShiftHistoryOpen, setIsShiftHistoryOpen] = useState(false);
  const [closedShifts, setClosedShifts] = useState<(CashierShift & {
    totalOrders?: number;
    cashOrders?: number;
    transferOrders?: number;
    cardOrders?: number;
    creditOrders?: number;
  })[]>([]);
  const [isLoadingClosedShifts, setIsLoadingClosedShifts] = useState(false);



  const fetchClosedShifts = async () => {
    setIsLoadingClosedShifts(true);
    try {
      const shifts = await shiftStore.getClosedShifts();
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(0, 0, 0, 0);
      
      const filtered = shifts.filter(shift => {
        if (!shift.closedAt) return false;
        return new Date(shift.closedAt).getTime() >= twoDaysAgo.getTime();
      });
      setClosedShifts(filtered);
    } catch (e) {
      toast.error(currentLanguage === "en" ? "Failed to load shift history" : "ไม่สามารถโหลดประวัติรอบกะได้");
    } finally {
      setIsLoadingClosedShifts(false);
    }
  };

  // Fetch active shift on mount / user change / branch change
  useEffect(() => {
    if (user?.id) {
      shiftStore.fetchActiveShift(user.id, activeBranchId);
    }
  }, [user?.id, activeBranchId]);

  // Compute live cashier shift statistics
  // Compute live cashier shift statistics
  const activeShiftStats = useMemo(() => {
    if (!activeShift) return { 
      cashSales: 0, 
      transferSales: 0, 
      cardSales: 0, 
      creditSales: 0, 
      expectedCash: 0,
      totalOrders: 0,
      cashOrders: 0,
      transferOrders: 0,
      cardOrders: 0,
      creditOrders: 0
    };
    
    let cashSales = 0;
    let transferSales = 0;
    let cardSales = 0;
    let creditSales = 0;
    
    let totalOrders = 0;
    let cashOrders = 0;
    let transferOrders = 0;
    let cardOrders = 0;
    let creditOrders = 0;
    
    const shiftOpenTime = new Date(activeShift.openedAt).getTime();
    
    for (const job of jobs) {
      // Only count jobs belonging to this shift's branch
      if (job.branchId !== activeShift.branchId) continue;
      
      let hasPaymentLog = false;
      let usedCash = false;
      let usedTransfer = false;
      let usedCard = false;
      let usedCredit = false;
      
      // Parse structured payment records from adminNotesJson
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed && Array.isArray(parsed.payments)) {
            hasPaymentLog = true;
            for (const pay of parsed.payments) {
              const payTime = new Date(pay.timestamp).getTime();
              // Check if payment was made during this shift
              if (payTime >= shiftOpenTime) {
                const method = pay.method?.toLowerCase();
                const amount = pay.amount || 0;
                if (method === 'cash') {
                  cashSales += amount;
                  usedCash = true;
                } else if (method === 'transfer') {
                  transferSales += amount;
                  usedTransfer = true;
                } else if (method === 'card') {
                  cardSales += amount;
                  usedCard = true;
                } else if (method === 'credit') {
                  creditSales += amount;
                  usedCredit = true;
                }
              }
            }
          }
        } catch (e) {
          // Ignore JSON parse error, fall back to legacy check
        }
      }

      // Legacy fallback
      if (!hasPaymentLog) {
        if (!job.createdAt) continue;
        const jobTime = new Date(job.createdAt).getTime();
        if (jobTime >= shiftOpenTime && job.createdBy === activeShift.userName && job.isPaid) {
          const method = job.paymentMethod?.toLowerCase();
          const amount = job.totalAmount || 0;
          if (method === 'cash') {
            cashSales += amount;
            usedCash = true;
          } else if (method === 'transfer') {
            transferSales += amount;
            usedTransfer = true;
          } else if (method === 'card') {
            cardSales += amount;
            usedCard = true;
          } else if (method === 'credit') {
            creditSales += amount;
            usedCredit = true;
          }
        }
      }

      if (usedCash || usedTransfer || usedCard || usedCredit) {
        totalOrders += 1;
        if (usedCash) cashOrders += 1;
        if (usedTransfer) transferOrders += 1;
        if (usedCard) cardOrders += 1;
        if (usedCredit) creditOrders += 1;
      }
    }
    
    const expectedCash = activeShift.startingCash + cashSales;
    
    return {
      cashSales,
      transferSales,
      cardSales,
      creditSales,
      expectedCash,
      totalOrders,
      cashOrders,
      transferOrders,
      cardOrders,
      creditOrders
    };
  }, [activeShift, jobs]);

  const getMinutesFromTimeStr = (str: string) => {
    const [h, m] = str.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const isShiftFromPreviousDay = useMemo(() => {
    if (!activeShift?.openedAt) return false;
    const openedDate = new Date(activeShift.openedAt);
    const today = new Date();
    return (
      openedDate.getFullYear() !== today.getFullYear() ||
      openedDate.getMonth() !== today.getMonth() ||
      openedDate.getDate() !== today.getDate()
    );
  }, [activeShift]);

  const getProductPrice = useCallback((product: ServiceItem) => {
    if (selectedCustomer?.priceListId) {
      const pl = priceLists.find(p => p.id === selectedCustomer.priceListId);
      if (pl && pl.servicePrices && pl.servicePrices[product.id] !== undefined) {
        return pl.servicePrices[product.id];
      }
    }
    return isMemberRate ? product.memberPrice : product.price;
  }, [selectedCustomer, priceLists, isMemberRate]);

  // Recalculate cart prices if customer or member rate toggled
  useEffect(() => {
    setCart(prev => {
      if (prev.length === 0) return prev;
      return prev.map(item => {
        if (item.id === "topup-member-item") return item;
        const service = services.find(s => s.id === item.id);
        if (!service) return item;
        const newPrice = getProductPrice(service);
        return {
          ...item,
          price: newPrice,
          basePrice: newPrice
        };
      });
    });
  }, [selectedCustomer, isMemberRate, services, priceLists, getProductPrice]);

  const isNearClosing = useMemo(() => {
    if (!activeShift) return false;
    const closeTimeStr = settings?.shopCloseTime || "19:00";
    const closeMinutes = getMinutesFromTimeStr(closeTimeStr);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return nowMinutes >= (closeMinutes - 60);
  }, [activeShift, settings?.shopCloseTime]);


  // Handle preselected customer and category redirected from CRM
  useEffect(() => {
    if (preselectedCustomer) {
      setSelectedCustomer(preselectedCustomer);
    }
    if (preselectedCategory) {
      if (preselectedCategory === "Topup Member" && isStandardPlan) {
        setSelectedCategory("All");
      } else {
        setSelectedCategory(preselectedCategory);
        if (preselectedCategory === "Topup Member") {
          setIsMemberRate(true);
        }
      }
    }
    if (preselectedCustomer || preselectedCategory) {
      onClearPreselected?.();
    }
  }, [preselectedCustomer, preselectedCategory, onClearPreselected, isStandardPlan]);

  // Initialize VAT settings from global settings when loaded
  useEffect(() => {
    if (!loadedJobId) {
      if (settings?.vatType) {
        setVatType(settings.vatType as any);
      }
      if (settings?.vatRate) {
        setVatRate(parseFloat(settings.vatRate) || 0);
      }
    }
  }, [settings?.vatType, settings?.vatRate, loadedJobId]);

  // Initialize refund method when an order is chosen for cancellation/refund
  useEffect(() => {
    if (posCancellingJob) {
      setRefundMethod(posCancellingJob.paymentMethod || "cash");
    }
  }, [posCancellingJob]);

  // Filter customers based on search input
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
    );
  }, [customerSearch, customers]);

  // Dynamically compute unique categories from active services
  const categories = useMemo(() => {
    const activeServices = services.filter(s => s.isActive !== false);
    const uniqueCats = Array.from(new Set(activeServices.map(s => s.category).filter(Boolean)));
    if (isStandardPlan) {
      return ["All", ...uniqueCats];
    }
    return ["All", ...uniqueCats, "Topup Member"];
  }, [services, isStandardPlan]);

  // Auto-apply member rate and auto-select Member payment method if customer has wallet balance
  useEffect(() => {
    if (selectedCustomer?.isMember) {
      setIsMemberRate(true);
      toast.info("Member rates auto-applied for this customer");
      if (!isStandardPlan && (selectedCustomer.creditBalance || 0) > 0) {
        setPaymentMethod("credit");
      }
    } else {
      setIsMemberRate(false);
    }
  }, [selectedCustomer, isStandardPlan]);

  // Force isPaid to true and reset paymentMethod if credit conditions change
  // Merged into one effect to avoid circular isPaid <-> paymentMethod loop
  useEffect(() => {
    if (paymentMethod === "credit") {
      setIsPaid(true);
    }
    if (paymentMethod === "credit" && (!isPaid || !selectedCustomer)) {
      setPaymentMethod("cash");
    }
  }, [paymentMethod, isPaid, selectedCustomer]);

  // Reset selectedCategory to "All" if it is set to "Topup Member" but we are on standard plan
  useEffect(() => {
    if (isStandardPlan && selectedCategory === "Topup Member") {
      setSelectedCategory("All");
    }
  }, [isStandardPlan, selectedCategory]);

  // Filter products based on category and search (matching both Thai and English names)
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "Topup Member") {
      if (isStandardPlan) return [];
      const virtualTopupProduct: ServiceItem = {
        id: "topup-member-item",
        name: "Topup Member",
        nameEn: "Topup Member",
        price: 0,
        memberPrice: 0,
        category: "Topup Member",
        isActive: true,
      };
      if ("topup member".includes(searchQuery.toLowerCase())) {
        return [virtualTopupProduct];
      }
      return [];
    }

    const activeServices = services.filter(p => p.isActive !== false);
    const regularFiltered = activeServices.filter(p => {
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      const nameMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const nameEnMatch = p.nameEn ? p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      const matchesSearch = nameMatch || nameEnMatch;
      return matchesCategory && matchesSearch;
    });

    if (!isStandardPlan && selectedCategory === "All" && "topup member".includes(searchQuery.toLowerCase())) {
      const virtualTopupProduct: ServiceItem = {
        id: "topup-member-item",
        name: "Topup Member",
        nameEn: "Topup Member",
        price: 0,
        memberPrice: 0,
        category: "Topup Member",
        isActive: true,
      };
      return [...regularFiltered, virtualTopupProduct];
    }

    return regularFiltered;
  }, [selectedCategory, searchQuery, services, isStandardPlan]);

  // Cart logic
  const addToCart = (product: ServiceItem, customPrice?: number) => {
    if (isSpectatorMode) {
      toast.error(currentLanguage === "en" ? "Spectator Mode - Actions are disabled" : "โหมดผู้เฝ้าดู - ไม่สามารถทำรายการได้");
      return;
    }
    const hasTopup = cart.some(item => item.id === "topup-member-item");
    if (hasTopup && product.id !== "topup-member-item") {
      toast.error("Cannot add other services when Topup Member is in the cart");
      return;
    }

    const hasRegularItems = cart.some(item => item.id !== "topup-member-item");
    if (hasRegularItems && product.id === "topup-member-item") {
      toast.error("Cannot add Topup Member when other services are in the cart");
      return;
    }

    playAudioFeedback("click");
    const price = customPrice !== undefined ? customPrice : getProductPrice(product);
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (customPrice !== undefined) {
          return prev.map(item => item.id === product.id ? { ...item, price, basePrice: price, quantity: 1 } : item);
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id: product.id, name: product.name, nameEn: product.nameEn, price: price, basePrice: price, quantity: 1 }];
    });
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    if (isSpectatorMode) return;
    setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const updateQuantity = (id: string, delta: number) => {
    if (isSpectatorMode) return;
    playAudioFeedback("click");
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    if (isSpectatorMode) return;
    playAudioFeedback("delete");
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const selectedExpressPercent = useMemo(() => {
    if (serviceSpeed === "express_rate1" && rate1Num !== null) return rate1Num;
    if (serviceSpeed === "express_rate2" && rate2Num !== null) return rate2Num;
    if (serviceSpeed === "express_rate3" && rate3Num !== null) return rate3Num;
    if (serviceSpeed === "express_50") return 50;
    if (serviceSpeed === "express_100") return 100;
    return 0;
  }, [serviceSpeed, rate1Num, rate2Num, rate3Num]);

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const expressSurcharge = useMemo(() => {
    if (selectedExpressPercent > 0) {
      return Math.ceil(subtotal * (selectedExpressPercent / 100));
    }
    return 0;
  }, [selectedExpressPercent, subtotal]);
  const vatAmount = useMemo(() => {
    if (vatType === "none" || vatRate <= 0) return 0;
    const baseForVat = subtotal + expressSurcharge;
    if (vatType === "inclusive") {
      return baseForVat * (vatRate / (100 + vatRate));
    } else {
      return baseForVat * (vatRate / 100);
    }
  }, [vatType, vatRate, subtotal, expressSurcharge]);

  const total = useMemo(() => {
    const baseTotal = subtotal + expressSurcharge;
    const vat = vatType === "exclusive" ? (baseTotal * (vatRate / 100)) : 0;
    return baseTotal + vat + manualAdjustment;
  }, [subtotal, expressSurcharge, vatType, vatRate, manualAdjustment]);

  const promptpayConfig = useMemo(() => {
    if (!settings) return null;
    if (settings.enablePromptPay !== "true") return null;
    const branchId = activeBranchId;
    const ppId = settings[`promptpayId_${branchId}`]?.trim() || settings[`promptpayId_global`]?.trim() || "";
    const ppName = settings[`promptpayName_${branchId}`]?.trim() || settings[`promptpayName_global`]?.trim() || "";
    return ppId ? { id: ppId, name: ppName } : null;
  }, [settings, activeBranchId]);

  const promptpayPayload = useMemo(() => {
    if (!promptpayConfig || !promptpayConfig.id || total <= 0) return "";
    try {
      return generatePromptPayPayload(promptpayConfig.id, total);
    } catch (e) {
      console.warn("Failed to generate PromptPay payload:", e);
      return "";
    }
  }, [promptpayConfig, total]);

  const receiptData = useMemo(() => {
    if (!isDraftPreview && latestJob) {
      const expressMatch = latestJob.remark?.match(/Express\s*(\d+)%/i);
      const expressPercent = expressMatch ? parseInt(expressMatch[1], 10) : 0;
      const jobSpeed = expressPercent > 0 ? `express_${expressPercent}` : "standard";
      const jobItems = Array.isArray(latestJob.items) 
        ? latestJob.items 
        : (latestJob.itemsJson ? JSON.parse(latestJob.itemsJson) : []);
      const jobSubtotal = jobItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      const jobSurcharge = expressPercent > 0 ? Math.ceil(jobSubtotal * (expressPercent / 100)) : 0;

      const vatMatch = latestJob.remark?.match(/VAT:\s*(\w+)\s*\((\d+(?:\.\d+)?)\%\)/i);
      const jobVatType = vatMatch ? vatMatch[1].toLowerCase() : "none";
      const jobVatRate = vatMatch ? parseFloat(vatMatch[2]) : 0;
      
      const baseTotal = jobSubtotal + jobSurcharge;
      let jobVatAmount = 0;
      if (jobVatType === "inclusive") {
        jobVatAmount = baseTotal * (jobVatRate / (100 + jobVatRate));
      } else if (jobVatType === "exclusive") {
        jobVatAmount = baseTotal * (jobVatRate / 100);
      }

      return {
        id: latestJob.id ? latestJob.id.split('-')[0].toUpperCase() : "",
        createdAt: latestJob.createdAt ? new Date(latestJob.createdAt) : new Date(),
        customerName: latestJob.customerName || "Walk-In",
        customerPhone: latestJob.customerPhone || "-",
        items: jobItems,
        subtotal: jobSubtotal,
        expressSurcharge: jobSurcharge,
        serviceSpeed: jobSpeed,
        discount: latestJob.discount || 0,
        total: latestJob.totalAmount,
        isPaid: latestJob.isPaid,
        paymentChannel: latestJob.paymentChannel,
        remark: latestJob.remark,
        isDraft: false,
        vatType: jobVatType,
        vatRate: jobVatRate,
        vatAmount: jobVatAmount,
        deliveryScheduledAt: latestJob.deliveryScheduledAt,
        status: latestJob.status,
        adminNotesJson: latestJob.adminNotesJson
      };
    }

    // For Draft Preview, construct simulated payment logs
    const draftPayments: any[] = [];
    const timestamp = new Date().toISOString();
    draftPayments.push({ amount: total, method: paymentMethod, timestamp });

    const expressText = selectedExpressPercent > 0 ? `Express ${selectedExpressPercent}%` : "";

    return {
      id: proformaReceiptNumber || "PROFORMA",
      createdAt: new Date(),
      customerName: selectedCustomer ? selectedCustomer.name : "Walk-In",
      customerPhone: selectedCustomer ? selectedCustomer.phone : "-",
      items: cart.map(item => ({ name: item.name, nameEn: item.nameEn, quantity: item.quantity, price: item.price })),
      subtotal: subtotal,
      expressSurcharge: expressSurcharge,
      serviceSpeed: serviceSpeed,
      discount: manualAdjustment,
      total: total,
      isPaid: isPaid,
      paymentChannel: isPaid ? (paymentMethod === "cash" ? "Cash" : paymentMethod === "transfer" ? "Transfer" : paymentMethod === "card" ? "Card" : (selectedCustomer?.isMember ? "Deduct Member" : "Credit Wallet")) : undefined,
      remark: [remark, expressText, vatType !== "none" ? `VAT: ${vatType} (${vatRate}%)` : ""].filter(Boolean).join(" | ") || undefined,
      isDraft: true,
      vatType: vatType,
      vatRate: vatRate,
      vatAmount: vatAmount,
      deliveryScheduledAt: new Date(deliveryScheduledTime),
      status: undefined,
      adminNotesJson: JSON.stringify({ payments: draftPayments })
    };
  }, [isDraftPreview, latestJob, selectedCustomer, cart, subtotal, expressSurcharge, serviceSpeed, manualAdjustment, total, isPaid, paymentMethod, remark, vatType, vatRate, vatAmount, deliveryScheduledTime, selectedExpressPercent, proformaReceiptNumber]);

  const handleCheckout = async () => {
    if (isSpectatorMode) {
      toast.error(currentLanguage === "en" ? "Spectator Mode - Actions are disabled" : "โหมดผู้เฝ้าดู - ไม่สามารถทำรายการได้");
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    // Cash Validation Check
    if (isPaid && paymentMethod === "cash") {
      const received = parseFloat(receivedCash);
      if (isNaN(received) || received < total) {
        toast.error(
          currentLanguage === "en"
            ? "Invalid or insufficient cash amount"
            : "จำนวนเงินสดที่รับมาไม่ถูกต้องหรือไม่เพียงพอ"
        );
        return;
      }
    }

    // Wallet Balance Check
    const finalCreditAlloc = paymentMethod === "credit" ? total : 0;

    if (finalCreditAlloc > 0) {
      if (!selectedCustomer) {
        toast.error("Please select a customer for Member wallet payment");
        return;
      }
      const balance = selectedCustomer.creditBalance || 0;
      if (balance < finalCreditAlloc) {
        toast.error(`Insufficient Member balance. Available: ฿${balance.toLocaleString()}. Required: ฿${finalCreditAlloc.toLocaleString()}`);
        return;
      }
    }

    let topUpTotal = 0;
    cart.forEach(item => {
      if (item.id === "topup-member-item") {
        topUpTotal += item.price * item.quantity;
      }
    });

    if (topUpTotal > 0) {
      if (!selectedCustomer) {
        toast.error("Please select a customer for Member Top-up");
        return;
      }
      if ((isPaid && paymentMethod === "credit") || finalCreditAlloc > 0) {
        toast.error("Cannot pay for Top-up using Member wallet");
        return;
      }
    }

    setIsProcessing(true);
    
    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const expressText = selectedExpressPercent > 0 ? `Express ${selectedExpressPercent}%` : "";
      const vatText = vatType !== "none" ? `VAT: ${vatType} (${vatRate}%)` : "";
      const finalRemark = [remark, expressText, vatText].filter(Boolean).join(" | ") || undefined;

      // Fetch loaded job payments if editing a saved order
      const loadedJob = jobs.find(j => j.id === loadedJobId);
      let existingPayments: any[] = [];
      if (loadedJob && loadedJob.adminNotesJson) {
        try {
          const parsed = JSON.parse(loadedJob.adminNotesJson);
          if (parsed && Array.isArray(parsed.payments)) {
            existingPayments = parsed.payments;
          }
        } catch (e) {}
      }

      // Construct new payments list for this transaction
      const newPayments: any[] = [];
      const timestamp = new Date().toISOString();
      const shiftId = activeShift?.id;

      const payAmt = loadedJob ? (total - existingPayments.reduce((s, p) => s + p.amount, 0)) : total;
      if (isPaid && payAmt > 0) {
        const paymentRecord: any = { amount: payAmt, method: paymentMethod, timestamp, shiftId };
        if (paymentMethod === "cash") {
          const receivedVal = parseFloat(receivedCash);
          if (!isNaN(receivedVal) && receivedVal >= payAmt) {
            paymentRecord.received = receivedVal;
            paymentRecord.change = receivedVal - payAmt;
          }
        }
        newPayments.push(paymentRecord);
      }

      const finalPayments = [...existingPayments, ...newPayments];
      const totalPaid = finalPayments.reduce((s, p) => s + p.amount, 0);
      const isPaidFlag = isPaid || totalPaid >= total;

      // Determine backward-compatible payment method & channel
      let finalMethod: any = paymentMethod;
      let finalChannel = undefined;

      if (newPayments.length === 1) {
        finalMethod = newPayments[0].method;
        finalChannel = newPayments[0].method.toUpperCase();
      }

      const paymentsJsonStr = JSON.stringify({ payments: finalPayments });

      let finalJob = null;
      if (loadedJobId) {
        await jobStore.updateJobDetails(loadedJobId, {
          totalAmount: total,
          discount: manualAdjustment,
          items: cart.map(item => ({ name: item.name, nameEn: item.nameEn, quantity: item.quantity, price: item.price })),
          isPaid: isPaidFlag,
          paymentMethod: isPaidFlag ? finalMethod : undefined,
          paymentChannel: isPaidFlag ? finalChannel : undefined,
          remark: finalRemark,
          adminNotesJson: paymentsJsonStr,
          status: undefined,
          completedAt: isPaidFlag && isStandardPlan ? new Date() : undefined,
          deliveryScheduledAt: new Date(deliveryScheduledTime),
        });

        const allJobs = jobStore.getSnapshot();
        finalJob = allJobs.find(j => j.id === loadedJobId);
      } else {
        finalJob = await jobStore.addJob({
          source: "pos",
          customerId: selectedCustomer?.id,
          customerName: selectedCustomer ? selectedCustomer.name : "Walk-In",
          customerPhone: selectedCustomer ? selectedCustomer.phone : "-",
          pickupLocation: "POS Counter (Walk-in)",
          dropoffLocation: shops[0]?.name || "That Laundry Shop (Branch 1)",
          pickupCoords: { lat: 13.7417, lng: 100.5526 }, // Shop coords
          dropoffCoords: { lat: 13.7417, lng: 100.5526 },
          totalAmount: total,
          discount: manualAdjustment,
          items: cart.map(item => ({ name: item.name, nameEn: item.nameEn, quantity: item.quantity, price: item.price })),
          serviceType: "wash_fold",
          status: "billing",
          completedAt: isStandardPlan && isPaidFlag ? new Date() : undefined,
          fee: 0, 
          branchId: shops[0]?.id,
          isPaid: isPaidFlag,
          paymentMethod: isPaidFlag ? finalMethod : undefined,
          paymentChannel: isPaidFlag ? finalChannel : undefined,
          remark: finalRemark,
          adminNotesJson: paymentsJsonStr,
          createdBy: user?.name || user?.email || "POS Counter",
          deliveryScheduledAt: new Date(deliveryScheduledTime),
        });
      }

      // Member balance adjustment
      let balanceAdjustment = 0;
      if (selectedCustomer) {
        if (finalCreditAlloc > 0) {
          balanceAdjustment = -finalCreditAlloc;
        } else {
          balanceAdjustment = topUpTotal;
        }
      }

      if (balanceAdjustment !== 0 && selectedCustomer) {
        const newBalance = (selectedCustomer.creditBalance || 0) + balanceAdjustment;
        const updates: Partial<Customer> = { creditBalance: newBalance };
        
        if (balanceAdjustment > 0 && !selectedCustomer.isMember) {
          updates.isMember = true;
          const priceLists = priceListStore.getSnapshot();
          const memberList = priceLists.find(p => p.name.toLowerCase().includes("member"));
          if (memberList) {
            updates.priceListId = memberList.id;
          }
        }

        await customerStore.updateCustomer(selectedCustomer.id, updates);
        
        // Update local state copy to immediately reflect in current view
        setSelectedCustomer(prev => prev ? { 
          ...prev, 
          creditBalance: newBalance,
          isMember: updates.isMember !== undefined ? updates.isMember : prev.isMember,
          priceListId: updates.priceListId !== undefined ? updates.priceListId : prev.priceListId
        } : null);
      }

      setLatestJob(finalJob);
      setShowReceipt(true);
      playAudioFeedback("success");

      let descriptionMsg = `Order for ${selectedCustomer ? selectedCustomer.name : "Walk-In"} has been recorded.`;
      if (isPaidFlag) {
        if (paymentMethod === "cash" && receivedCash) {
          const receivedVal = parseFloat(receivedCash);
          if (!isNaN(receivedVal) && receivedVal > total) {
            const changeVal = receivedVal - total;
            descriptionMsg = currentLanguage === "en"
              ? `Order recorded. Change to return: ฿${changeVal.toFixed(2)}`
              : `บันทึกรายการสำเร็จ เงินทอนที่ต้องคืน: ฿${changeVal.toFixed(2)}`;
          } else if (!isNaN(receivedVal) && receivedVal === total) {
            descriptionMsg = currentLanguage === "en"
              ? `Order recorded. Exact amount received: ฿${total.toFixed(2)}`
              : `บันทึกรายการสำเร็จ รับเงินพอดี: ฿${total.toFixed(2)}`;
          }
        } else if (selectedCustomer) {
          if (finalCreditAlloc > 0) {
            const newBalance = (selectedCustomer.creditBalance || 0) - finalCreditAlloc;
            descriptionMsg = `Order recorded. ฿${finalCreditAlloc.toFixed(2)} deducted from Member wallet. New balance: ฿${newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`;
          } else if (topUpTotal > 0) {
            const newBalance = (selectedCustomer.creditBalance || 0) + topUpTotal;
            const upgradedText = !selectedCustomer.isMember ? " (Upgraded to MEMBER automatically)" : "";
            descriptionMsg = `Order recorded. ฿${topUpTotal.toFixed(2)} added to Member wallet. New balance: ฿${newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}${upgradedText}.`;
          }
        }
      }

      toast.success(loadedJobId ? "Order Updated Successfully" : "Order Synced Successfully", {
        description: descriptionMsg
      });
      resetCartForm();
    } catch (err) {
      toast.error(loadedJobId ? "Failed to update order" : "Failed to sync order");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasLoadedShift) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] w-full bg-background font-sans gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {currentLanguage === "en" ? "Checking shift status..." : "กำลังตรวจสอบสถานะกะพนักงาน..."}
        </p>
      </div>
    );
  }

  if (hasLoadedShift && activeShift && isShiftFromPreviousDay) {
    return (
      <>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] w-full bg-background/95 backdrop-blur-sm font-sans p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 relative overflow-hidden"
          >
            {/* Top aesthetic accent line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 to-amber-500" />
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-3">
                <ShieldAlert size={28} />
              </div>
              <h2 className="text-xl font-black text-foreground tracking-tight text-center w-full flex justify-center">
                {currentLanguage === "en" ? "Pending Shift Detected" : "ตรวจพบกะค้าง"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 font-medium leading-relaxed text-center">
                {currentLanguage === "en"
                  ? `You have an unclosed cashier shift from ${format(new Date(activeShift.openedAt), "dd/MM/yyyy")}. Please count the remaining cash and close the shift before proceeding.`
                  : `คุณมีกะค้างของวันที่ ${format(new Date(activeShift.openedAt), "dd/MM/yyyy")} ยังไม่ได้ปิด กรุณาตรวจนับยอดเงินและปิดกะก่อนเริ่มการขายใหม่`}
              </p>
            </div>

            <div className="space-y-4">
              <Button
                type="button"
                onClick={() => {
                  setActualCash("");
                  setCloseShiftNotes("");
                  setIsCloseShiftOpen(true);
                }}
                className="w-full bg-rose-600 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-bold h-10 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/15"
              >
                <Banknote size={16} />
                {currentLanguage === "en" ? "Close Shift & Count Cash" : "ปิดกะและตรวจนับเงิน (Close Shift)"}
              </Button>
            </div>

            <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
              <span>{currentLanguage === "en" ? "Pending Shift Staff:" : "พนักงานกะค้าง:"} {activeShift.userName}</span>
              <span>
                {currentLanguage === "en"
                  ? `Opened at: ${format(new Date(activeShift.openedAt), "HH:mm")}`
                  : `เปิดเมื่อ: ${format(new Date(activeShift.openedAt), "HH:mm น.")}`}
              </span>
            </div>
          </motion.div>
        </div>

        <Dialog open={isCloseShiftOpen} onOpenChange={setIsCloseShiftOpen}>
          <DialogContent className="max-w-md p-5 bg-card border border-border shadow-2xl rounded-2xl">
            <DialogHeader className="shrink-0 mb-3">
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Banknote className="text-red-500" size={18} />
                {currentLanguage === "en" ? "Close Cashier Shift & Drawer Report" : "รายงานปิดกะพนักงานและลิ้นชักเงินสด"}
              </DialogTitle>
            </DialogHeader>

            {activeShift && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!activeShift) return;
                const cashVal = parseFloat(actualCash);
                if (isNaN(cashVal) || cashVal < 0) {
                  toast.error(
                    currentLanguage === "en"
                      ? "Please enter a valid actual cash amount (must be at least 0)"
                      : "กรุณาระบุเงินสดนับจริงให้ถูกต้อง (ต้องไม่น้อยกว่า 0)"
                  );
                  return;
                }
                setIsShiftSubmitting(true);
                try {
                  await shiftStore.closeShift(activeShift.id, cashVal, closeShiftNotes);
                  toast.success(
                    currentLanguage === "en"
                      ? "Cashier shift closed successfully. POS system locked."
                      : "ปิดรอบลิ้นชักเงินสดสำเร็จแล้ว ระบบถูกล็อก"
                  );
                  setIsCloseShiftOpen(false);
                  setActualCash("");
                  setCloseShiftNotes("");
                } catch (err) {
                  toast.error(
                    currentLanguage === "en"
                      ? "Failed to close cashier shift"
                      : "ไม่สามารถปิดรอบลิ้นชักเงินสดได้"
                  );
                } finally {
                  setIsShiftSubmitting(false);
                }
              }} className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2.5 text-xs text-foreground font-semibold leading-relaxed">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold border-b border-border pb-1.5 mb-1">
                    <span>{currentLanguage === "en" ? "Staff" : "พนักงาน"}: {activeShift.userName}</span>
                    <span>
                      {currentLanguage === "en" ? "Opened At" : "เปิดกะเมื่อ"}: {format(new Date(activeShift.openedAt), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {currentLanguage === "en" ? "1. Starting Float:" : "1. เงินทอนเริ่มต้น (Starting Float):"}
                    </span>
                    <span>฿{activeShift.startingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {currentLanguage === "en" ? "2. Cash Sales:" : "2. ยอดขายเงินสด (Cash Sales):"}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +฿{activeShiftStats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="flex justify-between font-black border-t border-dashed border-border pt-2 text-sm">
                    <span>
                      {currentLanguage === "en" ? "Expected Cash in Drawer:" : "ยอดเงินสดที่ควรมี (Expected Cash):"}
                    </span>
                    <span>฿{activeShiftStats.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="border-t border-border pt-2.5 mt-1 space-y-1 text-[11px]">
                    <p className="text-muted-foreground font-bold mb-1">
                      {currentLanguage === "en" ? "Non-cash Sales:" : "ยอดขายช่องทางอื่น ๆ (Non-cash Sales):"}
                    </p>
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {currentLanguage === "en" ? "- Bank Transfer:" : "- โอนเงิน (Bank Transfer):"}
                      </span>
                      <span>฿{activeShiftStats.transferSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {currentLanguage === "en" ? "- Card:" : "- บัตรเครดิต (Card):"}
                      </span>
                      <span>฿{activeShiftStats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {currentLanguage === "en" ? "- Member Wallet:" : "- หักบัญชีสมาชิก (Member Wallet):"}
                      </span>
                      <span>฿{activeShiftStats.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-2 mt-1 space-y-1 text-[11px]">
                    <div className="flex justify-between text-foreground font-bold mb-1">
                      <span>
                        {currentLanguage === "en" ? "Total Orders:" : "จำนวนออเดอร์ทั้งหมด:"}
                      </span>
                      <span>
                        {activeShiftStats.totalOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pl-2">
                      <span>
                        {currentLanguage === "en" ? "• Cash:" : "• เงินสด:"}
                      </span>
                      <span>
                        {activeShiftStats.cashOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pl-2">
                      <span>
                        {currentLanguage === "en" ? "• Bank Transfer:" : "• โอนเงิน:"}
                      </span>
                      <span>
                        {activeShiftStats.transferOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pl-2">
                      <span>
                        {currentLanguage === "en" ? "• Card:" : "• บัตรเครดิต:"}
                      </span>
                      <span>
                        {activeShiftStats.cardOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pl-2">
                      <span>
                        {currentLanguage === "en" ? "• Member Wallet:" : "• หักบัญชีสมาชิก:"}
                      </span>
                      <span>
                        {activeShiftStats.creditOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="actualCash" className="text-xs font-bold text-foreground">
                    {currentLanguage === "en" ? "Actual Cash in Drawer (฿) *" : "เงินสดนับจริงในลิ้นชัก (฿) *"}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">฿</span>
                    <Input
                      id="actualCash"
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      className="pl-7 bg-muted/50 border-border text-foreground font-black focus-visible:ring-emerald-500"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                    />
                  </div>
                </div>

                {actualCash && !isNaN(parseFloat(actualCash)) && (() => {
                  const diff = parseFloat(actualCash) - activeShiftStats.expectedCash;
                  return (
                    <div className="flex justify-between items-center text-xs font-bold rounded-lg p-2.5 border bg-muted/40">
                      <span className="text-muted-foreground">
                        {currentLanguage === "en" ? "Difference (Shortage/Overage):" : "ส่วนต่าง (Shortage/Overage):"}
                      </span>
                      {diff > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +฿{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentLanguage === "en" ? "(Overage)" : "(เงินเกิน)"}
                        </span>
                      ) : diff < 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-black">
                          ฿{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentLanguage === "en" ? "(Shortage)" : "(เงินขาด)"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          ฿0.00 {currentLanguage === "en" ? "(Balanced)" : "(ยอดตรง)"}
                        </span>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="closeShiftNotes" className="text-xs font-bold text-foreground">
                    {currentLanguage === "en" ? "Additional Notes" : "บันทึกเพิ่มเติมการปิดกะ"}
                  </Label>
                  <Input
                    id="closeShiftNotes"
                    type="text"
                    placeholder={
                      currentLanguage === "en"
                        ? "e.g., drawer balanced, excess coins..."
                        : "เช่น ส่งยอดบัญชีเรียบร้อย, มีเงินเหรียญเยอะ..."
                    }
                    className="bg-muted/50 border-border text-xs focus-visible:ring-emerald-500"
                    value={closeShiftNotes}
                    onChange={(e) => setCloseShiftNotes(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-2 border-t border-border gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCloseShiftOpen(false)}
                    className="h-9 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    {currentLanguage === "en" ? "Cancel" : "ยกเลิก"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isShiftSubmitting}
                    className="h-9 bg-red-600 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/10"
                  >
                    {isShiftSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {currentLanguage === "en" ? "Submitting..." : "กำลังส่งรายงาน..."}
                      </>
                    ) : (
                      <>
                        {currentLanguage === "en" ? "Confirm and Close Shift" : "ยืนยันปิดรอบและปิดกะพนักงาน"}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }


  // Branch Selection Portal (shown to any user who has multiple branches and has not selected one yet)
  if (shops.length > 1 && !activeBranchId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background font-sans p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl bg-card border border-border shadow-2xl rounded-2xl p-8 relative overflow-hidden z-10"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary to-indigo-500" />
          
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Store size={24} />
              </div>
            </div>
            <h1 className="text-xl font-black text-foreground tracking-tight">
              {currentLanguage === "en" ? "Select Branch to Monitor/Operate" : "เลือกสาขาเพื่อดูแลระบบ / เริ่มงาน"}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold">
              {currentLanguage === "en" 
                ? "Select any branch below to view its active POS cart, drawer stats, or open a shift."
                : "กรุณาเลือกสาขาที่ต้องการตรวจสอบข้อมูลรอบกะ หรือเปิดเครื่องขายสินค้า (POS)"}
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shops.map(shop => {
              return (
                <motion.button
                  key={shop.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setActiveBranchId(shop.id);
                    localStorage.setItem("pos_active_branch_id", shop.id);
                    playAudioFeedback("click");
                  }}
                  className="flex flex-col items-start text-left p-4.5 bg-muted/20 hover:bg-muted/40 border border-border hover:border-primary/40 rounded-xl cursor-pointer transition-all shadow-sm w-full"
                >
                  <Store size={16} className="text-primary mb-2" />
                  <span className="text-xs font-black text-foreground">{shop.name}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold mt-1 line-clamp-2 leading-relaxed">{shop.address}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  }

  if (hasLoadedShift && activeShift && activeShift.branchId !== activeBranchId && !isSpectatorMode) {
    const shiftBranchName = shops.find(s => s.id === activeShift.branchId)?.name || "สาขาอื่น";
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] w-full bg-background/95 backdrop-blur-sm font-sans p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 relative overflow-hidden text-center"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mx-auto mb-4">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-lg font-black text-foreground tracking-tight">
            {currentLanguage === "en" ? "Active Shift at Another Branch" : "พบรอบกะเปิดอยู่ที่สาขาอื่น"}
          </h2>
          <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed">
            {currentLanguage === "en"
              ? `You currently have an active cashier shift open at branch "${shiftBranchName}". Please switch back to "${shiftBranchName}" to close it before operating at this branch.`
              : `คุณมีรอบกะที่ยังเปิดค้างอยู่ที่สาขา "${shiftBranchName}" กรุณาสลับกลับไปที่สาขา "${shiftBranchName}" เพื่อทำการปิดกะก่อนเริ่มขายที่สาขานี้`}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              onClick={() => {
                setActiveBranchId(activeShift.branchId);
                localStorage.setItem("pos_active_branch_id", activeShift.branchId);
                playAudioFeedback("click");
              }}
              className="w-full bg-primary hover:bg-primary/95 text-white font-bold h-10 rounded-xl cursor-pointer"
            >
              {currentLanguage === "en" ? `Switch Back to ${shiftBranchName}` : `สลับกลับไปที่ ${shiftBranchName}`}
            </Button>
            {shops.length > 1 && (
              <Button
                variant="outline"
                onClick={() => {
                  setActiveBranchId("");
                  localStorage.removeItem("pos_active_branch_id");
                  playAudioFeedback("delete");
                }}
                className="w-full border-border text-foreground font-bold h-10 rounded-xl cursor-pointer"
              >
                {currentLanguage === "en" ? "Change Selected Branch" : "เปลี่ยนสาขาอื่น"}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (hasLoadedShift && !activeShift && !isSpectatorMode) {
    const handleOpenShift = async (e: React.FormEvent) => {
      e.preventDefault();
      const cashVal = parseFloat(startingCash);
      if (isNaN(cashVal) || cashVal < 0) {
        toast.error(
          currentLanguage === "en"
            ? "Please enter a valid starting float (must be at least 0)"
            : "กรุณาระบุเงินทอนเริ่มต้นให้ถูกต้อง (ต้องไม่น้อยกว่า 0)"
        );
        return;
      }
      if (!user?.id || !activeShop?.id) return;
      setIsShiftSubmitting(true);
      try {
        await shiftStore.openShift(user.id, user.name || user.email, activeShop.id, cashVal, openShiftNotes);
        toast.success(
          currentLanguage === "en"
            ? "Cashier shift opened successfully. POS ready."
            : "เปิดรอบลิ้นชักเงินสดสำเร็จแล้ว เริ่มต้นการขายได้"
        );
        setStartingCash("");
        setOpenShiftNotes("");
      } catch (err) {
        toast.error(
          currentLanguage === "en"
            ? "Failed to open cashier shift"
            : "ไม่สามารถเปิดรอบลิ้นชักเงินสดได้"
        );
      } finally {
        setIsShiftSubmitting(false);
      }
    };

    return (
      <>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] w-full bg-background/95 backdrop-blur-sm font-sans p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 relative overflow-hidden"
          >
            {/* Top aesthetic accent line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
                <Banknote size={28} />
              </div>
              <h2 className="text-xl font-black text-foreground tracking-tight">
                {currentLanguage === "en" ? "Open Cashier Shift" : "ระบบเปิดรอบลิ้นชักเงินสด"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {currentLanguage === "en"
                  ? "Please specify starting float to begin using POS."
                  : "กรุณาระบุเงินทอนเริ่มต้นเพื่อเริ่มต้นใช้งานระบบ POS"}
              </p>
            </div>

            {branchActiveShift ? (
              <div className="space-y-4 text-center mt-4">
                <div className="p-4 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-semibold leading-relaxed shadow-sm">
                  {currentLanguage === "en" ? (
                    <>
                      A cashier shift is currently active by staff: <span className="font-bold underline">{branchActiveShift.userName}</span>.
                      <br />
                      You cannot open a new shift or perform transactions until they close their shift.
                    </>
                  ) : (
                    <>
                      มีรอบกะกำลังเปิดใช้งานอยู่โดยพนักงาน: <span className="font-bold underline">{branchActiveShift.userName}</span>
                      <br />
                      คุณไม่สามารถเปิดกะใหม่หรือทำรายการขายได้ จนกว่าพนักงานท่านดังกล่าวจะทำการปิดกะ
                    </>
                  )}
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-background border-border hover:bg-muted hover:text-foreground text-foreground font-bold h-10 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
                  onClick={async () => {
                    setIsShiftSubmitting(true);
                    try {
                      if (user?.id) {
                        await shiftStore.fetchActiveShift(user.id);
                        toast.success(
                          currentLanguage === "en"
                            ? "Status refreshed successfully."
                            : "รีเฟรชสถานะสำเร็จแล้ว"
                        );
                      }
                    } catch (e) {
                      toast.error(
                        currentLanguage === "en"
                          ? "Failed to refresh status"
                          : "ไม่สามารถรีเฟรชสถานะได้"
                      );
                    } finally {
                      setIsShiftSubmitting(false);
                    }
                  }}
                  disabled={isShiftSubmitting}
                >
                  {isShiftSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {currentLanguage === "en" ? "Refreshing..." : "กำลังรีเฟรช..."}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      {currentLanguage === "en" ? "Refresh Status" : "รีเฟรชสถานะ"}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="startingCash" className="text-xs font-bold text-foreground">
                    {currentLanguage === "en" ? "Starting Float (฿) *" : "เงินทอนเริ่มต้น (฿) *"}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">฿</span>
                    <Input
                      id="startingCash"
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      className="pl-7 bg-muted/50 border-border text-foreground font-black focus-visible:ring-emerald-500"
                      value={startingCash}
                      onChange={(e) => setStartingCash(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="openShiftNotes" className="text-xs font-bold text-foreground">
                    {currentLanguage === "en" ? "Additional Notes (Optional)" : "บันทึกเพิ่มเติม (ถ้ามี)"}
                  </Label>
                  <Input
                    id="openShiftNotes"
                    type="text"
                    placeholder={
                      currentLanguage === "en"
                        ? "e.g., morning shift, extra float..."
                        : "เช่น กะเช้า, เงินทอนสำรองเพิ่มเติม..."
                    }
                    className="bg-muted/50 border-border text-xs focus-visible:ring-emerald-500"
                    value={openShiftNotes}
                    onChange={(e) => setOpenShiftNotes(e.target.value)}
                  />
                </div>

                <div className="pt-3">
                  <Button
                    type="submit"
                    disabled={isShiftSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold h-10 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/15"
                  >
                    {isShiftSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {currentLanguage === "en" ? "Opening Shift..." : "กำลังเปิดกะพนักงาน..."}
                      </>
                    ) : (
                      <>
                        {currentLanguage === "en" ? "Open Shift & Start Sales" : "เปิดกะและเริ่มต้นขาย (Open Shift)"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
            
            <div className="pt-2.5 text-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  fetchClosedShifts();
                  setIsShiftHistoryOpen(true);
                }}
                className="text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer font-bold flex items-center gap-1.5 mx-auto hover:bg-transparent"
              >
                <History size={12} />
                {currentLanguage === "en" ? "View Shift History" : "ดูประวัติกะย้อนหลัง"}
              </Button>
            </div>

            <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
              <span>{currentLanguage === "en" ? "Staff:" : "พนักงาน:"} {user?.name || user?.email || "Unknown"}</span>
              <span>
                {currentLanguage === "en"
                  ? `Server Time: ${format(new Date(), "HH:mm")}`
                  : `เวลาเซิร์ฟเวอร์: ${format(new Date(), "HH:mm น.")}`}
              </span>
            </div>
          </motion.div>
        </div>
        <ShiftHistoryDialog
          isOpen={isShiftHistoryOpen}
          onOpenChange={setIsShiftHistoryOpen}
          isLoading={isLoadingClosedShifts}
          shifts={closedShifts}
          currentLanguage={currentLanguage === "en" ? "en" : "th"}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden font-sans relative">
      {isSpectatorMode && (
        <div className="bg-amber-500 text-white text-[11px] font-black py-2 px-6 flex items-center justify-between shadow-sm shrink-0 z-50">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="animate-pulse" />
            <span>
              {currentLanguage === "en"
                ? `SPECTATOR MODE - Monitoring ${activeShop?.name || "Branch"} (Active Cashier: ${branchActiveShift?.userName})`
                : `โหมดผู้เฝ้าดู - กำลังตรวจสอบสาขา ${activeShop?.name || "สาขา"} (แคชเชียร์ปัจจุบัน: ${branchActiveShift?.userName})`}
            </span>
          </div>
          <button
            onClick={() => {
              setActiveBranchId("");
              localStorage.removeItem("pos_active_branch_id");
              playAudioFeedback("delete");
            }}
            className="bg-white/20 hover:bg-white/30 text-white font-bold px-2.5 py-1 rounded-lg text-[9px] uppercase transition-all shrink-0 cursor-pointer"
          >
            {currentLanguage === "en" ? "Change Branch" : "เปลี่ยนสาขา"}
          </button>
        </div>
      )}

      {/* Integrated POS Header Bar */}
      <header className="flex h-16 items-center justify-between px-6 shrink-0 bg-card border-b border-border shadow-sm">
        <div className="flex items-center gap-6 min-w-0 flex-1">
          <div>
            <h1 className="text-sm sm:text-base lg:text-lg font-black text-foreground tracking-tight whitespace-nowrap">Point of Sale</h1>
            <p className="hidden md:block text-[10px] text-muted-foreground font-semibold mt-0.5">Create and process over-the-counter orders</p>
          </div>

          {shops.length > 1 && (
            <div className="flex items-center gap-1.5 border border-border bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl px-2.5 py-1 shadow-sm shrink-0">
              <Store size={12} className="text-muted-foreground" />
              <select
                value={activeBranchId}
                onChange={(e) => {
                  setActiveBranchId(e.target.value);
                  playAudioFeedback("click");
                }}
                className="bg-transparent text-[11px] font-black text-foreground outline-none cursor-pointer border-none p-0 pr-5 appearance-none select-none focus:ring-0 focus:outline-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right center",
                  backgroundSize: "10px"
                }}
              >
                {shops.map(s => (
                  <option key={s.id} value={s.id} className="bg-card text-foreground font-semibold text-xs">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product Search - Now right next to the POS title */}
          <div className="relative w-44 sm:w-52 lg:w-60 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <Input 
              placeholder="Search services..." 
              className="pl-8 sm:pl-9 pr-8 w-full bg-muted/40 border-border h-8 sm:h-9 text-[10px] sm:text-xs rounded-xl text-foreground focus-visible:ring-primary shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  playAudioFeedback("delete");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 min-w-0">
          {/* Active Shift Header Badge & Close Shift button */}
          {activeShift && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-muted border border-border shadow-sm shrink-0">
              <div className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <Banknote size={14} />
              </div>
              <div className="text-left leading-none">
                <p className="text-[9px] text-muted-foreground font-bold">
                  {currentLanguage === "en" ? "Expected Cash" : "เงินในลิ้นชัก"}
                </p>
                <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ฿{activeShiftStats.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              {!isSpectatorMode && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  type="button"
                  className="h-6.5 px-2.5 text-[10px] font-black text-red-650 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg ml-1.5 cursor-pointer transition-all shadow-sm flex items-center"
                  onClick={() => {
                    setActualCash("");
                    setCloseShiftNotes("");
                    setIsCloseShiftOpen(true);
                  }}
                >
                  {currentLanguage === "en" ? "Close Shift" : "ปิดกะ"}
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                type="button"
                className="h-6.5 px-2.5 text-[10px] font-black text-blue-650 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/30 rounded-lg ml-1 cursor-pointer transition-all shadow-sm flex items-center gap-1"
                onClick={() => {
                  fetchClosedShifts();
                  setIsShiftHistoryOpen(true);
                }}
              >
                <History size={10} />
                {currentLanguage === "en" ? "History" : "ประวัติกะ"}
              </Button>
            </div>
          )}

          {/* Desktop User profile badge at the top-right corner */}
          {user && (
            <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-border bg-muted shrink-0 shadow-sm">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black"
                style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
              >
                {(user.name || user.email || "A")[0].toUpperCase()}
              </div>
              <div className="text-left leading-none">
                <p className="text-xs font-semibold text-foreground">{user.name || user.email}</p>
                <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{user.role}</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Body Layout */}
      <div className="flex-1 flex gap-5 p-5 overflow-hidden min-h-0">
        {/* Product Catalog Area (Left) */}
        <div className="w-[calc(66%-10px)] shrink-0 flex flex-col min-w-0 h-full overflow-hidden">
          {isNearClosing && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-2 shrink-0 animate-pulse">
              <ShieldAlert size={14} className="shrink-0" />
              <span>
                {currentLanguage === "en"
                  ? `Shop is closing soon (Closing: ${settings?.shopCloseTime || "19:00"}). Please count cash and close cashier shift at the end of operations.`
                  : `ใกล้ถึงเวลาปิดร้านแล้ว (เวลาปิด: ${settings?.shopCloseTime || "19:00"} น.) กรุณาตรวจนับเงินสดและปิดกะให้เรียบร้อยเมื่อสิ้นสุดรอบการขาย`}
              </span>
            </div>
          )}

        {/* Categories Bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide shrink-0">
          {categories.map(cat => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all whitespace-nowrap uppercase tracking-wider cursor-pointer ${
                selectedCategory === cat 
                  ? "bg-primary text-primary-foreground shadow-md shadow-brand/10" 
                  : "bg-card text-muted-foreground border border-border hover:bg-muted hover:text-foreground"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>
 
        {/* Product Cards Grid (Scrollable Container) */}
        <div className="flex-1 overflow-y-auto pr-1 min-h-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 pb-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.length > 0 ? (
                filteredProducts.map(product => {
                  const displayName = (currentLanguage === "en" && product.nameEn) ? product.nameEn : product.name;
                  const isDisabled = (
                    (cart.some(item => item.id === "topup-member-item") && product.id !== "topup-member-item") ||
                    (cart.some(item => item.id !== "topup-member-item") && product.id === "topup-member-item")
                  );
                  return (
                    <motion.div
                      layout
                      key={product.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={isDisabled || isSpectatorMode || product.id === "topup-member-item" ? {} : { y: -2 }}
                      whileTap={isDisabled || isSpectatorMode || product.id === "topup-member-item" ? {} : { scale: 0.96 }}
                      onClick={isDisabled || isSpectatorMode || product.id === "topup-member-item" ? undefined : () => addToCart(product)}
                      className={`bg-card p-3 rounded-xl border border-border shadow-sm transition-all group flex flex-col justify-between ${
                        (isDisabled || isSpectatorMode) ? "opacity-40 pointer-events-none select-none" : ""
                      } ${
                        (product.id === "topup-member-item" || isSpectatorMode) ? "" : "cursor-pointer hover:shadow-md hover:border-primary/25"
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                          {getProductIcon(product.icon, product.name, product.nameEn, product.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-foreground text-[13px] line-clamp-2 leading-tight" title={displayName}>
                            {displayName}
                          </h3>
                        </div>
                      </div>
                      {product.id === "topup-member-item" ? (
                        <div className="space-y-2 mt-1 pt-1 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">฿</span>
                            <input
                              type="number"
                              disabled={isSpectatorMode}
                              placeholder={currentLanguage === "en" ? "Amount" : "จำนวนเงิน"}
                              className="h-7 pl-5 pr-1 text-[11px] font-bold bg-muted border border-border w-full text-foreground rounded-lg focus:ring-1 focus:ring-primary outline-none"
                              value={topUpInputVal}
                              onChange={(e) => setTopUpInputVal(e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            disabled={isSpectatorMode}
                            onClick={() => {
                              const amt = parseFloat(topUpInputVal);
                              if (isNaN(amt) || amt <= 0) {
                                toast.error("Please enter a valid amount");
                                return;
                              }
                              addToCart(product, amt);
                              setTopUpInputVal("");
                            }}
                            className={`w-full h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg border-none cursor-pointer ${isSpectatorMode ? "opacity-50 pointer-events-none" : ""}`}
                          >
                            {currentLanguage === "en" ? "Top Up" : "เติมเงิน"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/50">
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-black text-foreground">฿{getProductPrice(product)}</span>
                            {getProductPrice(product) !== product.price && (
                              <span className="text-[9px] line-through text-muted-foreground/60 font-semibold">฿{product.price}</span>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-[8px] font-bold uppercase py-0 px-1 h-3.5 bg-muted text-muted-foreground scale-90 origin-right">
                            {product.category}
                          </Badge>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              ) : (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-card rounded-2xl border border-border shadow-sm p-6 max-w-sm mx-auto mt-6">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Search className="text-muted-foreground" size={20} />
                  </div>
                  <h3 className="text-xs font-bold text-foreground">No services found</h3>
                  <p className="text-[10px] text-muted-foreground font-medium max-w-[200px] mt-1 mb-4">
                    We couldn&apos;t find any services matching &quot;{searchQuery}&quot;
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      playAudioFeedback("delete");
                    }}
                    className="h-8 px-4 bg-accent hover:bg-primary/10 text-primary font-bold text-xs rounded-xl border-none cursor-pointer"
                  >
                    Clear Search
                  </Button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
 
      {/* Cart & Checkout Panel (Right) */}
      <aside className="w-[calc(34%-10px)] min-w-[340px] shrink-0 h-full flex flex-col gap-4 overflow-hidden">
 
        {/* Current Order Cart (Self-contained scrollable container) */}
        <div className="flex-1 bg-card rounded-2xl flex flex-col border border-border shadow-sm overflow-hidden min-h-0">
          {/* Cart Header - Single Row */}
          <div className="p-3 border-b border-border flex items-center gap-2 shrink-0">
            {/* Customer Search / Select */}
            <div className="flex-1 min-w-0">
              {selectedCustomer ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-9 px-3 rounded-xl bg-accent border border-primary/20 flex items-center gap-2 w-full"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-accent-foreground truncate">{selectedCustomer.name}</p>
                    <p className="text-[9px] text-primary font-semibold truncate">
                      {selectedCustomer.phone}
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1.5">
                        (฿{(selectedCustomer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </span>
                    </p>
                  </div>
                  {selectedCustomer.isMember && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 text-[8px] py-0 px-1 font-bold shrink-0 scale-90">
                      M
                    </Badge>
                  )}
                  <motion.button 
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => setSelectedCustomer(null)} 
                    className="p-1 hover:bg-primary/10 rounded text-primary/70 shrink-0 cursor-pointer"
                    title="Remove customer"
                  >
                    <X size={12} />
                  </motion.button>
                </motion.div>
              ) : (
                <div className="relative w-full">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input 
                    type="text"
                    placeholder={currentLanguage === "en" ? "Select customer..." : "ค้นหา/เลือกลูกค้า..."}
                    className="w-full pl-9 pr-4 h-9 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                  />
                  
                  {isCustomerDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setIsCustomerDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-25 divide-y divide-border scrollbar-thin">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-4 py-2 hover:bg-muted text-xs font-semibold text-foreground flex items-center justify-between transition-colors cursor-pointer"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setCustomerSearch("");
                                setIsCustomerDropdownOpen(false);
                                playAudioFeedback("success");
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-foreground truncate">{c.name}</p>
                                <p className="text-[10px] text-muted-foreground font-medium">
                                  {c.phone}
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1.5">
                                    (฿{(c.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                                  </span>
                                </p>
                              </div>
                              {c.isMember && (
                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-100 text-[8px] py-0 px-1 font-bold shrink-0">
                                  MEMBER
                                </Badge>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-xs text-muted-foreground text-center font-medium">
                            {currentLanguage === "en" ? "No customers found" : "ไม่พบข้อมูลลูกค้า"}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Add Customer Icon Button */}
            <Button
              variant="outline"
              size="icon"
              type="button"
              className="h-9 w-9 rounded-xl border bg-card hover:bg-muted text-foreground flex items-center justify-center cursor-pointer shrink-0"
              onClick={() => {
                playAudioFeedback("click");
                setIsAddCustomerOpen(true);
              }}
              title={currentLanguage === "en" ? "Add Customer" : "เพิ่มลูกค้า"}
            >
              <UserPlus size={15} />
            </Button>

            {/* Cart Items Badge */}
            <div className="relative mx-1.5 shrink-0 flex items-center justify-center h-9 w-6" title={currentLanguage === "en" ? "Cart Items" : "รายการสั่งซื้อ"}>
              <ShoppingCart size={15} className="text-muted-foreground" />
              {cart.length > 0 && (
                <span className="absolute -top-0.5 -right-2 bg-primary text-primary-foreground text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center border border-card scale-90">
                  {cart.length}
                </span>
              )}
            </div>

            {/* Recall Button */}
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-9 text-[10px] font-bold px-2.5 flex items-center gap-1 border-dashed hover:border-primary hover:text-primary transition-all cursor-pointer bg-muted/40 rounded-xl shrink-0"
              onClick={() => {
                playAudioFeedback("click");
                setIsRecallOpen(true);
              }}
            >
              <FolderOpen size={11} />
              {currentLanguage === "en" ? "Recall" : "เรียกคืนบิล"}
            </Button>

            {/* Clear Cart Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              type="button"
              className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-55 dark:hover:bg-red-950/20 cursor-pointer rounded-xl shrink-0 border border-transparent hover:border-red-200"
              onClick={() => {
                setCart([]);
                setLoadedJobId(null);
                playAudioFeedback("delete");
                setEditingPriceItemId(null);
                setDeliveryScheduledTime(getTomorrowDateTimeString());
              }}
              title={currentLanguage === "en" ? "Clear Cart" : "ล้างตะกร้า"}
            >
              <Trash2 size={13} />
            </Button>
          </div>

          {loadedJobId && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/30 px-4 py-2 flex items-center justify-between shrink-0 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 flex-wrap">
                <FolderOpen size={12} className="text-amber-500 shrink-0" />
                <span>{currentLanguage === "en" ? "Editing Saved Order" : "กำลังแก้ไขบิล"} #{loadedJobId.split('-')[0].toUpperCase()}</span>
                {(() => {
                  const job = jobs.find(j => j.id === loadedJobId);
                  if (job && job.adminNotesJson) {
                    try {
                      const parsed = JSON.parse(job.adminNotesJson);
                      if (parsed && Array.isArray(parsed.payments)) {
                        const totalPaid = parsed.payments.reduce((s: number, p: any) => s + p.amount, 0);
                        if (totalPaid > 0) {
                          const due = (job.totalAmount || 0) - totalPaid;
                          return (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold ml-1.5 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              {currentLanguage === "en" ? `Paid: ฿${totalPaid.toFixed(2)} | Due: ฿${due.toFixed(2)}` : `มัดจำแล้ว: ฿${totalPaid.toFixed(2)} | ค้างจ่าย: ฿${due.toFixed(2)}`}
                            </span>
                          );
                        }
                      }
                    } catch (e) {}
                  }
                  return null;
                })()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const job = jobs.find(j => j.id === loadedJobId);
                    if (job) {
                      setPosCancellingJob(job);
                      setPosCancelReason("");
                    }
                  }}
                  className="text-red-500 hover:text-red-700 font-bold hover:underline cursor-pointer text-[10px]"
                >
                  {currentLanguage === "en" ? "Cancel Order" : "ยกเลิกบิล"}
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button
                  type="button"
                  onClick={() => {
                    resetCartForm();
                    playAudioFeedback("delete");
                    toast.info(currentLanguage === "en" ? "Edit mode cancelled" : "ยกเลิกโหมดแก้ไขแล้ว");
                  }}
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 hover:underline cursor-pointer text-[10px]"
                >
                  {currentLanguage === "en" ? "Exit" : "ออก"}
                </button>
              </div>
            </div>
          )}
 
          {/* Cart items list (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
            <AnimatePresence mode="popLayout">
              {cart.map(item => {
                const displayItemName = (currentLanguage === "en" && item.nameEn) ? item.nameEn : item.name;
                return (
                  <motion.div 
                    layout
                    key={item.id} 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-muted/40 dark:bg-muted/10 py-1 px-3 rounded-xl border border-border flex items-center justify-between gap-2.5 min-h-[38px] hover:border-primary/25 transition-all shadow-sm"
                  >
                    {/* Left: Name and base rate */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-extrabold text-foreground truncate" title={displayItemName}>
                        {displayItemName}
                      </p>
                      {item.price !== item.basePrice && (
                        <p className="text-[9px] font-bold text-primary">
                          (Custom)
                        </p>
                      )}
                    </div>
 
                    {/* Middle: Compact Qty Controls */}
                    <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden w-20 h-7.5 shadow-sm shrink-0">
                      <motion.button 
                        whileTap={{ scale: 0.85 }}
                        whileHover={{ backgroundColor: "var(--muted)" }}
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-6.5 h-7.5 text-muted-foreground border-r border-border transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                      >
                        <Minus size={10} />
                      </motion.button>
                      <input 
                        type="number" 
                        step="0.1" 
                        className="h-7.5 w-7 border-none bg-transparent text-center text-[11px] font-extrabold outline-none px-0.5 text-foreground"
                        value={item.quantity}
                        onChange={(e) => updateCartItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                      <motion.button 
                        whileTap={{ scale: 0.85 }}
                        whileHover={{ backgroundColor: "var(--muted)" }}
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-6.5 h-7.5 text-muted-foreground border-l border-border transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                      >
                        <Plus size={10} />
                      </motion.button>
                    </div>
 
                    {/* Right: Interactive Price & Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {editingPriceItemId === item.id ? (
                        <div className="relative w-16">
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-bold">฿</span>
                          <input 
                            type="number" 
                            step="0.1" 
                            className="h-7 w-full text-[11.5px] font-bold bg-card pl-3.5 pr-1 border border-primary rounded-lg outline-none text-right focus:ring-1 focus:ring-primary text-foreground"
                            value={item.price}
                            onChange={(e) => updateCartItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                            onBlur={() => setEditingPriceItemId(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Escape") {
                                setEditingPriceItemId(null);
                              }
                            }}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingPriceItemId(item.id)}
                          className="text-right px-1.5 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer shrink-0"
                          title="Click to edit unit price"
                        >
                          <p className="text-[13px] font-extrabold text-foreground">฿{(item.price * item.quantity).toFixed(2)}</p>
                          {item.price !== item.basePrice && (
                            <p className="text-[8px] font-semibold text-amber-600 line-through">฿{(item.basePrice * item.quantity).toFixed(2)}</p>
                          )}
                        </button>
                      )}
                      <motion.button 
                        whileTap={{ scale: 0.9 }}
                        onClick={() => removeFromCart(item.id)}
                        className="text-muted-foreground/60 hover:text-red-500 transition-colors p-1 shrink-0 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 size={12} />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 opacity-40">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <ShoppingCart size={24} className="text-muted-foreground" />
                  </div>
                  <p className="text-xs font-bold text-foreground">Cart is empty</p>
                  <p className="text-[10px] font-medium text-muted-foreground max-w-[160px] mt-1">Select products from the catalog to build an order.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
 
          {/* Surcharge / Rate Settings Block */}
          {!cart.some(item => item.id === "topup-member-item") && (
            <div className="px-4 py-3 bg-muted/30 border-t border-border space-y-2.5 shrink-0">
              {isMemberRate && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-800 text-[10px] text-emerald-700 dark:text-emerald-300 font-bold tracking-tight"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  Member Rate Active (Discounted prices applied)
                </motion.div>
              )}
   
              {!isStandardPlan && (
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Rate Mode</Label>
                  <div className="flex bg-muted rounded-xl p-0.5 border border-border">
                    <button
                      type="button"
                      onClick={() => setIsMemberRate(false)}
                      className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${!isMemberRate ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMemberRate(true)}
                      className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${isMemberRate ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-500 hover:text-emerald-605"}`}
                    >
                      Member
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Zap size={10} className="text-purple-500" /> Express
                </Label>
                <div className="flex bg-muted rounded-xl p-0.5 border border-border">
                  <button
                    type="button"
                    onClick={() => setServiceSpeed("standard")}
                    className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${serviceSpeed === "standard" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Std
                  </button>
                  {rate1Num !== null && rate1Num > 0 && (
                    <button
                      type="button"
                      onClick={() => setServiceSpeed("express_rate1")}
                      className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${serviceSpeed === "express_rate1" || (serviceSpeed === "express_50" && rate1Num === 50) || (serviceSpeed === "express_100" && rate1Num === 100) ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Exp {rate1Num}%
                    </button>
                  )}
                  {rate2Num !== null && rate2Num > 0 && (
                    <button
                      type="button"
                      onClick={() => setServiceSpeed("express_rate2")}
                      className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${serviceSpeed === "express_rate2" || (serviceSpeed === "express_50" && rate2Num === 50) || (serviceSpeed === "express_100" && rate2Num === 100) ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Exp {rate2Num}%
                    </button>
                  )}
                  {rate3Num !== null && rate3Num > 0 && (
                    <button
                      type="button"
                      onClick={() => setServiceSpeed("express_rate3")}
                      className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${serviceSpeed === "express_rate3" || (serviceSpeed === "express_50" && rate3Num === 50) || (serviceSpeed === "express_100" && rate3Num === 100) ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Exp {rate3Num}%
                    </button>
                  )}
                  {/* Fallback rendering for legacy rates if they don't match configured rates but are selected */}
                  {serviceSpeed === "express_50" && rate1Num !== 50 && rate2Num !== 50 && rate3Num !== 50 && (
                    <button
                      type="button"
                      className="px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all bg-purple-600 text-white shadow-sm"
                    >
                      Exp 50%
                    </button>
                  )}
                  {serviceSpeed === "express_100" && rate1Num !== 100 && rate2Num !== 100 && rate3Num !== 100 && (
                    <button
                      type="button"
                      className="px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all bg-purple-600 text-white shadow-sm"
                    >
                      Exp 100%
                    </button>
                  )}
                </div>
              </div>

              {/* วันที่นัดรับผ้า */}
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <CalendarIcon size={10} className="text-blue-500" /> {currentLanguage === "en" ? "Collection Date" : "วันที่นัดรับผ้า"}
                </Label>
                <div className="flex items-center gap-1 mt-0.5 max-w-[210px] w-full">
                  {/* Date Selector */}
                  <div className="relative flex-1 group">
                    <input
                      type="date"
                      value={deliveryScheduledTime ? deliveryScheduledTime.split('T')[0] : ""}
                      onChange={(e) => {
                        const newDateVal = e.target.value;
                        if (newDateVal) {
                          const timePart = deliveryScheduledTime ? deliveryScheduledTime.split('T')[1] : "00:00";
                          const [hour, minute] = (timePart || "00:00").split(":");
                          setDeliveryScheduledTime(`${newDateVal}T${hour || "00"}:${minute || "00"}`);
                        }
                      }}
                      onClick={(e) => {
                        try {
                          (e.currentTarget as any).showPicker();
                        } catch (err) {}
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <div className="px-2 py-0.5 text-[10px] font-bold rounded-lg border border-border bg-card text-foreground flex justify-between items-center w-full group-hover:border-primary/50 transition-colors h-7">
                      <span>{formatDateTimeLocalString(deliveryScheduledTime).split(" ")[0]}</span>
                      <CalendarIcon size={10} className="text-muted-foreground ml-1 shrink-0" />
                    </div>
                  </div>

                  {/* Hour Selector */}
                  <select
                    value={deliveryScheduledTime && deliveryScheduledTime.includes('T') ? deliveryScheduledTime.split('T')[1].split(':')[0] : "00"}
                    onChange={(e) => {
                      const newHour = e.target.value;
                      const datePart = deliveryScheduledTime ? deliveryScheduledTime.split('T')[0] : "";
                      const timePart = deliveryScheduledTime ? deliveryScheduledTime.split('T')[1] : "00:00";
                      const minute = timePart ? timePart.split(':')[1] : "00";
                      setDeliveryScheduledTime(`${datePart}T${newHour}:${minute}`);
                    }}
                    className="h-7 text-[10px] font-bold rounded-lg border border-border bg-card text-foreground px-1 focus:ring-1 focus:ring-primary outline-none shrink-0 w-[42px] cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {validHours.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>

                  <span className="text-muted-foreground font-bold text-[10px] shrink-0">:</span>

                  {/* Minute Selector */}
                  <select
                    value={deliveryScheduledTime && deliveryScheduledTime.includes('T') ? deliveryScheduledTime.split('T')[1].split(':')[1] : "00"}
                    onChange={(e) => {
                      const newMinute = e.target.value;
                      const datePart = deliveryScheduledTime ? deliveryScheduledTime.split('T')[0] : "";
                      const timePart = deliveryScheduledTime ? deliveryScheduledTime.split('T')[1] : "00:00";
                      const hour = timePart ? timePart.split(':')[0] : "00";
                      setDeliveryScheduledTime(`${datePart}T${hour}:${newMinute}`);
                    }}
                    className="h-7 text-[10px] font-bold rounded-lg border border-border bg-card text-foreground px-1 focus:ring-1 focus:ring-primary outline-none shrink-0 w-[42px] cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {validMinutes.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
 
          {/* Delivery & Pickup Service Option (Enabled via Shop Settings) */}
          {isDeliveryEnabled && !cart.some(item => item.id === "topup-member-item") && (
            <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-3">
                {/* Option 1: Pickup & Delivery */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="delivery-both"
                    checked={deliveryServiceType === "both"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCart(prev => {
                          const filtered = prev.filter(item => item.id !== "delivery-only-service-item" && item.id !== "delivery-pickup-service-item");
                          const price = parseFloat(localDeliveryPrice) || 0;
                          return [...filtered, {
                            id: "delivery-pickup-service-item",
                            name: "บริการรับ-ส่ง",
                            nameEn: "Pickup & Delivery Service",
                            price: price,
                            basePrice: price,
                            quantity: 1
                          }];
                        });
                      } else {
                        setCart(prev => prev.filter(item => item.id !== "delivery-pickup-service-item"));
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <label htmlFor="delivery-both" className="text-[11px] font-bold text-foreground cursor-pointer whitespace-nowrap">
                    {currentLanguage === "en" ? "Pickup & Delivery" : "บริการรับ-ส่ง"}
                  </label>
                </div>

                {/* Option 2: Delivery Only */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="delivery-only"
                    checked={deliveryServiceType === "delivery_only"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCart(prev => {
                          const filtered = prev.filter(item => item.id !== "delivery-only-service-item" && item.id !== "delivery-pickup-service-item");
                          const price = parseFloat(localDeliveryPrice) || 0;
                          return [...filtered, {
                            id: "delivery-only-service-item",
                            name: "บริการส่ง",
                            nameEn: "Delivery Service",
                            price: price,
                            basePrice: price,
                            quantity: 1
                          }];
                        });
                      } else {
                        setCart(prev => prev.filter(item => item.id !== "delivery-only-service-item"));
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <label htmlFor="delivery-only" className="text-[11px] font-bold text-foreground cursor-pointer whitespace-nowrap">
                    {currentLanguage === "en" ? "Delivery" : "บริการส่ง"}
                  </label>
                </div>
              </div>

              {/* Price Input (Visible when any delivery type is selected) */}
              {deliveryServiceType && (
                <div className="relative max-w-[80px] w-full shrink-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">฿</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={localDeliveryPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLocalDeliveryPrice(val);
                      const price = parseFloat(val) || 0;
                      setCart(prev => prev.map(item => {
                        if (item.id === "delivery-pickup-service-item" || item.id === "delivery-only-service-item") {
                          return { ...item, price, basePrice: price };
                        }
                        return item;
                      }));
                    }}
                    className="w-full h-7 pl-5 pr-1.5 text-[11px] bg-card border border-border rounded-lg outline-none focus:border-primary font-bold text-foreground text-right"
                  />
                </div>
              )}
            </div>
          )}

          {/* Special Remarks Block */}
          <div className="px-4 py-2 bg-muted/30 border-t border-border space-y-1.5 shrink-0">
            <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Special Remarks</Label>
            <input
              type="text"
              placeholder="e.g. Stain on sleeve, express delivery..."
              className="w-full h-8 text-[11px] px-3 bg-card border border-border rounded-lg outline-none focus:border-primary placeholder:text-muted-foreground font-semibold text-foreground"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
 
          {/* Payment Settings Block */}
          <div className="px-4 py-3 bg-muted/30 border-t border-border shrink-0">
            <div className="grid grid-cols-2 gap-4">
              {/* Column 1 */}
              <div className="space-y-3">
                {/* Row 1: Payment Status */}
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Status</Label>
                  <div className="flex bg-muted rounded-xl p-0.5 border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaid(true);
                      }}
                      className={`px-3 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${isPaid ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      PAID
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaid(false);
                      }}
                      className={`px-3 py-0.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${!isPaid ? "bg-amber-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      UNPAID
                    </button>
                  </div>
                </div>

                {/* Row 2: Method (Only shown when PAID) */}
                {isPaid && (
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Method</Label>
                    <div className="flex bg-muted rounded-xl p-0.5 border border-border">
                      {(selectedCustomer && !isStandardPlan ? ["cash", "transfer", "card", "credit"] : ["cash", "transfer", "card"]).map((m) => {
                        const active = paymentMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m as any)}
                            className={`px-2.5 py-0.5 text-[9px] font-bold rounded-lg transition-all capitalize cursor-pointer ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {m === "credit" ? "Member" : m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2 */}
              <div className="h-full flex flex-col justify-start">
                <AnimatePresence mode="wait">
                  {isPaid && paymentMethod === "cash" && (
                    <motion.div
                      key="cash-panel"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-2 text-xs w-full"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          {currentLanguage === "en" ? "Received Cash" : "รับเงินมา"}
                        </Label>
                        <div className="relative w-32 shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">฿</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            className="h-8 text-[11px] font-bold bg-card pl-6 pr-2 border border-border rounded-lg outline-none focus:border-primary text-right w-full text-foreground"
                            value={receivedCash}
                            onChange={(e) => setReceivedCash(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Suggestions Shortcuts */}
                      <div className="flex flex-wrap gap-1 justify-end w-full mt-2">
                        {getCashSuggestions(total).map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => setReceivedCash(sug.toString())}
                            className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap shadow-sm ${
                              parseFloat(receivedCash) === sug
                                ? "bg-primary text-white border-primary shadow-sm shadow-primary/20 scale-95"
                                : "bg-card text-foreground hover:bg-muted border-border hover:border-slate-300 dark:hover:border-slate-700"
                            }`}
                          >
                            {sug === total ? (currentLanguage === "en" ? "Exact" : "พอดี") : `฿${sug}`}
                          </button>
                        ))}
                      </div>

                      {/* Calculation Output / Warnings */}
                      {receivedCash && !isNaN(parseFloat(receivedCash)) && (
                        <div className="pt-2 border-t border-dashed border-border flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {parseFloat(receivedCash) >= total 
                              ? (currentLanguage === "en" ? "Change" : "เงินทอน") 
                              : (currentLanguage === "en" ? "Warning" : "คำเตือน")}
                          </span>
                          {parseFloat(receivedCash) >= total ? (
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 animate-fade-in">
                              ฿{(parseFloat(receivedCash) - total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-sm font-black text-rose-500 dark:text-rose-400 animate-pulse text-right">
                              {currentLanguage === "en" 
                                ? `Short by ฿${(total - parseFloat(receivedCash)).toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
                                : `ขาดอีก ฿${(total - parseFloat(receivedCash)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {isPaid && paymentMethod === "credit" && selectedCustomer && (
                    <motion.div
                      key="credit-panel"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2.5 rounded-xl border border-emerald-500/20 font-bold"
                    >
                      {currentLanguage === "en" ? "Current Balance" : "ยอดเงินปัจจุบัน"}: ฿{(selectedCustomer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      <br />
                      {(selectedCustomer.creditBalance || 0) >= total ? (
                        <span>
                          {currentLanguage === "en" ? "Remaining Balance" : "ยอดคงเหลือหลังชำระ"}: ฿{((selectedCustomer.creditBalance || 0) - total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-rose-500 dark:text-rose-400 font-extrabold">
                          {currentLanguage === "en"
                            ? `Insufficient Balance (Short by ฿${(total - (selectedCustomer.creditBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })})`
                            : `ยอดเงินไม่เพียงพอ (ขาดอีก ฿${(total - (selectedCustomer.creditBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
                        </span>
                      )}
                    </motion.div>
                  )}

                  {isPaid && paymentMethod === "transfer" && settings?.enablePromptPay === "true" && (
                    <motion.div
                      key="transfer-panel"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="w-full flex flex-col items-center bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 space-y-4 text-left"
                    >
                      {promptpayConfig ? (
                        <>
                          {/* PromptPay Branding Header */}
                          <div className="w-full flex items-center justify-between bg-[#193F72] text-white px-4 py-2 rounded-xl select-none">
                            <span className="text-[12px] font-extrabold tracking-wider">Prompt Pay</span>
                            <span className="text-[9px] font-semibold opacity-80">THAI QR PAYMENT</span>
                          </div>

                          {/* QR Code display */}
                          {promptpayPayload ? (
                            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-md flex flex-col items-center select-none">
                              <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(promptpayPayload)}`} 
                                alt="PromptPay QR Code"
                                className="w-40 h-40 object-contain select-none"
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-rose-500 font-bold py-4">
                              {currentLanguage === "en" ? "Invalid PromptPay ID format" : "รูปแบบหมายเลข PromptPay ไม่ถูกต้อง"}
                            </div>
                          )}

                          {/* Amount and Account Details */}
                          <div className="w-full text-center space-y-1.5 pt-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest select-none">
                              {currentLanguage === "en" ? "Transfer Amount" : "ยอดเงินโอน"}
                            </div>
                            <div className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                              ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            
                            <div className="flex flex-col gap-0.5 mt-2 bg-card rounded-lg p-2 border border-border text-left">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-muted-foreground">ID:</span>
                                <span className="font-bold text-foreground font-mono">{promptpayConfig.id}</span>
                              </div>
                              {promptpayConfig.name && (
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-muted-foreground">{currentLanguage === "en" ? "Account:" : "ชื่อบัญชี:"}</span>
                                  <span className="font-bold text-foreground truncate max-w-[120px]" title={promptpayConfig.name}>
                                    {promptpayConfig.name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                          <ShieldAlert size={28} className="text-amber-500 shrink-0" />
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {currentLanguage === "en" ? "PromptPay Not Configured" : "ยังไม่ได้ตั้งค่า PromptPay"}
                          </div>
                          <p className="text-[9px] text-muted-foreground max-w-[180px]">
                            {currentLanguage === "en" 
                              ? "Configure PromptPay details in the Settings tab to display dynamic payment QR codes here." 
                              : "กรุณาตั้งค่าหมายเลข PromptPay ในแถบ Settings เพื่อแสดง QR Code จ่ายเงินอัตโนมัติ"}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

            {/* Checkout Totals Summary Block */}
            <div className="p-4 bg-card border-t border-border space-y-2 shrink-0">
              {serviceSpeed !== "standard" && (
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-bold text-foreground">฿{subtotal.toFixed(2)}</span>
                </div>
              )}

              {expressSurcharge > 0 && (
                <div className="flex justify-between text-xs font-semibold text-purple-600 dark:text-purple-400 items-center">
                  <span className="flex items-center gap-1">
                    <Zap size={11} className="fill-purple-600 text-purple-650 shrink-0 animate-pulse" />
                    Express Surcharge ({selectedExpressPercent}%)
                  </span>
                  <span className="font-bold">+฿{expressSurcharge.toFixed(2)}</span>
                </div>
              )}

              {vatType === "exclusive" && vatRate > 0 && (
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>VAT ({vatRate}%)</span>
                  <span className="font-bold text-foreground">+฿{vatAmount.toFixed(2)}</span>
                </div>
              )}

              {vatType === "inclusive" && vatRate > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span>
                    {currentLanguage === "en" ? `Incl. VAT ${vatRate}%` : `รวม VAT ${vatRate}%`}
                  </span>
                  <span>฿{vatAmount.toFixed(2)}</span>
                </div>
              )}


 
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <span className="text-xs font-black text-foreground uppercase tracking-wider">Total</span>
              <div className="text-right">
                <span className="text-xl font-black text-foreground tracking-tight">฿{total.toFixed(2)}</span>
              </div>
            </div>
 
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline"
                disabled={cart.length === 0 || isProcessing}
                onClick={async () => {
                  playAudioFeedback("click");
                  if (!proformaReceiptNumber) {
                    const shopId = activeShop?.id || "default";
                    const proformaKey = `proformaSeq_${shopId}`;
                    const currentSeq = parseInt(settings?.[proformaKey] || "0", 10);
                    const nextSeq = currentSeq + 1;
                    await settingsStore.updateSetting(proformaKey, String(nextSeq));
                    
                    let branchCode = "";
                    if (activeShop?.name) {
                      const getInitials = (name: string) => {
                        const words = name.trim().split(/\s+/);
                        if (words.length > 1) {
                          return words.map(w => w.charAt(0)).join("").toUpperCase();
                        }
                        return name.substring(0, 3).toUpperCase();
                      };
                      
                      const myInitials = getInitials(activeShop.name);
                      const isDuplicate = shops.some(s => s.id !== activeShop.id && getInitials(s.name) === myInitials);
                      
                      if (isDuplicate) {
                        const suffix = (activeShop.id || "").slice(-3).toUpperCase();
                        branchCode = `${myInitials}${suffix}`;
                      } else {
                        branchCode = myInitials;
                      }
                    }
                    if (!branchCode || branchCode.length < 2) {
                      branchCode = (activeShop?.id || "PR").split("-")[0].toUpperCase();
                    }
                    
                    setProformaReceiptNumber(`PR-${branchCode}-${String(nextSeq).padStart(5, "0")}`);
                  }
                  setIsDraftPreview(true);
                  setShowReceipt(true);
                }}
                className="flex-1 h-11 rounded-xl text-xs font-bold transition-all border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center gap-1.5 cursor-pointer"
                title={currentLanguage === "en" ? "Preview Proforma Receipt before recording sale" : "ดูตัวอย่างใบรับเงินชั่วคราวก่อนบันทึกการขาย"}
              >
                <Eye size={14} />
                {currentLanguage === "en" ? "Proforma Receipt" : "ใบรับเงินชั่วคราว"}
              </Button>
 
              <Button 
                disabled={
                  isProcessing || 
                  !!(isPaid && paymentMethod === "credit" && selectedCustomer && (selectedCustomer.creditBalance || 0) < total) ||
                  !!(isPaid && paymentMethod === "cash" && (!receivedCash || isNaN(parseFloat(receivedCash)) || parseFloat(receivedCash) < total))
                }
                onClick={handleCheckout}
                className={`flex-[2] h-11 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 border-none text-white cursor-pointer ${
                  isPaid 
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/20" 
                    : "bg-primary hover:bg-primary/90 shadow-brand/20"
                }`}
              >
                {isProcessing ? (
                  <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-4 h-4 border-2 border-muted border-t-white rounded-full"
                  />
                ) : (
                  <>
                    {isPaid ? (
                      <>
                        <Banknote size={14} />
                        <span>Pay ฿{total.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <CreditCard size={14} />
                        <span>Record Unpaid Order</span>
                      </>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </aside>
      </div> {/* Closing Main Body Layout */}

      {/* Thermal Receipt Preview Dialog */}
      <Dialog open={showReceipt} onOpenChange={(open) => {
        setShowReceipt(open);
        if (!open) {
          setIsDraftPreview(false);
          setLatestJob(null);
        }
      }}>
        {(() => {
          const paperSize = settings?.receiptPaperSize || "80mm";
          const isSmall = paperSize === "58mm";
          return (
            <DialogContent className={`${isSmall ? "max-w-[260px]" : "max-w-[320px]"} max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl bg-neutral-900 dark:bg-neutral-950 font-mono`}>
              <div className="p-4 print:p-0 flex flex-col items-center">
                {/* Thermal Receipt Container with tactile paper styling */}
                <div data-paper-size={paperSize} className={`printable-receipt ${isSmall ? "w-[220px]" : "w-[280px]"} bg-white text-zinc-800 ${isSmall ? "p-3.5 pt-5 pb-5 text-[8.5px]" : "p-5 pt-7 pb-7 text-[10px]"} shadow-2xl rounded-sm border border-neutral-300/60 space-y-4 relative overflow-hidden text-left`}>
                  
                  {/* Jagged tear effect top */}
                  <div className="absolute top-0 left-0 right-0 h-[6px] overflow-hidden select-none pointer-events-none print:hidden !mt-0">
                    <svg className="w-full h-full text-neutral-900 dark:text-neutral-950 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
                      <polygon points="0,0 2.5,10 5,0 7.5,10 10,0 12.5,10 15,0 17.5,10 20,0 22.5,10 25,0 27.5,10 30,0 32.5,10 35,0 37.5,10 40,0 42.5,10 45,0 47.5,10 50,0 52.5,10 55,0 57.5,10 60,0 62.5,10 65,0 67.5,10 70,0 72.5,10 75,0 77.5,10 80,0 82.5,10 85,0 87.5,10 90,0 92.5,10 95,0 97.5,10 100,0 100,0 0,0" />
                    </svg>
                  </div>

                  {/* Jagged tear effect bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-[6px] overflow-hidden select-none pointer-events-none print:hidden !mt-0">
                    <svg className="w-full h-full text-neutral-900 dark:text-neutral-950 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
                      <polygon points="0,10 2.5,0 5,10 7.5,0 10,10 12.5,0 15,10 17.5,0 20,10 22.5,0 25,10 27.5,0 30,10 32.5,0 35,10 37.5,0 40,10 42.5,0 45,10 47.5,0 50,10 52.5,0 55,10 57.5,0 60,10 62.5,0 65,10 67.5,0 70,10 72.5,0 75,10 77.5,0 80,10 82.5,0 85,10 87.5,0 90,10 92.5,0 95,10 97.5,0 100,10 100,10 0,10" />
                    </svg>
                  </div>

                  {/* Diagonal Void Stamp */}
                  {receiptData.status === "cancel" && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
                      <div className="border-[5px] border-double border-red-500 text-red-500 font-sans font-black text-2xl px-3 py-1.5 rounded-lg uppercase tracking-widest -rotate-12 opacity-20">
                        {currentLanguage === "en" ? "VOIDED" : "ยกเลิกแล้ว"}
                      </div>
                    </div>
                  )}

                  {/* Draft Preview Header Watermark */}
                  {receiptData.isDraft && (
                    <div className="absolute inset-x-0 top-3.5 flex justify-center print:hidden">
                      <span className="bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 font-sans font-bold text-[8px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm border border-purple-200 dark:border-purple-900">
                        {currentLanguage === "en" ? "PROFORMA RECEIPT" : "ใบรับเงินชั่วคราว"}
                      </span>
                    </div>
                  )}

                  {/* Receipt Header */}
                  <div className="text-center space-y-1 pt-3">
                    {receiptData.status === "cancel" && (
                      <div className="bg-red-50 text-red-700 font-sans font-black text-[9px] py-1 px-2 rounded uppercase tracking-wider mb-2 border border-red-200 inline-block">
                        {currentLanguage === "en" ? "VOID / CANCELLED SLIP" : "ใบยกเลิกรายการ / คืนเงิน"}
                      </div>
                    )}
                    {activeShop?.logoUrl && (
                      <div className="flex justify-center mb-2">
                        <img 
                          src={activeShop.logoUrl} 
                          alt="Shop Logo" 
                          className="h-10 w-10 object-contain rounded-md filter contrast-125 mix-blend-multiply" 
                        />
                      </div>
                    )}
                    <h3 className={`${isSmall ? "text-[10px]" : "text-xs"} font-black tracking-tight text-neutral-900 uppercase`}>
                      {activeShop?.name || "That Laundry Shop"}
                    </h3>
                    <p className={`${isSmall ? "text-[8px]" : "text-[9px]"} text-neutral-600 font-medium`}>{activeShop?.address || "123 Sukhumvit Road, Bangkok"}</p>
                    <p className={`${isSmall ? "text-[8px]" : "text-[9px]"} text-neutral-600 font-medium`}>Tel: {activeShop?.phone || "081-111-2222"}</p>
                    {activeShop?.taxId && (
                      <p className={`${isSmall ? "text-[7.5px]" : "text-[8.5px]"} text-neutral-600 font-bold uppercase tracking-tight`}>TAX ID: {activeShop.taxId}</p>
                    )}
                    <div className="border-t border-dashed border-neutral-400/50 my-2" />
                  </div>

                  {/* Order Info */}
                  <div className="space-y-1 text-neutral-700">
                    <div className="flex justify-between font-bold text-neutral-900">
                      <span>{receiptData.isDraft ? (currentLanguage === "en" ? "PROFORMA NO:" : "เลขที่ใบชั่วคราว:") : "RECEIPT NO:"}</span>
                      <span>{receiptData.isDraft ? receiptData.id : `#${receiptData.id}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DATE:</span>
                      <span>{format(receiptData.createdAt, "dd/MM/yyyy HH:mm")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CUSTOMER:</span>
                      <span className="truncate max-w-[120px] font-bold text-neutral-900">{receiptData.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PHONE:</span>
                      <span>{receiptData.customerPhone}</span>
                    </div>
                    {receiptData.deliveryScheduledAt && (() => {
                      const isEdited = isCollectionDateEdited(receiptData.createdAt, receiptData.deliveryScheduledAt);
                      return (
                        <div className="flex justify-between">
                          <span>DUE DATE{isEdited ? " (EDIT)" : ""}:</span>
                          <span className="font-bold text-purple-700 bg-purple-50 px-1 rounded">{format(new Date(receiptData.deliveryScheduledAt), "dd/MM/yyyy HH:mm")}</span>
                        </div>
                      );
                    })()}
                    <div className="border-t border-dashed border-neutral-400/50 my-2" />
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 text-neutral-700">
                    <div className="flex font-bold text-neutral-900">
                      <span className="flex-1 min-w-0">ITEM</span>
                      <span className="w-12 text-center">QTY</span>
                      <span className="w-16 text-right">TOTAL</span>
                    </div>
                    {receiptData.items.map((item: any, idx: number) => {
                      const rawName = (currentLanguage === "en" && item.nameEn) ? item.nameEn : item.name;
                      const maxLen = isSmall ? 22 : 32;
                      const displayItemName = rawName.length > maxLen ? rawName.slice(0, maxLen - 3) + "..." : rawName;
                      return (
                        <div key={idx} className={`flex ${isSmall ? "text-[8px]" : "text-[9px]"} leading-tight`}>
                          <span className="flex-1 min-w-0 truncate pr-4">{displayItemName}</span>
                          <span className="w-12 text-center">{item.quantity}</span>
                          <span className="w-16 text-right">฿{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <div className="border-t border-dashed border-neutral-400/50 my-2" />
                  </div>

                  {/* Totals Calculation */}
                  <div className="space-y-1 text-neutral-700">
                    <div className="flex justify-between">
                      <span>SUBTOTAL:</span>
                      <span>฿{receiptData.subtotal.toFixed(2)}</span>
                    </div>
                    {receiptData.expressSurcharge > 0 && (
                      <div className="flex justify-between text-purple-700 font-bold">
                        <span>EXPRESS ({receiptData.serviceSpeed && receiptData.serviceSpeed.startsWith("express_") ? `${receiptData.serviceSpeed.split("_")[1]}%` : ""}):</span>
                        <span>+฿{receiptData.expressSurcharge.toFixed(2)}</span>
                      </div>
                    )}
                    {receiptData.vatType === "exclusive" && receiptData.vatRate > 0 && (
                      <div className="flex justify-between text-neutral-700 font-bold">
                        <span>VAT ({receiptData.vatRate}%)</span>
                        <span>+฿{receiptData.vatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {receiptData.vatType === "inclusive" && receiptData.vatRate > 0 && (
                      <div className="flex justify-between text-emerald-700 font-bold">
                        <span>{currentLanguage === "en" ? `Incl. VAT ${receiptData.vatRate}%` : `รวม VAT ${receiptData.vatRate}%`}</span>
                        <span>฿{receiptData.vatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {receiptData.discount > 0 && (
                      <div className="flex justify-between text-rose-700 font-bold">
                        <span>MANUAL ADJUST:</span>
                        <span>-฿{receiptData.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className={`flex justify-between font-black text-neutral-900 ${isSmall ? "text-[11px]" : "text-xs"} pt-1 border-t border-neutral-450/40`}>
                      <span>GRAND TOTAL:</span>
                      <span>฿{receiptData.total.toFixed(2)}</span>
                    </div>

                    {/* Payments List Breakdown on Receipt */}
                    {(() => {
                      let payments: any[] = [];
                      try {
                        if (receiptData.adminNotesJson) {
                          const parsed = JSON.parse(receiptData.adminNotesJson);
                          if (parsed && Array.isArray(parsed.payments)) {
                            payments = parsed.payments;
                          }
                        }
                      } catch (e) {}

                      if (payments.length === 0) return null;
                      return (
                        <div className="space-y-1 pt-1.5 border-t border-dashed border-neutral-400/50 text-neutral-700">
                          {payments.map((p: any, pIdx: number) => (
                            <div key={pIdx} className="space-y-0.5">
                              <div className={`flex ${isSmall ? "text-[7.5px]" : "text-[8.5px]"} leading-tight font-mono`}>
                                <span className="flex-1 truncate uppercase pr-2">
                                  {format(new Date(p.timestamp), "dd/MM/yyyy")} - PAID ({p.method === "credit" ? "MEMBER" : p.method}):
                                </span>
                                <span className="font-bold">฿{p.amount.toFixed(2)}</span>
                              </div>
                              {p.method === "cash" && p.received !== undefined && p.received > 0 && (
                                <div className={`flex ${isSmall ? "text-[7px] pl-4 text-neutral-500" : "text-[8px] pl-4 text-neutral-500"} leading-tight font-mono`}>
                                  <span className="flex-1">
                                    {currentLanguage === "en" ? "- Cash Received:" : "- รับเงินสด:"}
                                  </span>
                                  <span>฿{p.received.toFixed(2)}</span>
                                </div>
                              )}
                              {p.method === "cash" && p.change !== undefined && p.change > 0 && (
                                <div className={`flex ${isSmall ? "text-[7px] pl-4 text-neutral-500" : "text-[8px] pl-4 text-neutral-500"} leading-tight font-mono`}>
                                  <span className="flex-1">
                                    {currentLanguage === "en" ? "- Change Returned:" : "- เงินทอน:"}
                                  </span>
                                  <span>฿{p.change.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className={`flex justify-between font-black text-neutral-900 ${isSmall ? "text-[8.5px]" : "text-[9.5px]"} pt-0.5 border-t border-dashed border-neutral-400/30`}>
                            <span>TOTAL PAID:</span>
                            <span>฿{payments.reduce((s: number, pay: any) => s + pay.amount, 0).toFixed(2)}</span>
                          </div>
                          {!receiptData.isPaid && (
                            <div className={`flex justify-between font-black text-rose-700 ${isSmall ? "text-[9px]" : "text-[10px]"}`}>
                              <span>BALANCE DUE:</span>
                              <span>฿{(receiptData.total - payments.reduce((s: number, pay: any) => s + pay.amount, 0)).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="border-t border-dashed border-neutral-400/50 my-2" />
                  </div>

                  {/* Payment & Remarks */}
                  <div className="space-y-1.5 text-center flex flex-col items-center">
                    {receiptData.status === "cancel" ? (
                      <div className={`${isSmall ? "text-[8.5px] py-0.5 px-2.5" : "text-[10px] py-1 px-3"} bg-red-100/80 text-red-800 border-red-300 font-black rounded-md inline-block uppercase border`}>
                        {currentLanguage === "en" ? "VOIDED / REFUNDED" : "ยกเลิกและคืนเงินแล้ว"}
                      </div>
                    ) : (() => {
                      let payments: any[] = [];
                      try {
                        if (receiptData.adminNotesJson) {
                          const parsed = JSON.parse(receiptData.adminNotesJson);
                          if (parsed && Array.isArray(parsed.payments)) {
                            payments = parsed.payments;
                          }
                        }
                      } catch (e) {}
                      const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0);

                      if (receiptData.isPaid) {
                        return (
                          <div className={`${isSmall ? "text-[8.5px] py-0.5 px-2.5" : "text-[10px] py-1 px-3"} bg-emerald-100/80 text-emerald-800 border-emerald-300/50 font-black rounded-md inline-block uppercase border`}>
                            {currentLanguage === "en" ? `PAID (${receiptData.paymentChannel || "CASH"})` : `ชำระเงินแล้ว (${receiptData.paymentChannel || "CASH"})`}
                          </div>
                        );
                      } else if (totalPaid > 0) {
                        return (
                          <div className={`${isSmall ? "text-[8.5px] py-0.5 px-2.5" : "text-[10px] py-1 px-3"} bg-amber-100/80 text-amber-800 border-amber-300/50 font-black rounded-md inline-block uppercase border`}>
                            {currentLanguage === "en" ? `PARTIAL PAID (฿${totalPaid.toFixed(2)})` : `จ่ายมัดจำแล้ว (฿${totalPaid.toFixed(2)})`}
                          </div>
                        );
                      } else {
                        return (
                          <div className={`${isSmall ? "text-[8.5px] py-0.5 px-2.5" : "text-[10px] py-1 px-3"} bg-red-100/80 text-red-800 border-red-300/50 font-black rounded-md inline-block uppercase border`}>
                            {currentLanguage === "en" ? "UNPAID - PAY ON PICKUP" : "ยังไม่ชำระ - จ่ายตอนรับผ้า"}
                          </div>
                        );
                      }
                    })()}
                    {cleanRemarkForDisplay(receiptData.remark) && (
                      <div className={`${isSmall ? "text-[8px] p-1" : "text-[9px] p-1.5"} text-neutral-600 font-medium text-left mt-2 bg-zinc-50 rounded border border-neutral-300 w-full leading-tight`}>
                        <span className="font-bold text-neutral-800">REMARK:</span> {cleanRemarkForDisplay(receiptData.remark)}
                      </div>
                    )}
                  </div>

                  {/* Barcode/Footer */}
                  <div className="text-center pt-2 space-y-2">
                    <div className="flex flex-col items-center justify-center">
                      <div className={`flex items-center justify-center h-8 ${isSmall ? "w-36" : "w-44"} bg-transparent opacity-85 my-1`}>
                        {/* Simulated barcode lines */}
                        {Array.from({ length: 32 }).map((_, idx) => {
                          const isThick = (idx % 3 === 0 && idx % 2 === 0) || idx === 11 || idx === 17 || idx === 23;
                          const spacing = idx % 4 === 0 ? "mr-[2px]" : "mr-[1px]";
                          return (
                            <span 
                              key={idx} 
                              className={`h-full bg-black inline-block ${spacing}`} 
                              style={{
                                width: isThick ? "2px" : "0.8px",
                                backgroundColor: "black",
                                WebkitPrintColorAdjust: "exact",
                                printColorAdjust: "exact"
                              }}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[8px] text-neutral-500 font-mono tracking-[4px] mt-1 uppercase">
                        {receiptData.isDraft ? receiptData.id : (receiptData.status === "cancel" ? `${receiptData.id}-VOID` : receiptData.id)}
                      </span>
                    </div>
                    <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">
                      {receiptData.isDraft 
                        ? (currentLanguage === "en" ? "Proforma Receipt only" : "เอกสารใบรับเงินชั่วคราวเท่านั้น")
                        : (receiptData.status === "cancel" 
                            ? (currentLanguage === "en" ? "This order has been cancelled" : "รายการสั่งซื้อนี้ถูกยกเลิกแล้ว")
                            : "Thank you for using our service!")}
                    </p>
                  </div>
                </div>

                {/* Print and Close buttons */}
                <div className="w-full flex gap-3 mt-4 print:hidden">
                  <Button 
                    onClick={() => {
                      window.print();
                    }}
                    className="flex-1 bg-neutral-800 text-white font-bold h-10 rounded-xl hover:bg-neutral-700 text-xs border-none cursor-pointer"
                  >
                    Print {receiptData.isDraft ? (currentLanguage === "en" ? "Proforma" : "ใบชั่วคราว") : (receiptData.status === "cancel" ? (currentLanguage === "en" ? "Void Slip" : "ใบยกเลิก") : "Receipt")}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowReceipt(false);
                      setIsDraftPreview(false);
                      setLatestJob(null);
                    }}
                    className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-white font-bold h-10 rounded-xl text-xs cursor-pointer"
                  >
                    {receiptData.isDraft ? "Close" : "Done"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>      {/* Close Cashier Shift Report Dialog */}
      <Dialog open={isCloseShiftOpen} onOpenChange={setIsCloseShiftOpen}>
        <DialogContent className="max-w-md p-5 bg-card border border-border shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-3">
            <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
              <Banknote className="text-red-500" size={18} />
              {currentLanguage === "en" ? "Close Cashier Shift & Drawer Report" : "รายงานปิดกะพนักงานและลิ้นชักเงินสด"}
            </DialogTitle>
          </DialogHeader>

          {activeShift && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!activeShift) return;
              const cashVal = parseFloat(actualCash);
              if (isNaN(cashVal) || cashVal < 0) {
                toast.error(
                  currentLanguage === "en"
                    ? "Please enter a valid actual cash amount (must be at least 0)"
                    : "กรุณาระบุเงินสดนับจริงให้ถูกต้อง (ต้องไม่น้อยกว่า 0)"
                );
                return;
              }
              setIsShiftSubmitting(true);
              try {
                await shiftStore.closeShift(activeShift.id, cashVal, closeShiftNotes);
                toast.success(
                  currentLanguage === "en"
                    ? "Cashier shift closed successfully. POS system locked."
                    : "ปิดรอบลิ้นชักเงินสดสำเร็จแล้ว ระบบถูกล็อก"
                );
                setIsCloseShiftOpen(false);
                setActualCash("");
                setCloseShiftNotes("");
              } catch (err) {
                toast.error(
                  currentLanguage === "en"
                    ? "Failed to close cashier shift"
                    : "ไม่สามารถปิดรอบลิ้นชักเงินสดได้"
                );
              } finally {
                setIsShiftSubmitting(false);
              }
            }} className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2.5 text-xs text-foreground font-semibold leading-relaxed">
                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold border-b border-border pb-1.5 mb-1">
                  <span>{currentLanguage === "en" ? "Staff" : "พนักงาน"}: {activeShift.userName}</span>
                  <span>
                    {currentLanguage === "en" ? "Opened At" : "เปิดกะเมื่อ"}: {format(new Date(activeShift.openedAt), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {currentLanguage === "en" ? "1. Starting Float:" : "1. เงินทอนเริ่มต้น (Starting Float):"}
                  </span>
                  <span>฿{activeShift.startingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {currentLanguage === "en" ? "2. Cash Sales:" : "2. ยอดขายเงินสด (Cash Sales):"}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +฿{activeShiftStats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                <div className="flex justify-between font-black border-t border-dashed border-border pt-2 text-sm">
                  <span>
                    {currentLanguage === "en" ? "Expected Cash in Drawer:" : "ยอดเงินสดที่ควรมี (Expected Cash):"}
                  </span>
                  <span>฿{activeShiftStats.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="border-t border-border pt-2.5 mt-1 space-y-1 text-[11px]">
                  <p className="text-muted-foreground font-bold mb-1">
                    {currentLanguage === "en" ? "Non-cash Sales:" : "ยอดขายช่องทางอื่น ๆ (Non-cash Sales):"}
                  </p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {currentLanguage === "en" ? "- Bank Transfer:" : "- โอนเงิน (Bank Transfer):"}
                    </span>
                    <span>฿{activeShiftStats.transferSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {currentLanguage === "en" ? "- Card:" : "- บัตรเครดิต (Card):"}
                    </span>
                    <span>฿{activeShiftStats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {currentLanguage === "en" ? "- Member Wallet:" : "- หักบัญชีสมาชิก (Member Wallet):"}
                    </span>
                    <span>฿{activeShiftStats.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-2 mt-1 space-y-1 text-[11px]">
                  <div className="flex justify-between text-foreground font-bold mb-1">
                    <span>
                      {currentLanguage === "en" ? "Total Orders:" : "จำนวนออเดอร์ทั้งหมด:"}
                    </span>
                    <span>
                      {activeShiftStats.totalOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pl-2">
                    <span>
                      {currentLanguage === "en" ? "• Cash:" : "• เงินสด:"}
                    </span>
                    <span>
                      {activeShiftStats.cashOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pl-2">
                    <span>
                      {currentLanguage === "en" ? "• Bank Transfer:" : "• โอนเงิน:"}
                    </span>
                    <span>
                      {activeShiftStats.transferOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pl-2">
                    <span>
                      {currentLanguage === "en" ? "• Card:" : "• บัตรเครดิต:"}
                    </span>
                    <span>
                      {activeShiftStats.cardOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pl-2">
                    <span>
                      {currentLanguage === "en" ? "• Member Wallet:" : "• หักบัญชีสมาชิก:"}
                    </span>
                    <span>
                      {activeShiftStats.creditOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="actualCash" className="text-xs font-bold text-foreground">
                  {currentLanguage === "en" ? "Actual Cash in Drawer (฿) *" : "เงินสดนับจริงในลิ้นชัก (฿) *"}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">฿</span>
                  <Input
                    id="actualCash"
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    className="pl-7 bg-muted/50 border-border text-foreground font-black focus-visible:ring-emerald-500"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                  />
                </div>
              </div>

              {actualCash && !isNaN(parseFloat(actualCash)) && (() => {
                const diff = parseFloat(actualCash) - activeShiftStats.expectedCash;
                return (
                  <div className="flex justify-between items-center text-xs font-bold rounded-lg p-2.5 border bg-muted/40">
                    <span className="text-muted-foreground">
                      {currentLanguage === "en" ? "Difference (Shortage/Overage):" : "ส่วนต่าง (Shortage/Overage):"}
                    </span>
                    {diff > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +฿{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentLanguage === "en" ? "(Overage)" : "(เงินเกิน)"}
                      </span>
                    ) : diff < 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-black">
                        ฿{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentLanguage === "en" ? "(Shortage)" : "(เงินขาด)"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        ฿0.00 {currentLanguage === "en" ? "(Balanced)" : "(ยอดตรง)"}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1.5 text-left">
                <Label htmlFor="closeShiftNotes" className="text-xs font-bold text-foreground">
                  {currentLanguage === "en" ? "Additional Notes" : "บันทึกเพิ่มเติมการปิดกะ"}
                </Label>
                <Input
                  id="closeShiftNotes"
                  type="text"
                  placeholder={
                    currentLanguage === "en"
                      ? "e.g., drawer balanced, excess coins..."
                      : "เช่น ส่งยอดบัญชีเรียบร้อย, มีเงินเหรียญเยอะ..."
                  }
                  className="bg-muted/50 border-border text-xs focus-visible:ring-emerald-500"
                  value={closeShiftNotes}
                  onChange={(e) => setCloseShiftNotes(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2 border-t border-border gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCloseShiftOpen(false)}
                  className="h-9 font-bold text-xs rounded-xl cursor-pointer"
                >
                  {currentLanguage === "en" ? "Cancel" : "ยกเลิก"}
                </Button>
                <Button
                  type="submit"
                  disabled={isShiftSubmitting}
                  className="h-9 bg-red-600 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/10"
                >
                  {isShiftSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {currentLanguage === "en" ? "Submitting..." : "กำลังส่งรายงาน..."}
                    </>
                  ) : (
                    <>
                      {currentLanguage === "en" ? "Confirm and Close Shift" : "ยืนยันปิดรอบและปิดกะพนักงาน"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ShiftHistoryDialog
        isOpen={isShiftHistoryOpen}
        onOpenChange={setIsShiftHistoryOpen}
        isLoading={isLoadingClosedShifts}
        shifts={closedShifts}
        currentLanguage={currentLanguage === "en" ? "en" : "th"}
      />

      {/* Recall Saved Bills / Unpaid Orders Dialog */}
      <Dialog open={isRecallOpen} onOpenChange={(open) => {
        setIsRecallOpen(open);
        if (!open) {
          setRecallSearch("");
        }
      }}>
        <DialogContent className="max-w-lg p-5 max-h-[80vh] overflow-hidden flex flex-col bg-card border border-border shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-2">
            <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
              <FolderOpen className="text-primary" size={18} />
              <span>
                {currentLanguage === "en" ? "Recall / Return Clothes" : "เรียกคืนบิล / คืนผ้า"}
              </span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-medium">
              {currentLanguage === "en"
                ? "Manage active orders, collect unpaid payments, or perform clothes collection returns."
                : "จัดการใบสั่งซื้อค้างจ่าย, รับเงินค่าบริการ, หรือทำรายการคืนผ้าให้กับลูกค้า"}
            </p>
          </DialogHeader>

          {/* Tab Selector */}
          <div className="flex bg-muted rounded-xl p-0.5 border border-border mb-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRecallTab("unpaid");
                setRecallSearch("");
              }}
              className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer text-center ${recallTab === "unpaid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {currentLanguage === "en" ? "Saved / Unpaid" : "ค้างชำระ / บันทึกไว้"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRecallTab("ready");
                setRecallSearch("");
              }}
              className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer text-center ${recallTab === "ready" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {currentLanguage === "en" ? "Paid / Return" : "ชำระแล้ว / คืนผ้า & คืนเงิน"}
            </button>
          </div>

          {/* Search Input */}
          <div className="relative mb-3.5 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input
              type="text"
              placeholder={currentLanguage === "en" ? "Search Order No, Customer, Phone..." : "ค้นหาเลขบิล, ชื่อลูกค้า, เบอร์โทร..."}
              className="pl-9 pr-8 text-[11px] h-8 bg-card border-border rounded-lg focus-visible:ring-1 focus-visible:ring-primary w-full text-foreground font-medium"
              value={recallSearch}
              onChange={(e) => setRecallSearch(e.target.value)}
            />
            {recallSearch && (
              <button
                type="button"
                onClick={() => setRecallSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:bg-muted"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* List of jobs */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1">
            {(() => {
              const filteredList = jobs.filter(j => {
                if (j.branchId !== activeShop?.id) return false;
                let matchTab = false;
                if (recallTab === "unpaid") {
                  matchTab = !j.isPaid && j.status !== 'cancel' && j.status !== 'completed';
                } else {
                  matchTab = !!j.isPaid && j.status !== 'cancel' && j.status !== 'completed';
                }

                if (!matchTab) return false;

                if (recallSearch.trim()) {
                  const query = recallSearch.toLowerCase().trim();
                  const orderNoMatch = j.id && j.id.toLowerCase().includes(query);
                  const customerNameMatch = j.customerName && j.customerName.toLowerCase().includes(query);
                  const phoneMatch = j.customerPhone && j.customerPhone.toLowerCase().includes(query);
                  return !!(orderNoMatch || customerNameMatch || phoneMatch);
                }

                return true;
              });

              if (filteredList.length === 0) {
                return (
                  <div className="py-12 text-center text-xs text-muted-foreground/60 border border-dashed border-border rounded-xl">
                    {currentLanguage === "en" 
                      ? "No orders found in this section." 
                      : "ไม่พบรายการสั่งซื้อในหมวดหมู่นี้"}
                  </div>
                );
              }

              return filteredList.map(job => {
                const jobDateStr = format(new Date(job.createdAt), "dd/MM/yyyy HH:mm");
                const itemsCount = job.items ? job.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0) : 0;
                
                return (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-3.5 bg-muted/20 hover:bg-muted/40 border border-border/80 hover:border-primary/30 rounded-xl transition-all shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-foreground">
                          #{job.id.split('-')[0].toUpperCase()}
                        </span>
                        <Badge variant="outline" className={`text-[8.5px] uppercase font-bold py-0.5 px-1.5 border-none shadow-none ${
                          job.subStatus === 'ready' 
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}>
                          {job.subStatus === 'ready' 
                            ? (currentLanguage === "en" ? "Ready" : "พร้อมรับ") 
                            : job.type}
                        </Badge>
                        <Badge variant="outline" className={`text-[8.5px] uppercase font-bold py-0.5 px-1.5 border-none shadow-none ${
                          job.isPaid 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}>
                          {job.isPaid 
                            ? (currentLanguage === "en" ? "Paid" : "จ่ายแล้ว") 
                            : (currentLanguage === "en" ? "Unpaid" : "ค้างจ่าย")}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-foreground font-semibold flex items-center gap-1.5">
                        <span className="text-muted-foreground">{currentLanguage === "en" ? "Customer:" : "ลูกค้า:"}</span>
                        <span>{job.customerName || "Walk-In"}</span>
                        {job.customerPhone && job.customerPhone !== "-" && (
                          <span className="text-muted-foreground text-[10px] font-medium">({job.customerPhone})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-2">
                        <span>{jobDateStr}</span>
                        <span>•</span>
                        <span>{itemsCount} {currentLanguage === "en" ? "items" : "รายการ"}</span>
                      </div>

                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground font-semibold">{currentLanguage === "en" ? "Total Amount" : "ยอดรวม"}</div>
                        <div className="text-sm font-black text-foreground">฿{(job.totalAmount || 0).toLocaleString()}</div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {recallTab === "unpaid" ? (
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => {
                              const cartItems = (job.items || []).map((it: any, idx: number) => {
                                if (it.name === "บริการรับ-ส่ง" || it.nameEn === "Pickup & Delivery Service") {
                                  return {
                                    id: "delivery-pickup-service-item",
                                    name: "บริการรับ-ส่ง",
                                    nameEn: "Pickup & Delivery Service",
                                    price: it.price,
                                    basePrice: it.price,
                                    quantity: it.quantity
                                  };
                                }
                                if (it.name === "บริการส่ง" || it.nameEn === "Delivery Service") {
                                  return {
                                    id: "delivery-only-service-item",
                                    name: "บริการส่ง",
                                    nameEn: "Delivery Service",
                                    price: it.price,
                                    basePrice: it.price,
                                    quantity: it.quantity
                                  };
                                }
                                const match = services.find(s => s.name === it.name || s.nameEn === it.nameEn);
                                return {
                                  id: match ? match.id : `RECALLED-${idx}-${Date.now()}`,
                                  name: it.name,
                                  nameEn: it.nameEn,
                                  price: it.price,
                                  basePrice: it.price,
                                  quantity: it.quantity
                                };
                              });

                              const deliveryCartItem = cartItems.find(it => it.id === "delivery-pickup-service-item" || it.id === "delivery-only-service-item");
                              if (deliveryCartItem) {
                                setLocalDeliveryPrice(String(deliveryCartItem.price));
                              } else {
                                setLocalDeliveryPrice("");
                              }

                              setCart(cartItems);

                              const customer = customers.find(c => c.id === job.customerId || (job.customerPhone && c.phone === job.customerPhone));
                              setSelectedCustomer(customer || null);

                              setManualAdjustment(job.discount || 0);

                              if (job.remark) {
                                const expressMatch = job.remark.match(/Express\s*(\d+)%/i);
                                if (expressMatch) {
                                  const pct = parseInt(expressMatch[1], 10);
                                  if (pct === rate1Num) {
                                    setServiceSpeed("express_rate1");
                                  } else if (pct === rate2Num) {
                                    setServiceSpeed("express_rate2");
                                  } else if (pct === rate3Num) {
                                    setServiceSpeed("express_rate3");
                                  } else if (pct === 50) {
                                    setServiceSpeed("express_50");
                                  } else if (pct === 100) {
                                    setServiceSpeed("express_100");
                                  } else {
                                    setServiceSpeed("standard");
                                  }
                                } else {
                                  setServiceSpeed("standard");
                                }

                                const vatMatch = job.remark.match(/VAT:\s*(\w+)\s*\((\d+(?:\.\d+)?)\%\)/i);
                                if (vatMatch) {
                                  setVatType(vatMatch[1].toLowerCase() as any);
                                  setVatRate(parseFloat(vatMatch[2]));
                                } else {
                                  setVatType("none");
                                }

                                const cleanRemark = job.remark
                                  .split(" | Express")[0]
                                  .split(" | VAT:")[0];
                                setRemark(
                                  cleanRemark.startsWith("Express") || cleanRemark.startsWith("VAT:") 
                                    ? "" 
                                    : cleanRemark
                                );
                              } else {
                                setRemark("");
                                setServiceSpeed("standard");
                                setVatType("none");
                              }

                              if (job.deliveryScheduledAt) {
                                setDeliveryScheduledTime(getTomorrowDateTimeString(new Date(job.deliveryScheduledAt)));
                              } else {
                                setDeliveryScheduledTime(getTomorrowDateTimeString());
                              }

                              setLoadedJobId(job.id);
                              setIsRecallOpen(false);
                              playAudioFeedback("success");
                              toast.success(currentLanguage === "en" ? `Loaded order #${job.id.split('-')[0].toUpperCase()} into cart` : `โหลดรายการ #${job.id.split('-')[0].toUpperCase()} เข้าตะกร้าเรียบร้อย`);
                            }}
                            disabled={isSpectatorMode}
                            className={`h-8 font-bold text-xs bg-primary hover:bg-primary/95 text-white rounded-lg px-3 cursor-pointer shrink-0 ${isSpectatorMode ? "opacity-50 pointer-events-none" : ""}`}
                          >
                            {currentLanguage === "en" ? "Select" : "เลือก"}
                          </Button>
                        ) : (
                          <>
                            {job.subStatus === "ready" && !isSpectatorMode && (
                              <Button
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setConfirmReturnJob(job);
                                }}
                                className="h-8 font-bold text-xs bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg px-3 cursor-pointer shrink-0 flex items-center gap-1 shadow-sm"
                              >
                                <Check size={12} />
                                {currentLanguage === "en" ? "Return" : "คืนผ้าสำเร็จ"}
                              </Button>
                            )}
                          </>
                        )}

                        {job.status !== "completed" && job.status !== "cancel" && !isSpectatorMode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => {
                              setPosCancellingJob(job);
                              setPosCancelReason("");
                            }}
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg cursor-pointer shrink-0"
                            title={currentLanguage === "en" ? (job.isPaid ? "Cancel & Refund" : "Cancel Order") : (job.isPaid ? "คืนผ้า & คืนเงิน" : "ยกเลิกบิล")}
                          >
                            <XCircle size={15} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-3 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRecallOpen(false)}
              className="h-9 font-bold text-xs rounded-xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AdminCustomerDialog 
        open={isAddCustomerOpen}
        onOpenChange={setIsAddCustomerOpen}
        customer={null}
        onSaved={(newCustomer) => {
          setSelectedCustomer(newCustomer);
          setIsAddCustomerOpen(false);
          toast.success(
            currentLanguage === "en"
              ? `Customer ${newCustomer.name} added and selected in cart.`
              : `เพิ่มลูกค้า ${newCustomer.name} สำเร็จและเลือกเข้าตะกร้าเรียบร้อย`
          );
        }}
      />

      {/* Cancellation Confirmation Dialog */}
      <Dialog open={!!posCancellingJob} onOpenChange={(open) => !open && setPosCancellingJob(null)}>
        <DialogContent className="max-w-md p-5 bg-card border border-border shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-3">
            <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
              <XCircle className="text-rose-500" size={18} />
              <span>
                {posCancellingJob?.isPaid
                  ? (currentLanguage === "en" ? "Cancel & Refund Paid Order" : "คืนผ้า & คืนเงิน (ยกเลิกบิลที่จ่ายแล้ว)")
                  : (currentLanguage === "en" ? "Cancel Unpaid Order" : "ยกเลิกใบสั่งซื้อค้างชำระ")}
                {" "}#{posCancellingJob?.id.split('-')[0].toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {posCancellingJob?.isPaid && (
              <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="posRefundMethod" className="text-xs font-bold text-foreground">
                    {currentLanguage === "en" ? "Refund Method *" : "วิธีการคืนเงิน *"}
                  </Label>
                  <select
                    id="posRefundMethod"
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full h-10 px-3 py-2 bg-background border border-border focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all rounded-xl text-xs font-semibold text-foreground focus:outline-none"
                  >
                    <option value="cash">{currentLanguage === "en" ? "Cash (Deduct from Drawer)" : "เงินสด (หักจากลิ้นชัก)"}</option>
                    <option value="transfer">{currentLanguage === "en" ? "Bank Transfer (Do not deduct cash)" : "เงินโอน (ไม่หักเงินสด)"}</option>
                    <option value="card">{currentLanguage === "en" ? "Credit Card (Do not deduct cash)" : "บัตรเครดิต (ไม่หักเงินสด)"}</option>
                    {posCancellingJob.customerId && (
                      <option value="credit">{currentLanguage === "en" ? "Member Wallet Credit (System auto-refund)" : "บัญชีสมาชิก / เครดิต (ระบบคืนเงินเข้ากระเป๋าอัตโนมัติ)"}</option>
                    )}
                  </select>
                </div>

                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed space-y-1.5 text-left">
                  <p className="font-bold">
                    {currentLanguage === "en" ? "Refund Information:" : "ข้อมูลการคืนเงิน:"}
                  </p>
                  {refundMethod === "credit" ? (
                    <p>
                      {currentLanguage === "en"
                        ? `The system will automatically refund ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} back to the customer's wallet balance.`
                        : `ระบบจะคืนเงินเครดิตจำนวน ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} เข้าบัญชีสมาชิกของลูกค้าโดยอัตโนมัติ`}
                    </p>
                  ) : refundMethod === "cash" ? (
                    <p>
                      {currentLanguage === "en"
                        ? `Please refund ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} in CASH to the customer. This shift's expected cash stats will be reduced accordingly.`
                        : `กรุณาคืนเงินสดจำนวน ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} คืนลูกค้า ยอดเงินสดคาดการณ์ในลิ้นชักรอบกะนี้จะปรับลดลง`}
                    </p>
                  ) : (
                    <p>
                      {currentLanguage === "en"
                        ? `Please refund ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} via ${refundMethod === 'transfer' ? 'BANK TRANSFER' : 'CREDIT CARD'} to the customer. This will not affect the cash drawer's expected cash stats.`
                        : `กรุณาคืนเงินจำนวน ฿${(posCancellingJob.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} โดยวิธี${refundMethod === 'transfer' ? 'โอนเงินบัญชีธนาคาร' : 'ยกเลิกยอดบัตรเครดิต'}คืนลูกค้า (รายการนี้จะไม่มีผลต่อยอดเงินสดในลิ้นชัก)`}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-left">
              <Label htmlFor="posCancelReason" className="text-xs font-bold text-foreground">
                {currentLanguage === "en" ? "Reason for Cancellation *" : "เหตุผลในการยกเลิก *"}
              </Label>
              <Input
                id="posCancelReason"
                type="text"
                required
                placeholder={currentLanguage === "en" ? "e.g., customer request, wrong items..." : "เช่น ลูกค้าขอยกเลิก, เลือกสินค้าผิด..."}
                className="bg-muted/50 border-border text-xs focus-visible:ring-rose-500"
                value={posCancelReason}
                onChange={(e) => setPosCancelReason(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter className="pt-2 border-t border-border gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPosCancellingJob(null)}
                className="h-9 font-bold text-xs rounded-xl cursor-pointer"
              >
                {currentLanguage === "en" ? "Keep Order" : "เก็บใบสั่งซื้อไว้"}
              </Button>
              <Button
                type="button"
                disabled={!posCancelReason.trim()}
                onClick={async () => {
                  if (!posCancellingJob) return;
                  try {
                    const isPaidOrder = posCancellingJob.isPaid;
                    const isWalletRefund = refundMethod === "credit" && posCancellingJob.customerId;
                    
                    let refundSuccessMsg = "";
                    let updatedNotesJson = posCancellingJob.adminNotesJson;
                    
                    if (isPaidOrder) {
                      if (isWalletRefund) {
                        const customer = customers.find(c => c.id === posCancellingJob.customerId);
                        if (customer) {
                          const refundAmount = posCancellingJob.totalAmount || 0;
                          const newBalance = (customer.creditBalance || 0) + refundAmount;
                          await customerStore.updateCustomer(customer.id, { creditBalance: newBalance });
                          refundSuccessMsg = ` และคืนเงิน ฿${refundAmount.toFixed(2)} เข้ากระเป๋าสมาชิกสำเร็จ`;
                        }
                      }

                      // Append negative payment to reflect the refund in shift expected cash
                      if (posCancellingJob.adminNotesJson) {
                        try {
                          const parsed = JSON.parse(posCancellingJob.adminNotesJson);
                          if (parsed && Array.isArray(parsed.payments)) {
                            parsed.payments.push({
                              method: refundMethod,
                              amount: -(posCancellingJob.totalAmount || 0),
                              timestamp: new Date().toISOString()
                            });
                            updatedNotesJson = JSON.stringify(parsed);
                          }
                        } catch (e) {
                          // Ignore
                        }
                      }
                    }

                    const existingRemark = posCancellingJob.remark ? ` | ${posCancellingJob.remark}` : '';
                    const updatedRemark = `[Cancelled & Refunded: ${posCancelReason}]${existingRemark}`;
                    
                    const updatedFields = {
                      status: "cancel" as const,
                      isPaid: false,
                      remark: updatedRemark,
                      adminNotesJson: updatedNotesJson
                    };

                    await jobStore.updateJobDetails(posCancellingJob.id, updatedFields);
                    
                    if (loadedJobId === posCancellingJob.id) {
                      resetCartForm();
                    }

                    toast.success(
                      currentLanguage === "en"
                        ? `Order #${posCancellingJob.id.split('-')[0].toUpperCase()} cancelled and refunded successfully.`
                        : `คืนผ้าและยกเลิกบิล #${posCancellingJob.id.split('-')[0].toUpperCase()} เรียบร้อยแล้ว${refundSuccessMsg}`
                    );

                    // Create the full updated job object to display in the receipt
                    const cancelledJobObj = {
                      ...posCancellingJob,
                      ...updatedFields
                    };
                    setLatestJob(cancelledJobObj);
                    setIsDraftPreview(false);
                    setShowReceipt(true);

                    setPosCancellingJob(null);
                    setPosCancelReason("");
                  } catch (e) {
                    toast.error(currentLanguage === "en" ? "Failed to cancel order" : "ไม่สามารถยกเลิกใบสั่งซื้อได้");
                  }
                }}
                className="h-9 bg-red-600 hover:bg-red-500 dark:bg-red-650 dark:hover:bg-red-550 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/10 border-none"
              >
                {currentLanguage === "en" ? "Confirm Cancellation" : "ยืนยันการยกเลิก"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Clothes Confirmation Dialog */}
      <Dialog open={!!confirmReturnJob} onOpenChange={(open) => !open && setConfirmReturnJob(null)}>
        <DialogContent className="max-w-md p-5 bg-card border border-border shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-3">
            <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
              <CheckCircle2 className="text-indigo-500" size={18} />
              <span>{currentLanguage === "en" ? "Confirm Clothes Return" : "ยืนยันการคืนผ้า"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
              {currentLanguage === "en"
                ? `Are you sure you want to mark Order #${confirmReturnJob?.id.split('-')[0].toUpperCase()} as returned? This will set its status to Completed.`
                : `คุณแน่ใจหรือไม่ที่จะทำรายการคืนผ้าสำหรับใบสั่งซื้อ #${confirmReturnJob?.id.split('-')[0].toUpperCase()}? การดำเนินการนี้จะตั้งค่าสถานะเป็น 'เสร็จสิ้น' (Completed)`}
            </p>

            <DialogFooter className="pt-2 border-t border-border gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmReturnJob(null)}
                className="h-9 font-bold text-xs rounded-xl cursor-pointer"
              >
                {currentLanguage === "en" ? "Cancel" : "ยกเลิก"}
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!confirmReturnJob) return;
                  try {
                    await jobStore.completeJob(confirmReturnJob.id);
                    toast.success(
                      currentLanguage === "en"
                        ? `Order #${confirmReturnJob.id.split('-')[0].toUpperCase()} marked as completed (returned).`
                        : `ทำรายการคืนผ้าสำหรับใบสั่งซื้อ #${confirmReturnJob.id.split('-')[0].toUpperCase()} เรียบร้อยแล้ว`
                    );
                    setConfirmReturnJob(null);
                  } catch (e) {
                    toast.error(currentLanguage === "en" ? "Failed to complete return" : "ไม่สามารถบันทึกรายการคืนผ้าได้");
                  }
                }}
                className="h-9 bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-650/15 border-none"
              >
                {currentLanguage === "en" ? "Confirm Return" : "ยืนยันคืนผ้า"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
