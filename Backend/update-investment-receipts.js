require('./mongodb.js').connectToMongoDB().then(async () => {
  const { InvestmentTracking } = require('./mongodb-models');
  
  // Update each record with receipt_url from SQLite
  const updates = [
    { month: 'Dec-2025', receipt_url: 'https://drive.google.com/file/d/1hPLZ_gl-r3yPMlSc9TSwz1RjG-20nl7U/view?usp=drive_link' },
    { month: 'Feb-2026', receipt_url: 'https://drive.google.com/file/d/1e8j1YgVwsaVwqXd6voVsOyfWWk0Wqmke/view?usp=drive_link' },
    { month: 'Jan-2026', receipt_url: 'https://drive.google.com/file/d/1dAVV9vas0T1nbE5usBbfu9baM6D8ypmu/view?usp=drive_link' },
    { month: 'Nov-2025', receipt_url: null }
  ];
  
  for (const update of updates) {
    await InvestmentTracking.findOneAndUpdate(
      { month: update.month },
      { receipt_url: update.receipt_url },
      { new: true }
    );
    console.log(`Updated receipt_url for ${update.month}`);
  }
  
  console.log('✅ MongoDB investment_tracking updated to match SQLite structure');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
