const sqlite3 = require("sqlite3").verbose();
const { connectToMongoDB } = require('./mongodb');
const {
  User,
  Contribution,
  MemberDocument,
  MemberMonthlyContribution,
  SystemSetting,
  ContactSubmission,
  SecurityLog,
  PasswordResetToken,
  InvestmentTracking,
  InvestmentHistory,
  MansaXInvestment
} = require('./mongodb-models');

// SQLite database connection
const sqliteDb = new sqlite3.Database("./contributions.db", sqlite3.OPEN_READONLY);

// Migration progress tracking
let migrationStats = {
  users: 0,
  contributions: 0,
  memberDocuments: 0,
  monthlyContributions: 0,
  systemSettings: 0,
  contactSubmissions: 0,
  securityLogs: 0,
  passwordResetTokens: 0,
  investmentTracking: 0,
  investmentHistory: 0,
  mansaXInvestments: 0,
  errors: []
};

// Helper function to log progress
function logProgress(table, count, total = null) {
  const percentage = total ? Math.round((count / total) * 100) : count;
  console.log(`📊 ${table}: ${count}${total ? `/${total} (${percentage}%)` : ''} records migrated`);
}

// Helper function to handle errors
function handleError(error, context) {
  console.error(`❌ Error in ${context}:`, error);
  migrationStats.errors.push({ context, error: error.message });
}

// Migrate Users table
async function migrateUsers() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting users migration...');
    
    sqliteDb.all("SELECT * FROM users", async (err, rows) => {
      if (err) {
        handleError(err, 'Users query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const userData = {
            member_name: row.member_name,
            member_email: row.member_email,
            role: row.role || 'member',
            password_hash: row.password_hash,
            login_attempts: row.login_attempts || 0,
            locked_until: row.locked_until ? new Date(row.locked_until) : null,
            last_login: row.last_login ? new Date(row.last_login) : null,
            created_at: row.created_at ? new Date(row.created_at) : new Date(),
            synced_at: row.synced_at ? new Date(row.synced_at) : new Date()
          };

          await User.findOneAndUpdate(
            { member_email: row.member_email },
            userData,
            { upsert: true, new: true }
          );
          
          migrationStats.users++;
          if (migrationStats.users % 10 === 0) {
            logProgress('Users', migrationStats.users, rows.length);
          }
        }
        
        logProgress('Users', migrationStats.users, rows.length);
        console.log('✅ Users migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Users migration');
        reject(error);
      }
    });
  });
}

// Migrate Contributions table
async function migrateContributions() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting contributions migration...');
    
    sqliteDb.all("SELECT * FROM contribution", async (err, rows) => {
      if (err) {
        handleError(err, 'Contributions query');
        return reject(err);
      }

      try {
        // Get month columns dynamically
        const monthColumns = await getMonthColumns();
        
        for (const row of rows) {
          const contributionData = {
            member_name: row.member_name,
            member_email: row.member_email,
            total_contributions: row.total_contributions || 0,
            interest_per_member: row.interest_per_member || 0,
            final_payout: row.final_payout || 0,
            synced_at: row.synced_at ? new Date(row.synced_at) : new Date(),
            monthly_contributions: new Map()
          };

          // Add monthly contributions to Map
          for (const month of monthColumns) {
            if (row[month] !== undefined && row[month] !== null) {
              contributionData.monthly_contributions.set(month, parseFloat(row[month]) || 0);
            }
          }

          await Contribution.findOneAndUpdate(
            { member_email: row.member_email },
            contributionData,
            { upsert: true, new: true }
          );
          
          migrationStats.contributions++;
          if (migrationStats.contributions % 10 === 0) {
            logProgress('Contributions', migrationStats.contributions, rows.length);
          }
        }
        
        logProgress('Contributions', migrationStats.contributions, rows.length);
        console.log('✅ Contributions migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Contributions migration');
        reject(error);
      }
    });
  });
}

// Migrate Member Documents table
async function migrateMemberDocuments() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting member documents migration...');
    
    sqliteDb.all("SELECT * FROM member_documents", async (err, rows) => {
      if (err) {
        handleError(err, 'Member documents query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          // Skip documents without required fields
          if (!row.file_path || !row.file_name) {
            console.warn(`⚠️ Skipping document with missing required fields for ${row.member_email}`);
            migrationStats.memberDocuments++;
            continue;
          }

          const documentData = {
            member_email: row.member_email,
            member_name: row.member_name,
            document_type: row.document_type,
            document_title: row.document_title,
            file_path: row.file_path,
            file_name: row.file_name,
            file_size: row.file_size,
            mime_type: row.mime_type,
            status: row.status || 'active',
            upload_date: row.upload_date ? new Date(row.upload_date) : new Date(),
            expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
            uploaded_by: row.uploaded_by,
            is_primary: Boolean(row.is_primary),
            download_count: row.download_count || 0,
            last_downloaded: row.last_downloaded ? new Date(row.last_downloaded) : null,
            metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null
          };

          await new MemberDocument(documentData).save();
          migrationStats.memberDocuments++;
          
          if (migrationStats.memberDocuments % 10 === 0) {
            logProgress('Member Documents', migrationStats.memberDocuments, rows.length);
          }
        }
        
        logProgress('Member Documents', migrationStats.memberDocuments, rows.length);
        console.log('✅ Member documents migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Member documents migration');
        reject(error);
      }
    });
  });
}

// Migrate Member Monthly Contributions table
async function migrateMemberMonthlyContributions() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting member monthly contributions migration...');
    
    sqliteDb.all("SELECT * FROM member_monthly_contributions", async (err, rows) => {
      if (err) {
        handleError(err, 'Member monthly contributions query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const monthlyContributionData = {
            member_email: row.member_email,
            month: row.month,
            contribution_amount: row.contribution_amount || 0,
            created_at: row.created_at ? new Date(row.created_at) : new Date()
          };

          await MemberMonthlyContribution.findOneAndUpdate(
            { member_email: row.member_email, month: row.month },
            monthlyContributionData,
            { upsert: true, new: true }
          );
          
          migrationStats.monthlyContributions++;
          
          if (migrationStats.monthlyContributions % 20 === 0) {
            logProgress('Monthly Contributions', migrationStats.monthlyContributions, rows.length);
          }
        }
        
        logProgress('Monthly Contributions', migrationStats.monthlyContributions, rows.length);
        console.log('✅ Member monthly contributions migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Member monthly contributions migration');
        reject(error);
      }
    });
  });
}

// Migrate System Settings table
async function migrateSystemSettings() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting system settings migration...');
    
    sqliteDb.all("SELECT * FROM system_settings", async (err, rows) => {
      if (err) {
        handleError(err, 'System settings query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const settingData = {
            key: row.key,
            value: row.value,
            description: row.description,
            updated_by: row.updated_by,
            updated_at: row.updated_at ? new Date(row.updated_at) : new Date()
          };

          await SystemSetting.findOneAndUpdate(
            { key: row.key },
            settingData,
            { upsert: true, new: true }
          );
          
          migrationStats.systemSettings++;
        }
        
        logProgress('System Settings', migrationStats.systemSettings, rows.length);
        console.log('✅ System settings migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'System settings migration');
        reject(error);
      }
    });
  });
}

// Migrate Contact Submissions table
async function migrateContactSubmissions() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting contact submissions migration...');
    
    sqliteDb.all("SELECT * FROM contact_submissions", async (err, rows) => {
      if (err) {
        handleError(err, 'Contact submissions query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const contactData = {
            name: row.name,
            email: row.email,
            subject: row.subject,
            category: row.category,
            priority: row.priority || 'normal',
            message: row.message,
            newsletter: Boolean(row.newsletter),
            submitted_at: row.submitted_at ? new Date(row.submitted_at) : new Date(),
            status: row.status || 'pending',
            response: row.response,
            responded_by: row.responded_by,
            responded_at: row.responded_at ? new Date(row.responded_at) : null,
            notes: row.notes
          };

          await new ContactSubmission(contactData).save();
          migrationStats.contactSubmissions++;
          
          if (migrationStats.contactSubmissions % 10 === 0) {
            logProgress('Contact Submissions', migrationStats.contactSubmissions, rows.length);
          }
        }
        
        logProgress('Contact Submissions', migrationStats.contactSubmissions, rows.length);
        console.log('✅ Contact submissions migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Contact submissions migration');
        reject(error);
      }
    });
  });
}

// Migrate Security Logs table
async function migrateSecurityLogs() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting security logs migration...');
    
    sqliteDb.all("SELECT * FROM security_logs", async (err, rows) => {
      if (err) {
        handleError(err, 'Security logs query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const logData = {
            timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
            action: row.action,
            user: row.user,
            ip_address: row.ip_address,
            details: row.details
          };

          await new SecurityLog(logData).save();
          migrationStats.securityLogs++;
          
          if (migrationStats.securityLogs % 50 === 0) {
            logProgress('Security Logs', migrationStats.securityLogs, rows.length);
          }
        }
        
        logProgress('Security Logs', migrationStats.securityLogs, rows.length);
        console.log('✅ Security logs migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Security logs migration');
        reject(error);
      }
    });
  });
}

// Migrate Password Reset Tokens table
async function migratePasswordResetTokens() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting password reset tokens migration...');
    
    sqliteDb.all("SELECT * FROM password_reset_tokens", async (err, rows) => {
      if (err) {
        handleError(err, 'Password reset tokens query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const tokenData = {
            user_email: row.user_email,
            token: row.token,
            expires_at: row.expires_at ? new Date(row.expires_at) : new Date(),
            used: Boolean(row.used),
            created_at: row.created_at ? new Date(row.created_at) : new Date()
          };

          await new PasswordResetToken(tokenData).save();
          migrationStats.passwordResetTokens++;
        }
        
        logProgress('Password Reset Tokens', migrationStats.passwordResetTokens, rows.length);
        console.log('✅ Password reset tokens migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Password reset tokens migration');
        reject(error);
      }
    });
  });
}

// Migrate Investment Tracking table
async function migrateInvestmentTracking() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting investment tracking migration...');
    
    sqliteDb.all("SELECT * FROM investment_tracking", async (err, rows) => {
      if (err) {
        handleError(err, 'Investment tracking query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const investmentData = {
            month: row.month,
            total_contributions: row.total_contributions || 0,
            mansa_x: row.mansa_x || 0,
            i_and_m: row.i_and_m || 0,
            cumulative_mansa_x: row.cumulative_mansa_x || 0,
            total_invested: row.total_invested || 0,
            running_total_contributions: row.running_total_contributions || 0,
            mansa_x_percentage: row.mansa_x_percentage || 0,
            i_and_m_percentage: row.i_and_m_percentage || 0,
            created_at: row.created_at ? new Date(row.created_at) : new Date(),
            updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
            last_calculated: row.last_calculated ? new Date(row.last_calculated) : null,
            receipt_path: row.receipt_path,
            receipt_filename: row.receipt_filename,
            receipt_uploaded_at: row.receipt_uploaded_at ? new Date(row.receipt_uploaded_at) : null,
            receipt_uploaded_by: row.receipt_uploaded_by
          };

          await InvestmentTracking.findOneAndUpdate(
            { month: row.month },
            investmentData,
            { upsert: true, new: true }
          );
          
          migrationStats.investmentTracking++;
        }
        
        logProgress('Investment Tracking', migrationStats.investmentTracking, rows.length);
        console.log('✅ Investment tracking migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Investment tracking migration');
        reject(error);
      }
    });
  });
}

// Migrate Investment History table
async function migrateInvestmentHistory() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting investment history migration...');
    
    sqliteDb.all("SELECT * FROM investment_history", async (err, rows) => {
      if (err) {
        handleError(err, 'Investment history query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const historyData = {
            month: row.month,
            previous_amount: row.previous_amount,
            new_amount: row.new_amount,
            changed_by: row.changed_by,
            change_date: row.change_date ? new Date(row.change_date) : new Date(),
            reason: row.reason
          };

          await new InvestmentHistory(historyData).save();
          migrationStats.investmentHistory++;
        }
        
        logProgress('Investment History', migrationStats.investmentHistory, rows.length);
        console.log('✅ Investment history migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Investment history migration');
        reject(error);
      }
    });
  });
}

// Migrate Mansa X Investments table
async function migrateMansaXInvestments() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting mansa x investments migration...');
    
    sqliteDb.all("SELECT * FROM mansa_x_investments", async (err, rows) => {
      if (err) {
        handleError(err, 'Mansa X investments query');
        return reject(err);
      }

      try {
        for (const row of rows) {
          const mansaData = {
            month: row.month,
            mansa_x_amount: row.mansa_x_amount || 0,
            notes: row.notes,
            created_at: row.created_at ? new Date(row.created_at) : new Date(),
            updated_at: row.updated_at ? new Date(row.updated_at) : new Date()
          };

          await MansaXInvestment.findOneAndUpdate(
            { month: row.month },
            mansaData,
            { upsert: true, new: true }
          );
          
          migrationStats.mansaXInvestments++;
        }
        
        logProgress('Mansa X Investments', migrationStats.mansaXInvestments, rows.length);
        console.log('✅ Mansa X investments migration completed');
        resolve();
      } catch (error) {
        handleError(error, 'Mansa X investments migration');
        reject(error);
      }
    });
  });
}

// Helper function to get month columns from SQLite
function getMonthColumns() {
  return new Promise((resolve, reject) => {
    sqliteDb.all(`PRAGMA table_info(contribution)`, (err, columns) => {
      if (err) {
        reject(err);
        return;
      }

      // Filter for month columns (exclude standard columns)
      const standardColumns = ['id', 'member_name', 'member_email', 'total_contributions',
        'interest_per_member', 'final_payout', 'synced_at'];

      const monthColumns = columns
        .map(col => col.name)
        .filter(name => !standardColumns.includes(name));

      resolve(monthColumns);
    });
  });
}

// Main migration function
async function migrateToMongoDB() {
  console.log('🚀 Starting SQLite to MongoDB migration...');
  console.log('=====================================');

  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Run migrations in sequence
    await migrateUsers();
    await migrateSystemSettings();
    await migrateContributions();
    await migrateMemberMonthlyContributions();
    await migrateMemberDocuments();
    await migrateContactSubmissions();
    await migrateSecurityLogs();
    await migratePasswordResetTokens();
    await migrateInvestmentTracking();
    await migrateInvestmentHistory();
    await migrateMansaXInvestments();

    // Close SQLite connection
    sqliteDb.close((err) => {
      if (err) {
        console.error('❌ Error closing SQLite database:', err);
      } else {
        console.log('🔌 SQLite database connection closed');
      }
    });

    // Print final statistics
    console.log('=====================================');
    console.log('📊 Migration Summary:');
    console.log(`✅ Users: ${migrationStats.users}`);
    console.log(`✅ Contributions: ${migrationStats.contributions}`);
    console.log(`✅ Member Documents: ${migrationStats.memberDocuments}`);
    console.log(`✅ Monthly Contributions: ${migrationStats.monthlyContributions}`);
    console.log(`✅ System Settings: ${migrationStats.systemSettings}`);
    console.log(`✅ Contact Submissions: ${migrationStats.contactSubmissions}`);
    console.log(`✅ Security Logs: ${migrationStats.securityLogs}`);
    console.log(`✅ Password Reset Tokens: ${migrationStats.passwordResetTokens}`);
    console.log(`✅ Investment Tracking: ${migrationStats.investmentTracking}`);
    console.log(`✅ Investment History: ${migrationStats.investmentHistory}`);
    console.log(`✅ Mansa X Investments: ${migrationStats.mansaXInvestments}`);
    
    if (migrationStats.errors.length > 0) {
      console.log('❌ Errors encountered:');
      migrationStats.errors.forEach(error => {
        console.log(`  - ${error.context}: ${error.error}`);
      });
    } else {
      console.log('🎉 Migration completed successfully with no errors!');
    }
    
    console.log('=====================================');
    
    // Close MongoDB connection
    const { mongoose } = require('./mongodb-models');
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateToMongoDB();
}

module.exports = { migrateToMongoDB, migrationStats };
