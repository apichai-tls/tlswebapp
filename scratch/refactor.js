const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add RiderTask interface at the top (after imports)
code = code.replace('const RiderJobImages', `
export interface RiderTask {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  isCompleted: boolean;
  isActive: boolean;
  scheduledAt: Date;
  completedAt?: Date;
  targetLocation: string;
  targetCoords?: { lat: number; lng: number };
  distance: number;
  commission: number;
}

const RiderJobImages`);

// 2. Change selectedJob to RiderTask
code = code.replace(
  'const [selectedJob, setSelectedJob] = useState<Job | null>(null);',
  'const [selectedJob, setSelectedJob] = useState<RiderTask | null>(null);'
);
code = code.replace(
  'const [jobToComplete, setJobToComplete] = useState<Job | null>(null);',
  'const [jobToComplete, setJobToComplete] = useState<RiderTask | null>(null);'
);

// 3. Replace myJobs and historyJobs logic (lines 249-318)
const oldLogicStr = `  const myJobs = jobs.filter((j) => {
    if (!activeRider) return false;
    const isPickupRider = j.pickupRiderId === activeRider.id || j.riderId === activeRider.id;
    const isDeliveryRider = j.deliveryRiderId === activeRider.id;

    if (isPickupRider && !isDeliveryRider) {
      return ["pending", "accepted", "pickup"].includes(j.status);
    }
    if (isDeliveryRider && !isPickupRider) {
      return ["washed", "delivery"].includes(j.status);
    }
    if (isPickupRider && isDeliveryRider) {
      return ["pending", "accepted", "pickup", "washed", "delivery"].includes(j.status);
    }
    return false;
  }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const historyJobs = jobs.filter((j) => {
    if (!activeRider) return false;
    const isPickupRider = j.pickupRiderId === activeRider.id || j.riderId === activeRider.id;
    const isDeliveryRider = j.deliveryRiderId === activeRider.id;

    // Check if the job was completed TODAY (either scheduled today or completed today)
    // For jobs that are completely finished, we only show them if they finished today.
    // For jobs still in progress at the shop (active, pickup_completed, ready_for_delivery),
    // we always show them to the pickup rider so they don't lose track of their pending commissions.
    const isTerminal = ["completed", "cancelled"].includes(j.status);
    if (isTerminal) {
      const jobDate = j.completedAt ? new Date(j.completedAt) : new Date(j.scheduledAt);
      if (historyMode === "daily") {
        if (!isSameDay(jobDate, historyDate)) return false;
      } else {
        if (!isSameMonth(jobDate, historyDate) || jobDate.getFullYear() !== historyDate.getFullYear()) return false;
      }
    } else {
      if (historyMode === "daily" && !isToday(historyDate)) return false;
      if (historyMode === "monthly" && (!isSameMonth(historyDate, new Date()) || historyDate.getFullYear() !== new Date().getFullYear())) return false;
    }

    if (isPickupRider && !isDeliveryRider) {
      return ["picked_up", "active", "washed", "delivery", "completed", "cancelled"].includes(j.status);
    }
    if (isDeliveryRider && !isPickupRider) {
      return ["completed", "cancelled"].includes(j.status);
    }
    if (isPickupRider && isDeliveryRider) {
      return ["completed", "cancelled"].includes(j.status);
    }
    return false;
  }).sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.scheduledAt).getTime();
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.scheduledAt).getTime();
    return bTime - aTime;
  });

  const totalHistoryJobs = historyJobs.filter(j => j.status !== 'cancelled').length;
  const totalCommission = historyJobs.filter(j => j.status !== 'cancelled').reduce((acc, job) => {
    let comm = 0;
    const isPickupRider = job.pickupRiderId === activeRider?.id || job.riderId === activeRider?.id;
    const isDeliveryRider = job.deliveryRiderId === activeRider?.id;
    
    if (isPickupRider && ["picked_up", "active", "washed", "delivery", "completed"].includes(job.status)) {
      comm += (job.pickupCommission || 0);
    }
    if (isDeliveryRider && job.status === "completed") {
      comm += (job.deliveryCommission || 0);
    }
    
    return acc + comm;
  }, 0);`;

const newLogicStr = `  const allTasks: RiderTask[] = [];
  if (activeRider) {
    jobs.forEach(j => {
      if (j.pickupRiderId === activeRider.id || j.riderId === activeRider.id) {
        const isPickupCompleted = ["picked_up", "active", "washed", "delivery", "completed", "cancelled"].includes(j.status);
        allTasks.push({
          taskId: \`\${j.id}-pickup\`,
          job: j,
          legType: "pickup",
          isCompleted: isPickupCompleted,
          isActive: ["pending", "accepted", "pickup"].includes(j.status),
          scheduledAt: j.scheduledAt ? new Date(j.scheduledAt) : new Date(),
          completedAt: isPickupCompleted ? (j.completedAt ? new Date(j.completedAt) : new Date()) : undefined,
          targetLocation: j.pickupLocation,
          targetCoords: j.pickupCoords,
          distance: j.pickupDistance || j.distance || 0,
          commission: j.pickupCommission || 0,
        });
      }
      if (j.deliveryRiderId === activeRider.id) {
        const isTerminal = ["completed", "cancelled"].includes(j.status);
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

  const totalHistoryJobs = historyJobs.filter(t => t.job.status !== 'cancelled').length;
  const totalCommission = historyJobs.filter(t => t.job.status !== 'cancelled').reduce((acc, t) => acc + t.commission, 0);`;

code = code.replace(oldLogicStr, newLogicStr);

// 4. In handleComplete, we receive a legId/taskId instead of jobId.
// We need to pass the real jobId to completeJob
code = code.replace(
  'async function handleComplete(jobId: string) {',
  'async function handleComplete(taskId: string) {\n    const jobId = taskId.split("-")[0];'
);
code = code.replace(/const proofUrl = capturedImages\[jobId\];/g, 'const proofUrl = capturedImages[taskId];');
code = code.replace(/const proofFile = capturedFiles\[jobId\];/g, 'const proofFile = capturedFiles[taskId];');
// The entityId in upload-url should be the real jobId. Wait, yes, jobId is fine.
// The completeJob takes jobId, which is fine.
code = code.replace(/myJobs\.filter\(j => j\.status !== "completed"\)/g, 'myJobs.filter(t => !t.isCompleted)');

// 5. In the UI rendering, map over myJobs (which are now RiderTasks)
code = code.replace(
  '{myJobs.map((job, i) => {',
  '{myJobs.map((task, i) => {\n                    const job = task.job;\n                    const legType = task.legType;'
);
code = code.replace(
  'const legType = ["pending", "accepted", "active", "pickup"].includes(job.status) ? "pickup" : "delivery";',
  ''
);
// Make sure to change key={job.id} to key={task.taskId}
code = code.replace(/key={job\.id}/g, 'key={task.taskId}');
code = code.replace(/onClick=\{\(\) => setSelectedJob\(job\)\}/g, 'onClick={() => setSelectedJob(task)}');

// Same for historyJobs
code = code.replace(
  '{historyJobs.map((job, i) => {',
  '{historyJobs.map((task, i) => {\n                    const job = task.job;\n                    const legType = task.legType;'
);
code = code.replace(
  'const legType = (job.status === "completed" && job.deliveryRiderId === activeRider?.id) ? "delivery" : "pickup";',
  ''
);
code = code.replace(
  'const targetLocation = legType === \'pickup\' ? job.pickupLocation : job.dropoffLocation;',
  'const targetLocation = task.targetLocation;'
);
code = code.replace(
  'const commission = legType === \'pickup\' ? (job.pickupCommission || 0) : (job.deliveryCommission || 0);',
  'const commission = task.commission;'
);

// 6. In the Dialogs: selectedJob is now a RiderTask
code = code.replace(
  'const legType = ["pending", "accepted", "active", "pickup"].includes(selectedJob.status) ? "pickup" : "delivery";',
  'const legType = selectedJob.legType;'
);
code = code.replace(
  'const targetLocation = legType === \'pickup\' ? selectedJob.pickupLocation : selectedJob.dropoffLocation;',
  'const targetLocation = selectedJob.targetLocation;'
);
code = code.replace(
  'const targetCoords = legType === \'pickup\' ? selectedJob.pickupCoords : selectedJob.dropoffCoords;',
  'const targetCoords = selectedJob.targetCoords;'
);
code = code.replace(
  'const distance = legType === \'pickup\' ? (selectedJob.pickupDistance || selectedJob.distance || 0) : (selectedJob.deliveryDistance || selectedJob.distance || 0);',
  'const distance = selectedJob.distance;'
);

code = code.replace(/selectedJob\.id/g, 'selectedJob.job.id');
code = code.replace(/selectedJob\.customerName/g, 'selectedJob.job.customerName');
code = code.replace(/selectedJob\.customerPhone/g, 'selectedJob.job.customerPhone');
code = code.replace(/selectedJob\.remark/g, 'selectedJob.job.remark');
code = code.replace(/selectedJob\.adminNotesJson/g, 'selectedJob.job.adminNotesJson');
code = code.replace(/selectedJob\.status/g, 'selectedJob.job.status');

// 7. jobToComplete is now RiderTask
code = code.replace(/jobToComplete\.id/g, 'jobToComplete.taskId');
code = code.replace(/handleComplete\(jobToComplete\.id\)/g, 'handleComplete(jobToComplete.taskId)');

fs.writeFileSync(path, code);
console.log('Done refactoring');
