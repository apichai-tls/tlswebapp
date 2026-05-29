const shops = [
  { id: "shop-main", name: "Main branch (Sukhumvit 1/1)", lat: 13.745616940478026, lng: 100.55177486178236 },
  { id: "shop-head", name: "Head Office (Sukhumvit 15 / SR)", lat: 13.7438, lng: 100.5583 },
  { id: "SHOP-MOGWZ0X0", name: "Pattanakarn (PTK)", lat: 13.739651623351827, lng: 100.62566725192795 }
];

const dropoff = { lat: 13.7588878, lng: 100.5373605 }; // Pullman Bangkok King Power

async function calculateAllShops() {
  const roundHalfUp = (val) => Math.ceil(val * 2) / 2;
  const ratePerKm = 10;

  console.log("================= DISTANCE & FEE ANALYSIS =================");
  for (const shop of shops) {
    const url = `https://router.project-osrm.org/route/v1/driving/${shop.lng},${shop.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        console.log(`OSRM failed for ${shop.name}`);
        continue;
      }
      const route = data.routes[0];
      const distanceMeters = route.distance;
      const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
      
      const totalFee = roundHalfUp(distanceKm) * ratePerKm;
      const finalFee = Math.max(30, totalFee);

      console.log(`\nFrom: ${shop.name}`);
      console.log(`  - OSRM Distance: ${distanceKm} km (${distanceMeters.toFixed(1)} meters)`);
      console.log(`  - roundHalfUp(Distance): ${roundHalfUp(distanceKm)}`);
      console.log(`  - Delivery Fee: ${finalFee} Baht`);
    } catch (e) {
      console.error(`Failed to calculate for ${shop.name}`, e);
    }
  }
}

calculateAllShops();
