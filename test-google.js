const https = require('https');

const origin = "13.7417,100.5526"; // Shop 1
const destination = "13.7262,100.5235"; // Silom
const apiKey = "AIzaSyAQGS8ZA1BMv_jWl3eptJYcne3pj2WY8nY";
const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=two_wheeler&avoid=tolls&alternatives=true&region=th&key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const parsed = JSON.parse(data);
    if (parsed.status !== "OK") {
        console.log("Error:", parsed.status, parsed.error_message);
    } else {
        console.log("Routes count:", parsed.routes.length);
        parsed.routes.forEach((r, i) => {
            console.log(`Route ${i+1}: ${r.legs[0].distance.text} (${r.legs[0].distance.value} m) - ${r.legs[0].duration.text}`);
        });
    }
  });
}).on('error', err => console.log(err.message));
