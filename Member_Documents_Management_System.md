# Member Documents Management System

## Overview
This system manages both **photos** and **MOU documents** for members in a unified manner using the `member_documents` table.

## Database Structure

### member_documents Table
The system uses a single table to store all member documents with the following key columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `member_email` | TEXT | Member's email (foreign key to users table) |
| `document_type` | TEXT | Type of document: 'photo' or 'mou' |
| `document_title` | TEXT | Document title/filename |
| `file_path` | TEXT | Full path to the file on disk |
| `file_name` | TEXT | Original filename |
| `file_size` | INTEGER | File size in bytes |
| `mime_type` | TEXT | File MIME type (e.g., image/jpeg, application/pdf) |
| `status` | TEXT | Document status ('active', 'expired', 'deleted') |
| `is_primary` | BOOLEAN | For photos: indicates primary profile photo |
| `upload_date` | DATETIME | When the document was uploaded |
| `expiry_date` | DATE | For MOU documents: expiration date |
| `uploaded_by` | TEXT | Who uploaded the document |
| `download_count` | INTEGER | For MOU: track downloads |
| `last_downloaded` | DATETIME | For MOU: last download timestamp |
| `metadata` | TEXT | JSON field for additional data |

## Document Types

### 1. Photos (document_type = 'photo')
- **Purpose**: Member profile pictures
- **Storage**: `/uploads/photos/` directory
- **Primary Flag**: Only one photo per member can be marked as `is_primary = 1`
- **Display**: Shown in member lists, profiles, and dashboards
- **Fallback**: Colored initials displayed when no photo exists

### 2. MOU Documents (document_type = 'mou')
- **Purpose**: Memorandum of Understanding documents
- **Storage**: `/uploads/mou/` directory
- **Features**:
  - Expiry date tracking
  - Download counting
  - Version history
  - Status management

## API Endpoints

### Upload Photo
```
POST /upload/photo
Content-Type: multipart/form-data
Fields:
- member_email: Member's email
- photo: Image file
- uploaded_by: Uploader identifier
```

### Upload MOU
```
POST /upload/mou
Content-Type: multipart/form-data
Fields:
- member_email: Member's email
- mou_document: PDF file
- expiry_date: Document expiration date
- uploaded_by: Uploader identifier
```

### Get Member Photo
```
GET /users/:email/photo
Response: { photo_url, upload_date, is_primary }
```

### Get Member Documents
```
GET /documents/:email
Response: Array of all documents for the member
```

## Usage Workflow

### For Admins:
1. **Upload Photos**: Use the photo upload button in member management
2. **Upload MOUs**: Use the MOU upload section in member profiles
3. **Manage Documents**: View, download, or delete documents as needed
4. **Set Primary Photos**: Mark one photo as primary for profile display

### For Members:
1. **View Profile**: See their photo in dashboard
2. **Download MOUs**: Access their signed documents
3. **Update Documents**: Request admin to upload new versions

## File Management

### Storage Locations:
- **Photos**: `Backend/uploads/photos/`
- **MOUs**: `Backend/uploads/mou/`

### File Naming:
Files are automatically renamed with timestamp prefixes to prevent conflicts:
- Photos: `PHOTO-{timestamp}-{random}.extension`
- MOUs: `MOU-{timestamp}-{random}.pdf`

## Security & Access Control

- All document access is authenticated
- File paths are not exposed directly
- Only authorized users can upload/modify documents
- Document deletion requires admin privileges

## Maintenance

### Regular Tasks:
1. **Cleanup**: Remove expired MOU documents
2. **Backup**: Regular database and file backups
3. **Monitoring**: Track storage usage and document counts
4. **Audit**: Review document access logs

### Reset Procedure:
To reset the document system:
1. Run `node reset_member_documents.js`
2. This clears all database records and uploaded files
3. Start fresh with new document uploads

## Troubleshooting

### Common Issues:
- **Missing Photos**: Check if `is_primary` is set correctly
- **Upload Failures**: Verify file size limits and permissions
- **Display Issues**: Ensure API endpoints return correct URLs
- **File Access**: Check file permissions on upload directories

### Debug Commands:
```bash
# Check document counts
sqlite3 contributions.db "SELECT document_type, COUNT(*) FROM member_documents GROUP BY document_type;"

# List all documents for a member
sqlite3 contributions.db "SELECT document_type, file_name, upload_date FROM member_documents WHERE member_email = 'user@example.com';"

# Check file existence
ls -la uploads/photos/
ls -la uploads/mou/
```