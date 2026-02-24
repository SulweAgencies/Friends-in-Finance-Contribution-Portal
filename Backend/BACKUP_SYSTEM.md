# Media Backup System Documentation

## Overview
This backup system ensures zero media loss during uploads by creating automatic backups before any media operations. The system supports both full and incremental backups with easy restore capabilities.

## Features
- ✅ **Automatic Pre-Upload Backups** - Creates backup before any media upload
- ✅ **Full System Backups** - Complete backup of database and all media files
- ✅ **Incremental Backups** - Only backup changed files since last backup
- ✅ **Easy Restore** - One-command restore to any previous state
- ✅ **Backup History** - Track all backups with metadata
- ✅ **Compression** - Efficient ZIP compression to save storage space

## Directory Structure
```
Backend/
├── backups/
│   ├── full_backup_2026-02-16T10-30-00.zip
│   ├── incremental_backup_2026-02-16T11-45-00.zip
│   ├── backup_history.json
│   └── last_pre_upload_backup.txt
├── uploads/
│   ├── photos/
│   └── mou/
├── contributions.db
├── media_backup.js
└── pre_upload_backup.js
```

## Installation

1. **Install Dependencies**:
```bash
cd Backend
npm install archiver extract-zip
```

2. **The system is now ready to use!**

## Usage

### 1. Automatic Pre-Upload Backup
Run this before uploading any media files:
```bash
node pre_upload_backup.js
```

This will:
- Create a full backup with timestamp
- Save backup ID for potential restore
- Display backup details
- Allow safe media upload

### 2. Manual Full Backup
Create a complete backup of everything:
```bash
node media_backup.js create-full [backup_name]
```

Examples:
```bash
# Create backup with custom name
node media_backup.js create-full "end_of_month_backup"

# Create backup with auto-generated name
node media_backup.js create-full
```

### 3. Incremental Backup
Only backup files that have changed:
```bash
node media_backup.js create-incremental
```

### 4. List All Backups
View all available backups:
```bash
node media_backup.js list
```

### 5. Restore Backup
Restore to a previous state:
```bash
node media_backup.js restore <backup_id>
```

Example:
```bash
node media_backup.js restore full_backup_2026-02-16T10-30-00
```

### 6. Delete Backup
Remove old backups to save space:
```bash
node media_backup.js delete <backup_id>
```

### 7. View Statistics
See backup usage statistics:
```bash
node media_backup.js stats
```

## Backup Types

### Full Backup
- **What**: Complete copy of database and all files
- **When to use**: 
  - Before major operations
  - End of month/year
  - Before system updates
- **Size**: Larger but complete
- **Compression**: Maximum (level 9)

### Incremental Backup
- **What**: Only files changed since last backup
- **When to use**:
  - Daily backups
  - After small changes
  - Regular maintenance
- **Size**: Smaller and faster
- **Compression**: Balanced (level 6)

## Safety Features

### 1. Pre-Upload Protection
Always run `node pre_upload_backup.js` before uploading media:
```bash
# Step 1: Create backup
node pre_upload_backup.js

# Step 2: Upload your media files
# (Proceed with your normal upload process)

# Step 3: If something goes wrong, restore:
node media_backup.js restore pre_upload_2026-02-16T10-30-00-000Z
```

### 2. Version History
All backups are timestamped and tracked in `backup_history.json`:
```json
[
  {
    "id": "full_backup_2026-02-16T10-30-00",
    "type": "full",
    "timestamp": "2026-02-16T10:30:00.000Z",
    "size": 15728640,
    "file_count": 1250,
    "path": "backups/full_backup_2026-02-16T10-30-00.zip"
  }
]
```

### 3. Easy Restore
One command restores everything:
```bash
node media_backup.js restore full_backup_2026-02-16T10-30-00
```

## Best Practices

### Daily Workflow
```bash
# Morning: Create incremental backup
node media_backup.js create-incremental

# During day: Work normally
# Upload photos, MOU documents, etc.

# End of day: Create another incremental
node media_backup.js create-incremental
```

### Before Major Operations
```bash
# Before bulk uploads
node pre_upload_backup.js

# Do your uploads
# (your normal upload process)

# Verify everything works
# If issues, restore immediately:
node media_backup.js restore pre_upload_2026-02-16T10-30-00-000Z
```

### Monthly Maintenance
```bash
# First day of month: Full backup
node media_backup.js create-full "monthly_backup_$(date +%Y-%m)"

# Mid-month: Incremental backups
node media_backup.js create-incremental

# End of month: Another full backup
node media_backup.js create-full "end_of_month_$(date +%Y-%m)"

# Clean up old backups (keep last 3 months)
node media_backup.js list
# Manually delete old backups using their IDs
```

## Storage Management

### Monitor Backup Size
```bash
node media_backup.js stats
```

### Clean Up Old Backups
```bash
# List backups to identify old ones
node media_backup.js list

# Delete specific old backups
node media_backup.js delete old_backup_id_1
node media_backup.js delete old_backup_id_2
```

### Recommended Retention Policy
- **Daily incremental backups**: Keep 30 days
- **Weekly full backups**: Keep 3 months
- **Monthly full backups**: Keep 1 year
- **Yearly full backups**: Keep 5 years

## Troubleshooting

### Backup Fails
```bash
# Check available disk space
df -h

# Check permissions
ls -la backups/
ls -la uploads/

# Check if backup directory exists
mkdir -p backups
```

### Restore Fails
```bash
# Check if backup file exists
ls -la backups/backup_name.zip

# Check backup integrity
unzip -t backups/backup_name.zip

# Try manual restore
# Extract backup manually and copy files
```

### Not Enough Disk Space
```bash
# Check current usage
node media_backup.js stats

# Delete old incremental backups
node media_backup.js list
node media_backup.js delete old_incremental_backup

# Consider compressing old full backups further
```

## Security Considerations

### Backup File Security
- Backup files contain sensitive data
- Store backups in secure location
- Consider encrypting backup files
- Limit access to backup directory

### Access Control
```bash
# Set proper permissions
chmod 700 backups/
chmod 600 backups/*.zip
chmod 600 backups/backup_history.json
```

## Integration with Upload Process

### Automated Integration
You can integrate backups into your upload workflow:

```javascript
// In your upload script
const { createPreUploadBackup } = require('./pre_upload_backup.js');

async function uploadMedia() {
    try {
        // Step 1: Create backup
        const backupId = await createPreUploadBackup();
        
        // Step 2: Proceed with upload
        // Your upload logic here
        
        console.log('✅ Upload completed successfully!');
        
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        
        // Step 3: Restore if needed
        if (backupId) {
            console.log('🔄 Restoring from backup...');
            // Call restore function
        }
    }
}
```

## Emergency Procedures

### If Upload Goes Wrong
```bash
# 1. Stop all upload processes
# 2. Identify the last good backup
node media_backup.js list

# 3. Restore immediately
node media_backup.js restore pre_upload_2026-02-16T10-30-00-000Z

# 4. Verify restoration
# Check that files and database are correct
```

### If Database Corruption Occurs
```bash
# 1. Stop the application
# 2. Restore from most recent backup
node media_backup.js restore full_backup_2026-02-16T10-30-00

# 3. Restart application
node server.js
```

This backup system ensures your media files are always protected and recoverable!