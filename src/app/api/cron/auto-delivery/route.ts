import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Security token check to protect production route
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const expectedToken = process.env.CRON_SECRET;
  
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowUtc = new Date();
    const nowBangkokTime = nowUtc.getTime() + 7 * 60 * 60 * 1000;
    const nowBangkokDate = new Date(nowBangkokTime);
    
    // Today's 19:05 Bangkok time
    const todayTargetBangkok = new Date(
      nowBangkokDate.getUTCFullYear(),
      nowBangkokDate.getUTCMonth(),
      nowBangkokDate.getUTCDate(),
      19, 5, 0, 0
    );
    const todayTargetUtc = new Date(todayTargetBangkok.getTime() - 7 * 60 * 60 * 1000);

    let mostRecentTargetUtc: Date;
    if (nowUtc >= todayTargetUtc) {
      mostRecentTargetUtc = todayTargetUtc;
    } else {
      // Yesterday's 19:05 Bangkok time
      const yesterdayTargetBangkok = new Date(todayTargetBangkok.getTime() - 24 * 60 * 60 * 1000);
      mostRecentTargetUtc = new Date(yesterdayTargetBangkok.getTime());
    }

    const jobsToMove = await prisma.job.findMany({
      where: {
        status: 'billing',
        updatedAt: { lt: mostRecentTargetUtc }
      },
      select: { id: true }
    });

    if (jobsToMove.length > 0) {
      const jobIds = jobsToMove.map(j => j.id);
      
      await prisma.job.updateMany({
        where: { id: { in: jobIds } },
        data: { status: 'delivery' }
      });

      // Add system log entries indicating auto-movement
      for (const id of jobIds) {
        const logEntry = {
          id: Math.random().toString(36).substring(7),
          userId: "system",
          userName: "System Auto-Delivery",
          text: "Automatically moved from Process to Delivery after 19:05",
          timestamp: new Date().toISOString()
        };
        
        try {
          const job = await prisma.job.findUnique({
            where: { id },
            select: { adminNotesJson: true }
          });
          let notes = [];
          if (job?.adminNotesJson) {
            try {
              notes = JSON.parse(job.adminNotesJson);
              if (!Array.isArray(notes)) notes = [];
            } catch {
              notes = [];
            }
          }

          // Safety check to avoid double entries
          const hasRecentAutoDeliveryNote = notes.some((note: any) => 
            note.userName === "System Auto-Delivery" && 
            note.text === "Automatically moved from Process to Delivery after 19:05" &&
            (new Date().getTime() - new Date(note.timestamp).getTime()) < 60 * 60 * 1000
          );

          if (!hasRecentAutoDeliveryNote) {
            notes.push(logEntry);
            await prisma.job.update({
              where: { id },
              data: { adminNotesJson: JSON.stringify(notes) }
            });
          }
        } catch (e) {
          console.error(`Failed to write auto-move log for job ${id}`, e);
        }
      }
      return NextResponse.json({ success: true, movedJobs: jobIds.length, jobIds });
    }
    return NextResponse.json({ success: true, movedJobs: 0 });
  } catch (error: any) {
    console.error('Failed to run auto-move jobs routine:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
