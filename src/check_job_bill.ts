import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const job = await prisma.job.findUnique({
    where: { id: "2026001102" }
  });
  if (!job || !job.billImageUrl) {
    console.log("Job or billImageUrl not found");
    return;
  }
  const urls = JSON.parse(job.billImageUrl);
  const dataUrl = urls[0];
  const base64Content = dataUrl.replace("data:image/svg+xml;charset=utf-8;base64,", "");
  const decodedSvg = decodeURIComponent(escape(atob(base64Content)));
  console.log("First 10 character codes of SVG:");
  for (let i = 0; i < 10; i++) {
    console.log(`Char ${i}: '${decodedSvg[i]}' (code: ${decodedSvg.charCodeAt(i)})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
