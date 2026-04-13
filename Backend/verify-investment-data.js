require('./mongodb.js').connectToMongoDB().then(async () => {
  const { InvestmentTracking } = require('./mongodb-models');
  const investments = await InvestmentTracking.find({}).sort({ month: 1 });
  console.log('=== Updated MongoDB investment_tracking data ===');
  investments.forEach(inv => {
    const obj = inv.toObject();
    console.log(`Month: ${obj.month}`);
    console.log(`  receipt_url: ${obj.receipt_url}`);
    console.log(`  receipt_uploaded_at: ${obj.receipt_uploaded_at}`);
    console.log(`  receipt_uploaded_by: ${obj.receipt_uploaded_by}`);
    console.log('---');
  });
  process.exit(0);
}).catch(err => {
  console.error('MongoDB error:', err);
  process.exit(1);
});
