"use client";

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Tag, 
  Layers,
  Shirt,
  WashingMachine
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
import { serviceStore, type ServiceItem } from "@/lib/store";
import { toast } from "sonner";

export function AdminServiceMenu() {
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  // Form state
  const [formData, setFormData] = useState<Omit<ServiceItem, "id">>({
    name: "",
    nameEn: "",
    price: 0,
    memberPrice: 0,
    category: "Weight",
    unit: ""
  });

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.nameEn && s.nameEn.toLowerCase().includes(searchTerm.toLowerCase())) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (service?: ServiceItem) => {
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
      setFormData({
        name: "",
        nameEn: "",
        price: 0,
        memberPrice: 0,
        category: "Weight",
        unit: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      serviceStore.updateService(editingService.id, formData);
      toast.success("Service updated successfully");
    } else {
      serviceStore.addService(formData);
      toast.success("New service added");
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this service?")) {
      serviceStore.deleteService(id);
      toast.success("Service deleted");
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 bg-slate-50/30 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Service Menu & Pricing</h2>
          <p className="text-sm text-slate-500 font-medium">Manage rates for members and non-members</p>
        </div>
        <Button 
          onClick={() => handleOpenModal()}
          className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 gap-2 h-11 px-5"
        >
          <Plus size={18} />
          Add New Service
        </Button>
      </div>

      <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm max-w-md">
        <Search className="text-slate-400 ml-2" size={18} />
        <Input 
          placeholder="Filter by name or category..." 
          className="border-none bg-transparent focus-visible:ring-0 text-sm h-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
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
              {filteredServices.map((service, i) => (
                <motion.tr
                  layout
                  key={service.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
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
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase">{service.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 uppercase text-[9px] font-bold tracking-wider">
                      {service.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-black text-slate-900">
                    ฿{service.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="p-6 bg-slate-900 text-white">
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10">
                  <Edit3 size={20} />
                </div>
                {editingService ? "Update Service" : "New Service Item"}
              </DialogTitle>
            </DialogHeader>
            
            <div className="p-6 space-y-5 bg-white">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Service Name (Thai) *</Label>
                <Input 
                  required
                  className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                  placeholder="เช่น ซักอบพับทั่วไป"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Service Name (English)</Label>
                <Input 
                  className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                  placeholder="e.g. Wash & Fold"
                  value={formData.nameEn || ""}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base Price (Regular)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                  <Input 
                    type="number"
                    step="0.01"
                    required
                    className="rounded-xl border-slate-200 h-11 pl-7 focus:ring-slate-900"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  />
                </div>
                <p className="text-[10px] text-slate-500">Overrides for custom Price Lists can be configured in System Settings.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Category</Label>
                  <select 
                    className="w-full rounded-xl border border-slate-200 h-11 px-3 text-sm font-medium focus:ring-slate-900 outline-none"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Weight">Weight</option>
                    <option value="Clothing">Clothing</option>
                    <option value="Bedding">Bedding</option>
                    <option value="Dry Clean">Dry Clean</option>
                    <option value="Add-on">Add-on</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Display Unit</Label>
                  <Input 
                    className="rounded-xl border-slate-200 h-11 focus:ring-slate-900"
                    placeholder="e.g. kg, piece"
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
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 min-w-[120px] h-11 font-bold"
              >
                {editingService ? "Save Changes" : "Add Service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
