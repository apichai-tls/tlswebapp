const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.test' });

async function restoreDB() {
  // Use the connection string from .env.test or pass it directly
  const connectionString = process.env.DATABASE_URL;
  const backupFile = path.join(__dirname, '../backup_data/tls_test_backup_before_merge_20260724.sql');

  console.log('Restoring backup to:', connectionString);
  console.log('Using backup file:', backupFile);

  if (!fs.existsSync(backupFile)) {
    console.error('Backup file not found!');
    process.exit(1);
  }

  const sql = fs.readFileSync(backupFile, 'utf8');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to database. Executing SQL dump... (This may take a minute)');
    await client.query(sql);
    console.log('✅ Database restored successfully!');
  } catch (error) {
    console.error('❌ Error restoring database:', error);
  } finally {
    await client.end();
  }
}

restoreDB();
