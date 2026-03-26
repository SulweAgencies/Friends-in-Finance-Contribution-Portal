
// Local file URL helper for document management
class LocalFileHelper {
    static getPhotoUrl(filename) {
        if (!filename) return null;
        return `/uploads/photos/${filename}`;
    }
    
    static getMOUUrl(filename) {
        if (!filename) return null;
        return `/uploads/mou/${filename}`;
    }
    
    static getLocalPath(filename, type) {
        if (!filename) return null;
        const dir = type === 'photo' ? 'photos' : 'mou';
        return path.join(__dirname, 'uploads', dir, filename);
    }
    
    static fileExists(filename, type) {
        const filePath = this.getLocalPath(filename, type);
        return filePath && fs.existsSync(filePath);
    }
    
    static getFileInfo(filename, type) {
        const filePath = this.getLocalPath(filename, type);
        if (!filePath || !fs.existsSync(filePath)) {
            return null;
        }
        
        const stats = fs.statSync(filePath);
        return {
            filename,
            type,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            url: type === 'photo' ? this.getPhotoUrl(filename) : this.getMOUUrl(filename)
        };
    }
}

module.exports = LocalFileHelper;
