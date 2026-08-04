import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log("Fetching all jobs from PROD...")
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      status: true,
      subStatus: true,
      createdAt: true,
      completedAt: true,
      totalAmount: true,
      fee: true,
      isPaid: true,
      paymentChannel: true,
      pickupProofImageUrl: true,
      deliveryProofImageUrl: true,
      proofImageUrl: true, // legacy
      pickupRiderId: true,
      deliveryRiderId: true,
      riderId: true,
      customerName: true
    },
    orderBy: { createdAt: 'desc' }
  })
  
  console.log(`Found ${jobs.length} jobs. Analyzing for anomalies...`)
  
  const anomalies = []
  
  const now = new Date()
  
  for (const job of jobs) {
    const jobAnomalies = []
    
    // 1. Completed but not paid
    if (job.status === 'completed' && !job.isPaid) {
      jobAnomalies.push("Status is 'completed' but isPaid is false.")
    }
    
    // 2. Stuck in pending/pickup/processing/delivery for a very long time (> 14 days)
    if (job.status !== 'completed' && job.status !== 'cancelled') {
      const daysSinceCreated = (now.getTime() - new Date(job.createdAt).getTime()) / (1000 * 3600 * 24)
      if (daysSinceCreated > 14) {
        jobAnomalies.push(`Job is stuck in '${job.status}' for ${Math.round(daysSinceCreated)} days.`)
      }
    }
    
    // 3. Completed without delivery proof (and no legacy proof)
    if (job.status === 'completed') {
      if (!job.deliveryProofImageUrl && !job.proofImageUrl) {
        jobAnomalies.push("Status is 'completed' but missing delivery proof image.")
      }
    }
    
    // 4. Past pickup but missing pickup proof
    if (['processing', 'delivery', 'completed'].includes(job.status)) {
      if (!job.pickupProofImageUrl) {
        jobAnomalies.push(`Status is '${job.status}' but missing pickup proof image.`)
      }
    }
    
    // 5. Total amount is 0 or negative for completed jobs
    if (job.status === 'completed' && (job.totalAmount || 0) <= 0) {
      jobAnomalies.push("Completed job has totalAmount <= 0.")
    }
    
    // 6. Bug we just fixed: delivery proof image is empty, but legacy proof image has data (could be pickup image)
    if (job.proofImageUrl && !job.deliveryProofImageUrl && job.pickupProofImageUrl) {
      const pickupUrls = JSON.parse(job.pickupProofImageUrl || "[]")
      if (Array.isArray(pickupUrls) && pickupUrls[0] === job.proofImageUrl) {
         jobAnomalies.push("Legacy proofImageUrl matches pickup image (Affected by the Rider App bug).")
      }
    }

    // 7. No rider assigned but status is past pending
    if (job.status !== 'pending' && job.status !== 'cancelled') {
      if (!job.pickupRiderId && !job.riderId && job.status !== 'in-store') {
         // sometimes jobs are brought by walk-ins, wait, does walk-in have no rider?
         // If it's a delivery job, it should have a rider.
      }
    }
    
    if (jobAnomalies.length > 0) {
      anomalies.push({
        id: job.id,
        createdAt: job.createdAt,
        status: job.status,
        anomalies: jobAnomalies
      })
    }
  }
  
  console.log(`\nFound ${anomalies.length} jobs with potential anomalies.\n`)
  
  // Group by anomaly type for summary
  const summary = {}
  anomalies.forEach(a => {
    a.anomalies.forEach(msg => {
      // Generalize message for summary
      const key = msg.replace(/[0-9]+/g, 'X') 
      summary[key] = (summary[key] || 0) + 1
    })
  })
  
  console.log("=== SUMMARY OF ANOMALIES ===")
  for (const [key, count] of Object.entries(summary)) {
    console.log(`${count}x : ${key}`)
  }
  
  console.log("\n=== DETAILED LIST ===")
  // Print top 50 anomalies
  anomalies.slice(0, 50).forEach(a => {
    console.log(`Job ID: ${a.id} (${a.status})`)
    a.anomalies.forEach(msg => console.log(`  - ${msg}`))
  })
  if (anomalies.length > 50) {
    console.log(`... and ${anomalies.length - 50} more jobs.`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
