# MongoDB Migration Guide

## Overview
This guide walks you through migrating your Friends in Finance Contribution Portal from SQLite to MongoDB.

## Prerequisites
1. **MongoDB Server**: Install MongoDB Community Server or use MongoDB Atlas
2. **Node.js**: Ensure Node.js is installed
3. **Backup**: Always backup your SQLite database before migration

## Installation Steps

### 1. Install MongoDB Dependencies
```bash
cd Backend
npm install mongodb mongoose
```

### 2. Set up MongoDB Connection

#### Option A: Local MongoDB
```bash
# Install MongoDB Community Server
# Start MongoDB service
mongod
```

#### Option B: MongoDB Atlas (Cloud)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get your connection string

### 3. Environment Configuration
Create a `.env` file in the Backend directory:

```env
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/friends_in_finance
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/friends_in_finance?retryWrites=true&w=majority
```

### 4. Run Migration

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Run Migration Script
```bash
node migrate-to-mongodb.js
```

The migration script will:
- Connect to both SQLite and MongoDB
- Migrate all data preserving relationships
- Show progress for each table
- Report any errors encountered

## Migration Details

### Tables Migrated
1. **users** → User collection
2. **contribution** → Contribution collection (with dynamic monthly data)
3. **member_documents** → MemberDocument collection
4. **member_monthly_contributions** → MemberMonthlyContribution collection
5. **system_settings** → SystemSetting collection
6. **contact_submissions** → ContactSubmission collection
7. **security_logs** → SecurityLog collection
8. **password_reset_tokens** → PasswordResetToken collection
9. **investment_tracking** → InvestmentTracking collection
10. **investment_history** → InvestmentHistory collection
11. **mansa_x_investments** → MansaXInvestment collection

### Data Type Conversions
- SQLite TEXT → MongoDB String
- SQLite INTEGER → MongoDB Number
- SQLite REAL → MongoDB Number
- SQLite DATETIME → MongoDB Date
- SQLite BOOLEAN → MongoDB Boolean
- Dynamic month columns → Map<String, Number>

### Indexes Created
All important indexes from SQLite are recreated in MongoDB for optimal performance.

## Post-Migration Steps

### 1. Update Server Configuration
After successful migration, update your server.js to use MongoDB instead of SQLite.

### 2. Test Application
- Start your server with MongoDB
- Test all API endpoints
- Verify data integrity
- Check frontend functionality

### 3. Backup MongoDB
After confirming everything works:
```bash
# Create a backup of your new MongoDB database
mongodump --db friends_in_finance --out ./mongodb-backup
```

## Troubleshooting

### Common Issues

#### Connection Errors
- Verify MongoDB is running
- Check connection string in .env file
- Ensure network/firewall permissions

#### Migration Errors
- Check SQLite database file exists
- Verify read permissions on SQLite file
- Monitor console output for specific error messages

#### Data Validation
After migration, verify:
- Record counts match between SQLite and MongoDB
- All data types converted correctly
- Relationships preserved

## Rollback Plan
If you need to rollback to SQLite:
1. Stop the server
2. Restore from your SQLite backup
3. Revert server.js changes
4. Restart with SQLite

## Performance Benefits
- Better handling of large datasets
- Improved query performance with proper indexing
- Horizontal scaling capabilities
- Rich aggregation framework for complex analytics

## Support
For issues during migration:
1. Check MongoDB logs
2. Review migration script output
3. Verify data in MongoDB Compass
4. Test with small datasets first

## Next Steps
After migration:
1. Monitor application performance
2. Set up MongoDB monitoring
3. Plan backup strategy
4. Consider MongoDB Atlas for production
