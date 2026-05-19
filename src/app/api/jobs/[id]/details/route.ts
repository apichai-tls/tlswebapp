import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const jobDetails = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        bagImageUrl: true,
        billImageUrl: true,
        proofImageUrl: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        itemsJson: true,
        legsJson: true,
      }
    });

    if (!jobDetails) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(jobDetails);
  } catch (error) {
    console.error(`Failed to fetch details for job`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
