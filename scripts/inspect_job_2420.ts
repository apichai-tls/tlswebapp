import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const job = await prisma.job.findUnique({
    where: { id: '2026002420' }
  })

  if (!job) {
    console.log("Job 2026002420 not found.")
    return
  }

  console.log("Job ID:", job.id)
  console.log("Current Status:", job.status)
  console.log("Sub Status:", job.subStatus)
  console.log("Created At:", job.createdAt)
  console.log("Completed At:", job.completedAt)
  console.log("Created By:", job.createdBy)
  
  console.log("\n--- LEGS JSON ---")
  try {
    console.log(JSON.stringify(JSON.parse(job.legsJson || '{}'), null, 2))
  } catch (e) {
    console.log("Error parsing legsJson", job.legsJson)
  }

  console.log("\n--- ACTIVITY LOGS (adminNotesJson) ---")
  try {
    const logs = JSON.parse(job.adminNotesJson || '[]')
    if (Array.isArray(logs)) {
      logs.forEach(log => {
        console.log(`[${log.timestamp || 'Unknown'}] ${log.userName || log.userId}: ${log.text}`)
      })
    } else {
      console.log(logs)
    }
  } catch (e) {
    console.log("Error parsing adminNotesJson", job.adminNotesJson)
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
