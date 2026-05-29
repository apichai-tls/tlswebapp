const targetCoords = { lat: 13.7069879, lng: 100.5999322 }; // INNSiDE
const srCoords = { lat: 13.7438, lng: 100.5583 }; // SR
const pkCoords = { lat: 13.73965162335183, lng: 100.625667251928 }; // PK / Pattanakarn

async function checkOSRMRoute(name, shopCoords) {
  const url = `https://router.project-osrm.org/route/v1/driving/${shopCoords.lng},${shopCoords.lat};${targetCoords.lng},${targetCoords.lat}?overview=false`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const distanceKm = data.routes[0].distance / 1000;
      const durationMin = data.routes[0].duration / 60;
      console.log(`OSRM Driving Route from ${name} to INNSiDE:`);
      console.log(` - Distance: ${distanceKm.toFixed(2)} km`);
      console.log(` - Duration: ${durationMin.toFixed(2)} minutes`);
    } else {
      console.log(`OSRM route failed for ${name}`, data);
    }
  } catch (e) {
    console.error(`Error fetching OSRM for ${name}:`, e.message);
  }
}

async function run() {
  await checkOSRMRoute('SR (Soi Ruamrudee)', srCoords);
  await checkOSRMRoute('PK (Pattanakarn)', pkCoords);
}

run();
