import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to database to pre-compute POI distances...");
  
  try {
    const shops = await prisma.shopLocation.findMany();
    if (shops.length === 0) {
      console.log("No shops found. Exiting.");
      return;
    }

    // Fetch POIs that haven't been calculated yet or we can just fetch all
    const pois = await prisma.pOI.findMany({
      where: {
        OR: [
          { closestShopId: null },
          { distanceKm: null }
        ]
      }
    });

    console.log(`Found ${pois.length} POIs that need distance calculation.`);

    let count = 0;
    
    // We will use OSRM Table API to avoid Google Maps costs for thousands of POIs
    // Since OSRM has rate limits, we should batch them
    const BATCH_SIZE = 50; 

    for (let i = 0; i < pois.length; i += BATCH_SIZE) {
      const batch = pois.slice(i, i + BATCH_SIZE);
      
      const promises = batch.map(async (poi) => {
        const coordsList = [
          `${poi.lng},${poi.lat}`, 
          ...shops.map(s => `${s.lng},${s.lat}`)
        ].join(";");
        
        const osrmUrl = `https://router.project-osrm.org/table/v1/driving/${coordsList}?sources=0&annotations=distance`;
        
        try {
          const res = await fetch(osrmUrl);
          const data = await res.json();
          
          let minDistance = Infinity;
          let closestShopId = "";

          if (data.code === "Ok" && data.distances && data.distances[0]) {
            for (let j = 0; j < shops.length; j++) {
              const distMeters = data.distances[0][j + 1];
              if (distMeters !== undefined && distMeters !== null) {
                const distKm = distMeters / 1000;
                if (distKm < minDistance) {
                  minDistance = distKm;
                  closestShopId = shops[j].id;
                }
              }
            }
          }

          if (closestShopId && minDistance !== Infinity) {
            await prisma.pOI.update({
              where: { id: poi.id },
              data: {
                closestShopId,
                distanceKm: Math.round(minDistance * 10) / 10
              }
            });
            return true;
          }
          return false;
        } catch (e) {
          console.warn(`Failed for POI ${poi.name}:`, e);
          return false;
        }
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r).length;
      count += successCount;
      
      console.log(`Processed ${i + batch.length} / ${pois.length} ... (Success: ${successCount})`);
      
      // Delay to respect OSRM free tier limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`🎉 Pre-computation completed! Successfully updated ${count} POIs.`);
  } catch (error) {
    console.error("❌ Error pre-computing POIs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
