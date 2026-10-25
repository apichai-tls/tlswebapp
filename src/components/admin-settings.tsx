import { useState, useEffect, useRef, useCallback, useSyncExternalStore, useMemo } from "react";
import { Copy, Edit3, Trash2, Settings2, Store, MapPin, Plus, Key, Coins, QrCode, Printer, CreditCard, RotateCcw, Building, Search, Tag, Sparkles, Banknote, CheckCircle2, AlertCircle, Usb, RefreshCw, Ticket, Clock, ShieldCheck, Eye, EyeOff, SlidersHorizontal, Compass, Percent, Shield, ArrowRight, Check, X, Layers, Cpu, CreditCard as CardIcon } from "lucide-react";
import { priceListStore, serviceStore, shopStore, settingsStore, type PriceList, type PriceListItem, type ShopLocation } from "@/lib/store";
import { 
  type PaymentChannelItem, 
  type PaymentChannelType, 
  getPaymentChannels, 
  PAYMENT_TYPE_LABELS, 
  DEFAULT_PAYMENT_CHANNELS 
} from "@/lib/payment-channels";
import { 
  getCashDrawerStatus, 
  pairCashDrawer, 
  kickCashDrawer, 
  type CashDrawerStatus 
} from "@/lib/cash-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { LocationInput } from "@/components/location-input";

export function AdminSettings() {
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const systemSettings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [name, setName] = useState("");
  const [servicePrices, setServicePrices] = useState<Record<string, number>>({});
  const [isCorporateCatalog, setIsCorporateCatalog] = useState(true);
  const [customItems, setCustomItems] = useState<PriceListItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<"all" | "pricing" | "branches" | "payments" | "pos" | "system">("all");
  const [settingsSearch, setSettingsSearch] = useState("");

  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShopLocation | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopCoords, setShopCoords] = useState({ lat: 13.736717, lng: 100.523186 });
  const [shopNoCommission, setShopNoCommission] = useState(false);
  const [shopIsPosEnabled, setShopIsPosEnabled] = useState(false);
  const [shopArea, setShopArea] = useState("BKK");
  const [shopLogoUrl, setShopLogoUrl] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopTaxId, setShopTaxId] = useState("");
  const [shopAddressFull, setShopAddressFull] = useState("");
  const [shopProformaQrUrl, setShopProformaQrUrl] = useState("");
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  const [receiptPaperSize, setReceiptPaperSize] = useState("80mm");
  const [currentLanguage, setCurrentLanguage] = useState("th");

  // Cash Drawer Settings
  const [cashDrawerAutoOpenOnPay, setCashDrawerAutoOpenOnPay] = useState(true);
  const [cashDrawerAutoOpenOnPrint, setCashDrawerAutoOpenOnPrint] = useState(true);
  const [cashDrawerShowManualButton, setCashDrawerShowManualButton] = useState(true);
  const [posAutoApplyVoucher, setPosAutoApplyVoucher] = useState(false);
  const [drawerStatus, setDrawerStatus] = useState<CashDrawerStatus>({ supported: true, isPaired: false });
  const [isPairingDrawer, setIsPairingDrawer] = useState(false);
  const [isTestingDrawer, setIsTestingDrawer] = useState(false);

  const [googleApiKey, setGoogleApiKey] = useState("");
  const [enableGoogleApi, setEnableGoogleApi] = useState(false);
  const [commissionRateInput, setCommissionRateInput] = useState("2");
  const [enablePromptPay, setEnablePromptPay] = useState(false);
  const [ppSettings, setPpSettings] = useState<Record<string, string>>({});

  const [vatTypeInput, setVatTypeInput] = useState("none");
  const [vatRateInput, setVatRateInput] = useState("7");
  const [sessionTimeoutInput, setSessionTimeoutInput] = useState("20");

  const handleSaveSessionTimeout = async (valStr?: string) => {
    const raw = (valStr !== undefined ? valStr : sessionTimeoutInput).trim();
    const num = Number(raw);
    if (raw === "" || isNaN(num) || num < 0) {
      toast.error("กรุณาระบุจำนวนนาทีที่ถูกต้อง (0 = ปิดใช้งาน)");
      return;
    }
    const cleanVal = String(Math.floor(num));
    setSessionTimeoutInput(cleanVal);
    try {
      await settingsStore.updateSetting("sessionTimeoutMinutes", cleanVal);
      if (typeof window !== "undefined") {
        localStorage.setItem("tls_session_timeout_mins", cleanVal);
      }
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success(
        cleanVal === "0"
          ? "ปิดระบบตัด Session อัตโนมัติเรียบร้อยแล้ว"
          : `ตั้งเวลา Idle Session Timeout เป็น ${cleanVal} นาที เรียบร้อยแล้ว`
      );
    } catch (err) {
      toast.error("Failed to save setting: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleSaveVatSetting = async (key: string, value: string) => {
    try {
      await settingsStore.updateSetting(key, value);
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success("VAT setting updated successfully");
    } catch (err) {
      toast.error("Failed to save setting: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Payment Channels State
  const paymentChannels = getPaymentChannels(systemSettings);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<PaymentChannelItem | null>(null);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<PaymentChannelType>("transfer");
  const [channelEnabled, setChannelEnabled] = useState(true);
  const [channelRequiresMember, setChannelRequiresMember] = useState(false);
  const [deletingChannel, setDeletingChannel] = useState<PaymentChannelItem | null>(null);

  const handleSavePaymentChannels = async (newChannels: PaymentChannelItem[]) => {
    try {
      await settingsStore.updateSetting("paymentChannels", JSON.stringify(newChannels));
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success("บันทึกช่องทางการชำระเงินเรียบร้อยแล้ว");
    } catch (err) {
      toast.error("บันทึกล้มเหลว: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleOpenAddChannel = () => {
    setEditingChannel(null);
    setChannelName("");
    setChannelType("transfer");
    setChannelEnabled(true);
    setChannelRequiresMember(false);
    setIsChannelModalOpen(true);
  };

  const handleOpenEditChannel = (ch: PaymentChannelItem) => {
    setEditingChannel(ch);
    setChannelName(ch.name);
    setChannelType(ch.type);
    setChannelEnabled(ch.enabled);
    setChannelRequiresMember(!!ch.requiresMember);
    setIsChannelModalOpen(true);
  };

  const handleToggleChannel = async (id: string) => {
    const updated = paymentChannels.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    await handleSavePaymentChannels(updated);
  };

  const handleSubmitChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      toast.error("กรุณาระบุชื่อช่องทางการชำระเงิน");
      return;
    }

    let updated: PaymentChannelItem[];
    if (editingChannel) {
      updated = paymentChannels.map((c) =>
        c.id === editingChannel.id
          ? {
              ...c,
              name: channelName.trim(),
              type: channelType,
              enabled: channelEnabled,
              requiresMember: channelRequiresMember,
            }
          : c
      );
    } else {
      if (paymentChannels.some((c) => c.name.toLowerCase() === channelName.trim().toLowerCase())) {
        toast.error("มีชื่อช่องทางการชำระเงินนี้อยู่แล้ว");
        return;
      }
      const newId = "channel_" + Date.now();
      const newChannel: PaymentChannelItem = {
        id: newId,
        name: channelName.trim(),
        type: channelType,
        enabled: channelEnabled,
        requiresMember: channelRequiresMember,
        isSystem: false,
      };
      updated = [...paymentChannels, newChannel];
    }

    await handleSavePaymentChannels(updated);
    setIsChannelModalOpen(false);
  };

  const handleConfirmDeleteChannel = async () => {
    if (!deletingChannel) return;
    const updated = paymentChannels.filter((c) => c.id !== deletingChannel.id);
    await handleSavePaymentChannels(updated);
    setDeletingChannel(null);
    toast.success(`ลบช่องทาง "${deletingChannel.name}" เรียบร้อยแล้ว`);
  };

  const handleResetDefaultChannels = async () => {
    if (confirm("ต้องการรีเซ็ตช่องทางการชำระเงินกลับเป็นค่าเริ่มต้น 7 ช่องทางใช่หรือไม่?")) {
      await handleSavePaymentChannels(DEFAULT_PAYMENT_CHANNELS);
    }
  };
  
  useEffect(() => {
    if (systemSettings) {
      setGoogleApiKey(systemSettings.googleMapsApiKey || "");
      setEnableGoogleApi(systemSettings.enableGoogleApi === "true");
      setCommissionRateInput(systemSettings.riderCommissionPerKm || "2");
      setEnablePromptPay(systemSettings.enablePromptPay === "true");
      setReceiptPaperSize(systemSettings.receiptPaperSize || "80mm");
      setCurrentLanguage(systemSettings.language || "th");
      setVatTypeInput(systemSettings.vatType || "none");
      setVatRateInput(systemSettings.vatRate || "7");
      setSessionTimeoutInput(systemSettings.sessionTimeoutMinutes ?? "20");

      // Cash drawer settings
      setCashDrawerAutoOpenOnPay(systemSettings.cashDrawerAutoOpenOnPay !== "false");
      setCashDrawerAutoOpenOnPrint(systemSettings.cashDrawerAutoOpenOnPrint !== "false");
      setCashDrawerShowManualButton(systemSettings.cashDrawerShowManualButton !== "false");
      setPosAutoApplyVoucher(systemSettings.posAutoApplyVoucher === "true");
      
      const pp: Record<string, string> = {};
      pp["global_id"] = systemSettings.promptpayId_global || "";
      pp["global_name"] = systemSettings.promptpayName_global || "";
      shopLocations.forEach(shop => {
        pp[`id_${shop.id}`] = systemSettings[`promptpayId_${shop.id}`] || "";
        pp[`name_${shop.id}`] = systemSettings[`promptpayName_${shop.id}`] || "";
      });
      setPpSettings(pp);
    }
  }, [systemSettings, shopLocations]);

  // Initial check of cash drawer hardware pairing on component mount
  useEffect(() => {
    getCashDrawerStatus().then(status => {
      setDrawerStatus(status);
    }).catch(() => {});
  }, []);

  const handlePairDrawer = async () => {
    setIsPairingDrawer(true);
    try {
      const res = await pairCashDrawer();
      if (res.success) {
        toast.success(`Cash drawer connected: ${res.portInfo || ""}`);
        const status = await getCashDrawerStatus();
        setDrawerStatus(status);
      } else if (res.error && res.error !== "User cancelled device pairing.") {
        toast.error(res.error);
      }
    } finally {
      setIsPairingDrawer(false);
    }
  };

  const handleTestKick = async () => {
    setIsTestingDrawer(true);
    try {
      const res = await kickCashDrawer();
      if (res.success) {
        toast.success("Cash drawer test kick signal sent successfully!");
      } else {
        toast.error(res.error || "Failed to trigger cash drawer. Please check device pairing.");
      }
    } finally {
      setIsTestingDrawer(false);
    }
  };

  const [isVerifyingKey, setIsVerifyingKey] = useState(false);

  const handleSaveApiSettings = async () => {
    if (enableGoogleApi && googleApiKey) {
      setIsVerifyingKey(true);
      try {
        // Test the API key by making a simple request
        const { authFetch } = await import("@/lib/api");
        const res = await authFetch(`/api/places?query=test&key=${encodeURIComponent(googleApiKey.trim())}`);
        const data = await res.json();
        
        if (!res.ok || data.error) {
          toast.error("Invalid API Key or API is not enabled on Google Cloud");
          setIsVerifyingKey(false);
          return;
        }
      } catch {
        toast.error("Failed to verify API Key. Please check your connection.");
        setIsVerifyingKey(false);
        return;
      }
      setIsVerifyingKey(false);
    }

    settingsStore.updateSetting("googleMapsApiKey", googleApiKey);
    settingsStore.updateSetting("enableGoogleApi", enableGoogleApi ? "true" : "false");
    toast.success("API Settings saved successfully");
  };

  const handleSaveCommissionSettings = async () => {
    const val = parseFloat(commissionRateInput);
    if (isNaN(val) || val < 0) {
      toast.error("Please enter a valid commission rate");
      return;
    }
    try {
      await settingsStore.updateSetting("riderCommissionPerKm", commissionRateInput);
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success("Rider Commission Rate updated successfully");
    } catch (err) {
      toast.error("Failed to save setting: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleSavePromptPaySettings = async () => {
    try {
      await settingsStore.updateSetting("enablePromptPay", enablePromptPay ? "true" : "false");
      await settingsStore.updateSetting("promptpayId_global", ppSettings["global_id"] || "");
      await settingsStore.updateSetting("promptpayName_global", ppSettings["global_name"] || "");
      
      for (const shop of shopLocations) {
        await settingsStore.updateSetting(`promptpayId_${shop.id}`, ppSettings[`id_${shop.id}`] || "");
        await settingsStore.updateSetting(`promptpayName_${shop.id}`, ppSettings[`name_${shop.id}`] || "");
      }
      
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success("PromptPay settings saved successfully");
    } catch (err) {
      toast.error("Failed to save PromptPay settings: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleDuplicate = (baseList: PriceList) => {
    setName(`${baseList.name} (Copy)`);
    const isCorp = Boolean(baseList.isCorporate || (baseList.customItems && baseList.customItems.length > 0));
    setIsCorporateCatalog(isCorp);
    if (isCorp && baseList.customItems) {
      setCustomItems(baseList.customItems.map(it => ({
        ...it,
        id: `ITEM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
      })));
    } else {
      setCustomItems([]);
    }
    setServicePrices({ ...baseList.servicePrices });
    setEditingList(null);
    setIsModalOpen(true);
  };

  const originalPriceListRef = useRef<{
    baseName: string;
    baseIsCorporate: boolean;
    baseServicePrices: Record<string, number>;
    baseCustomItems: PriceListItem[];
  } | null>(null);

  const originalShopRef = useRef<ShopLocation | null>(null);

  const applyPriceListToForm = (list: PriceList) => {
    setEditingList(list);
    setName(list.name);
    const isCorp = Boolean(list.isCorporate || (list.customItems && list.customItems.length > 0));
    setIsCorporateCatalog(isCorp);
    const clonedItems = isCorp && list.customItems ? list.customItems.map((it) => ({ ...it })) : [];
    const clonedPrices = { ...(list.servicePrices || {}) };
    setCustomItems(clonedItems);
    setServicePrices(clonedPrices);
    originalPriceListRef.current = {
      baseName: list.name,
      baseIsCorporate: isCorp,
      baseServicePrices: { ...clonedPrices },
      baseCustomItems: clonedItems.map((it) => ({ ...it })),
    };
  };

  const handleEdit = (list: PriceList) => {
    applyPriceListToForm(list);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}? Customers using this will revert to Regular.`)) {
      priceListStore.deletePriceList(id);
      toast.success("Price list deleted");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    if (isCorporateCatalog) {
      const validItems = customItems.filter(it => it.name.trim().length > 0);
      if (validItems.length === 0) {
        toast.error("กรุณาระบุรายการสินค้าสำหรับสัญญานี้อย่างน้อย 1 รายการ");
        return;
      }

      if (editingList) {
        const baseSnap = originalPriceListRef.current;
        const res = await priceListStore.updatePriceList(editingList.id, {
          name: name.trim(),
          isCorporate: true,
          customItems: validItems,
          servicePrices: {},
          baseName: baseSnap?.baseName,
          baseServicePrices: baseSnap?.baseServicePrices,
          baseCustomItems: baseSnap?.baseCustomItems,
        });
        if (res?.isConflict && res?.latestPriceList) {
          applyPriceListToForm(res.latestPriceList);
          toast.warning("แคตตาล็อกสัญญานี้ถูกแก้ไขโดยผู้ใช้อื่นเมื่อสักครู่ ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาตรวจสอบก่อนบันทึกอีกครั้ง");
          return;
        }
        toast.success("อัปเดตแคตตาล็อกสัญญา Corporate สำเร็จ");
      } else {
        await priceListStore.addPriceList({
          name: name.trim(),
          isCorporate: true,
          customItems: validItems,
          servicePrices: {},
        });
        toast.success("สร้างแคตตาล็อกสัญญา Corporate ใหม่สำเร็จ");
      }
    } else {
      // Clean up: If override matches the base price, remove it so it inherits naturally
      const cleanedServicePrices: Record<string, number> = {};
      for (const [serviceId, price] of Object.entries(servicePrices)) {
        const baseService = services.find(s => s.id === serviceId);
        if (baseService && baseService.price === price) {
          continue; // Inherit from base
        }
        cleanedServicePrices[serviceId] = price;
      }

      if (editingList) {
        const baseSnap = originalPriceListRef.current;
        const res = await priceListStore.updatePriceList(editingList.id, {
          name: name.trim(),
          isCorporate: false,
          customItems: undefined,
          servicePrices: cleanedServicePrices,
          baseName: baseSnap?.baseName,
          baseServicePrices: baseSnap?.baseServicePrices,
          baseCustomItems: baseSnap?.baseCustomItems,
        });
        if (res?.isConflict && res?.latestPriceList) {
          applyPriceListToForm(res.latestPriceList);
          toast.warning("ตารางราคานี้ถูกแก้ไขโดยผู้ใช้อื่นเมื่อสักครู่ ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาตรวจสอบก่อนบันทึกอีกครั้ง");
          return;
        }
        toast.success("Price list updated");
      } else {
        await priceListStore.addPriceList({
          name: name.trim(),
          isCorporate: false,
          customItems: undefined,
          servicePrices: cleanedServicePrices,
        });
        toast.success("Price list created");
      }
    }
    setIsModalOpen(false);
  };

  const handlePriceChange = (serviceId: string, val: string) => {
    const num = parseFloat(val);
    setServicePrices(prev => ({ ...prev, [serviceId]: isNaN(num) ? 0 : num }));
  };

  const handleUpdateReceiptSetting = async (key: string, value: string) => {
    try {
      await settingsStore.updateSetting(key, value);
      const { refreshDb } = await import("@/lib/api");
      await refreshDb();
      toast.success("POS Receipt settings updated");
    } catch (err) {
      toast.error("Failed to update receipt settings: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleQrUpload = useCallback(async (file: File) => {
    setIsUploadingQr(true);
    try {
      // Try GCS signed URL first, fall back to local upload
      const shopId = editingShop?.id || "new-branch";
      let publicUrl = "";
      try {
        const res = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "system",
            entityId: shopId,
            subType: "qr",
            contentType: file.type,
            fileName: file.name,
          }),
        });
        if (res.ok) {
          const { uploadUrl, publicUrl: gcsUrl } = await res.json();
          await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          publicUrl = gcsUrl;
        }
      } catch {
        // GCS unavailable — use local upload
      }

      if (!publicUrl) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "system");
        formData.append("entityId", shopId);
        formData.append("subType", "qr");
        const res = await fetch("/api/upload-local", { method: "POST", body: formData });
        const data = await res.json();
        publicUrl = data.publicUrl || "";
      }

      if (publicUrl) {
        setShopProformaQrUrl(publicUrl);
        toast.success("QR Code uploaded successfully");
      } else {
        toast.error("Upload failed");
      }
    } catch (err) {
      toast.error("Upload error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsUploadingQr(false);
    }
  }, [editingShop?.id]);

  const handleEditShop = (shop: ShopLocation) => {
    originalShopRef.current = {
      ...shop,
      coords: shop.coords ? { ...shop.coords } : { lat: 13.736717, lng: 100.523186 },
    };
    setEditingShop(shop);
    setShopName(shop.name);
    setShopAddress(shop.address);
    setShopCoords(shop.coords);
    setShopNoCommission(shop.noCommission || false);
    setShopIsPosEnabled(shop.isPosEnabled || false);
    setShopArea(shop.area || "BKK");
    setShopLogoUrl(shop.logoUrl || "");
    setShopPhone(shop.phone || "");
    setShopTaxId(shop.taxId || "");
    setShopAddressFull(shop.addressFull || "");
    setShopProformaQrUrl(shop.proformaQrUrl || "");
    setIsShopModalOpen(true);
  };

  const handleAddShop = () => {
    originalShopRef.current = null;
    setEditingShop(null);
    setShopName("");
    setShopAddress("");
    setShopCoords({ lat: 13.736717, lng: 100.523186 });
    setShopNoCommission(false);
    setShopIsPosEnabled(false);
    setShopArea("BKK");
    setShopLogoUrl("");
    setShopPhone("");
    setShopTaxId("");
    setShopAddressFull("");
    setShopProformaQrUrl("");
    setIsShopModalOpen(true);
  };

  const handleDeleteShop = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete branch: ${name}?`)) {
      shopStore.deleteShopLocation(id);
      toast.success("Branch deleted");
    }
  };

  const handleShopSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim() || !shopAddress.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    const payload = {
      name: shopName,
      address: shopAddress,
      coords: shopCoords,
      noCommission: shopNoCommission,
      isPosEnabled: shopIsPosEnabled,
      area: shopArea,
      logoUrl: shopLogoUrl.trim() || null,
      phone: shopPhone.trim() || null,
      taxId: shopTaxId.trim() || null,
      addressFull: shopAddressFull.trim() || null,
      proformaQrUrl: shopProformaQrUrl.trim() || null,
    };
    try {
      if (editingShop) {
        const orig = originalShopRef.current;
        const dirtyPayload: Partial<ShopLocation> = {};
        if (!orig) {
          Object.assign(dirtyPayload, payload);
        } else {
          if (payload.name !== orig.name) dirtyPayload.name = payload.name;
          if (payload.address !== orig.address) dirtyPayload.address = payload.address;
          if (
            payload.coords.lat !== orig.coords?.lat ||
            payload.coords.lng !== orig.coords?.lng
          ) {
            dirtyPayload.coords = payload.coords;
          }
          if (Boolean(payload.noCommission) !== Boolean(orig.noCommission)) {
            dirtyPayload.noCommission = payload.noCommission;
          }
          if (Boolean(payload.isPosEnabled) !== Boolean(orig.isPosEnabled)) {
            dirtyPayload.isPosEnabled = payload.isPosEnabled;
          }
          if (payload.area !== (orig.area || "BKK")) dirtyPayload.area = payload.area;
          if (payload.logoUrl !== (orig.logoUrl || null)) dirtyPayload.logoUrl = payload.logoUrl;
          if (payload.phone !== (orig.phone || null)) dirtyPayload.phone = payload.phone;
          if (payload.taxId !== (orig.taxId || null)) dirtyPayload.taxId = payload.taxId;
          if (payload.addressFull !== (orig.addressFull || null)) dirtyPayload.addressFull = payload.addressFull;
          if (payload.proformaQrUrl !== (orig.proformaQrUrl || null)) dirtyPayload.proformaQrUrl = payload.proformaQrUrl;
        }
        if (Object.keys(dirtyPayload).length > 0) {
          await shopStore.updateShopLocation(editingShop.id, dirtyPayload);
        }
        toast.success("Branch updated");
      } else {
        await shopStore.addShopLocation(payload);
        toast.success("Branch added");
      }
      setIsShopModalOpen(false);
    } catch (err: any) {
      console.error("Failed to save branch:", err);
      toast.error(err?.message || "Failed to save branch");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-400">
      {/* 1. Modern Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl shadow-slate-950/20 border border-slate-800/80">
        <div className="pointer-events-none absolute -right-16 -top-16 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute right-32 -bottom-20 w-72 h-72 rounded-full bg-emerald-500/10 blur-2xl" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase bg-white/10 text-indigo-200 backdrop-blur-md border border-white/15">
                <SlidersHorizontal size={12} className="text-indigo-400" />
                Workspace Settings &amp; Configuration
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              System Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xl leading-relaxed">
              Configure dynamic pricing catalogs, manage physical branch service hubs, payment channels, hardware integration, and platform defaults.
            </p>
          </div>

          {/* Quick Metrics & Fast Tab Jumpers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSettingsTab("pricing")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md ${
                activeSettingsTab === "pricing" 
                  ? "bg-indigo-600/30 border-indigo-400/80 ring-2 ring-indigo-400/30" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Price Lists</span>
                <Settings2 size={12} className="text-indigo-400" />
              </div>
              <div className="text-lg font-black text-white mt-1 flex items-baseline gap-1.5">
                <span>{priceLists.length}</span>
                <span className="text-[10px] font-semibold text-indigo-300">Active</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSettingsTab("branches")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md ${
                activeSettingsTab === "branches" 
                  ? "bg-emerald-600/30 border-emerald-400/80 ring-2 ring-emerald-400/30" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Branches</span>
                <Store size={12} className="text-emerald-400" />
              </div>
              <div className="text-lg font-black text-white mt-1 flex items-baseline gap-1.5">
                <span>{shopLocations.length}</span>
                <span className="text-[10px] font-semibold text-emerald-300">Hubs</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSettingsTab("payments")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md ${
                activeSettingsTab === "payments" 
                  ? "bg-sky-600/30 border-sky-400/80 ring-2 ring-sky-400/30" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Payments</span>
                <CreditCard size={12} className="text-sky-400" />
              </div>
              <div className="text-lg font-black text-white mt-1 flex items-baseline gap-1.5">
                <span>{paymentChannels.length}</span>
                <span className="text-[10px] font-semibold text-sky-300">Methods</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSettingsTab("pos")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer backdrop-blur-md ${
                activeSettingsTab === "pos" 
                  ? "bg-amber-600/30 border-amber-400/80 ring-2 ring-amber-400/30" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Hardware</span>
                <Usb size={12} className={drawerStatus.isPaired ? "text-emerald-400" : "text-amber-400"} />
              </div>
              <div className="text-lg font-black text-white mt-1 flex items-baseline gap-1.5">
                <span className={`w-2 h-2 rounded-full ${drawerStatus.isPaired ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className="text-xs font-bold">{drawerStatus.isPaired ? "Ready" : "Pairing"}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Modern Segmented Tab Bar & Search Filter */}
      <div className="bg-white/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sticky top-2 z-20">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-0.5">
          {[
            { id: "all", label: "All Overview", icon: Layers, count: null },
            { id: "pricing", label: "Price Lists", icon: Settings2, count: priceLists.length },
            { id: "branches", label: "Branches", icon: Store, count: shopLocations.length },
            { id: "payments", label: "Payments & VAT", icon: CreditCard, count: paymentChannels.length },
            { id: "pos", label: "POS & Hardware", icon: Printer, count: null },
            { id: "system", label: "System & API", icon: Key, count: null },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSettingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSettingsTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                }`}
              >
                <Icon size={14} className={isActive ? "text-indigo-400" : "text-slate-400"} />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-700"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Live Filter Input */}
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={settingsSearch}
            onChange={e => setSettingsSearch(e.target.value)}
            placeholder="Search settings..."
            className="h-9 pl-8.5 pr-8 text-xs rounded-xl bg-slate-50/80 border-slate-200 focus:bg-white focus:border-indigo-400"
          />
          {settingsSearch && (
            <button
              type="button"
              onClick={() => setSettingsSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DYNAMIC PRICE LISTS                                            */}
      {/* ========================================================================= */}
      {(activeSettingsTab === "all" || activeSettingsTab === "pricing") && (
        (!settingsSearch || "price list catalog corporate contract override default".includes(settingsSearch.toLowerCase())) && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <Settings2 size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Dynamic Price Lists</h3>
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                      {priceLists.length} Catalogs
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Create unlimited price lists to assign custom or corporate contract rates to customers.</p>
                </div>
              </div>

              <Button 
                onClick={() => {
                  setName("");
                  setServicePrices({});
                  setIsCorporateCatalog(true);
                  const initialItems: PriceListItem[] = services
                    .filter(s => s.isActive !== false && s.category !== 'PACKAGE')
                    .map(s => ({
                      id: s.id,
                      serviceId: s.id,
                      name: s.name,
                      nameEn: s.nameEn || null,
                      category: s.category || "GENERAL",
                      unit: s.unit || "ชิ้น",
                      price: s.price || 0,
                    }));
                  setCustomItems(initialItems);
                  setEditingList(null);
                  setIsModalOpen(true);
                }} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9.5 px-4 rounded-xl shadow-xs shadow-indigo-600/25 hover:shadow-md cursor-pointer transition-all gap-1.5 self-start sm:self-auto"
              >
                <Plus size={15} />
                <span>Add Price List</span>
              </Button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {priceLists
                .filter(l => !settingsSearch || l.name.toLowerCase().includes(settingsSearch.toLowerCase()))
                .map(list => {
                  const isCorp = Boolean(list.isCorporate || (list.customItems && list.customItems.length > 0));
                  const itemCount = isCorp ? (list.customItems?.length || 0) : Object.keys(list.servicePrices || {}).length;

                  return (
                    <div 
                      key={list.id} 
                      className="group rounded-2xl bg-slate-50/50 hover:bg-white border border-slate-200/80 hover:border-indigo-300 p-4.5 sm:p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight group-hover:text-indigo-900 transition-colors">
                            {list.name}
                          </h4>

                          {list.isDefault && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-black uppercase text-[9.5px] tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                              <CheckCircle2 size={11} className="text-emerald-700" /> Default Base
                            </Badge>
                          )}

                          {isCorp && (
                            <Badge className="bg-gradient-to-r from-amber-100 to-amber-200/90 text-amber-900 border border-amber-300 font-extrabold uppercase text-[9.5px] tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                              <Building size={11} className="text-amber-800" /> Corporate Catalog
                            </Badge>
                          )}

                          {!list.isDefault && !isCorp && (
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-bold uppercase text-[9px] tracking-wider px-2 py-0.5 rounded-md">
                              Custom Special
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                            isCorp 
                              ? 'bg-amber-50/80 text-amber-900 border-amber-200/80' 
                              : 'bg-white text-slate-600 border-slate-200/80'
                          }`}>
                            <Tag size={12} className={isCorp ? 'text-amber-600' : 'text-slate-400'} />
                            <span>
                              <strong className="font-black text-slate-900">{itemCount}</strong> {isCorp ? 'contract items (สินค้าตามสัญญา)' : 'overridden prices'}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleDuplicate(list)} 
                          className="h-9 px-3 gap-1.5 border-slate-200 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/70 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          <Copy size={13} className="text-slate-400 group-hover:text-indigo-600" />
                          <span>Duplicate</span>
                        </Button>

                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEdit(list)} 
                          className="h-9 px-3.5 gap-1.5 border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          <Edit3 size={13} className="text-slate-500" />
                          <span>Edit</span>
                        </Button>

                        {!list.isDefault && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(list.id, list.name)} 
                            className="h-9 w-9 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Delete price list"
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: BRANCH LOCATIONS                                               */}
      {/* ========================================================================= */}
      {(activeSettingsTab === "all" || activeSettingsTab === "branches") && (
        (!settingsSearch || "branch hub location shop store address".includes(settingsSearch.toLowerCase())) && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <Store size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Branch Locations</h3>
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                      {shopLocations.length} Hubs
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Manage physical shop locations used for pickup/delivery maps, routes, and staff assignments.</p>
                </div>
              </div>

              <Button 
                onClick={handleAddShop} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9.5 px-4 rounded-xl shadow-xs shadow-emerald-600/25 hover:shadow-md cursor-pointer transition-all gap-1.5 self-start sm:self-auto"
              >
                <Plus size={15} />
                <span>Add Branch</span>
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shopLocations
                .filter(s => !settingsSearch || s.name.toLowerCase().includes(settingsSearch.toLowerCase()) || s.address.toLowerCase().includes(settingsSearch.toLowerCase()))
                .map((shop, idx) => {
                  const isMainHub = (shop.name || "").toLowerCase().includes("15 sukhumvit") || (shop.name || "").toLowerCase().includes("sukhumvit 15") || idx === 0;

                  return (
                    <div 
                      key={shop.id} 
                      className="group rounded-2xl bg-slate-50/40 hover:bg-white border border-slate-200/90 hover:border-emerald-300 p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                              <Store size={18} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-extrabold text-slate-900 text-base leading-snug group-hover:text-emerald-950 transition-colors">
                                {shop.name}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                                  shop.area === "PTY"
                                    ? "bg-amber-50 text-amber-700 border-amber-200/80"
                                    : "bg-sky-50 text-sky-700 border-sky-200/80"
                                }`}>
                                  {shop.area || "BKK"}
                                </span>

                                {isMainHub && (
                                  <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 flex items-center gap-1">
                                    ⭐ Main Hub
                                  </span>
                                )}

                                {shop.noCommission && (
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/80">
                                    ไม่มีค่าคอม
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleEditShop(shop)} 
                              className="h-8 w-8 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                              title="Edit branch"
                            >
                              <Edit3 size={14} />
                            </Button>
                            {shopLocations.length > 1 && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteShop(shop.id, shop.name)} 
                                className="h-8 w-8 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                                title="Delete branch"
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Address Box */}
                        <div className="bg-white rounded-xl p-3 border border-slate-200/70 text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
                          <MapPin size={14} className="shrink-0 text-emerald-600 mt-0.5" />
                          <span className="line-clamp-2">{shop.address}</span>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active Hub
                        </span>
                        <button 
                          type="button" 
                          onClick={() => handleEditShop(shop)}
                          className="text-xs font-bold text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer"
                        >
                          Edit Details →
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: PAYMENTS & VAT                                                 */}
      {/* ========================================================================= */}
      {(activeSettingsTab === "all" || activeSettingsTab === "payments") && (
        (!settingsSearch || "payment channel vat tax transfer cash card promptpay".includes(settingsSearch.toLowerCase())) && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Payment Channels Table */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Payment Channels</h3>
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-sky-50 text-sky-700 border border-sky-200/70">
                        {paymentChannels.length} Channels
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Configure accepted payment methods (cash, transfers, cards, promptpay) for POS registers and dispatch orders.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetDefaultChannels}
                    className="text-xs text-slate-500 hover:text-slate-800 rounded-xl h-9"
                  >
                    Reset Defaults
                  </Button>
                  <Button
                    type="button"
                    onClick={handleOpenAddChannel}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs shadow-sky-600/25 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Add Channel</span>
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-6">Channel Name</th>
                        <th className="py-3.5 px-6">Type</th>
                        <th className="py-3.5 px-6 text-center">Status</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paymentChannels
                        .filter(c => !settingsSearch || c.name.toLowerCase().includes(settingsSearch.toLowerCase()) || c.type.toLowerCase().includes(settingsSearch.toLowerCase()))
                        .map((channel) => {
                          const typeInfo = PAYMENT_TYPE_LABELS[channel.type] || PAYMENT_TYPE_LABELS.other;
                          return (
                            <tr key={channel.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-6 font-bold text-slate-900">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{channel.name}</span>
                                  {channel.requiresMember && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                      Member Only
                                    </Badge>
                                  )}
                                  {channel.isSystem && (
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      (system)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-6">
                                <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${typeInfo.color}`}>
                                  {typeInfo.label}
                                </span>
                              </td>
                              <td className="py-3.5 px-6 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleChannel(channel.id)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                    channel.enabled
                                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                      : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                  }`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${channel.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                                  {channel.enabled ? "Active" : "Disabled"}
                                </button>
                              </td>
                              <td className="py-3.5 px-6 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEditChannel(channel)}
                                    className="h-8 w-8 p-0 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit3 size={14} />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingChannel(channel)}
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* VAT & Tax Settings */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
                  <Percent size={20} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">VAT &amp; Tax Configuration</h3>
                  <p className="text-xs text-slate-500 font-medium">Configure default Value-Added Tax rules and percentages applied during invoicing.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">VAT Calculation Mode</Label>
                  <select
                    value={vatTypeInput}
                    onChange={e => {
                      setVatTypeInput(e.target.value);
                      handleSaveVatSetting("vatType", e.target.value);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-11"
                  >
                    <option value="none">No VAT (ไม่มีภาษี)</option>
                    <option value="inclusive">Inclusive VAT (รวมภาษีในราคาสินค้า)</option>
                    <option value="exclusive">Exclusive VAT (คำนวณภาษีเพิ่มจากราคาสินค้า)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">VAT Rate Percentage</Label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      step="any"
                      value={vatRateInput} 
                      onChange={e => setVatRateInput(e.target.value)} 
                      onBlur={() => handleSaveVatSetting("vatRate", vatRateInput)}
                      placeholder="7" 
                      className="font-bold pr-10 h-11 rounded-xl border-slate-200"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: POS & HARDWARE                                                 */}
      {/* ========================================================================= */}
      {(activeSettingsTab === "all" || activeSettingsTab === "pos") && (
        (!settingsSearch || "pos receipt printer cash drawer kick hardware voucher bt-100u paper".includes(settingsSearch.toLowerCase())) && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Hardware: Cash Drawer */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                    <Banknote size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Cash Drawer Hardware</h3>
                      <Badge className={drawerStatus.isPaired ? "bg-emerald-100 text-emerald-800 border-none font-bold" : "bg-amber-100 text-amber-800 border-none font-bold"}>
                        {drawerStatus.isPaired ? "Device Paired" : "Not Paired"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Configure automatic drawer kick behavior and pair USB-to-RJ11 (BT-100U) triggers via Web Serial API.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePairDrawer}
                    disabled={isPairingDrawer}
                    className="h-9.5 px-3.5 text-xs font-bold bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs rounded-xl cursor-pointer"
                  >
                    {isPairingDrawer ? (
                      <RefreshCw size={13} className="animate-spin mr-1.5" />
                    ) : (
                      <Usb size={13} className="mr-1.5 text-indigo-600" />
                    )}
                    {drawerStatus.isPaired ? "Re-pair USB" : "Pair BT-100U Device"}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleTestKick}
                    disabled={isTestingDrawer || !drawerStatus.isPaired}
                    className="h-9.5 px-4 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {isTestingDrawer ? (
                      <RefreshCw size={13} className="animate-spin mr-1.5" />
                    ) : (
                      <Banknote size={13} className="mr-1.5" />
                    )}
                    Test Kick
                  </Button>
                </div>
              </div>

              {/* Trigger Checkboxes Grid */}
              <div className="space-y-3">
                <Label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  Drawer Kick Trigger Conditions
                </Label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white cursor-pointer transition-all shadow-2xs">
                    <input
                      type="checkbox"
                      checked={cashDrawerAutoOpenOnPay}
                      onChange={e => {
                        const checked = e.target.checked;
                        setCashDrawerAutoOpenOnPay(checked);
                        handleUpdateReceiptSetting("cashDrawerAutoOpenOnPay", checked ? "true" : "false");
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-900 block">Open on Cash Pay</span>
                      <span className="text-[11px] text-slate-500 block leading-relaxed">
                        Kicks drawer automatically when completing Cash or Split-Cash payment at register.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white cursor-pointer transition-all shadow-2xs">
                    <input
                      type="checkbox"
                      checked={cashDrawerAutoOpenOnPrint}
                      onChange={e => {
                        const checked = e.target.checked;
                        setCashDrawerAutoOpenOnPrint(checked);
                        handleUpdateReceiptSetting("cashDrawerAutoOpenOnPrint", checked ? "true" : "false");
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-900 block">Open on Print Receipt</span>
                      <span className="text-[11px] text-slate-500 block leading-relaxed">
                        Kicks drawer when clicking Print in the receipt preview dialog for cash orders.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white cursor-pointer transition-all shadow-2xs">
                    <input
                      type="checkbox"
                      checked={cashDrawerShowManualButton}
                      onChange={e => {
                        const checked = e.target.checked;
                        setCashDrawerShowManualButton(checked);
                        handleUpdateReceiptSetting("cashDrawerShowManualButton", checked ? "true" : "false");
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-900 block">Show Manual Kick Button</span>
                      <span className="text-[11px] text-slate-500 block leading-relaxed">
                        Display a quick-access manual [Open Drawer] button on POS header &amp; Job Table.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* POS Printer & Voucher Policies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Receipt Printer Card */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                    <Printer size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Receipt Printing Defaults</h3>
                    <p className="text-xs text-slate-500 font-medium">Default paper sizing and print language.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">Receipt Paper Width</Label>
                    <select
                      value={receiptPaperSize}
                      onChange={e => {
                        setReceiptPaperSize(e.target.value);
                        handleUpdateReceiptSetting("receiptPaperSize", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10"
                    >
                      <option value="80mm">80mm (Standard POS Thermal)</option>
                      <option value="58mm">58mm (Compact Mobile Thermal)</option>
                      <option value="A5">A5 (Half Letter Sheet)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">Default Receipt Language</Label>
                    <select
                      value={currentLanguage}
                      onChange={e => {
                        setCurrentLanguage(e.target.value);
                        handleUpdateReceiptSetting("language", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-bold rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 h-10"
                    >
                      <option value="th">ไทย (Thai)</option>
                      <option value="en">English (EN)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Promotion & Voucher Policy */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                    <Ticket size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Voucher &amp; Discounts</h3>
                    <p className="text-xs text-slate-500 font-medium">Automated coupon policies at checkout.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200/90 bg-amber-50/40 hover:bg-amber-50/70 cursor-pointer transition-all shadow-2xs">
                    <input
                      type="checkbox"
                      checked={posAutoApplyVoucher}
                      onChange={e => {
                        const checked = e.target.checked;
                        setPosAutoApplyVoucher(checked);
                        handleUpdateReceiptSetting("posAutoApplyVoucher", checked ? "true" : "false");
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-amber-950 block">
                        Auto-apply Best Voucher at POS (นำคูปองที่ดีที่สุดมาใช้ให้อัตโนมัติ)
                      </span>
                      <span className="text-[11px] text-amber-900/80 block leading-relaxed">
                        เมื่อเลือกลูกค้าที่มีคูปองในระบบ POS จะคำนวณและเลือกคูปองที่ประหยัดให้ลูกค้ามากที่สุดมาหักลดทันที
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: SYSTEM, INTEGRATIONS & SECURITY                                */}
      {/* ========================================================================= */}
      {(activeSettingsTab === "all" || activeSettingsTab === "system") && (
        (!settingsSearch || "system api google maps rider commission rate timeout session security deploy".includes(settingsSearch.toLowerCase())) && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Google Maps API Key Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                  <Compass size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Google Maps Platform &amp; Places API</h3>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      enableGoogleApi ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {enableGoogleApi ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Manage third-party search and routing services used across dispatch and map lookups.</p>
                </div>
              </div>

              <div className="max-w-2xl space-y-5">
                {/* Toggle Card */}
                <div 
                  onClick={() => setEnableGoogleApi(!enableGoogleApi)}
                  className={`flex items-start justify-between gap-4 p-4.5 rounded-2xl border transition-all cursor-pointer ${
                    enableGoogleApi
                      ? "bg-amber-50/40 border-amber-200/90 shadow-2xs"
                      : "bg-slate-50/80 border-slate-200/80 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      enableGoogleApi ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-500'
                    }`}>
                      <Compass size={18} />
                    </div>
                    <div>
                      <span className="text-sm font-extrabold text-slate-900 block">Enable Google Maps Search (Fallback)</span>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        If disabled, location lookups will strictly search within your imported local database. When enabled, Google Maps acts as a rich fallback.
                      </p>
                    </div>
                  </div>

                  <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 mt-1 ${enableGoogleApi ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${enableGoogleApi ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                  </div>
                </div>

                {/* API Key Box */}
                <div className={`space-y-2.5 transition-opacity duration-200 ${enableGoogleApi ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      <span>Google Maps API Key</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      {showGoogleApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showGoogleApiKey ? "Hide Key" : "Reveal Key"}</span>
                    </button>
                  </div>

                  <div className="relative">
                    <Input 
                      type={showGoogleApiKey ? "text" : "password"} 
                      value={googleApiKey} 
                      onChange={e => setGoogleApiKey(e.target.value)} 
                      placeholder="AIzaSy..." 
                      className="font-mono text-sm h-10.5 rounded-xl border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 pr-10"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Requires Places API and Geocoding API to be enabled on your Google Cloud Console. Keys are encrypted and used only for location queries.
                  </p>
                </div>
                
                <Button 
                  onClick={handleSaveApiSettings} 
                  disabled={isVerifyingKey} 
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-xs cursor-pointer transition-all gap-1.5"
                >
                  {isVerifyingKey ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Verifying Key...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Save API Settings</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Rider Commission & Session Security 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rider Commission Settings */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                      <Coins size={20} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Rider Commission Rate</h3>
                      <p className="text-xs text-slate-500 font-medium">Payout calculation per kilometer for delivery team.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">Commission Rate (฿ per km)</Label>
                    <div className="relative max-w-[200px]">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black">฿</span>
                      <Input 
                        id="rider-commission-input"
                        type="number" 
                        step="0.1"
                        value={commissionRateInput} 
                        onChange={e => setCommissionRateInput(e.target.value)} 
                        placeholder="2.0" 
                        className="pl-8 font-black text-sm h-11 rounded-xl"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Used to calculate pickup and delivery rider payout based on distance from branch. Default is ฿2.0 / km.
                    </p>
                  </div>
                </div>

                <Button 
                  id="save-commission-btn" 
                  onClick={handleSaveCommissionSettings} 
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-xs self-start cursor-pointer"
                >
                  Save Commission Rate
                </Button>
              </div>

              {/* Security & Idle Session Timeout */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Security &amp; Session Timeout</h3>
                      <p className="text-xs text-slate-500 font-medium">Idle user auto-logout duration.</p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <Label className="font-bold text-xs uppercase tracking-wider text-slate-700">
                      Idle Timeout Duration
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-32">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={sessionTimeoutInput}
                          onChange={(e) => setSessionTimeoutInput(e.target.value)}
                          placeholder="20"
                          className="font-black pr-12 h-10 text-xs rounded-xl"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">min</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {["15", "20", "30", "60", "0"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleSaveSessionTimeout(preset)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              sessionTimeoutInput === preset
                                ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {preset === "0" ? "Off" : `${preset}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed">
                    <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Force Re-login on Deploy:</strong> The system automatically logs out stale sessions whenever a new application build is deployed.
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => handleSaveSessionTimeout()}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-xs self-start cursor-pointer"
                >
                  Save Timeout Settings
                </Button>
              </div>
            </div>
          </div>
        )
      )}


      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[90vh]">
            <DialogHeader className="p-8 bg-slate-900 text-white shrink-0">
              <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2.5">
                {isCorporateCatalog ? <Building className="text-amber-400" size={26} /> : <Tag className="text-indigo-400" size={26} />}
                {editingList 
                  ? (isCorporateCatalog ? "Edit Corporate B2B Catalog" : "Edit Price List") 
                  : (isCorporateCatalog ? "Create Corporate B2B Catalog" : "Create New Price List")}
              </DialogTitle>
              <DialogDescription className="text-slate-300 text-sm mt-1">
                {isCorporateCatalog 
                  ? "กำหนดรายการสินค้าและราคาเฉพาะสัญญาสำหรับบริษัทนี้ สามารถเพิ่ม/ลบรายการและกำหนดราคาได้อย่างอิสระ" 
                  : "กำหนดชื่อและราคา Override สำหรับบริการที่ต้องการ ช่องที่เว้นไว้จะใช้ราคามาตรฐานของร้าน"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
              <div className="space-y-8">
                {/* Catalog Type Switcher */}
                <div className="space-y-2">
                  <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Catalog Type / ประเภทตารางราคา
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCorporateCatalog(true);
                        if (customItems.length === 0) {
                          const initialItems: PriceListItem[] = services
                            .filter(s => s.isActive !== false && s.category !== 'PACKAGE')
                            .map(s => ({
                              id: s.id,
                              serviceId: s.id,
                              name: s.name,
                              nameEn: s.nameEn || null,
                              category: s.category || "GENERAL",
                              unit: s.unit || "ชิ้น",
                              price: servicePrices[s.id] ?? s.price ?? 0,
                            }));
                          setCustomItems(initialItems);
                        }
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isCorporateCatalog
                          ? "border-amber-400 bg-amber-50/70 shadow-sm ring-2 ring-amber-400/20"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm flex items-center gap-2 text-amber-950">
                          <Building size={16} className="text-amber-600" />
                          Corporate B2B Catalog
                        </span>
                        {isCorporateCatalog && (
                          <span className="text-[10px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
                        ตารางสินค้าเฉพาะของบริษัทนี้ สามารถเพิ่ม/ลบรายการและกำหนดราคาเฉพาะสัญญาได้อิสระ
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCorporateCatalog(false)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        !isCorporateCatalog
                          ? "border-indigo-400 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-400/20"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm flex items-center gap-2 text-indigo-950">
                          <Tag size={16} className="text-indigo-600" />
                          Standard Price Override
                        </span>
                        {!isCorporateCatalog && (
                          <span className="text-[10px] font-black uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-indigo-900/80 leading-relaxed font-medium">
                        ใช้รายการสินค้าเดียวกับร้านทั้งหมด และกำหนดเฉพาะราคาลดพิเศษบางรายการ
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {isCorporateCatalog ? "Company / Contract Identification" : "Price List Identification"}
                  </Label>
                  <Input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder={isCorporateCatalog ? "e.g. Corporate - Hotel Marriott, Corporate - Bangkok Hospital" : "e.g. Wholesale Partners, VIP Members"} 
                    className="h-14 bg-white text-lg font-bold border-slate-200 focus-visible:ring-indigo-500 rounded-xl shadow-sm"
                  />
                </div>

                {isCorporateCatalog ? (
                  /* ======================================================== */
                  /* CORPORATE B2B CATALOG: INDEPENDENT ITEMS TABLE           */
                  /* ======================================================== */
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <Label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                          Contract Product Items (รายการสินค้าเฉพาะของบริษัทนี้)
                        </Label>
                        <p className="text-xs text-slate-500 font-medium">
                          ลบรายการที่ไม่ใช้ออกได้ หรือกดเพิ่มรายการใหม่เฉพาะของลูกค้ารายนี้ได้อิสระ
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input
                            placeholder="ค้นหารายการ..."
                            value={catalogSearch}
                            onChange={e => setCatalogSearch(e.target.value)}
                            className="h-9 pl-8 w-44 text-xs bg-white rounded-xl"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            const newItem: PriceListItem = {
                              id: `ITEM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
                              name: "",
                              nameEn: "",
                              category: "B2B",
                              unit: "ชิ้น",
                              price: 0,
                            };
                            setCustomItems(prev => [newItem, ...prev]);
                            toast.success("เพิ่มแถวสินค้าใหม่แล้ว กรุณากรอกชื่อและราคา");
                          }}
                          className="h-9 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl gap-1.5 shadow-sm cursor-pointer shrink-0"
                        >
                          <Plus size={14} /> เพิ่มสินค้าเฉพาะบริษัท
                        </Button>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-amber-50/70 border-b border-amber-200/60 text-[10px] uppercase font-black text-amber-950 tracking-wider sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-3 w-[45px]">#</th>
                              <th className="px-4 py-3">ชื่อสินค้า / บริการเฉพาะ</th>
                              <th className="px-4 py-3 w-[140px]">หมวดหมู่</th>
                              <th className="px-4 py-3 w-[110px]">หน่วยนับ</th>
                              <th className="px-4 py-3 w-[150px]">ราคาตามสัญญา (฿)</th>
                              <th className="px-4 py-3 w-[60px] text-center">ลบ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {customItems.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                                  ยังไม่มีรายการสินค้าในสัญญานี้ กด "+ เพิ่มสินค้าเฉพาะบริษัท" เพื่อเริ่มสร้าง
                                </td>
                              </tr>
                            ) : (
                              customItems
                                .map((item, index) => ({ item, index }))
                                .filter(({ item }) => {
                                  if (!catalogSearch.trim()) return true;
                                  const q = catalogSearch.toLowerCase();
                                  return (
                                    item.name.toLowerCase().includes(q) ||
                                    (item.nameEn && item.nameEn.toLowerCase().includes(q)) ||
                                    (item.category && item.category.toLowerCase().includes(q))
                                  );
                                })
                                .map(({ item, index }) => (
                                  <tr key={item.id || index} className="hover:bg-amber-50/20 transition-colors">
                                    <td className="px-4 py-2.5 text-xs font-mono text-slate-400 font-bold">
                                      {index + 1}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <Input
                                        placeholder="ระบุชื่อสินค้า/บริการ e.g. ผ้าปูเตียง 350 เส้น"
                                        value={item.name}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setCustomItems(prev => {
                                            const next = [...prev];
                                            next[index] = { ...next[index], name: val };
                                            return next;
                                          });
                                        }}
                                        className="h-9 text-xs font-bold text-slate-900 bg-white border-slate-200 rounded-xl"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <Input
                                        placeholder="Category"
                                        value={item.category || ""}
                                        onChange={e => {
                                          const val = e.target.value.toUpperCase();
                                          setCustomItems(prev => {
                                            const next = [...prev];
                                            next[index] = { ...next[index], category: val };
                                            return next;
                                          });
                                        }}
                                        className="h-9 text-xs font-bold uppercase text-slate-700 bg-white border-slate-200 rounded-xl"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <Input
                                        placeholder="e.g. ผืน, ชิ้น"
                                        value={item.unit || ""}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setCustomItems(prev => {
                                            const next = [...prev];
                                            next[index] = { ...next[index], unit: val };
                                            return next;
                                          });
                                        }}
                                        className="h-9 text-xs text-slate-700 bg-white border-slate-200 rounded-xl"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={item.price}
                                          onChange={e => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setCustomItems(prev => {
                                              const next = [...prev];
                                              next[index] = { ...next[index], price: val };
                                              return next;
                                            });
                                          }}
                                          className="h-9 text-xs font-bold font-mono pl-7 bg-white border-amber-300 focus-visible:ring-amber-500 rounded-xl text-amber-950"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          setCustomItems(prev => prev.filter((_, i) => i !== index));
                                        }}
                                        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                        title="ลบรายการนี้ออกจากสัญญา"
                                      >
                                        <Trash2 size={14} />
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-600 flex justify-between items-center">
                        <span>จำนวนรายการในสัญญานี้: <strong className="text-amber-800">{customItems.length}</strong> รายการ</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newItem: PriceListItem = {
                              id: `ITEM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
                              name: "",
                              nameEn: "",
                              category: "B2B",
                              unit: "ชิ้น",
                              price: 0,
                            };
                            setCustomItems(prev => [...prev, newItem]);
                          }}
                          className="h-7 text-xs border-dashed border-amber-400 text-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer"
                        >
                          <Plus size={12} className="mr-1" /> เพิ่มอีก 1 รายการ
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ======================================================== */
                  /* STANDARD PRICE OVERRIDES TABLE                           */
                  /* ======================================================== */
                  <div className="space-y-3">
                    <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pricing Configuration</Label>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100/50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                          <tr>
                            <th className="px-6 py-4">Service Name</th>
                            <th className="px-6 py-4 w-[140px]">Base Price</th>
                            <th className="px-6 py-4 w-[280px]">Custom Override (฿)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {services.map(service => (
                            <tr key={service.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900 text-base">{service.name}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{service.category}</div>
                              </td>
                              <td className="px-6 py-4 font-semibold text-slate-500">
                                ฿{service.price.toLocaleString()}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                                    <Input 
                                      type="number" 
                                      step="0.01"
                                      className={`h-11 w-full pl-8 font-bold rounded-xl transition-all ${servicePrices[service.id] !== undefined && servicePrices[service.id] !== service.price ? "border-indigo-300 bg-indigo-50 text-indigo-900 focus-visible:ring-indigo-500" : "border-slate-200 bg-slate-50 focus-visible:ring-slate-400"}`} 
                                      value={servicePrices[service.id] ?? service.price}
                                      onChange={e => handlePriceChange(service.id, e.target.value)}
                                    />
                                  </div>
                                  {servicePrices[service.id] !== undefined && servicePrices[service.id] !== service.price ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setServicePrices(prev => {
                                          const next = { ...prev };
                                          delete next[service.id];
                                          return next;
                                        });
                                      }}
                                      className="h-11 px-2.5 text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl shrink-0 cursor-pointer"
                                      title="รีเซ็ตกลับไปใช้ราคามาตรฐาน (Revert to Base Price)"
                                    >
                                      <RotateCcw size={12} className="mr-1" /> Revert
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 bg-slate-100 rounded-md shrink-0">
                                      Base
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="p-6 border-t border-slate-100 bg-white shrink-0">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="h-12 rounded-xl px-6 font-semibold cursor-pointer">Cancel</Button>
              <Button type="submit" className="h-12 rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-200 cursor-pointer">
                {editingList ? "บันทึกสัญญา / ตารางราคา" : "สร้างสัญญา / ตารางราคา"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isShopModalOpen} onOpenChange={setIsShopModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border-none shadow-2xl bg-white">
          <form onSubmit={handleShopSubmit}>
            <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100 shrink-0">
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Store className="text-emerald-500" />
                {editingShop ? "Edit Branch Location" : "Add New Branch"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                This location will be available for pickup/delivery calculations.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Branch Name</Label>
                  <Input required value={shopName} onChange={e => setShopName(e.target.value)} placeholder="e.g. Sukhumvit Soi 11" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Area Zone</Label>
                  <select 
                    value={shopArea} 
                    onChange={e => setShopArea(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 h-10"
                  >
                    <option value="BKK">BKK (Bangkok)</option>
                    <option value="PTY">PTY (Pattaya)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Address & Map Location</Label>
                <LocationInput 
                  id="shop-address"
                  placeholder="Search location or enter address"
                  value={shopAddress}
                  onChange={setShopAddress}
                  onSelectLocation={(loc) => setShopCoords({ lat: loc.lat, lng: loc.lng })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Latitude</Label>
                  <Input 
                    type="number"
                    step="any"
                    required
                    value={shopCoords.lat}
                    onChange={e => setShopCoords(prev => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                    className="h-10 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Longitude</Label>
                  <Input 
                    type="number"
                    step="any"
                    required
                    value={shopCoords.lng}
                    onChange={e => setShopCoords(prev => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
                    className="h-10 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Logo URL</Label>
                  <Input 
                    value={shopLogoUrl} 
                    onChange={e => setShopLogoUrl(e.target.value)} 
                    placeholder="https://.../logo.png" 
                    className="h-10 text-xs font-mono" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Phone Number</Label>
                  <Input 
                    value={shopPhone} 
                    onChange={e => setShopPhone(e.target.value)} 
                    placeholder="02-123-4567" 
                    className="h-10 text-sm font-bold" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Tax ID</Label>
                  <Input 
                    value={shopTaxId} 
                    onChange={e => setShopTaxId(e.target.value)} 
                    placeholder="13-digit Tax ID" 
                    className="h-10 text-sm font-mono" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  Full Address <span className="text-[11px] font-normal text-slate-400">(แสดงบนใบเสร็จ)</span>
                </Label>
                <textarea
                  value={shopAddressFull}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setShopAddressFull(e.target.value)}
                  placeholder={"เช่น 123/4 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110"}
                  rows={3}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
                />
                <p className="text-[11px] text-slate-400">ถ้าไม่กรอก จะใช้ Address &amp; Map Location แทน</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <QrCode size={14} className="text-emerald-600" />
                  Proforma QR Code <span className="text-[11px] font-normal text-slate-400">(แสดงบน Proforma Invoice เพื่อชำระเงิน)</span>
                </Label>

                {/* Hidden file input */}
                <input
                  ref={qrFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQrUpload(file);
                    e.target.value = "";
                  }}
                />

                {shopProformaQrUrl ? (
                  /* Preview mode — show QR image with replace/remove buttons */
                  <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shopProformaQrUrl}
                      alt="QR Preview"
                      className="h-24 w-24 object-contain rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                    <div className="flex flex-col gap-2 flex-1">
                      <p className="text-xs font-semibold text-slate-700">QR Code พร้อมใช้งานแล้ว ✅</p>
                      <p className="text-[10px] text-slate-400 break-all font-mono leading-tight">{shopProformaQrUrl.split('/').pop()}</p>
                      <div className="flex gap-2 mt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isUploadingQr}
                          onClick={() => qrFileInputRef.current?.click()}
                          className="h-7 text-[11px] px-3 border-slate-300"
                        >
                          {isUploadingQr ? "กำลัง Upload..." : "เปลี่ยนรูป"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShopProformaQrUrl("")}
                          className="h-7 text-[11px] px-3 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        >
                          ลบ QR
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Upload zone — drag & drop or click */
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !isUploadingQr && qrFileInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && !isUploadingQr && qrFileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && !isUploadingQr) handleQrUpload(file);
                    }}
                    className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors select-none
                      ${isUploadingQr ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50'}`}
                  >
                    {isUploadingQr ? (
                      <>
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-semibold text-emerald-600">กำลัง Upload...</p>
                      </>
                    ) : (
                      <>
                        <QrCode size={28} className="text-slate-400" />
                        <p className="text-xs font-semibold text-slate-600">คลิกหรือลากไฟล์รูป QR มาวาง</p>
                        <p className="text-[10px] text-slate-400">PNG, JPG, WEBP รองรับ</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <input 
                  type="checkbox" 
                  id="shopNoCommission" 
                  checked={shopNoCommission} 
                  onChange={(e) => setShopNoCommission(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-600 cursor-pointer"
                />
                <label htmlFor="shopNoCommission" className="text-sm font-semibold text-slate-800 cursor-pointer">
                  ไม่มีค่าคอม (No Commission)
                </label>
              </div>

              <div className="flex items-center gap-2 mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                <input 
                  type="checkbox" 
                  id="shopIsPosEnabled" 
                  checked={shopIsPosEnabled} 
                  onChange={(e) => setShopIsPosEnabled(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-600 cursor-pointer"
                />
                <label htmlFor="shopIsPosEnabled" className="text-sm font-semibold text-indigo-900 cursor-pointer">
                  เปิดใช้งาน POS และระบบเปิด-ปิดกะสำหรับสาขานี้
                </label>
              </div>
            </div>
            <DialogFooter className="p-6 border-t border-slate-100 shrink-0 bg-slate-50">
              <Button type="button" variant="outline" onClick={() => setIsShopModalOpen(false)} className="h-10 font-semibold px-6">Cancel</Button>
              <Button type="submit" className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 shadow-sm">
                {editingShop ? "Save Changes" : "Create Branch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Payment Channel Modal */}
      <Dialog open={isChannelModalOpen} onOpenChange={setIsChannelModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden bg-white rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="text-indigo-600" size={22} />
              {editingChannel ? "แก้ไขช่องทางการชำระเงิน" : "เพิ่มช่องทางการชำระเงินใหม่"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              กำหนดชื่อและประเภทช่องทางชำระเงินสำหรับแสดงในระบบ
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitChannel}>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="channelNameInput" className="text-xs font-bold text-slate-700">
                  ชื่อช่องทาง (Channel Name) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="channelNameInput"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="เช่น TrueMoney Wallet, Alipay, บัตรเครดิต"
                  className="h-10 text-sm font-semibold border-slate-200 focus:border-indigo-500"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="channelTypeInput" className="text-xs font-bold text-slate-700">
                  ประเภทการชำระเงิน (Payment Type)
                </Label>
                <select
                  id="channelTypeInput"
                  value={channelType}
                  onChange={(e) => setChannelType(e.target.value as PaymentChannelType)}
                  className="w-full h-10 px-3 text-sm font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-800"
                >
                  <option value="cash">เงินสด (Cash)</option>
                  <option value="transfer">โอนเงิน / QR Code (Transfer)</option>
                  <option value="card">บัตรเครดิต / เดบิต / Gateway (Card)</option>
                  <option value="wallet">วอลเล็ทสมาชิก (Wallet)</option>
                  <option value="credit">เครดิต / ค้างชำระ (Credit)</option>
                  <option value="other">อื่นๆ (Other)</option>
                </select>
              </div>

              <div className="pt-2 space-y-3 border-t border-slate-100">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="channelEnabledInput"
                    checked={channelEnabled}
                    onChange={(e) => setChannelEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <Label htmlFor="channelEnabledInput" className="text-xs font-semibold text-slate-800 cursor-pointer">
                    เปิดใช้งานช่องทางนี้ในระบบ (Active)
                  </Label>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="channelRequiresMemberInput"
                    checked={channelRequiresMember}
                    onChange={(e) => setChannelRequiresMember(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <Label htmlFor="channelRequiresMemberInput" className="text-xs font-semibold text-slate-800 cursor-pointer">
                    เฉพาะลูกค้าที่เป็นสมาชิกเท่านั้น (Member Only / หัก Wallet)
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsChannelModalOpen(false)}
                className="h-9 px-4 font-semibold text-xs text-slate-600"
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm"
              >
                {editingChannel ? "บันทึกการแก้ไข" : "เพิ่มช่องทาง"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Channel Confirmation Modal */}
      <Dialog open={!!deletingChannel} onOpenChange={(open) => !open && setDeletingChannel(null)}>
        <DialogContent className="sm:max-w-[400px] p-6 bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="text-red-600" size={20} />
              ยืนยันการลบช่องทางการชำระเงิน
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-2">
              คุณแน่ใจหรือไม่ว่าต้องการลบช่องทาง <span className="font-bold text-slate-800">"{deletingChannel?.name}"</span> ออกจากระบบ?
              บิลเก่าที่เคยใช้ช่องทางนี้จะยังคงเก็บประวัติไว้ตามเดิม
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingChannel(null)}
              className="h-9 px-4 text-xs font-semibold"
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDeleteChannel}
              className="h-9 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm"
            >
              ยืนยันลบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
