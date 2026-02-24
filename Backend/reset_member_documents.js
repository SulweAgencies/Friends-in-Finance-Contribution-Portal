const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./contributions.db');
const photosDir = path.join(__dirname, 'uploads', 'photos');

console.log('=== Member Documents Reset System ===\n');

// Function to delete files
function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Deleted: ${path.basename(filePath)}`);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`❌ Error deleting ${filePath}:`, err.message);
        return false;
    }
}

// Function to clear database records
function clearDatabaseRecords(documentType) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, file_path, file_name FROM member_documents WHERE document_type = ?`,
            [documentType],
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (rows && rows.length > 0) {
                    console.log(`\n📄 Found ${rows.length} ${documentType.toUpperCase()} records to clear:`);
                    rows.forEach(row => {
                        console.log(`  - ${row.file_name}`);
                    });
                    
                    // Delete records from database
                    db.run(
                        `DELETE FROM member_documents WHERE document_type = ?`,
                        [documentType],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                console.log(`✅ Deleted ${this.changes} ${documentType.toUpperCase()} records from database`);
                                resolve(rows);
                            }
                        }
                    );
                } else {
                    console.log(`✅ No ${documentType.toUpperCase()} records found in database`);
                    resolve([]);
                }
            }
        );
    });
}

// Function to clear files from directory
function clearFilesFromDirectory(files) {
    let deletedCount = 0;
    console.log(`\n🗑️  Deleting ${files.length} files from uploads directory:`);
    
    files.forEach(file => {
        const filePath = path.join(photosDir, file.file_name);
        if (deleteFile(filePath)) {
            deletedCount++;
        }
    });
    
    console.log(`✅ Successfully deleted ${deletedCount}/${files.length} files`);
}

// Main execution
async function main() {
    try {
        console.log('Starting member documents reset...\n');
        
        // 1. Clear photo records from database
        const photoFiles = await clearDatabaseRecords('photo');
        
        // 2. Clear MOU records from database  
        const mouFiles = await clearDatabaseRecords('mou');
        
        // 3. Delete photo files from directory
        if (photoFiles.length > 0) {
            clearFilesFromDirectory(photoFiles);
        }
        
        // 4. Delete MOU files from directory (if they exist locally)
        if (mouFiles.length > 0) {
            console.log(`\n📝 MOU files were stored in database but may be stored elsewhere.`);
            console.log(`📋 MOU files cleared from database:`);
            mouFiles.forEach(file => {
                console.log(`  - ${file.file_name}`);
            });
        }
        
        // 5. Verify directory is empty
        if (fs.existsSync(photosDir)) {
            const remainingFiles = fs.readdirSync(photosDir);
            if (remainingFiles.length === 0) {
                console.log(`\n✅ Photos directory is now empty`);
            } else {
                console.log(`\n⚠️  ${remainingFiles.length} files still remain in photos directory:`);
                remainingFiles.forEach(file => console.log(`  - ${file}`));
            }
        }
        
        console.log(`\n🎉 Member documents reset completed successfully!`);
        console.log(`\n📋 Next steps:`);
        console.log(`1. Upload correct photos through the admin dashboard`);
        console.log(`2. Upload MOU documents through the admin dashboard`);
        console.log(`3. The system will automatically track both document types`);
        
    } catch (error) {
        console.error('❌ Error during reset:', error.message);
    } finally {
        db.close();
    }
}

main();
