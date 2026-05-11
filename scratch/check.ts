async function testDirectionalOSRM() {
  const cassia = '100.583789,13.755879'; // Cassia
  const pattanakarn = '100.6256,13.7396'; // Pattanakarn
  
  // From Cassia to Pattanakarn
  const url1 = `https://router.project-osrm.org/route/v1/driving/${cassia};${pattanakarn}?overview=full&geometries=geojson`;
  let res = await fetch(url1);
  let data = await res.json();
  console.log('Cassia -> Pattanakarn:', data.routes[0].distance / 1000, 'km');

  // From Pattanakarn to Cassia
  const url2 = `https://router.project-osrm.org/route/v1/driving/${pattanakarn};${cassia}?overview=full&geometries=geojson`;
  res = await fetch(url2);
  data = await res.json();
  console.log('Pattanakarn -> Cassia:', data.routes[0].distance / 1000, 'km');

  const tlssr = '100.5583,13.7438'; // TLSSR
  // From Cassia to TLSSR
  const url3 = `https://router.project-osrm.org/route/v1/driving/${cassia};${tlssr}?overview=full&geometries=geojson`;
  res = await fetch(url3);
  data = await res.json();
  console.log('Cassia -> TLSSR:', data.routes[0].distance / 1000, 'km');

  // From TLSSR to Cassia
  const url4 = `https://router.project-osrm.org/route/v1/driving/${tlssr};${cassia}?overview=full&geometries=geojson`;
  res = await fetch(url4);
  data = await res.json();
  console.log('TLSSR -> Cassia:', data.routes[0].distance / 1000, 'km');
}

testDirectionalOSRM().catch(console.error);
