require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database("./contributions.db");

function addCloudinaryColumns() {
    console.log('Adding Cloudinary columns to database...');
    
    // Add columns to member_documents
    db.run(`ALTER TABLE member_documents ADD COLUMN cloudinary_url TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column")) {
            console.error('Error:', err.message);
        } else {
            console.log('✅ cloudinary_url column ready in member_documents');
        }
    });

    db.run(`ALTER TABLE member_documents ADD COLUMN public_id TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column")) {
            console.error('Error:', err.message);
        } else {
            console.log('✅ public_id column ready in member_documents');
        }
    });

    // Add columns to investment_tracking
    db.run(`ALTER TABLE investment_tracking ADD COLUMN cloudinary_url TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column")) {
            console.error('Error:', err.message);
        } else {
            console.log('✅ cloudinary_url column ready in investment_tracking');
        }
    });

    db.run(`ALTER TABLE investment_tracking ADD COLUMN receipt_public_id TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column")) {
            console.error('Error:', err.message);
        } else {
            console.log('✅ receipt_public_id column ready in investment_tracking');
        }
    });

    // Close database after a delay to allow all operations to complete
    setTimeout(() => {
        db.close();
        console.log('Database schema updated successfully!');
    }, 1000);
}

addCloudinaryColumns();
