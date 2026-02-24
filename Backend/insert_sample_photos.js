const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database('./contributions.db');

// Sample mapping of member emails to photo filenames
const photoMappings = [
    { email: 'anneawuor20@gmail.com', photo: 'PHOTO-1-1770840352696-501638597.jpg' },
    { email: 'arnnebelle2@yahoo.com', photo: 'PHOTO-2-1770840405548-764861581.png' },
    { email: 'ckithikii@gmail.com', photo: 'PHOTO-3-1770840453270-395513791.png' },
    { email: 'wakeshocharlotte@gmail.com', photo: 'PHOTO-4-1770840476126-415097928.png' },
    { email: 'ndongaelsie@gmail.com', photo: 'PHOTO-5-1770840492121-422128366.png' },
    { email: 'Njenga573@gmail.com', photo: 'PHOTO-6-1770840512534-778781146.png' },
    { email: 'njengastellah@gmail.com', photo: 'PHOTO-7-1770840538379-107709729.png' },
    { email: 'priscillahmlumbasyo@gmail.com', photo: 'PHOTO-8-1770840558643-21647197.png' },
    { email: 'owinovictor91@gmail.com', photo: 'PHOTO-9-1770840579359-773865800.png' },
    { email: 'virginia.wmwaniki@gmail.com', photo: 'PHOTO-10-1770840604720-525800976.png' }
];

console.log('Inserting sample photo associations...');

db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    const stmt = db.prepare(`
        INSERT INTO member_documents 
        (member_email, document_type, document_title, file_path, file_name, file_size, mime_type, is_primary, status, upload_date)
        VALUES (?, 'photo', ?, ?, ?, 0, 'image/jpeg', 1, 'active', CURRENT_TIMESTAMP)
    `);
    
    photoMappings.forEach(mapping => {
        const filePath = path.join(__dirname, 'uploads', 'photos', mapping.photo);
        stmt.run([
            mapping.email,
            mapping.photo,
            filePath,
            mapping.photo
        ], function(err) {
            if (err) {
                console.error(`Error inserting photo for ${mapping.email}:`, err.message);
            } else {
                console.log(`✅ Inserted photo ${mapping.photo} for ${mapping.email}`);
            }
        });
    });
    
    stmt.finalize();
    
    db.run('COMMIT', (err) => {
        if (err) {
            console.error('Error committing transaction:', err.message);
        } else {
            console.log('✅ Sample photo associations inserted successfully');
        }
        db.close();
    });
});