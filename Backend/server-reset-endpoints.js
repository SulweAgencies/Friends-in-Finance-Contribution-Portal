
// Reset endpoints to use local storage only

// Remove Google Drive URL processing from document endpoints
// Replace with local file serving

// Photo endpoints - local only
app.get('/api/photos/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const photos = await new Promise((resolve, reject) => {
            db.all(
                `SELECT md.*, u.member_name 
                 FROM members_document md
                 LEFT JOIN users u ON md.member_email = u.member_email
                 WHERE md.member_email = ? AND md.document_type = 'photo'`,
                [email],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
        
        // Process for local URLs
        const processedPhotos = photos.map(photo => ({
            ...photo,
            url: photo.file_url || null, // Keep local paths or NULL
            local_path: photo.file_url ? photo.file_url.replace('/uploads/', './uploads/') : null,
            exists: photo.file_url ? fs.existsSync(path.join(__dirname, photo.file_url.replace('/uploads/', './uploads/'))) : false
        }));
        
        res.json({
            success: true,
            photos: processedPhotos
        });
        
    } catch (error) {
        console.error('Error fetching photos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// MOA endpoints - local only
app.get('/api/mou/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const mouDocs = await new Promise((resolve, reject) => {
            db.all(
                `SELECT md.*, u.member_name 
                 FROM members_document md
                 LEFT JOIN users u ON md.member_email = u.member_email
                 WHERE md.member_email = ? AND md.document_type = 'mou'`,
                [email],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
        
        // Process for local URLs
        const processedMOUs = mouDocs.map(doc => ({
            ...doc,
            url: doc.file_url || null, // Keep local paths or NULL
            local_path: doc.file_url ? doc.file_url.replace('/uploads/', './uploads/') : null,
            exists: doc.file_url ? fs.existsSync(path.join(__dirname, doc.file_url.replace('/uploads/', './uploads/'))) : false
        }));
        
        res.json({
            success: true,
            documents: processedMOUs
        });
        
    } catch (error) {
        console.error('Error fetching MOA documents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear all Google Drive URLs from database
app.post('/api/documents/clear-drive-urls', async (req, res) => {
    try {
        const [result] = await db.execute(
            `UPDATE members_document 
             SET file_url = NULL 
             WHERE document_type IN ('photo', 'mou')`
        );
        
        res.json({
            success: true,
            message: `Cleared ${result.affectedRows} document URLs`,
            cleared: result.affectedRows
        });
        
    } catch (error) {
        console.error('Error clearing URLs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
