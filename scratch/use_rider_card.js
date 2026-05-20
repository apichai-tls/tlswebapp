const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const myJobsStartIdx = code.indexOf('{myJobs.map((task, i) => {');
const myJobsEndIdx = code.indexOf('</AnimatePresence>', myJobsStartIdx);

if (myJobsStartIdx === -1 || myJobsEndIdx === -1) {
  console.log('Cannot find myJobs.map');
  process.exit(1);
}

const myJobsReplacement = `{myJobs.map((task, i) => {
                    const customer = customers.find(c => c.id === task.job.customerId);
                    return (
                      <motion.div
                        key={task.taskId}
                        custom={i}
                        variants={cardVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                        whileHover={{ scale: 1.01 }}
                      >
                        <RiderJobCard 
                          task={task} 
                          customer={customer} 
                          showCommission={showCommission} 
                          onClick={() => setSelectedJob(task)} 
                        />
                      </motion.div>
                    );
                  })}
                `;

code = code.slice(0, myJobsStartIdx) + myJobsReplacement + code.slice(myJobsEndIdx);

const historyJobsStartIdx = code.indexOf('{historyJobs.map((task, i) => {');
const historyJobsEndIdx = code.indexOf('</AnimatePresence>', historyJobsStartIdx);

if (historyJobsStartIdx === -1 || historyJobsEndIdx === -1) {
  console.log('Cannot find historyJobs.map');
  process.exit(1);
}

const historyJobsReplacement = `{historyJobs.map((task, i) => {
                    const customer = customers.find(c => c.id === task.job.customerId);
                    return (
                      <motion.div
                        key={task.taskId}
                        custom={i}
                        variants={cardVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                      >
                        <RiderJobCard 
                          task={task} 
                          customer={customer} 
                          showCommission={showCommission} 
                          isHistory={true}
                          onClick={() => {}} 
                        />
                      </motion.div>
                    );
                  })}
                `;

code = code.slice(0, historyJobsStartIdx) + historyJobsReplacement + code.slice(historyJobsEndIdx);

fs.writeFileSync(path, code);
console.log('Successfully replaced map logic to use RiderJobCard.');
