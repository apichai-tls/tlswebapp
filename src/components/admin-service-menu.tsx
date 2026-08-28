"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Tag, 
  Layers,
  Shirt,
  WashingMachine,
  Sparkles,
  Wallet,
  Gift,
  CheckCircle2,
  Percent,
  Coins
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { serviceStore, type ServiceItem, getServiceSKU } from "@/lib/store";
import { toast } from "sonner";

export function AdminServiceMenu() {
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  
  // Main Tab: "services" (Laundry Services) or "packages" (Promotion & Top-up)
  const [mainTab, setMainTab] = useState<"services" | "packages">("services");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  // Form state
  const [formData, setFormData] = useState<Omit<ServiceItem, "id">>({
    name: "",
    nameEn: "",
    price: 0,
    memberPrice: 0,
    category: "DRY CLEAN",
    unit: ""
  });

  // Services split
  const laundryServices = useMemo(() => 
    services.filter(s => s.category !== "PACKAGE"),
    [services]
  );

  const packageServices = useMemo(() => 
    services.filter(s => s.category === "PACKAGE"),
    [services]
  );

  // Dynamically compute unique categories from non-package services
  const categories = useMemo(() => {
    const uniqueCats = Array.from(new Set(laundryServices.map(s => s.category).filter(Boolean))).sort();
    return ["All", ...uniqueCats];
  }, [laundryServices]);

  // Filtered laundry services
  const filteredLaundryServices = useMemo(() => {
    return laundryServices.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (s.nameEn && s.nameEn.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [laundryServices, searchTerm, selectedCategory]);

  // Filtered package services
  const filteredPackageServices = useMemo(() => {
    return packageServices.filter(s => {
      return s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (s.nameEn && s.nameEn.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [packageServices, searchTerm]);

  const handleOpenModal = (service?: ServiceItem, forcePackage = false) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        nameEn: service.nameEn || "",
        price: service.price,
        memberPrice: service.memberPrice,
        category: service.category,
        unit: service.unit || ""
      });
    } else {
      setEditingService(null);
      const isPkg = forcePackage || mainTab === "packages";
      setFormData({
        name: "",
        nameEn: "",
        price: 0,
        memberPrice: 0,
        category: isPkg ? "PACKAGE" : "DRY CLEAN",
        unit: isPkg ? "pack" : ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      serviceStore.updateService(editingService.id, formData);
      toast.success(formData.category === "PACKAGE" ? "Package updated successfully" : "Service updated successfully");
    } else {
      serviceStore.addService(formData);
      toast.success(formData.category === "PACKAGE" ? "New package added" : "New service added");
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      serviceStore.deleteService(id);
      toast.success("Item deleted");
    }
  };

  const isFormPackage = formData.category === "PACKAGE";

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 bg-slate-50/30 font-sans">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {mainTab === "services" ? "Service Menu & Pricing" : "Promotion & Top-up Packages"}
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            {mainTab === "services" 
              ? "Manage laundry service items, rates, and display categories" 
              : "Manage member top-up packages, bonus credits, and wallet promotions"}
          </p>
        </div>
        <Button 
          onClick={() => handleOpenModal(undefined, mainTab === "packages")}
          className={mainTab === "packages" 
            ? "bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-200 gap-2 h-11 px-5" 
            : "bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 gap-2 h-11 px-5"}
        >
          <Plus size={18} />
          {mainTab === "packages" ? "Add New Package" : "Add New Service"}
        </Button>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 rounded-2xl w-fit">
        <button
          onClick={() => {
            setMainTab("services");
            setSearchTerm("");
            setSelectedCategory("All");
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            mainTab === "services"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Shirt size={16} />
          <span>Laundry Services</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            mainTab === "services" ? "bg-slate-100 text-slate-700" : "bg-slate-300/60 text-slate-600"
          }`}>
            {laundryServices.length}
          </span>
        </button>

        <button
          onClick={() => {
            setMainTab("packages");
            setSearchTerm("");
            setSelectedCategory("All");
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            mainTab === "packages"
              ? "bg-white text-emerald-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Gift size={16} className={mainTab === "packages" ? "text-emerald-600" : "text-slate-500"} />
          <span>Promotion & Top-up</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            mainTab === "packages" ? "bg-emerald-50 text-emerald-700" : "bg-slate-300/60 text-slate-600"
          }`}>
            {packageServices.length}
          </span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: LAUNDRY SERVICES */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {mainTab === "services" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm max-w-md">
            <Search className="text-slate-400 ml-2" size={18} />
            <Input 
              placeholder="Filter by name or category..." 
              className="border-none bg-transparent focus-visible:ring-0 text-sm h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Categories Bar */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide shrink-0">
            {categories.map(cat => (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all whitespace-nowrap uppercase tracking-wider cursor-pointer ${
                  selectedCategory === cat 
                    ? "bg-slate-900 text-white shadow-md shadow-slate-200" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {cat}
              </motion.button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-none hover:bg-slate-50">
                  <TableHead className="font-bold text-slate-600 pl-6 h-12 uppercase text-[10px] tracking-widest">Service Item</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest">Category</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-right">Base Price</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-center">Unit</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filteredLaundryServices.map((service, i) => (
                    <motion.tr
                      layout
                      key={service.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-slate-100 group hover:bg-slate-50 transition-colors cursor-default"
                    >
                      <TableCell className="py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-indigo-600 transition-colors border border-transparent group-hover:border-slate-100">
                            {service.name.includes("Wash") ? <WashingMachine size={18} /> : 
                             service.name.includes("Shirt") ? <Shirt size={18} /> : 
                             service.category === "Bedding" ? <Layers size={18} /> : <Tag size={18} />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{service.name}</div>
                            {service.nameEn && (
                              <div className="text-[11px] font-medium text-slate-500">{service.nameEn}</div>
                            )}
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase">{getServiceSKU(service, services)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 uppercase text-[9px] font-bold tracking-wider">
                          {service.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-black text-slate-900">
                          ฿{service.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-500 text-xs">
                        {service.unit || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-4">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-slate-200"
                            onClick={() => handleOpenModal(service)}
                          >
                            <Edit3 size={14} className="text-slate-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(service.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                  {filteredLaundryServices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                        No laundry services found.
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: PROMOTION & TOP-UP */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {mainTab === "packages" && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Coins size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-950">Member Top-Up Package Catalog</h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Packages listed here will appear in the <strong>Top Up Wallet</strong> dialog in CRM and automatically calculate bonus credits.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="bg-emerald-600 text-white font-bold text-xs py-1 px-3">
                {packageServices.length} Active Packages
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm max-w-md">
            <Search className="text-slate-400 ml-2" size={18} />
            <Input 
              placeholder="Search package name..." 
              className="border-none bg-transparent focus-visible:ring-0 text-sm h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Packages Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-none hover:bg-slate-50">
                  <TableHead className="font-bold text-slate-600 pl-6 h-12 uppercase text-[10px] tracking-widest">Package Name</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-right">Sale Price (ชำระ)</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-right">Bonus (แถมเพิ่ม)</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-right">Total Wallet Credit</TableHead>
                  <TableHead className="font-bold text-slate-600 h-12 uppercase text-[10px] tracking-widest text-center">Unit</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filteredPackageServices.map((pkg, i) => {
                    const bonus = Math.max(0, (pkg.memberPrice || pkg.price) - pkg.price);
                    const totalCredit = pkg.memberPrice > pkg.price ? pkg.memberPrice : pkg.price;

                    return (
                      <motion.tr
                        layout
                        key={pkg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b border-slate-100 group hover:bg-emerald-50/30 transition-colors cursor-default"
                      >
                        <TableCell className="py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors border border-emerald-100">
                              <Wallet size={18} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{pkg.name}</div>
                              {pkg.nameEn && (
                                <div className="text-[11px] font-medium text-slate-500">{pkg.nameEn}</div>
                              )}
                              <div className="text-[10px] font-mono text-emerald-600 font-semibold mt-0.5 uppercase">PACKAGE CODE: {getServiceSKU(pkg, services)}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-black text-slate-900">
                          ฿{pkg.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {bonus > 0 ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-xs">
                              + ฿{bonus.toLocaleString()}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-black text-emerald-600 text-base">
                            ฿{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium text-slate-500 text-xs">
                          {pkg.unit || "pack"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-4">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 hover:bg-emerald-100 hover:text-emerald-800"
                              onClick={() => handleOpenModal(pkg, true)}
                            >
                              <Edit3 size={14} className="text-slate-600" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDelete(pkg.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                  {filteredPackageServices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                        <div className="flex flex-col items-center gap-2">
                          <Gift size={28} className="text-slate-300" />
                          <p>No promotion or top-up packages found.</p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenModal(undefined, true)}
                            className="mt-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          >
                            <Plus size={14} className="mr-1" /> Add First Package
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT SERVICE OR PACKAGE */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader className={`p-6 text-white ${isFormPackage ? "bg-emerald-800" : "bg-slate-900"}`}>
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10">
                  {isFormPackage ? <Gift size={20} /> : <Edit3 size={20} />}
                </div>
                {editingService 
                  ? (isFormPackage ? "Update Package" : "Update Service") 
                  : (isFormPackage ? "New Top-Up Package" : "New Service Item")}
              </DialogTitle>
            </DialogHeader>
            
            <div className="p-6 space-y-5 bg-white">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {isFormPackage ? "Package Name (Thai) *" : "Service Name (Thai) *"}
                </Label>
                <Input 
                  required
                  className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                  placeholder={isFormPackage ? "เช่น Package ฿3,000 แถม ฿500" : "เช่น ซักอบพับทั่วไป"}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {isFormPackage ? "Package Name (English)" : "Service Name (English)"}
                </Label>
                <Input 
                  className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                  placeholder={isFormPackage ? "e.g. Package 3,000 THB (+500 Bonus)" : "e.g. Wash & Fold"}
                  value={formData.nameEn || ""}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {isFormPackage ? "Sale Price / ยอดชำระ (Regular) *" : "Base Price (Regular) *"}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                  <Input 
                    type="number"
                    step="0.01"
                    required
                    className="rounded-xl border-slate-200 h-11 pl-7 focus:ring-slate-900"
                    value={formData.price}
                    onChange={e => {
                      const newPrice = parseFloat(e.target.value) || 0;
                      const currentBonus = Math.max(0, formData.memberPrice - formData.price);
                      setFormData({ 
                        ...formData, 
                        price: newPrice,
                        memberPrice: isFormPackage ? newPrice + currentBonus : newPrice
                      });
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {isFormPackage 
                    ? "ยอดเงินจริงที่ลูกค้าต้องจ่ายเพื่อซื้อแพ็กเกจนี้" 
                    : "Overrides for custom Price Lists can be configured in System Settings."}
                </p>
              </div>

              {isFormPackage && (
                <div className="space-y-2 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                  <Label className="text-xs font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-600" />
                    Bonus Credit (แถมเครดิตเพิ่ม)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">฿</span>
                    <Input 
                      type="number"
                      step="0.01"
                      className="rounded-xl border-emerald-200 h-11 pl-7 text-emerald-700 font-bold bg-white focus:ring-emerald-500"
                      placeholder="เช่น 500"
                      value={formData.memberPrice > formData.price ? formData.memberPrice - formData.price : ""}
                      onChange={e => {
                        const bonusVal = parseFloat(e.target.value) || 0;
                        setFormData({ ...formData, memberPrice: formData.price + bonusVal });
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs bg-emerald-100/60 p-2.5 rounded-lg text-emerald-900 mt-2 font-medium">
                    <span>ลูกค้าจะได้รับเข้า Wallet:</span>
                    <strong className="text-emerald-700 text-sm font-black">
                      ฿{((formData.memberPrice > formData.price ? formData.memberPrice : formData.price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Category</Label>
                  {isFormPackage ? (
                    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 h-11 px-3 flex items-center text-xs font-bold text-emerald-800">
                      PACKAGE (Locked)
                    </div>
                  ) : (
                    <select 
                      className="w-full rounded-xl border border-slate-200 h-11 px-3 text-sm font-medium focus:ring-slate-900 outline-none"
                      value={formData.category}
                      onChange={e => {
                        const newCat = e.target.value;
                        setFormData({ 
                          ...formData, 
                          category: newCat,
                          memberPrice: newCat === "PACKAGE" ? formData.memberPrice || formData.price : formData.memberPrice
                        });
                      }}
                    >
                      <option value="DRY CLEAN">DRY CLEAN</option>
                      <option value="IRON">IRON</option>
                      <option value="KILO">KILO</option>
                      <option value="LINENS">LINENS</option>
                      <option value="OTHERS">OTHERS</option>
                      <option value="PCS">PCS</option>
                      <option value="SHOES">SHOES</option>
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Display Unit</Label>
                  <Input 
                    className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                    placeholder={isFormPackage ? "e.g. pack" : "e.g. kg, piece"}
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
               <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl h-11"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className={isFormPackage 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-200 min-w-[120px] h-11 font-bold"
                  : "bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 min-w-[120px] h-11 font-bold"}
              >
                {editingService ? "Save Changes" : (isFormPackage ? "Add Package" : "Add Service")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
