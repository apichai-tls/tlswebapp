"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  ShoppingCart, 
  User, 
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
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  jobStore, 
  riderStore, 
  serviceStore,
  shopStore,
  type Customer, 
  type ServiceType,
  type ServiceItem
} from "@/lib/store";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";
import { useCustomers } from "@/lib/use-customers";

const CATEGORIES = ["All", "Weight", "Clothing", "Bedding", "Add-on"];

interface CartItem {
  id: string;
  name: string;
  price: number;
  basePrice: number; // To track original rate vs override
  quantity: number;
}

export function AdminPOS() {
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const customers = useCustomers();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("wash_fold");
  const [isMemberRate, setIsMemberRate] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualAdjustment, setManualAdjustment] = useState(0);

  // Auto-apply member rate when customer changes
  useEffect(() => {
    if (selectedCustomer?.isMember) {
      setIsMemberRate(true);
      toast.info("Member rates auto-applied for this customer");
    } else {
      setIsMemberRate(false);
    }
  }, [selectedCustomer]);

  // Filter products based on category and search
  const filteredProducts = useMemo(() => {
    return services.filter(p => {
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery, services]);

  // Cart logic
  const addToCart = (product: ServiceItem) => {
    const price = isMemberRate ? product.memberPrice : product.price;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id: product.id, name: product.name, price, basePrice: price, quantity: 1 }];
    });
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const serviceSurcharge = serviceType === "wash_iron_fold" ? subtotal * 0.2 : 0;
  const total = subtotal + serviceSurcharge + manualAdjustment;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!selectedCustomer) {
      toast.error("Please select a customer");
      return;
    }

    setIsProcessing(true);
    
    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      jobStore.addJob({
        source: "pos",
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        pickupLocation: "POS Counter (Walk-in)",
        dropoffLocation: "That Laundry Shop (Branch 1)",
        pickupCoords: { lat: 13.7417, lng: 100.5526 }, // Shop coords
        dropoffCoords: { lat: 13.7417, lng: 100.5526 },
        totalAmount: total,
        discount: manualAdjustment,
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        serviceType,
        status: "billing", // Walk-ins start at billing (in shop)
        fee: 0, // No rider commission for walk-in
        branchId: shops[0]?.id,
        isPaid: true,
      });

      toast.success("Order Synced Successfully", {
        description: `Order for ${selectedCustomer.name} has been recorded.`
      });

      // Reset
      setCart([]);
      setSelectedCustomer(null);
    } catch (error) {
      toast.error("Failed to sync order");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-full gap-6 bg-slate-50/30 p-8 overflow-hidden font-sans">
      {/* Selection Area (Left) */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Point of Sale</h1>
            <p className="text-sm text-slate-500 font-medium">Create and process over-the-counter orders</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input 
                placeholder="Search services..." 
                className="pl-9 w-64 bg-white border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map(product => (
                <motion.div
                  layout
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -4 }}
                  onClick={() => addToCart(product)}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-100 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-indigo-50 transition-colors">
                    {product.name.includes("Wash") ? <WashingMachine className="text-indigo-600" size={24} /> : 
                     product.name.includes("Shirt") ? <Shirt className="text-amber-600" size={24} /> :
                     product.name.includes("Duvet") ? <Layers className="text-emerald-600" size={24} /> :
                     <Zap className="text-purple-600" size={24} />}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{product.name}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-lg font-black text-slate-900">฿{product.price}</span>
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase py-0 px-1.5 h-4 bg-slate-100 text-slate-500">
                      {product.category}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Cart Area (Right) */}
      <aside className="w-[400px] flex flex-col gap-6">
        {/* Customer Select */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 block">Customer Information</Label>
          <div className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                className="w-full pl-9 h-11 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all cursor-pointer"
                value={selectedCustomer?.id || ""}
                onChange={(e) => {
                  const cust = customers.find(c => c.id === e.target.value);
                  setSelectedCustomer(cust || null);
                }}
              >
                <option value="">Select or search customer...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-indigo-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-indigo-600">{selectedCustomer.phone}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-400">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex-1 bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-slate-900" />
              <h2 className="font-bold text-slate-900 truncate">Current Order</h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-900 text-white font-bold">{cart.length} items</Badge>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                onClick={() => setCart([])}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <AnimatePresence mode="popLayout">
              {cart.map(item => (
                <motion.div 
                  layout
                  key={item.id} 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                        Quantity (Decimal ok)
                        <span className="text-indigo-600">Quick Select</span>
                      </Label>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden flex-1 shadow-sm">
                          <button 
                            onClick={() => updateQuantity(item.id, -1)}
                            className="px-2 h-8 text-slate-500 hover:bg-slate-50 border-r border-slate-100 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <Input 
                            type="number" 
                            step="0.01" 
                            className="h-8 border-none text-center text-xs font-bold focus-visible:ring-0 px-1"
                            value={item.quantity}
                            onChange={(e) => updateCartItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                          />
                          <button 
                            onClick={() => updateQuantity(item.id, 1)}
                            className="px-2 h-8 text-slate-500 hover:bg-slate-50 border-l border-slate-100 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                        {[1, 2, 3, 5, 10].map(val => (
                          <button
                            key={val}
                            onClick={() => updateCartItem(item.id, { quantity: val })}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all flex-shrink-0 ${
                              item.quantity === val 
                                ? "bg-indigo-600 border-indigo-600 text-white" 
                                : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-slate-400 uppercase font-bold">Price Override</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">฿</span>
                          <Input 
                            type="number" 
                            step="0.01" 
                            className="h-8 text-xs font-bold bg-white pl-5 shadow-sm"
                            value={item.price}
                            onChange={(e) => updateCartItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-40">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                    <ShoppingCart size={32} className="text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">Cart is empty</p>
                  <p className="text-xs font-medium text-slate-400 max-w-[200px] mt-1">Select products from the grid to build an order.</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Surcharge / Rate Settings */}
          <div className="px-6 py-4 bg-slate-50 border-y border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rate Mode</Label>
              <div className="flex bg-white rounded-lg p-0.5 border border-slate-200">
                <button
                  onClick={() => setIsMemberRate(false)}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${!isMemberRate ? "bg-slate-900 text-white shadow-sm" : "text-slate-400"}`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setIsMemberRate(true)}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${isMemberRate ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-400/60"}`}
                >
                  Member
                </button>
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Service Tier</Label>
              <div className="flex grid grid-cols-2 gap-2">
               <button
                  onClick={() => setServiceType("wash_fold")}
                  className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                    serviceType === "wash_fold" 
                      ? "bg-white border-slate-900 text-slate-900 shadow-sm ring-1 ring-slate-900 ring-offset-1" 
                      : "bg-transparent border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}
                >
                  Wash/Fold
                </button>
                <button
                  onClick={() => setServiceType("wash_iron_fold")}
                  className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                    serviceType === "wash_iron_fold" 
                      ? "bg-white border-indigo-600 text-indigo-600 shadow-sm ring-1 ring-indigo-600 ring-offset-1" 
                      : "bg-transparent border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}
                >
                  Wash/Iron
                </button>
            </div>
          </div>
        </div>

          <div className="p-6 bg-white space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Subtotal</span>
              <span className="font-bold text-slate-900">฿{subtotal.toFixed(2)}</span>
            </div>
            {serviceSurcharge > 0 && (
              <div className="flex justify-between text-sm text-indigo-600">
                <span className="font-medium">Ironing Surcharge (20%)</span>
                <span className="font-bold">+฿{serviceSurcharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-end pt-3 border-t border-slate-100">
              <div className="flex flex-col">
                <span className="text-lg font-black text-slate-900 tracking-tight">Total Payment</span>
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-[10px] text-slate-400 uppercase font-bold">Manual Adj.</Label>
                  <div className="relative w-20">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">฿</span>
                    <Input 
                      type="number"
                      step="1"
                      placeholder="0"
                      className="h-5 text-[10px] font-bold bg-slate-50 pl-4 border-slate-200"
                      value={manualAdjustment || ""}
                      onChange={(e) => setManualAdjustment(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
              <span className="text-3xl font-black text-slate-900 tracking-tighter">฿{total.toFixed(2)}</span>
            </div>
            
            <Button 
              disabled={cart.length === 0 || !selectedCustomer || isProcessing}
              onClick={handleCheckout}
              className={`w-full h-14 mt-4 rounded-2xl text-base font-black transition-all shadow-xl flex items-center gap-2 border-none ${
                cart.length > 0 && selectedCustomer 
                  ? "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200" 
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {isProcessing ? (
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Layers size={20} />
                </motion.div>
              ) : (
                <>
                  <CreditCard size={20} />
                  Record Sale & Sync
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-slate-400 font-medium tracking-wide">
              Transaction will be synced to operational dashboard.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
