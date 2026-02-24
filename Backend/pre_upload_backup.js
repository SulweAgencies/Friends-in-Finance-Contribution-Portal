const MediaBackupSystem = require('./media_backup.js');

async function createPreUploadBackup() {
    console.log('=== Pre-Upload Backup System ===');
    console.log('Creating backup before media upload...\n');
    
    const backupSystem = new MediaBackupSystem();
    
    try {
        // Create a full backup with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `pre_upload_${timestamp}`;
        
        const backupInfo = await backupSystem.createFullBackup(backupName);
        
        console.log('\n✅ Pre-upload backup completed successfully!');
        console.log(`   Backup ID: ${backupInfo.id}`);
        console.log(`   Backup Size: ${(backupInfo.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Files Included: ${backupInfo.file_count}`);
        console.log(`   Location: ${backupInfo.path}`);
        
        // Save backup ID for potential restore
        const fs = require('fs');
        const path = require('path');
        const lastBackupFile = path.join(__dirname, 'backups', 'last_pre_upload_backup.txt');
        fs.writeFileSync(lastBackupFile, backupInfo.id);
        
        console.log('\n🚀 You can now safely upload your media files.');
        console.log('   In case of any issues, you can restore using:');
        console.log(`   node media_backup.js restore ${backupInfo.id}`);
        
        return backupInfo.id;
        
    } catch (error) {
        console.error('❌ Pre-upload backup failed:', error.message);
        console.log('\n⚠️  Proceeding without backup - this is risky!');
        throw error;
    }
}

// Run automatically if called directly
if (require.main === module) {
    createPreUploadBackup().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { createPreUploadBackup };