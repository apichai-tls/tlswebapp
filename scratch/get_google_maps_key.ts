import { PrismaClient } from '@prisma/client';

async function run() {
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: testUrl });

  try {
    const settings = await prisma.setting.findMany();
    console.log('Settings in DB:', settings);

    const apiKeySetting = settings.find(s => s.key === 'googleMapsApiKey');
    const enableGoogleSetting = settings.find(s => s.key === 'enableGoogleApi');

    console.log('Google API Enabled:', enableGoogleSetting?.value);
    console.log('API Key Found:', apiKeySetting ? 'Yes (hidden)' : 'No');

    if (apiKeySetting && apiKeySetting.value) {
      const apiKey = apiKeySetting.value;
      const targetCoords = { lat: 13.7069879, lng: 100.5999322 }; // INNSiDE
      const srCoords = { lat: 13.7438, lng: 100.5583 }; // SR
      const pkCoords = { lat: 13.73965162335183, lng: 100.625667251928 }; // PK / Pattanakarn

      console.log('\n--- CALLING GOOGLE DIRECTIONS API (mode=two_wheeler) ---');
      
      const queryGoogle = async (name, shopCoords) => {
        const origin = `${shopCoords.lat},${shopCoords.lng}`;
        const destination = `${targetCoords.lat},${targetCoords.lng}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&avoid=tolls&alternatives=true&mode=two_wheeler&region=th&key=${apiKey}`;
        
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.status === 'OK' && data.routes) {
            console.log(`Google Maps (Motorcycle) from ${name} to INNSiDE:`);
            data.routes.forEach((route, idx) => {
              const distKm = route.legs[0].distance.value / 1000;
              const durationMin = route.legs[0].duration.value / 60;
              console.log(` - Route ${idx + 1}: ${distKm.toFixed(2)} km, ${durationMin.toFixed(2)} mins (${route.summary || 'no summary'})`);
            });
          } else {
            console.log(`Google API error for ${name}: status=${data.status}, error_message=${data.error_message}`);
          }
        } catch (e: any) {
          console.error(`Fetch failed for ${name}:`, e.message);
        }
      };

      await queryGoogle('SR (Soi Ruamrudee)', srCoords);
      await queryGoogle('PK (Pattanakarn)', pkCoords);
    } else {
      console.log('No Google Maps API Key found in DB settings. Cannot query Google Maps.');
    }

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
