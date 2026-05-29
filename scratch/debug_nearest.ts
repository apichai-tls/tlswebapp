import { PrismaClient } from '@prisma/client';

function getDirectDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function checkDb(dbName: string, url: string) {
  console.log(`\n======================= DATABASE: ${dbName} =======================`);
  const prisma = new PrismaClient({ datasourceUrl: url });

  try {
    const shops = await prisma.shopLocation.findMany();
    console.log('Shops in DB:');
    shops.forEach(s => console.log(` - ID: ${s.id}, Name: ${s.name}, Lat: ${s.lat}, Lng: ${s.lng}`));

    const pois = await prisma.pOI.findMany({
      where: {
        name: {
          contains: 'INNSiDE',
          mode: 'insensitive'
        }
      }
    });
    console.log('\nFound POIs:');
    pois.forEach(p => console.log(` - Name: ${p.name}, Lat: ${p.lat}, Lng: ${p.lng}, ClosestShopId: ${p.closestShopId}, DistanceKm: ${p.distanceKm}`));

    if (pois.length > 0) {
      const p = pois[0];
      console.log(`\nDirect distance from "${p.name}" (${p.lat}, ${p.lng}) to shops:`);
      for (const shop of shops) {
        const dist = getDirectDistance(p.lat, p.lng, shop.lat, shop.lng);
        console.log(` - ${shop.name}: ${dist.toFixed(4)} km`);
      }
    } else {
      console.log('\nNo POI found with "INNSiDE" in this database');
    }
  } catch (error: any) {
    console.error(`Error in ${dbName}:`, error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function debugNearest() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";

  await checkDb('Production', prodUrl);
  await checkDb('Test', testUrl);
  await checkDb('Staging', stagingUrl);
}

debugNearest();
