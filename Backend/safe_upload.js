#!/usr/bin/env node

// Safe Media Upload Script
// This script creates a backup before any media upload operations

const { createPreUploadBackup } = require('./pre_upload_backup.js');
const fs = require('fs');
const path = require('path');

async function safeMediaUpload() {
    console.log('=== Safe Media Upload Assistant ===\n');
    
    try {
        // Step 1: Create backup
        console.log('Step 1: Creating pre-upload backup...');
        const backupId = await createPreUploadBackup();
        
        console.log('\n✅ Backup created successfully!');
        console.log(`   Backup ID: ${backupId}`);
        
        // Step 2: Instructions for user
        console.log('\n=== Ready for Media Upload ===');
        console.log('You can now safely upload your media files.');
        console.log('The system is protected by the backup we just created.');
        console.log('');
        console.log('To upload media:');
        console.log('1. Open your admin dashboard');
        console.log('2. Navigate to the members section');
        console.log('3. Upload photos and MOU documents as needed');
        console.log('4. The backup will protect your data');
        console.log('');
        console.log('If anything goes wrong during upload:');
        console.log(`Run: node media_backup.js restore ${backupId}`);
        console.log('');
        console.log('=== Emergency Restore Command ===');
        console.log(`node media_backup.js restore ${backupId}`);
        console.log('');
        
        // Save the restore command to a file for easy access
        const restoreFile = path.join(__dirname, 'EMERGENCY_RESTORE.txt');
        const restoreCommand = `node media_backup.js restore ${backupId}`;
        fs.writeFileSync(restoreFile, restoreCommand);
        console.log(`💾 Emergency restore command saved to: ${restoreFile}`);
        
        console.log('\n🎉 System is ready for safe media upload!');
        
    } catch (error) {
        console.error('\n❌ Failed to create backup:', error.message);
        console.log('\n⚠️  WARNING: Proceeding without backup is risky!');
        console.log('Consider fixing the backup system before uploading media.');
        process.exit(1);
    }
}

// Run the assistant
if (require.main === module) {
    safeMediaUpload().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { safeMediaUpload };