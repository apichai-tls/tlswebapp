async function main() {
  try {
    const start = '2020-01-01T00:00:00.000Z';
    const end = '2030-01-01T23:59:59.999Z';
    const url = `http://localhost:3000/api/jobs/history?start=${start}&end=${end}`;
    console.log(`Fetching from: ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log(`Fetched ${data.length} jobs.`);
    if (data.length > 0) {
      console.log("Keys of first job:", Object.keys(data[0]));
      console.log("isPaid value of first job:", data[0].isPaid);
      console.log("Full first job details:", JSON.stringify(data[0], null, 2));
    } else {
      console.log("No jobs found in localhost database for this range.");
    }
  } catch (error) {
    console.error("Fetch failed:", error.message);
  }
}

main();
