const { Client } = require('pg');

async function killConnections() {
  const connectionString = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to Postgres successfully!');
    
    // Check connections
    const res = await client.query('SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;');
    console.log('Connections by DB:', res.rows);

    // Terminate all other connections
    console.log('Terminating idle/active connections from other clients...');
    const killRes = await client.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE pid <> pg_backend_pid() 
        AND datname IN ('postgres', 'tls_test', 'tls_staging')
        AND state = 'idle';
    `);
    console.log(`Terminated ${killRes.rowCount} connections.`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

killConnections();
