"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2, XCircle, Image as ImageIcon, Eye, Edit2, Loader2 } from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { jobStore, type Job } from "@/lib/store";
import { Label } from "@/components/ui/label";

export function AdminVerify({ onEditJob }: { onEditJob?: (job: Job) => void }) {
  const jobs = useJobs();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Modals state
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const handleApprove = async (id: string) => {
    try {
      await jobStore.updateJobDetails(id, { status: "active" });
      toast.success(`Order ${id} approved and sent to Dispatch.`);
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancellingJob) return;
    try {
      const existingRemark = cancellingJob.remark ? ` | ${cancellingJob.remark}` : '';
      await jobStore.updateJobDetails(cancellingJob.id, { 
        status: "cancelled", 
        remark: `[Cancelled: ${cancelReason}]${existingRemark}`
      });
      toast.success(`Order ${cancellingJob.id} has been cancelled.`);
      setCancellingJob(null);
      setCancelReason("");
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  const verifications = jobs.filter(j => 
    j.status === "pending" &&
    (
      j.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (j.customerName || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getDisplayImage = (jobDetails: any) => {
    if (!jobDetails) return null;
    if (jobDetails.billImageUrl) return jobDetails.billImageUrl;
    if (jobDetails.proofImageUrl) return jobDetails.proofImageUrl;
    if (jobDetails.bagImageUrl) {
      try {
        const parsed = JSON.parse(jobDetails.bagImageUrl);
        const urls = Array.isArray(parsed) ? parsed : [parsed];
        const url = urls[0];
        if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('/')) {
          const cleanPath = url.replace(/^["'\\]+|["'\\]+$/g, '');
          return `https://storage.googleapis.com/tls-images-test/${cleanPath}`;
        }
        return url;
      } catch {
        return jobDetails.bagImageUrl;
      }
    }
    return null;
  };

  const JobImagePreview = ({ jobId, onImageSelect }: { jobId: string, onImageSelect: (url: string) => void }) => {
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tag, setTag] = useState<string>("Pending Image");

    useEffect(() => {
      fetch(`/api/jobs/${jobId}/details`)
        .then(r => r.json())
        .then(data => {
          const url = getDisplayImage(data);
          setImgUrl(url);
          if (data.billImageUrl) setTag("Payment Slip");
          else if (data.proofImageUrl) setTag("Delivery Proof");
          else if (data.bagImageUrl) setTag("Laundry Bag");
        })
        .catch(e => console.error("Failed to load image for job", jobId))
        .finally(() => setLoading(false));
    }, [jobId]);

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center text-slate-300 w-full h-full">
          <Loader2 size={24} className="mb-2 animate-spin text-slate-200" />
          <span className="text-xs font-semibold text-slate-400">Loading...</span>
        </div>
      );
    }

    if (!imgUrl) {
      return (
        <div className="flex flex-col items-center justify-center text-slate-300 w-full h-full">
          <ImageIcon size={32} className="mb-2" />
          <span className="text-xs font-semibold">No Image Uploaded</span>
        </div>
      );
    }

    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={imgUrl} 
          alt="Verification Proof" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
          <Button 
            variant="secondary" 
            size="sm" 
            className="gap-2"
            onClick={() => onImageSelect(imgUrl)}
          >
            <Eye size={16} /> View Image
          </Button>
        </div>
        <div className="absolute top-2 right-2 z-20">
          <Badge className="bg-indigo-600 border-none">
            {tag}
          </Badge>
        </div>
      </>
    );
  };

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
          verifications.map(job => {
            return (
            <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Image Preview Area */}
              <div className="h-40 bg-slate-100 border-b border-slate-100 relative group flex items-center justify-center">
                <JobImagePreview jobId={job.id} onImageSelect={setSelectedImage} />
              </div>
              
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-xs font-bold text-slate-500">{job.id.split('-')[0].toUpperCase()}</div>
                  <span className="text-[10px] text-slate-400 font-medium">{format(new Date(job.createdAt), "dd MMM, HH:mm")}</span>
                </div>
                <h3 className="font-bold text-slate-900 line-clamp-1">{job.customerName || "Walk-in Customer"}</h3>
                <p className="text-sm text-slate-500 mb-4 font-semibold text-indigo-600">฿{(job.totalAmount || job.fee || 0).toLocaleString()}</p>
                
                <div className="mt-auto flex flex-col gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (onEditJob) onEditJob(job);
                    }} 
                    className="w-full h-8 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 border-slate-200 cursor-pointer"
                  >
                    <Edit2 size={14} className="mr-1" /> Edit Job Details
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleApprove(job.id)} className="flex-1 h-9 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 cursor-pointer">
                      <CheckCircle2 size={14} className="mr-1" /> Approve
                    </Button>
                    <Button variant="outline" onClick={() => setCancellingJob(job)} className="flex-1 h-9 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 cursor-pointer">
                      <XCircle size={14} className="mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )})
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

      {/* Cancel Job Modal */}
      <Dialog open={!!cancellingJob} onOpenChange={(open) => !open && setCancellingJob(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <XCircle size={20} />
              Cancel Order {cancellingJob?.id.split('-')[0].toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Cancellation</Label>
              <Input 
                placeholder="e.g. Customer requested cancel, duplicate order..."
                value={cancelReason} 
                onChange={e => setCancelReason(e.target.value)} 
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancellingJob(null)}>Keep Order</Button>
            <Button 
              onClick={handleCancelConfirm} 
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={!cancelReason.trim()}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
