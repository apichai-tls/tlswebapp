import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

async function main() {
  const setting = await prisma.setting.findUnique({ where: { key: 'googleMapsApiKey' } });
  const apiKey = setting?.value;
  
  if (!apiKey) {
    console.log("No API key found");
    return;
  }

  const query = "Young and Beautiful";
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=th&language=th&key=${apiKey}`;
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const parsed = JSON.parse(data);
      console.log(`Status: ${parsed.status}`);
      if (parsed.results) {
        console.log(`Found ${parsed.results.length} results:`);
        parsed.results.slice(0, 15).forEach((r: any) => {
          console.log(`- ${r.name} (${r.formatted_address})`);
        });
      }
    });
  });
}

main().finally(() => prisma.$disconnect());
