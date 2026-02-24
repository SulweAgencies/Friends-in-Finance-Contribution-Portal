const { autoUpdateInvestmentTracking } = require('./db');

async function testPercentages() {
    try {
        console.log('🧪 Testing investment tracking percentage calculations...');
        const result = await autoUpdateInvestmentTracking();
        console.log('✅ Test result:', result);
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testPercentages();
