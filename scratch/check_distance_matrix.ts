import { PrismaClient } from '@prisma/client';

async function run() {
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: testUrl });

  try {
    const settings = await prisma.setting.findMany();
    const apiKeySetting = settings.find(s => s.key === 'googleMapsApiKey');
    if (apiKeySetting && apiKeySetting.value) {
      const apiKey = apiKeySetting.value;
      const targetCoords = { lat: 13.7069879, lng: 100.5999322 }; // INNSiDE
      const srCoords = { lat: 13.7438, lng: 100.5583 }; // SR
      const pkCoords = { lat: 13.73965162335183, lng: 100.625667251928 }; // PK / Pattanakarn

      const origins = `${srCoords.lat},${srCoords.lng}|${pkCoords.lat},${pkCoords.lng}`;
      const destinations = `${targetCoords.lat},${targetCoords.lng}`;
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${destinations}&avoid=tolls&mode=two_wheeler&region=th&key=${apiKey}`;

      const res = await fetch(url);
      const data = await res.json();
      console.log('Google Distance Matrix Response:', JSON.stringify(data, null, 2));
    }
  } catch (e: any) {
    console.error(e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
