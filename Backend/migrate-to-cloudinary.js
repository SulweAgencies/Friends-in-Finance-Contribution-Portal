// migrate-to-cloudinary.js
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function migratePhotos() {
  console.log('📸 Migrating photos to Cloudinary...');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM member_documents 
       WHERE document_type = 'photo' 
         AND status = 'active' 
         AND (cloudinary_url IS NULL OR cloudinary_url = '')`,
      async (err, photos) => {
        if (err) return reject(err);
        
        console.log(`Found ${photos.length} photos to migrate`);
        
        for (const photo of photos) {
          try {
            // Check if file exists locally
            if (!fs.existsSync(photo.file_path)) {
              console.log(`⚠️ File not found: ${photo.file_path}`);
              continue;
            }
            
            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(photo.file_path, {
              folder: 'friends-finance/photos',
              public_id: `PHOTO-${Date.now()}-${photo.id}`,
              transformation: [{ width: 500, height: 500, crop: 'limit' }]
            });
            
            // Update database with Cloudinary info
            await new Promise((res, rej) => {
              db.run(
                `UPDATE member_documents 
                 SET cloudinary_url = ?, public_id = ?, 
                     metadata = json_set(COALESCE(metadata, '{}'), '$.migrated', 'true')
                 WHERE id = ?`,
                [result.secure_url, result.public_id, photo.id],
                (err) => err ? rej(err) : res()
              );
            });
            
            console.log(`✅ Migrated photo ID ${photo.id}: ${result.secure_url}`);
            
            // Optional: Delete local file after successful migration
            // fs.unlinkSync(photo.file_path);
            
          } catch (error) {
            console.error(`❌ Failed to migrate photo ID ${photo.id}:`, error.message);
          }
        }
        
        resolve();
      }
    );
  });
}

async function migrateMOUs() {
  console.log('📄 Migrating MOUs to Cloudinary...');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM member_documents 
       WHERE document_type = 'mou' 
         AND status = 'active' 
         AND (cloudinary_url IS NULL OR cloudinary_url = '')`,
      async (err, mous) => {
        if (err) return reject(err);
        
        console.log(`Found ${mous.length} MOUs to migrate`);
        
        for (const mou of mous) {
          try {
            if (!fs.existsSync(mou.file_path)) {
              console.log(`⚠️ File not found: ${mou.file_path}`);
              continue;
            }
            
            // Upload to Cloudinary as raw file
            const result = await cloudinary.uploader.upload(mou.file_path, {
              folder: 'friends-finance/mou',
              public_id: `MOU-${Date.now()}-${mou.id}`,
              resource_type: 'raw'
            });
            
            // Update database
            await new Promise((res, rej) => {
              db.run(
                `UPDATE member_documents 
                 SET cloudinary_url = ?, public_id = ?,
                     metadata = json_set(COALESCE(metadata, '{}'), '$.migrated', 'true')
                 WHERE id = ?`,
                [result.secure_url, result.public_id, mou.id],
                (err) => err ? rej(err) : res()
              );
            });
            
            console.log(`✅ Migrated MOU ID ${mou.id}: ${result.secure_url}`);
            
          } catch (error) {
            console.error(`❌ Failed to migrate MOU ID ${mou.id}:`, error.message);
          }
        }
        
        resolve();
      }
    );
  });
}

async function migrateReceipts() {
  console.log('🧾 Migrating investment receipts to Cloudinary...');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM investment_tracking 
       WHERE receipt_path IS NOT NULL 
         AND receipt_path != ''
         AND (cloudinary_url IS NULL OR cloudinary_url = '')`,
      async (err, receipts) => {
        if (err) return reject(err);
        
        console.log(`Found ${receipts.length} receipts to migrate`);
        
        for (const receipt of receipts) {
          try {
            if (!fs.existsSync(receipt.receipt_path)) {
              console.log(`⚠️ File not found: ${receipt.receipt_path}`);
              continue;
            }
            
            // Determine resource type based on file extension
            const ext = path.extname(receipt.receipt_path).toLowerCase();
            const resourceType = ['.jpg', '.jpeg', '.png', '.gif'].includes(ext) ? 'image' : 'raw';
            
            const result = await cloudinary.uploader.upload(receipt.receipt_path, {
              folder: 'friends-finance/receipts',
              public_id: `receipt_${receipt.month}_${Date.now()}`,
              resource_type: resourceType
            });
            
            // Update database
            await new Promise((res, rej) => {
              db.run(
                `UPDATE investment_tracking 
                 SET cloudinary_url = ?, receipt_public_id = ?
                 WHERE id = ?`,
                [result.secure_url, result.public_id, receipt.id],
                (err) => err ? rej(err) : res()
              );
            });
            
            console.log(`✅ Migrated receipt for ${receipt.month}: ${result.secure_url}`);
            
          } catch (error) {
            console.error(`❌ Failed to migrate receipt ID ${receipt.id}:`, error.message);
          }
        }
        
        resolve();
      }
    );
  });
}

async function runMigration() {
  console.log('🚀 Starting migration to Cloudinary...\n');
  
  try {
    await migratePhotos();
    console.log('\n📸 Photo migration complete\n');
    
    await migrateMOUs();
    console.log('\n📄 MOU migration complete\n');
    
    await migrateReceipts();
    console.log('\n🧾 Receipt migration complete\n');
    
    console.log('✅ All migrations completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // Close database connection
    db.close();
  }
}

// Run the migration
runMigration();