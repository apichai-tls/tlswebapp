const https = require('https');

const customer = "13.7464024,100.5445206"; // 19 At Chidlom
const tlss1 = "13.74561694047803,100.5517748617824"; // TLSS1
const apiKey = "AIzaSyAQGS8ZA1BMv_jWl3eptJYcne3pj2WY8nY";

function getRoute(name, origin, destination) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=two_wheeler&avoid=tolls&alternatives=true&departure_time=now&region=th&key=${apiKey}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.status !== "OK") {
            console.log(`[${name}] Error:`, parsed.status, parsed.error_message);
            resolve(Infinity);
        } else {
            let shortest = parsed.routes[0];
            let minDistance = shortest.legs[0].distance.value;
            for (let i = 1; i < parsed.routes.length; i++) {
                const dist = parsed.routes[i].legs[0].distance.value;
                if (dist < minDistance) {
                    shortest = parsed.routes[i];
                    minDistance = dist;
                }
            }
            console.log(`[${name}] Shortest Route: ${shortest.legs[0].distance.text} (${minDistance} m) - ${shortest.legs[0].duration.text}`);
            resolve(minDistance);
        }
      });
    }).on('error', err => console.log(err.message));
  });
}

async function run() {
  console.log("=== Branch -> Customer (WITH departure_time=now) ===");
  await getRoute("TLSS1 -> 19 At Chidlom", tlss1, customer);
}

run();
