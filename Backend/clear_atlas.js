const { connectToMongoDB } = require('./mongodb');
const { mongoose } = require('./mongodb-models');

async function clearAtlas() {
  try {
    await connectToMongoDB();
    const dbName = mongoose.connection.name;
    console.log(`⚠️ Dropping database: ${dbName}`);
    await mongoose.connection.db.dropDatabase();
    console.log('✅ Atlas database dropped successfully');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to drop Atlas database:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  clearAtlas();
}

module.exports = { clearAtlas };
