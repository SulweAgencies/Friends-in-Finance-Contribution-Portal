require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Direct database connection
const db = new sqlite3.Database("./contributions.db", err => {
  if (err) console.error("DB error:", err.message);
  else console.log("✅ SQLite connected to contributions.db");
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function migrateReceipts() {
  console.log('🧾 Migrating receipts to Cloudinary...');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM investment_tracking 
       WHERE receipt_path IS NOT NULL 
         AND (cloudinary_url IS NULL OR cloudinary_url = '')`,
      async (err, receipts) => {
        if (err) return reject(err);
        
        console.log(`Found ${receipts.length} receipts to migrate`);
        
        for (const receipt of receipts) {
          try {
            if (fs.existsSync(receipt.receipt_path)) {
              console.log(`📄 Migrating receipt ID ${receipt.id}: ${receipt.receipt_path}`);
              
              const result = await cloudinary.uploader.upload(receipt.receipt_path, {
                folder: 'friends-finance/receipts',
                public_id: `receipt-${receipt.id}`,
                resource_type: 'auto'
              });
              
              // Update database with Cloudinary info
              db.run(
                `UPDATE investment_tracking 
                 SET cloudinary_url = ?, receipt_public_id = ? 
                 WHERE id = ?`,
                [result.secure_url, result.public_id, receipt.id],
                (err) => {
                  if (err) console.error(`❌ Error updating receipt ${receipt.id}:`, err.message);
                  else console.log(`✅ Migrated receipt ID ${receipt.id}: ${result.secure_url}`);
                }
              );
            } else {
              console.log(`⚠️ File not found: ${receipt.receipt_path}`);
            }
          } catch (error) {
            console.error(`❌ Error migrating receipt ${receipt.id}:`, error.message);
          }
        }
        
        resolve();
      }
    );
  });
}

async function main() {
  try {
    await migrateReceipts();
    console.log('🧾 Receipt migration complete');
    db.close();
  } catch (error) {
    console.error('Migration failed:', error);
    db.close();
  }
}

main();
