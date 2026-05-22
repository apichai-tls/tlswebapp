import { updateJobAction } from '../src/actions/db';
async function main() {
  try {
    const res = await updateJobAction('2026000001', { status: 'completed', completedAt: new Date() });
    console.log(res);
  } catch (e) { console.error('ERROR:', e); }
}
main();
