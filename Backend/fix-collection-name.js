require('./mongodb.js').connectToMongoDB().then(async () => {
  const mongoose = require('mongoose');
  
  // Get old data from investmenttrackings collection
  const oldSchema = new mongoose.Schema({}, { strict: false });
  const OldModel = mongoose.model('OldInvestmentTracking', oldSchema, 'investmenttrackings');
  
  // Get new model with correct collection name
  const { InvestmentTracking } = require('./mongodb-models');
  
  try {
    // Get all data from old collection
    const oldData = await OldModel.find({});
    console.log(`Found ${oldData.length} records in old collection`);
    
    if (oldData.length > 0) {
      // Clear new collection
      await InvestmentTracking.deleteMany({});
      console.log('Cleared new collection');
      
      // Insert data into new collection
      for (const record of oldData) {
        const cleanData = {
          month: record.month,
          total_contributions: record.total_contributions,
          mansa_x: record.mansa_x,
          i_and_m: record.i_and_m,
          cumulative_mansa_x: record.cumulative_mansa_x,
          total_invested: record.total_invested,
          running_total_contributions: record.running_total_contributions,
          mansa_x_percentage: record.mansa_x_percentage,
          i_and_m_percentage: record.i_and_m_percentage,
          created_at: record.created_at,
          updated_at: record.updated_at,
          last_calculated: record.last_calculated,
          receipt_url: record.receipt_url,
          receipt_path: record.receipt_path,
          receipt_filename: record.receipt_filename,
          receipt_uploaded_at: record.receipt_uploaded_at,
          receipt_uploaded_by: record.receipt_uploaded_by
        };
        
        await InvestmentTracking.create(cleanData);
      }
      
      console.log('✅ Migrated data to investment_tracking collection');
      
      // Drop old collection
      await mongoose.connection.db.dropCollection('investmenttrackings');
      console.log('✅ Dropped old investmenttrackings collection');
    } else {
      console.log('No data to migrate');
    }
    
  } catch (error) {
    console.error('Migration error:', error);
  }
  
  await mongoose.connection.close();
  process.exit(0);
}).catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});
