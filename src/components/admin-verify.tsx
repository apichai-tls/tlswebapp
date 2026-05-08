"use client";

import { useState } from "react";
import { Search, CheckCircle2, XCircle, Image as ImageIcon, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useJobs } from "@/lib/use-jobs";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AdminVerify() {
  const jobs = useJobs();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // For this initial version, we show all jobs that have a billImageUrl OR proofImageUrl
  // If none exist yet, we'll just show all jobs for demonstration of the search capability.
  const verifications = jobs.filter(j => 
    (j.billImageUrl || j.proofImageUrl || true) && // Temporarily show all for UI demo
    (
      j.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (j.customerName || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 bg-slate-50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Order Verification</h2>
          <p className="text-sm text-slate-500 mt-1">Audit payment slips and delivery proof images.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input 
            placeholder="Search Order ID or Customer..." 
            className="pl-9 bg-white border-slate-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {verifications.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            No verification tasks found.
          </div>
        ) : (
          verifications.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Image Preview Area */}
              <div className="h-40 bg-slate-100 border-b border-slate-100 relative group flex items-center justify-center">
                {job.billImageUrl || job.proofImageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={job.billImageUrl || job.proofImageUrl} 
                      alt="Verification Proof" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => setSelectedImage(job.billImageUrl || job.proofImageUrl || null)}
                      >
                        <Eye size={16} /> View Image
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <ImageIcon size={32} className="mb-2" />
                    <span className="text-xs font-semibold">No Image Uploaded</span>
                  </div>
                )}
                
                <div className="absolute top-2 right-2">
                  <Badge className="bg-indigo-600 border-none">
                    {job.billImageUrl ? "Payment Slip" : job.proofImageUrl ? "Delivery Proof" : "Pending Image"}
                  </Badge>
                </div>
              </div>
              
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-xs font-bold text-slate-500">{job.id.split('-')[0].toUpperCase()}</div>
                  <span className="text-[10px] text-slate-400 font-medium">{format(new Date(job.createdAt), "dd MMM, HH:mm")}</span>
                </div>
                <h3 className="font-bold text-slate-900 line-clamp-1">{job.customerName || "Walk-in Customer"}</h3>
                <p className="text-sm text-slate-500 mb-4 font-semibold text-indigo-600">฿{(job.totalAmount || job.fee || 0).toLocaleString()}</p>
                
                <div className="mt-auto flex gap-2">
                  <Button variant="outline" className="flex-1 h-9 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200">
                    <CheckCircle2 size={14} className="mr-1" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 h-9 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                    <XCircle size={14} className="mr-1" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="sm:max-w-3xl p-1 bg-transparent border-none shadow-none">
          {selectedImage && (
            <div className="relative rounded-xl overflow-hidden bg-black/50 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={selectedImage} 
                alt="Full Verification Proof" 
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
