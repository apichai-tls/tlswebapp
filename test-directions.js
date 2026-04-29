async function test() {
  try {
    const res = await fetch("http://localhost:3000/api/directions?origin=13.7607855,100.6037696&destination=13.745616940478026,100.55177486178236&key=AIzaSyAQGS8ZA1BMv_jWl3eptJYcne3pj2WY8nY");
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Data:", JSON.stringify(data).substring(0, 200));
  } catch (err) {
    console.error(err);
  }
}
test();
