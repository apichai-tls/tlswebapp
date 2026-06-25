import { useState, useEffect, useSyncExternalStore } from "react";
import { Copy, Edit3, Trash2, Settings2, Store, MapPin, Plus, Key, Coins, QrCode } from "lucide-react";
import { priceListStore, serviceStore, shopStore, settingsStore, type PriceList, type ShopLocation } from "@/lib/store";
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

  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShopLocation | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopCoords, setShopCoords] = useState({ lat: 13.736717, lng: 100.523186 });
  const [shopNoCommission, setShopNoCommission] = useState(false);
  const [shopArea, setShopArea] = useState("BKK");

  const [googleApiKey, setGoogleApiKey] = useState("");
  const [enableGoogleApi, setEnableGoogleApi] = useState(false);
  const [commissionRateInput, setCommissionRateInput] = useState("2");
  const [enablePromptPay, setEnablePromptPay] = useState(false);
  const [ppSettings, setPpSettings] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (systemSettings) {
      setGoogleApiKey(systemSettings.googleMapsApiKey || "");
      setEnableGoogleApi(systemSettings.enableGoogleApi === "true");
      setCommissionRateInput(systemSettings.riderCommissionPerKm || "2");
      setEnablePromptPay(systemSettings.enablePromptPay === "true");
      
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

  const [isVerifyingKey, setIsVerifyingKey] = useState(false);

  const handleSaveApiSettings = async () => {
    if (enableGoogleApi && googleApiKey) {
      setIsVerifyingKey(true);
      try {
        // Test the API key by making a simple request
        const res = await fetch(`/api/places?query=test&key=${encodeURIComponent(googleApiKey)}`);
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
    setServicePrices({ ...baseList.servicePrices });
    setEditingList(null);
    setIsModalOpen(true);
  };

  const handleEdit = (list: PriceList) => {
    setEditingList(list);
    setName(list.name);
    setServicePrices({ ...list.servicePrices });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}? Customers using this will revert to Regular.`)) {
      priceListStore.deletePriceList(id);
      toast.success("Price list deleted");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

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
      priceListStore.updatePriceList(editingList.id, { name, servicePrices: cleanedServicePrices });
      toast.success("Price list updated");
    } else {
      priceListStore.addPriceList({ name, servicePrices: cleanedServicePrices });
      toast.success("Price list created");
    }
    setIsModalOpen(false);
  };

  const handlePriceChange = (serviceId: string, val: string) => {
    const num = parseFloat(val);
    setServicePrices(prev => ({ ...prev, [serviceId]: isNaN(num) ? 0 : num }));
  };

  const handleEditShop = (shop: ShopLocation) => {
    setEditingShop(shop);
    setShopName(shop.name);
    setShopAddress(shop.address);
    setShopCoords(shop.coords);
    setShopNoCommission(shop.noCommission || false);
    setShopArea(shop.area || "BKK");
    setIsShopModalOpen(true);
  };

  const handleAddShop = () => {
    setEditingShop(null);
    setShopName("");
    setShopAddress("");
    setShopCoords({ lat: 13.736717, lng: 100.523186 });
    setShopNoCommission(false);
    setShopArea("BKK");
    setIsShopModalOpen(true);
  };

  const handleDeleteShop = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete branch: ${name}?`)) {
      shopStore.deleteShopLocation(id);
      toast.success("Branch deleted");
    }
  };

  const handleShopSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim() || !shopAddress.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    if (editingShop) {
      shopStore.updateShopLocation(editingShop.id, { name: shopName, address: shopAddress, coords: shopCoords, noCommission: shopNoCommission, area: shopArea });
      toast.success("Branch updated");
    } else {
      shopStore.addShopLocation({ name: shopName, address: shopAddress, coords: shopCoords, noCommission: shopNoCommission, area: shopArea });
      toast.success("Branch added");
    }
    setIsShopModalOpen(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">System Settings</h2>
        <p className="text-slate-500 mt-1 font-medium">Configure global application settings and manage dynamic price lists.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <Settings2 size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Dynamic Price Lists</h3>
              <p className="text-xs text-slate-500 font-medium">Create unlimited price lists to assign to your customers.</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {priceLists.map(list => (
              <div key={list.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-slate-900 text-lg">{list.name}</h4>
                    {list.isDefault && (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-black uppercase text-[9px] tracking-wider px-2 py-0.5 rounded-md">Default Base</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-medium bg-slate-100 inline-block px-2 py-0.5 rounded-full border border-slate-200">
                    <span className="text-slate-700 font-bold">{Object.keys(list.servicePrices).length}</span> overridden prices
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleDuplicate(list)} className="h-9 gap-2 border-slate-200 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 font-semibold rounded-lg transition-all">
                    <Copy size={14} /> Duplicate
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(list)} className="h-9 gap-2 border-slate-200 hover:border-slate-300 font-semibold rounded-lg">
                    <Edit3 size={14} /> Edit
                  </Button>
                  {!list.isDefault && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(list.id, list.name)} className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-8 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
              <Store size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Branch Locations</h3>
              <p className="text-xs text-slate-500 font-medium">Manage shop locations used for pickup/delivery maps.</p>
            </div>
          </div>
          <Button onClick={handleAddShop} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm">
            <Plus size={16} className="mr-2" /> Add Branch
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shopLocations.map(shop => (
            <div key={shop.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col hover:border-emerald-200 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-1">
                  <h4 className="font-bold text-slate-900 text-lg">{shop.name}</h4>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] w-fit uppercase tracking-wider">{shop.area || "BKK"}</Badge>
                    {shop.noCommission && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 text-[10px] w-fit">ไม่มีค่าคอม</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleEditShop(shop)} className="h-8 w-8 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg">
                    <Edit3 size={14} />
                  </Button>
                  {shopLocations.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteShop(shop.id, shop.name)} className="h-8 w-8 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-sm text-slate-500 flex items-start gap-1.5 mt-auto">
                <MapPin size={14} className="shrink-0 text-emerald-500 mt-0.5" />
                <span className="line-clamp-2 leading-snug">{shop.address}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-8 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Integrations & API Keys</h3>
              <p className="text-xs text-slate-500 font-medium">Manage third-party services and system keys.</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
              <input 
                type="checkbox" 
                id="enableApi" 
                checked={enableGoogleApi} 
                onChange={(e) => setEnableGoogleApi(e.target.checked)}
                className="w-5 h-5 text-orange-600 rounded border-slate-300 focus:ring-orange-600 cursor-pointer"
              />
              <div className="flex flex-col">
                <label htmlFor="enableApi" className="text-sm font-bold text-slate-800 cursor-pointer">
                  Enable Google Maps Search (Fallback)
                </label>
                <span className="text-[10px] text-slate-500">If disabled, the system will ONLY search within your imported local database.</span>
              </div>
            </div>

            <div className={`space-y-2 transition-opacity duration-200 ${enableGoogleApi ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <Label className="font-semibold text-slate-700">Google Maps API Key</Label>
              <Input 
                type="password" 
                value={googleApiKey} 
                onChange={e => setGoogleApiKey(e.target.value)} 
                placeholder="AIzaSy..." 
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500">Requires Places API and Geocoding API to be enabled. This will be used for searching locations securely.</p>
            </div>
            
            <Button onClick={handleSaveApiSettings} disabled={isVerifyingKey} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
              {isVerifyingKey ? "Verifying Key..." : "Save API Settings"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-8 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl">
              <Coins size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Rider Commission Settings</h3>
              <p className="text-xs text-slate-500 font-medium">Configure the payout rate per kilometer for riders.</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="max-w-2xl space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold text-slate-700">Rider Commission Rate (฿ per km)</Label>
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                <Input 
                  type="number" 
                  step="0.1"
                  value={commissionRateInput} 
                  onChange={e => setCommissionRateInput(e.target.value)} 
                  placeholder="2.0" 
                  className="pl-8 font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500">This rate is used to calculate pickup and delivery commissions based on distance. Default is ฿2.0 per km.</p>
            </div>
            
            <Button onClick={handleSaveCommissionSettings} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
              Save Commission Rate
            </Button>
          </div>
        </div>
      </div>

      {/* Temporarily hidden: change false to true to show again */}
      {false && (
        <div className="space-y-4 pt-8 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                <QrCode size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">PromptPay Configuration</h3>
                <p className="text-xs text-slate-500 font-medium">Configure dynamic PromptPay QR code parameters for POS bank transfers.</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="max-w-4xl space-y-6">
              {/* Enable/Disable Toggle Checkbox */}
              <div className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
                <input 
                  type="checkbox" 
                  id="enablePromptPay" 
                  checked={enablePromptPay} 
                  onChange={(e) => setEnablePromptPay(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600 cursor-pointer"
                />
                <div className="flex flex-col">
                  <label htmlFor="enablePromptPay" className="text-sm font-bold text-slate-800 cursor-pointer">
                    Enable Dynamic PromptPay QR Code Payment
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Toggle whether to display dynamic PromptPay QR Codes during cashier checkout when payment method is Bank Transfer.
                  </span>
                </div>
              </div>

              <div className={`space-y-6 transition-opacity duration-200 ${enablePromptPay ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                {/* Global Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Global PromptPay ID (Mobile or Tax ID)</Label>
                    <Input 
                      value={ppSettings["global_id"] || ""} 
                      onChange={e => setPpSettings(prev => ({ ...prev, global_id: e.target.value }))} 
                      placeholder="e.g. 0812345678 or 1234567890123" 
                      className="font-mono"
                    />
                    <p className="text-[10px] text-slate-500">Default PromptPay ID if branch-specific is not set. 10-digit mobile number or 13-digit Tax ID.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Global Account Name</Label>
                    <Input 
                      value={ppSettings["global_name"] || ""} 
                      onChange={e => setPpSettings(prev => ({ ...prev, global_name: e.target.value }))} 
                      placeholder="e.g. THAI LAUNDRY SERVICE" 
                    />
                    <p className="text-[10px] text-slate-500">Optional account holder display name.</p>
                  </div>
                </div>

                {/* Branch Specific Config */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">Branch-Specific Configurations</h4>
                  
                  {shopLocations.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No shop locations configured yet.</p>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {shopLocations.map(shop => (
                        <div key={shop.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Store size={14} className="text-slate-400 shrink-0" />
                            {shop.name}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">PromptPay ID</Label>
                            <Input 
                              value={ppSettings[`id_${shop.id}`] || ""} 
                              onChange={e => setPpSettings(prev => ({ ...prev, [`id_${shop.id}`]: e.target.value }))} 
                              placeholder="Mobile / Tax ID for this branch" 
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">Account Name</Label>
                            <Input 
                              value={ppSettings[`name_${shop.id}`] || ""} 
                              onChange={e => setPpSettings(prev => ({ ...prev, [`name_${shop.id}`]: e.target.value }))} 
                              placeholder="Account owner name for this branch" 
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button onClick={handleSavePromptPaySettings} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
                Save PromptPay Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[90vh]">
            <DialogHeader className="p-8 bg-slate-900 text-white shrink-0">
              <DialogTitle className="text-2xl font-black tracking-tight">
                {editingList ? "Edit Price List" : "Create New Price List"}
              </DialogTitle>
              <DialogDescription className="text-slate-300 text-sm mt-1">
                Define the name and set custom overrides for service items. Empty fields will fall back to the base price.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
              <div className="space-y-8">
                <div className="space-y-3">
                  <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">Price List Identification</Label>
                  <Input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="e.g. Wholesale Partners, VIP Members" 
                    className="h-14 bg-white text-lg font-bold border-slate-200 focus-visible:ring-indigo-500 rounded-xl shadow-sm"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pricing Configuration</Label>
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-100/50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Service Name</th>
                          <th className="px-6 py-4 w-[150px]">Base Price</th>
                          <th className="px-6 py-4 w-[220px]">Custom Override (฿)</th>
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
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  className={`h-11 w-full pl-8 font-bold rounded-xl transition-all ${servicePrices[service.id] !== undefined && servicePrices[service.id] !== service.price ? "border-indigo-300 bg-indigo-50 text-indigo-900 focus-visible:ring-indigo-500" : "border-slate-200 bg-slate-50 focus-visible:ring-slate-400"}`} 
                                  value={servicePrices[service.id] ?? service.price}
                                  onChange={e => handlePriceChange(service.id, e.target.value)}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="p-6 border-t border-slate-100 bg-white shrink-0">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="h-12 rounded-xl px-6 font-semibold">Cancel</Button>
              <Button type="submit" className="h-12 rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-200">
                {editingList ? "Save Price List" : "Create Price List"}
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
    </div>
  );
}
