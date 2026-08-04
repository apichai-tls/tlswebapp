import { Client } from 'pg';

async function main() {
  const prodUrl = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres";
  const client = new Client({
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Production DB.');

    // 1. Fetch Job details
    const jobRes = await client.query('SELECT * FROM "Job" WHERE "id" = $1', ['2026001393']);
    if (jobRes.rows.length === 0) {
      console.log('❌ Job 2026001393 not found.');
      return;
    }
    const job = jobRes.rows[0];
    console.log(`\n📦 Job ID: ${job.id}`);
    console.log(`   Branch ID: ${job.branchId}`);
    console.log(`   Customer Name: ${job.customerName}`);
    console.log(`   Pickup Lat/Lng: ${job.pickupLat}, ${job.pickupLng}`);
    console.log(`   Dropoff Lat/Lng: ${job.dropoffLat}, ${job.dropoffLng}`);
    console.log(`   fee: ${job.fee}`);
    console.log(`   totalAmount: ${job.totalAmount}`);
    console.log(`   pickupCommission: ${job.pickupCommission}`);
    console.log(`   deliveryCommission: ${job.deliveryCommission}`);
    console.log(`   pickupDistance: ${job.pickupDistance}`);
    console.log(`   deliveryDistance: ${job.deliveryDistance}`);
    console.log(`   legsJson:`, JSON.stringify(job.legsJson, null, 2));
    console.log(`   Created At: ${job.createdAt}`);
    console.log(`   Updated At: ${job.updatedAt}`);

    // 2. Fetch Activity Logs
    console.log('\n📝 [Activity Logs]');
    const logRes = await client.query(
      `SELECT * FROM "ActivityLog" 
       WHERE "entityId" = $1 
       ORDER BY "createdAt" ASC`,
      ['2026001393']
    );

    if (logRes.rows.length === 0) {
      console.log('   No activity logs found.');
    } else {
      logRes.rows.forEach((log) => {
        const logTime = new Date(log.createdAt);
        console.log(`   - [${logTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}] [User: ${log.userName || 'System'} (Role: ${log.userRole || 'N/A'})] [Action: ${log.action}]`);
        if (log.details) {
          console.log(`     Details: ${log.details}`);
        }
      });
    }

    // 3. Query Riders information
    console.log('\n🚴 [Riders]');
    const riderRes = await client.query('SELECT * FROM "Rider" WHERE "id" IN ($1, $2)', ['RIDER-04', 'RIDER-006']);
    riderRes.rows.forEach((r) => {
      console.log(`   - ID: ${r.id}, Name: ${r.name}, Nickname: ${r.nickname}, Branch ID: ${r.branchId}`);
    });

    // 4. Query Customer details and their jobs
    console.log('\n🧑 [Customer & All Jobs]');
    const custRes = await client.query('SELECT * FROM "Customer" WHERE "phone" = $1 OR "name" = $2', ['+852 4622 0348', 'JAY']);
    if (custRes.rows.length > 0) {
      const cust = custRes.rows[0];
      console.log(`   Customer: ID=${cust.id}, Name=${cust.name}, Phone=${cust.phone}, DefaultAddress=${cust.defaultAddress}, SecondaryAddress=${cust.secondaryAddress}, Area=${cust.area}`);
      
      const allJobsRes = await client.query('SELECT "id", "status", "branchId", "pickupLocation", "dropoffLocation", "createdAt" FROM "Job" WHERE "customerId" = $1 ORDER BY "createdAt" DESC', [cust.id]);
      allJobsRes.rows.forEach((j) => {
        console.log(`   - Job ID: ${j.id}, Status: ${j.status}, Branch ID: ${j.branchId}, Created At: ${j.createdAt}`);
        console.log(`     Pickup: ${j.pickupLocation}`);
        console.log(`     Dropoff: ${j.dropoffLocation}`);
      });
    } else {
      console.log('   Customer JAY not found.');
    }

    // 5. Query RiderTransactions information
    console.log('\n💸 [RiderTransactions]');
    const txRes = await client.query('SELECT * FROM "RiderTransaction" WHERE "jobId" = $1 ORDER BY "createdAt" ASC', ['2026001393']);
    if (txRes.rows.length === 0) {
      console.log('   No rider transactions found.');
    } else {
      txRes.rows.forEach((t) => {
        console.log(`   - ID: ${t.id}, Rider ID: ${t.riderId}, Type: ${t.type}, Amount: ${t.amount}, Created At: ${t.createdAt}`);
      });
    }

    // 6. Fetch ShopLocations list to match names
    console.log('\n🏢 [ShopLocations]');
    const branchRes = await client.query('SELECT * FROM "ShopLocation"');
    branchRes.rows.forEach((b) => {
      console.log(`   - ID: ${b.id}, Name: ${b.name}, Area: ${b.area}, Coordinates: ${b.lat}, ${b.lng}, Address: ${b.address}`);
    });

    // 7. Fetch Settings list
    console.log('\n⚙️ [Settings]');
    const settingsRes = await client.query('SELECT * FROM "Setting"');
    settingsRes.rows.forEach((s) => {
      console.log(`   - Key: ${s.key}, Value: ${s.value}`);
    });

    // 8. Fetch POIs list for Hilton
    console.log('\n📍 [POIs matching Hilton]');
    const poiRes = await client.query('SELECT * FROM "POI" WHERE "name" ILIKE \'%Hilton%\'');
    poiRes.rows.forEach((p) => {
      console.log(`   - Name: ${p.name}, Coordinates: ${p.lat}, ${p.lng}`);
    });

  } catch (e: any) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

main();
