import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveServerActionUser, canUserAccessJob } from "@/lib/server-auth";
import { sanitizeCustomerRecord } from "@/lib/db-cache";
import ReceiptPreviewClient from "./ReceiptPreviewClient";

export const dynamic = "force-dynamic";

export default async function ReceiptPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; auto?: string; data?: string; isDraft?: string }>;
}) {
  const { user } = await resolveServerActionUser();
  if (!user || user.role === "rider") {
    redirect("/login");
  }

  const { jobId = "2026005033", auto = "false", data, isDraft } = await searchParams;

  let job: any = null;
  let customer: any = null;
  let branch: any = null;

  if (data) {
    try {
      const cleanData = data.replace(/ /g, "+");
      const parsed = JSON.parse(Buffer.from(cleanData, "base64").toString("utf-8"));
      job = parsed.job || parsed;
      customer = parsed.customer || job?.customer;
      branch = parsed.branch || job?.branch;
    } catch (e) {
      console.error("Failed to parse base64 data in ReceiptPreviewPage:", e);
    }
  }

  if (!job) {
    const found = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        branch: true,
      },
    });
    if (found && canUserAccessJob(user, found)) {
      job = found;
      customer = found.customer;
      branch = found.branch;
    }
  }

  if (!job) {
    return (
      <div className="p-8 text-rose-500 font-bold bg-slate-900 min-h-screen">
        Job #{jobId} not found or access denied.
      </div>
    );
  }

  const safeCustomer = customer ? sanitizeCustomerRecord(customer) : null;
  if (job.customer) {
    job = { ...job, customer: safeCustomer };
  }

  const serializedJob = JSON.parse(JSON.stringify(job));
  const serializedCustomer = safeCustomer ? JSON.parse(JSON.stringify(safeCustomer)) : null;
  const serializedBranch = branch ? JSON.parse(JSON.stringify(branch)) : null;

  return (
    <ReceiptPreviewClient
      initialJob={serializedJob}
      initialCustomer={serializedCustomer}
      initialBranch={serializedBranch}
      autoRun={auto === "true"}
      isDraft={isDraft === "true"}
    />
  );
}
