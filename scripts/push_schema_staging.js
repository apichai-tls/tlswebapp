const { execSync } = require('child_process');
const fs = require('fs');

const STAGING_URL = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_staging";

console.log('Pushing schema to Staging...');
try {
  if (fs.existsSync('.env')) fs.renameSync('.env', '.env.backup');

  execSync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: STAGING_URL, DIRECT_URL: STAGING_URL },
    stdio: 'inherit'
  });
  console.log('Schema successfully pushed to Staging!');
} catch (e) {
  console.error('Failed to push schema:', e.message);
} finally {
  if (fs.existsSync('.env.backup')) fs.renameSync('.env.backup', '.env');
}
