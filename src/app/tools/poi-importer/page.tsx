import { redirect } from "next/navigation";

export default async function PoiImporterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const subtab = params?.tab ? `&subtab=${params.tab}` : "";
  redirect(`/admin?tab=pois${subtab}`);
}
