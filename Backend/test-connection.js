const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    console.log('🔍 Testing MongoDB connection...');
    console.log('📋 Connection URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
    
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI not found in .env file');
        return;
    }
    
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connection successful!');
        console.log('📊 Database name:', mongoose.connection.name);
        console.log('🌐 Host:', mongoose.connection.host);
        
        // Test basic operation
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📁 Collections found:', collections.length);
        
        await mongoose.connection.close();
        console.log('🔌 Connection closed successfully');
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.log('💡 DNS resolution failed - check cluster name in connection string');
        } else if (error.code === 'AUTH_FAILED') {
            console.log('💡 Authentication failed - check username/password');
        } else if (error.code === 'UNAUTHORIZED') {
            console.log('💡 Access denied - check IP whitelist in Atlas');
        }
    }
}

testConnection();
