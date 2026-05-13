const start = Date.now();
fetch('http://localhost:3000/api/db')
  .then(res => res.json())
  .then(data => {
    console.log(`Time taken: ${Date.now() - start}ms`);
    console.log(`Jobs: ${data.jobs.length}, POIs: ${data.pois.length}`);
  })
  .catch(console.error);
