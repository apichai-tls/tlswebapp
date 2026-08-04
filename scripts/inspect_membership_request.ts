import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_web_test';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    console.log('🔍 Columns of "MembershipRequest" in tls_web_test:');
    // Query row counts
    const reqCount = await client.query('SELECT COUNT(*) FROM "MembershipRequest"');
    const memberCount = await client.query('SELECT COUNT(*) FROM "Member"');
    console.log(`\nMembershipRequest rows count: ${reqCount.rows[0].count}`);
    console.log(`Member rows count: ${memberCount.rows[0].count}`);

    // Fetch sample requests
    console.log('\n📍 [Sample MembershipRequests]');
    const sampleReqs = await client.query('SELECT "id", "name", "email", "phone", "status", "createdAt" FROM "MembershipRequest" LIMIT 3');
    sampleReqs.rows.forEach(r => {
      console.log(`  - ID: ${r.id}, Name: ${r.name}, Phone: ${r.phone}, Status: ${r.status}, CreatedAt: ${r.createdAt}`);
    });

    // Fetch sample members
    console.log('\n📍 [Sample Members]');
    const sampleMembers = await client.query('SELECT "id", "name", "email", "phone", "tier", "balance" FROM "Member" LIMIT 3');
    sampleMembers.rows.forEach(m => {
      console.log(`  - ID: ${m.id}, Name: ${m.name}, Phone: ${m.phone}, Tier: ${m.tier}, Balance: ${m.balance}`);
    });
  } catch (err: any) {
    console.error('❌ Error inspecting columns:', err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
