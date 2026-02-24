const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const BACKUP_DIR = path.join(__dirname, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = './contributions.db';

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

class MediaBackupSystem {
    constructor() {
        this.backupHistory = this.loadBackupHistory();
    }

    loadBackupHistory() {
        const historyFile = path.join(BACKUP_DIR, 'backup_history.json');
        if (fs.existsSync(historyFile)) {
            return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        }
        return [];
    }

    saveBackupHistory() {
        const historyFile = path.join(BACKUP_DIR, 'backup_history.json');
        fs.writeFileSync(historyFile, JSON.stringify(this.backupHistory, null, 2));
    }

    async createFullBackup(backupName = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = backupName || `full_backup_${timestamp}`;
        const backupPath = path.join(BACKUP_DIR, `${backupId}.zip`);
        
        console.log(`\n=== Creating Full Backup: ${backupId} ===`);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(backupPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            output.on('close', () => {
                const stats = fs.statSync(backupPath);
                const backupInfo = {
                    id: backupId,
                    type: 'full',
                    timestamp: new Date().toISOString(),
                    size: stats.size,
                    file_count: archive.pointer(),
                    path: backupPath
                };
                
                this.backupHistory.push(backupInfo);
                this.saveBackupHistory();
                
                console.log(`✅ Full backup created successfully!`);
                console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   Location: ${backupPath}`);
                resolve(backupInfo);
            });

            archive.on('error', (err) => {
                console.error('❌ Backup creation failed:', err);
                reject(err);
            });

            archive.pipe(output);

            // Backup database
            if (fs.existsSync(DB_PATH)) {
                archive.file(DB_PATH, { name: 'database/contributions.db' });
                console.log('📦 Database backed up');
            }

            // Backup uploads directory
            if (fs.existsSync(UPLOADS_DIR)) {
                archive.directory(UPLOADS_DIR, 'uploads');
                console.log('📦 Uploads directory backed up');
            }

            archive.finalize();
        });
    }

    async createIncrementalBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `incremental_backup_${timestamp}`;
        const backupPath = path.join(BACKUP_DIR, `${backupId}.zip`);
        
        console.log(`\n=== Creating Incremental Backup: ${backupId} ===`);
        
        // Get last backup timestamp
        const lastBackup = this.backupHistory.length > 0 ? 
            new Date(this.backupHistory[this.backupHistory.length - 1].timestamp) : 
            new Date(0);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(backupPath);
            const archive = archiver('zip', {
                zlib: { level: 6 } // Balanced compression
            });

            output.on('close', () => {
                const stats = fs.statSync(backupPath);
                const backupInfo = {
                    id: backupId,
                    type: 'incremental',
                    timestamp: new Date().toISOString(),
                    size: stats.size,
                    file_count: archive.pointer(),
                    path: backupPath,
                    based_on: lastBackup.toISOString()
                };
                
                this.backupHistory.push(backupInfo);
                this.saveBackupHistory();
                
                console.log(`✅ Incremental backup created successfully!`);
                console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   Location: ${backupPath}`);
                resolve(backupInfo);
            });

            archive.on('error', (err) => {
                console.error('❌ Incremental backup failed:', err);
                reject(err);
            });

            archive.pipe(output);

            // Backup only changed files
            this.backupChangedFiles(archive, lastBackup);
            
            archive.finalize();
        });
    }

    backupChangedFiles(archive, sinceDate) {
        console.log('🔍 Scanning for changed files...');
        
        // Backup database if changed
        if (fs.existsSync(DB_PATH)) {
            const dbStats = fs.statSync(DB_PATH);
            if (new Date(dbStats.mtime) > sinceDate) {
                archive.file(DB_PATH, { name: 'database/contributions.db' });
                console.log('   📦 Database changed - including in backup');
            }
        }

        // Backup changed uploads
        if (fs.existsSync(UPLOADS_DIR)) {
            const uploadDirs = ['photos', 'mou'];
            uploadDirs.forEach(dir => {
                const dirPath = path.join(UPLOADS_DIR, dir);
                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath);
                    let changedCount = 0;
                    
                    files.forEach(file => {
                        const filePath = path.join(dirPath, file);
                        const stats = fs.statSync(filePath);
                        if (new Date(stats.mtime) > sinceDate) {
                            archive.file(filePath, { name: `uploads/${dir}/${file}` });
                            changedCount++;
                        }
                    });
                    
                    if (changedCount > 0) {
                        console.log(`   📦 ${dir}/: ${changedCount} changed files`);
                    }
                }
            });
        }
    }

    async restoreBackup(backupId) {
        const backup = this.backupHistory.find(b => b.id === backupId);
        if (!backup) {
            throw new Error(`Backup ${backupId} not found`);
        }

        console.log(`\n=== Restoring Backup: ${backupId} ===`);
        console.log(`   Type: ${backup.type}`);
        console.log(`   Created: ${backup.timestamp}`);
        console.log(`   Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);

        const backupPath = backup.path;
        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup file ${backupPath} not found`);
        }

        const extractPath = path.join(BACKUP_DIR, 'temp_restore');
        
        // Clean temp directory
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }
        fs.mkdirSync(extractPath, { recursive: true });

        return new Promise((resolve, reject) => {
            const extract = require('extract-zip');
            
            extract(backupPath, { dir: extractPath })
                .then(() => {
                    console.log('✅ Backup extracted successfully');
                    
                    // Restore database
                    const dbBackup = path.join(extractPath, 'database', 'contributions.db');
                    if (fs.existsSync(dbBackup)) {
                        fs.copyFileSync(dbBackup, DB_PATH);
                        console.log('   📊 Database restored');
                    }

                    // Restore uploads
                    const uploadsBackup = path.join(extractPath, 'uploads');
                    if (fs.existsSync(uploadsBackup)) {
                        fs.cpSync(uploadsBackup, UPLOADS_DIR, { recursive: true, force: true });
                        console.log('   📁 Uploads restored');
                    }

                    // Cleanup
                    fs.rmSync(extractPath, { recursive: true, force: true });
                    
                    console.log('✅ Restore completed successfully!');
                    resolve();
                })
                .catch(err => {
                    console.error('❌ Restore failed:', err);
                    // Cleanup on failure
                    if (fs.existsSync(extractPath)) {
                        fs.rmSync(extractPath, { recursive: true, force: true });
                    }
                    reject(err);
                });
        });
    }

    listBackups() {
        console.log('\n=== Available Backups ===');
        if (this.backupHistory.length === 0) {
            console.log('No backups found');
            return;
        }

        this.backupHistory.forEach((backup, index) => {
            console.log(`${index + 1}. ${backup.id}`);
            console.log(`   Type: ${backup.type}`);
            console.log(`   Date: ${new Date(backup.timestamp).toLocaleString()}`);
            console.log(`   Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Files: ${backup.file_count}`);
            if (backup.based_on) {
                console.log(`   Based on: ${new Date(backup.based_on).toLocaleString()}`);
            }
            console.log('');
        });
    }

    deleteBackup(backupId) {
        const backupIndex = this.backupHistory.findIndex(b => b.id === backupId);
        if (backupIndex === -1) {
            throw new Error(`Backup ${backupId} not found`);
        }

        const backup = this.backupHistory[backupIndex];
        if (fs.existsSync(backup.path)) {
            fs.unlinkSync(backup.path);
        }

        this.backupHistory.splice(backupIndex, 1);
        this.saveBackupHistory();
        
        console.log(`✅ Backup ${backupId} deleted successfully`);
    }

    getBackupStats() {
        const totalSize = this.backupHistory.reduce((sum, backup) => sum + backup.size, 0);
        const fullBackups = this.backupHistory.filter(b => b.type === 'full').length;
        const incrementalBackups = this.backupHistory.filter(b => b.type === 'incremental').length;
        
        return {
            total_backups: this.backupHistory.length,
            full_backups: fullBackups,
            incremental_backups: incrementalBackups,
            total_size: totalSize,
            total_size_mb: (totalSize / 1024 / 1024).toFixed(2)
        };
    }
}

// CLI Interface
async function main() {
    const backupSystem = new MediaBackupSystem();
    
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'create-full':
                await backupSystem.createFullBackup(args[1] || null);
                break;
                
            case 'create-incremental':
                await backupSystem.createIncrementalBackup();
                break;
                
            case 'list':
                backupSystem.listBackups();
                break;
                
            case 'restore':
                if (!args[1]) {
                    console.error('Error: Please specify backup ID to restore');
                    process.exit(1);
                }
                await backupSystem.restoreBackup(args[1]);
                break;
                
            case 'delete':
                if (!args[1]) {
                    console.error('Error: Please specify backup ID to delete');
                    process.exit(1);
                }
                backupSystem.deleteBackup(args[1]);
                break;
                
            case 'stats':
                const stats = backupSystem.getBackupStats();
                console.log('\n=== Backup Statistics ===');
                console.log(`Total Backups: ${stats.total_backups}`);
                console.log(`Full Backups: ${stats.full_backups}`);
                console.log(`Incremental Backups: ${stats.incremental_backups}`);
                console.log(`Total Size: ${stats.total_size_mb} MB`);
                break;
                
            default:
                console.log('Media Backup System');
                console.log('Usage: node media_backup.js [command] [options]');
                console.log('');
                console.log('Commands:');
                console.log('  create-full [name]     Create a full backup');
                console.log('  create-incremental     Create an incremental backup');
                console.log('  list                  List all backups');
                console.log('  restore <id>          Restore a specific backup');
                console.log('  delete <id>           Delete a specific backup');
                console.log('  stats                 Show backup statistics');
                console.log('');
                console.log('Examples:');
                console.log('  node media_backup.js create-full "pre-upload-backup"');
                console.log('  node media_backup.js create-incremental');
                console.log('  node media_backup.js list');
                console.log('  node media_backup.js restore full_backup_2026-02-16T10-30-00');
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = MediaBackupSystem;