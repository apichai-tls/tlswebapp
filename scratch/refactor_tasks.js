const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const startIdx = code.indexOf('const myJobs = jobs.filter((j) => {');
const endIdx = code.indexOf('function handleAccept(jobId: string) {');

if (startIdx === -1 || endIdx === -1) {
  console.log('Could not find boundaries');
  process.exit(1);
}

const replacement = `const allTasks: RiderTask[] = [];
  if (activeRider) {
    jobs.forEach(j => {
      if (j.pickupRiderId === activeRider.id || j.riderId === activeRider.id) {
        const isPickupCompleted = ["picked_up", "active", "ready_to_wash", "washed", "delivery", "completed", "cancel"].includes(j.status);
        allTasks.push({
          taskId: \`\${j.id}-pickup\`,
          job: j,
          legType: "pickup",
          isCompleted: isPickupCompleted,
          isActive: ["pending", "accepted", "pickup"].includes(j.status),
          scheduledAt: j.pickupScheduledAt ? new Date(j.pickupScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date()),
          completedAt: isPickupCompleted ? (j.completedAt ? new Date(j.completedAt) : new Date()) : undefined,
          targetLocation: j.pickupLocation,
          targetCoords: j.pickupCoords,
          distance: j.pickupDistance || j.distance || 0,
          commission: j.pickupCommission || 0,
        });
      }
      if (j.deliveryRiderId === activeRider.id) {
        const isTerminal = ["completed", "cancel"].includes(j.status);
        allTasks.push({
          taskId: \`\${j.id}-delivery\`,
          job: j,
          legType: "delivery",
          isCompleted: isTerminal,
          isActive: ["washed", "delivery"].includes(j.status),
          scheduledAt: j.deliveryScheduledAt ? new Date(j.deliveryScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date()),
          completedAt: isTerminal ? (j.completedAt ? new Date(j.completedAt) : new Date()) : undefined,
          targetLocation: j.dropoffLocation,
          targetCoords: j.dropoffCoords,
          distance: j.deliveryDistance || j.distance || 0,
          commission: j.deliveryCommission || 0,
        });
      }
    });
  }

  const myJobs = allTasks
    .filter(t => t.isActive && !t.isCompleted)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const historyJobs = allTasks
    .filter(t => {
      if (!t.isCompleted) return false;
      const jobDate = t.completedAt || t.scheduledAt;
      if (historyMode === "daily") {
        if (!isSameDay(jobDate, historyDate)) return false;
      } else {
        if (!isSameMonth(jobDate, historyDate) || jobDate.getFullYear() !== historyDate.getFullYear()) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = a.completedAt?.getTime() || a.scheduledAt.getTime();
      const bTime = b.completedAt?.getTime() || b.scheduledAt.getTime();
      return bTime - aTime;
    });

  const totalHistoryJobs = historyJobs.filter(t => t.job.status !== 'cancel').length;
  const totalCommission = historyJobs.filter(t => t.job.status !== 'cancel').reduce((acc, t) => acc + t.commission, 0);

  `;

code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
fs.writeFileSync(path, code);
console.log('Successfully refactored myJobs to use allTasks');
