import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUser, canUserAccessJob } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Forbidden: Account is deactivated' }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const jobDetails = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        riderId: true,
        pickupRiderId: true,
        deliveryRiderId: true,
        status: true,
        bagImageUrl: true,
        billImageUrl: true,
        proofImageUrl: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        itemsJson: true,
        legsJson: true,
      },
    });

    if (!jobDetails) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!canUserAccessJob(user, jobDetails)) {
      return NextResponse.json({ error: 'Forbidden: You do not have access to this job' }, { status: 403 });
    }

    return NextResponse.json({
      id: jobDetails.id,
      bagImageUrl: jobDetails.bagImageUrl,
      billImageUrl: jobDetails.billImageUrl,
      proofImageUrl: jobDetails.proofImageUrl,
      pickupProofImageUrl: jobDetails.pickupProofImageUrl,
      deliveryProofImageUrl: jobDetails.deliveryProofImageUrl,
      itemsJson: jobDetails.itemsJson,
      legsJson: jobDetails.legsJson,
    });
  } catch (error) {
    console.error('Failed to fetch details for job', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
