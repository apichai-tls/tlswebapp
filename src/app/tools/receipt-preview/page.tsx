import React from "react";
import { prisma } from "@/lib/prisma";
import ReceiptPreviewClient from "./ReceiptPreviewClient";

export const dynamic = "force-dynamic";

export default async function ReceiptPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; auto?: string; data?: string; isDraft?: string }>;
}) {
  const { jobId = "2026005033", auto = "false", data, isDraft } = await searchParams;

  let job: any = null;
  let customer: any = null;
  let branch: any = null;

  if (data) {
    try {
      const parsed = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
      job = parsed.job || parsed;
      customer = parsed.customer || job?.customer;
      branch = parsed.branch || job?.branch;
    } catch (e) {
      console.error("Failed to parse base64 data in ReceiptPreviewPage:", e);
    }
  }

  if (!job) {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        branch: true,
      },
    });
    if (job) {
      customer = job.customer;
      branch = job.branch;
    }
  }

  if (!job) {
    return (
      <div className="p-8 text-rose-500 font-bold bg-slate-900 min-h-screen">
        Job #{jobId} not found in database.
      </div>
    );
  }

  // Serialize to plain JSON so it cleanly crosses the Server-to-Client boundary
  const serializedJob = JSON.parse(JSON.stringify(job));
  const serializedCustomer = customer ? JSON.parse(JSON.stringify(customer)) : null;
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
