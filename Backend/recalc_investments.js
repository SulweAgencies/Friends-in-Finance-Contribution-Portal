const dbModule = require('./db.js');

const wait = ms => new Promise(res => setTimeout(res, ms));

async function runWithRetry(attempts = 6, delay = 500, initialDelay = 1500) {
  console.log('Starting investment recalculation (with retry)...');
  if (initialDelay > 0) {
    console.log(`Waiting ${initialDelay}ms for DB initialization/migration...`);
    await wait(initialDelay);
  }
  for (let i = 0; i < attempts; i++) {
    try {
      console.log(`Attempt ${i + 1} of ${attempts}`);
      const result = await dbModule.updateInvestmentTrackingTable();
      console.log('RECALC_DONE - processed months:', result.length);
      if (result.length) {
        const last = result[result.length - 1];
        console.log('LAST_MONTH:', last.month);
        console.log('CUMULATIVE_MANSA_X:', last.cumulative_mansa_x);
        console.log('I_AND_M:', last.i_and_m);
        console.log('TOTAL_INVESTED:', last.total_invested);
      }
      process.exit(0);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`Attempt ${i + 1} failed:`, msg);
      if (i === attempts - 1) {
        console.error('RECALC_ERROR - giving up after retries', err && err.stack ? err.stack : err);
        process.exit(2);
      }
      console.log(`Waiting ${delay}ms before retrying...`);
      await wait(delay);
    }
  }
}

runWithRetry();
