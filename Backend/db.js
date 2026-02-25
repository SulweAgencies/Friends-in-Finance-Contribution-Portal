const sqlite3 = require("sqlite3").verbose();
const path = require('path');
const fs = require('fs');

const db = new sqlite3.Database("./contributions.db", err => {
  if (err) console.error("DB error:", err.message);
  else {
    console.log("✅ SQLite connected to contributions.db");
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Create users table - simplified, just basic user info
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      member_email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT,
      login_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) console.error('Error creating users table:', err.message);
    else {
      console.log('✅ users table ready');

      // Add missing columns for password management
      const addPasswordColumns = () => {
        db.run(`ALTER TABLE users ADD COLUMN password_hash TEXT`, (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.error("Error adding password_hash:", err.message);
          }
        });

        db.run(`ALTER TABLE users ADD COLUMN login_attempts INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.error("Error adding login_attempts:", err.message);
          }
        });

        db.run(`ALTER TABLE users ADD COLUMN locked_until DATETIME`, (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.error("Error adding locked_until:", err.message);
          }
        });

        db.run(`ALTER TABLE users ADD COLUMN last_login DATETIME`, (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.error("Error adding last_login:", err.message);
          }
        });
      };

      // Add password-related columns
      addPasswordColumns();
    }
  });

  // Create unified member_documents table for BOTH photos and MOU documents
  db.run(`
    CREATE TABLE IF NOT EXISTS member_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_email TEXT NOT NULL,
      member_name TEXT,             -- added column
      document_type TEXT NOT NULL, -- 'photo' or 'mou'
      document_title TEXT,         -- filename or title
      file_name TEXT NOT NULL,    -- original filename
      file_size INTEGER,          -- file size in bytes
      mime_type TEXT,            -- image/png, application/pdf, etc.
      status TEXT DEFAULT 'active', -- active, expired, deleted
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiry_date DATE,          -- for MOU documents
      uploaded_by TEXT,          -- who uploaded it
      is_primary BOOLEAN DEFAULT 0, -- for photos: is this the primary profile photo
      download_count INTEGER DEFAULT 0, -- for MOU: track downloads
      last_downloaded DATETIME,  -- for MOU: last download timestamp
      metadata TEXT,            -- JSON field for any additional data
      cloudinary_url TEXT,      -- Cloudinary URL
      public_id TEXT,           -- Cloudinary public ID
      FOREIGN KEY (member_email) REFERENCES users(member_email) ON DELETE CASCADE
    );
  `, (err) => {
    if (err) console.error('Error creating member_documents table:', err.message);
    else {
      console.log('✅ member_documents table ready (unified storage for photos & MOU)');

      // Migration: Add member_name if it doesn't exist
      db.run(`ALTER TABLE member_documents ADD COLUMN member_name TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column name")) {
          console.error("Error adding member_name to member_documents:", err.message);
        }
      });

      // Create indexes for better performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_docs_email ON member_documents(member_email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_docs_type ON member_documents(document_type)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_docs_status ON member_documents(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_docs_primary ON member_documents(is_primary) WHERE document_type = 'photo'`);
    }
  });

  // Create contributions table with summary columns
  db.run(`
    CREATE TABLE IF NOT EXISTS contribution (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      member_email TEXT NOT NULL UNIQUE,
      total_contributions REAL NOT NULL DEFAULT 0,
      interest_per_member REAL NOT NULL DEFAULT 0,
      final_payout REAL NOT NULL DEFAULT 0,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) console.error('Error creating contribution table:', err.message);
    else console.log('✅ contribution table ready');
  });

  // Create indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(member_email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contribution_email ON contribution(member_email)`);

  // Create system settings table for gateway code and other settings
  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating system_settings table:', err.message);
    else {
      console.log('✅ system_settings table ready');

      // Insert default gateway code if not exists
      db.get("SELECT value FROM system_settings WHERE key = 'gateway_code'", (err, row) => {
        if (!row) {
          const defaultCode = '12345678'; // Default, should be changed by admin
          db.run(
            "INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)",
            ['gateway_code', defaultCode, '8-digit gateway access code'],
            (err) => {
              if (err) console.error('Error inserting default gateway code:', err);
              else console.log('✅ Default gateway code set to:', defaultCode);
            }
          );
        }
      });
    }
  });

  // Create password_reset_tokens table for password reset functionality
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_email) REFERENCES users(member_email)
    )
  `, (err) => {
    if (err) console.error('Error creating password_reset_tokens table:', err.message);
    else console.log('✅ password_reset_tokens table ready');
  });

  // Cleanup: Delete legacy fund_allocations table if it exists
  db.run(`DROP TABLE IF EXISTS fund_allocations`, (err) => {
    if (!err) console.log('🗑️ Legacy fund_allocations table removed');
  });

  // Create new member_monthly_contributions table
  db.run(`
    CREATE TABLE IF NOT EXISTS member_monthly_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_email TEXT NOT NULL,
      month TEXT NOT NULL,
      contribution_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_email, month),
      FOREIGN KEY (member_email) REFERENCES users(member_email) ON DELETE CASCADE
    );
  `, (err) => {
    if (err) console.error('Error creating member_monthly_contributions table:', err.message);
    else {
      console.log('✅ member_monthly_contributions table ready');
      db.run(`CREATE INDEX IF NOT EXISTS idx_mmc_email ON member_monthly_contributions(member_email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mmc_month ON member_monthly_contributions(month)`);

      // Trigger backfill on startup to ensure no data is missing
      backfillMonthlyContributions().catch(err => console.error('Backfill error:', err.message));
    }
  });

  // Create contact submissions table
  db.run(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          subject TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT DEFAULT 'normal',
          message TEXT NOT NULL,
          newsletter BOOLEAN DEFAULT 0,
          submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'pending',
          response TEXT,
          responded_by TEXT,
          responded_at DATETIME,
          notes TEXT
      );
  `, (err) => {
    if (err) console.error('Error creating contact_submissions table:', err.message);
    else {
      console.log('✅ contact_submissions table ready');

      // Create indexes for better performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_submissions(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_submissions(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_contact_category ON contact_submissions(category)`);
    }
  });

  // Create security logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      user TEXT,
      ip_address TEXT,
      details TEXT
    );
  `, (err) => {
    if (err) console.error('Error creating security_logs table:', err.message);
    else {
      console.log('✅ security_logs table ready');
      db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON security_logs(timestamp)`);
    }
  });
}

// Backfill data from wide contribution table to narrow member_monthly_contributions table
async function backfillMonthlyContributions() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🔄 Starting backfill for member_monthly_contributions...');
      const monthCols = await getMonthColumns();
      if (!monthCols || monthCols.length === 0) {
        console.log('ℹ️ No month columns found to backfill.');
        return resolve();
      }

      db.all(`SELECT * FROM contribution`, async (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) {
          console.log('ℹ️ No data in contribution table to backfill.');
          return resolve();
        }

        let totalInserted = 0;
        for (const row of rows) {
          for (const month of monthCols) {
            const amount = row[month];
            if (amount !== undefined && amount !== null && amount > 0) {
              await new Promise((res, rej) => {
                db.run(
                  `INSERT INTO member_monthly_contributions (member_email, month, contribution_amount)
                                     VALUES (?, ?, ?)
                                     ON CONFLICT(member_email, month) DO UPDATE SET contribution_amount = excluded.contribution_amount`,
                  [row.member_email, month, amount],
                  (insertErr) => {
                    if (insertErr) rej(insertErr);
                    else {
                      totalInserted++;
                      res();
                    }
                  }
                );
              });
            }
          }
        }
        console.log(`✅ Backfill complete. Processed ${totalInserted} monthly contribution records.`);
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

// ===== INVESTMENT TABLE SCHEMA =====
// Create investment_tracking table for monthly investment data following business logic:
// - cumulative_mansa_x = previous cumulative_mansa_x + current mansa_x
// - i_and_m = running_total_contributions - cumulative_mansa_x
// - total_invested = cumulative_mansa_x + i_and_m
db.run(`
  CREATE TABLE IF NOT EXISTS investment_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    total_contributions REAL NOT NULL DEFAULT 0,
    mansa_x REAL NOT NULL DEFAULT 0,
    i_and_m REAL NOT NULL DEFAULT 0,
    cumulative_mansa_x REAL NOT NULL DEFAULT 0,
    total_invested REAL NOT NULL DEFAULT 0,
    running_total_contributions REAL NOT NULL DEFAULT 0,
    mansa_x_percentage REAL DEFAULT 0,
    i_and_m_percentage REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_calculated DATETIME
  );
`, (err) => {
  if (err) console.error('Error creating investment_tracking table:', err.message);
  else {
    console.log('✅ investment_tracking table ready');

    // Create indexes for better query performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_investment_month ON investment_tracking(month)`);

    // Add any missing columns for backward compatibility
    const addColumnIfNotExists = (columnName, columnDef) => {
      db.run(`ALTER TABLE investment_tracking ADD COLUMN ${columnName} ${columnDef}`, (alterErr) => {
        if (alterErr && !/duplicate column|already exists|duplicate column name/i.test(alterErr.message)) {
          console.warn(`Could not add ${columnName} column:`, alterErr.message);
        }
      });
    };

    // Ensure all required columns exist
    addColumnIfNotExists('cumulative_mansa_x', 'REAL NOT NULL DEFAULT 0');
    addColumnIfNotExists('total_invested', 'REAL NOT NULL DEFAULT 0');
    addColumnIfNotExists('running_total_contributions', 'REAL NOT NULL DEFAULT 0');
    addColumnIfNotExists('mansa_x_percentage', 'REAL DEFAULT 0');
    addColumnIfNotExists('i_and_m_percentage', 'REAL DEFAULT 0');
    addColumnIfNotExists('last_calculated', 'DATETIME');

    // Add receipt management columns to investment_tracking table
    db.run(`
      ALTER TABLE investment_tracking ADD COLUMN receipt_path TEXT
    `, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Error adding receipt_path:", err.message);
      }
    });

    db.run(`
      ALTER TABLE investment_tracking ADD COLUMN receipt_filename TEXT
    `, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Error adding receipt_filename:", err.message);
      }
    });

    db.run(`
      ALTER TABLE investment_tracking ADD COLUMN receipt_uploaded_at DATETIME
    `, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Error adding receipt_uploaded_at:", err.message);
      }
    });

    db.run(`
      ALTER TABLE investment_tracking ADD COLUMN receipt_uploaded_by TEXT
    `, (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.error("Error adding receipt_uploaded_by:", err.message);
      }
    });

  }
});

// Migration: remove unwanted columns (cash_reserve, notes, status) if they exist
function migrateInvestmentTrackingSchema() {
  db.all(`PRAGMA table_info(investment_tracking)`, (err, cols) => {
    if (err) return console.error('Migration check error:', err.message);
    const colNames = (cols || []).map(c => c.name.toLowerCase());
    const unwanted = ['cash_reserve', 'notes', 'status'];
    const hasUnwanted = unwanted.some(u => colNames.includes(u));
    if (!hasUnwanted) return; // nothing to do

    console.log('🔧 Migrating investment_tracking schema to remove legacy columns...');
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      // Create new table without unwanted columns
      db.run(`
        CREATE TABLE IF NOT EXISTS investment_tracking_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL UNIQUE,
          total_contributions REAL NOT NULL DEFAULT 0,
          mansa_x REAL NOT NULL DEFAULT 0,
          i_and_m REAL NOT NULL DEFAULT 0,
          cumulative_mansa_x REAL NOT NULL DEFAULT 0,
          total_invested REAL NOT NULL DEFAULT 0,
          running_total_contributions REAL NOT NULL DEFAULT 0,
          mansa_x_percentage REAL DEFAULT 0,
          i_and_m_percentage REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_calculated DATETIME
        );
      `);

      // Copy data from old to new where possible
      db.run(`
        INSERT INTO investment_tracking_new (id, month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage, created_at, updated_at, last_calculated)
        SELECT id, month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage, created_at, updated_at, last_calculated
        FROM investment_tracking;
      `, (copyErr) => {
        if (copyErr) console.error('Error copying investment_tracking data during migration:', copyErr.message);
        // Drop old and rename
        db.run('DROP TABLE IF EXISTS investment_tracking', (dropErr) => {
          if (dropErr) console.error('Error dropping old investment_tracking:', dropErr.message);
          db.run('ALTER TABLE investment_tracking_new RENAME TO investment_tracking', (renameErr) => {
            if (renameErr) console.error('Error renaming new investment_tracking table:', renameErr.message);
            db.run('COMMIT', (cErr) => {
              if (cErr) console.error('Error committing migration transaction:', cErr.message);
              else console.log('✅ investment_tracking schema migrated (legacy columns removed)');
            });
          });
        });
      });
    });
  });
}

migrateInvestmentTrackingSchema();

// Create investment_history table to track changes to Mansa X amounts
db.run(`
  CREATE TABLE IF NOT EXISTS investment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    previous_amount REAL NOT NULL,
    new_amount REAL NOT NULL,
    changed_by TEXT,
    change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
  );
`, (err) => {
  if (err) console.error('Error creating investment_history table:', err.message);
  else console.log('✅ investment_history table ready');
});

// Create mansa_x_investments table (stores Mansa-X amounts per month)
db.run(`
  CREATE TABLE IF NOT EXISTS mansa_x_investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    mansa_x_amount REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`, (err) => {
  if (err) console.error('Error creating mansa_x_investments table:', err.message);
  else {
    console.log('✅ mansa_x_investments table ready');
    db.run(`CREATE INDEX IF NOT EXISTS idx_mx_month ON mansa_x_investments(month)`);
  }
});

// Create or replace view `investment_tracking_table` that aggregates monthly contributions,
// joins Mansa-X investments and computes cumulative and percentage metrics.
db.serialize(() => {
  db.run(`DROP VIEW IF EXISTS investment_tracking_table`, (err) => {
    if (err) console.warn('Warning dropping investment_tracking_table view:', err.message);
  });

  const createViewSql = `
    CREATE VIEW investment_tracking_table AS
    WITH 
    monthly_contributions AS (
        SELECT 
            month,
            SUM(contribution_amount) AS total_contributions,
            COUNT(DISTINCT member_email) AS contributing_members,
            SUM(contribution_amount) OVER (ORDER BY 
                CASE month
                    WHEN 'Nov-2025' THEN 1
                    WHEN 'Dec-2025' THEN 2
                    WHEN 'Jan-2026' THEN 3
                    ELSE 4
                END) AS running_total_contributions
        FROM member_monthly_contributions
        WHERE month IN ('Nov-2025', 'Dec-2025', 'Jan-2026')
        GROUP BY month
    ),

    monthly_investments AS (
        SELECT 
            mc.month,
            mc.total_contributions,
            mc.contributing_members,
            mc.running_total_contributions,
            COALESCE(mx.mansa_x_amount, 0) AS mansa_x_investment
        FROM monthly_contributions mc
        LEFT JOIN mansa_x_investments mx ON mc.month = mx.month
    ),

    cumulative_mansa_x AS (
        SELECT 
            month,
            total_contributions,
            contributing_members,
            running_total_contributions,
            mansa_x_investment,
            SUM(mansa_x_investment) OVER (
                ORDER BY 
                    CASE month
                        WHEN 'Nov-2025' THEN 1
                        WHEN 'Dec-2025' THEN 2
                        WHEN 'Jan-2026' THEN 3
                        ELSE 4
                    END
                ROWS UNBOUNDED PRECEDING
            ) AS cumulative_mansa_x
        FROM monthly_investments
    )

    SELECT 
      month,
      total_contributions,
      contributing_members,
        
      -- Mansa-X related columns
      mansa_x_investment,
      cumulative_mansa_x,
      -- Human-friendly aliased columns requested
      cumulative_mansa_x AS "Cumulative Mansa-X",
        
        -- I&M Balance calculation: Total contributions to date - Cumulative Mansa-X
        (running_total_contributions - cumulative_mansa_x) AS iandm_balance,
        
        -- Total Invested: Cumulative Mansa-X + I&M Balance
        cumulative_mansa_x + (running_total_contributions - cumulative_mansa_x) AS total_invested,
        cumulative_mansa_x + (running_total_contributions - cumulative_mansa_x) AS "Total Invested",
        
        -- Cash Reserve: Running total - Total Invested
        running_total_contributions - 
            (cumulative_mansa_x + (running_total_contributions - cumulative_mansa_x)) AS cash_reserve,
        
        -- Running total of contributions for verification
        running_total_contributions,
        
        -- Calculated percentages
        ROUND((mansa_x_investment / NULLIF(total_contributions, 0) * 100), 2) AS mansa_x_percentage_of_month,
        ROUND((cumulative_mansa_x / NULLIF(running_total_contributions, 0) * 100), 2) AS cumulative_mansa_x_percentage,
        ROUND(((running_total_contributions - cumulative_mansa_x) / NULLIF(running_total_contributions, 0) * 100), 2) AS iandm_percentage
    
    FROM cumulative_mansa_x
    ORDER BY 
        CASE month
            WHEN 'Nov-2025' THEN 1
            WHEN 'Dec-2025' THEN 2
            WHEN 'Jan-2026' THEN 3
            ELSE 4
        END;
  `;

  db.run(createViewSql, (err) => {
    if (err) console.error('Error creating investment_tracking_table view:', err.message);
    else console.log('✅ investment_tracking_table view created/updated');
  });
});

// Cache for existing month columns
let monthColumnCache = null;

// Get all month columns from cache or DB
function getMonthColumns() {
  return new Promise((resolve, reject) => {
    if (monthColumnCache) {
      return resolve(monthColumnCache);
    }

    db.all(`PRAGMA table_info(contribution)`, (err, columns) => {
      if (err) {
        reject(err);
        return;
      }

      // Filter for month columns (exclude standard columns)
      const standardColumns = ['id', 'member_name', 'member_email', 'total_contributions',
        'interest_per_member', 'final_payout', 'synced_at'];

      monthColumnCache = columns
        .map(col => col.name)
        .filter(name => !standardColumns.includes(name));

      resolve(monthColumnCache);
    });
  });
}

// Parse month labels like 'YYYY-MM' or 'Mon-YYYY' or 'Month-YYYY' to Date (first day)
function parseMonthLabelToDate(label) {
  if (!label || typeof label !== 'string') return null;
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(label)) return new Date(label + '-01');
  // Mon-YYYY or Month-YYYY
  const m = label.match(/^([A-Za-z]+)[-\s](\d{4})$/);
  if (m) {
    const mon = m[1].slice(0, 3).toLowerCase();
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    if (months.hasOwnProperty(mon)) return new Date(parseInt(m[2], 10), months[mon], 1);
  }
  const d = new Date(label);
  return isNaN(d.getTime()) ? null : d;
}

// Calculate cumulative total contributions up to and including the given month label
async function calculateCumulativeTotalContributions(monthLabel) {
  return new Promise((resolve, reject) => {
    getMonthColumns().then((cols) => {
      const target = parseMonthLabelToDate(monthLabel);
      if (!target) return resolve(0);

      const include = cols.filter(c => {
        const d = parseMonthLabelToDate(c);
        return d && d <= target;
      });

      if (include.length === 0) return resolve(0);

      // Build query summing selected columns across all rows
      const sums = include.map(c => `COALESCE(SUM("${c}"),0)`).join(' + ');
      const query = `SELECT (${sums}) as total FROM contribution`;

      db.get(query, (err, row) => {
        if (err) return reject(err);
        resolve(row && row.total ? row.total : 0);
      });
    }).catch(reject);
  });
}

// Check if a column exists
function columnExists(columnName) {
  return getMonthColumns().then(columns => columns.includes(columnName));
}

// Add month column if it doesn't exist
async function addMonthColumn(month) {
  try {
    const exists = await columnExists(month);

    if (!exists) {
      return new Promise((resolve, reject) => {
        db.run(`ALTER TABLE contribution ADD COLUMN "${month}" REAL DEFAULT 0`, (err) => {
          if (err) {
            reject(err);
          } else {
            // Clear cache and add new column
            getMonthColumns().then(columns => {
              monthColumnCache = [...columns, month];
              console.log(`✅ Added month column: ${month}`);
              resolve();
            });
          }
        });
      });
    }
  } catch (error) {
    throw error;
  }
}

// Add multiple month columns
async function addMonthColumns(months) {
  const uniqueMonths = [...new Set(months)];

  for (const month of uniqueMonths) {
    try {
      await addMonthColumn(month);
    } catch (error) {
      // Column might already exist, continue
      if (!error.message.includes("duplicate column")) {
        throw error;
      }
    }
  }
}

// Clear cache (call this when you know schema has changed)
function clearColumnCache() {
  monthColumnCache = null;
}

// Document management functions
async function getMemberPhoto(memberEmail) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM member_documents 
       WHERE LOWER(member_email) = LOWER(?) AND document_type = 'photo' AND status = 'active'
       ORDER BY is_primary DESC, upload_date DESC LIMIT 1`,
      [memberEmail],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

async function getMemberMOU(memberEmail) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM member_documents 
       WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou' AND status = 'active'
       ORDER BY upload_date DESC`,
      [memberEmail],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

async function getAllPhotos() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT d.*, u.member_name 
       FROM member_documents d
       LEFT JOIN users u ON LOWER(d.member_email) = LOWER(u.member_email)
       WHERE d.document_type = 'photo' AND d.status = 'active'
       ORDER BY d.upload_date DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

async function getAllMOUs() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT d.*, u.member_name 
       FROM member_documents d
       LEFT JOIN users u ON LOWER(d.member_email) = LOWER(u.member_email)
       WHERE d.document_type = 'mou' AND d.status = 'active'
       ORDER BY d.upload_date DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Get database stats
function getDatabaseStats() {
  return new Promise((resolve, reject) => {
    const stats = {};

    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) reject(err);
      else {
        stats.users = row.count;

        db.get("SELECT COUNT(*) as count FROM contribution", (err, row) => {
          if (err) reject(err);
          else {
            stats.contributions = row.count;

            db.get("SELECT COUNT(*) as count FROM member_documents WHERE document_type = 'photo'", (err, row) => {
              if (err) reject(err);
              else {
                stats.photos = row.count;

                db.get("SELECT COUNT(*) as count FROM member_documents WHERE document_type = 'mou'", (err, row) => {
                  if (err) reject(err);
                  else {
                    stats.mou_documents = row.count;

                    db.get("SELECT COUNT(*) as count FROM fund_allocations", (err, row) => {
                      if (err) reject(err);
                      else {
                        stats.fund_allocations = row.count;
                        stats.database_path = db.filename;
                        resolve(stats);
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  });
}

// ===== INVESTMENT MANAGEMENT FUNCTIONS =====

// Calculate total contributions for a specific month from contribution table
async function calculateMonthlyTotalContributions(month) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(contribution)`, (err, columns) => {
      if (err) return reject(err);

      const monthColumn = columns.find(col => col.name === month);
      if (!monthColumn) return resolve(0);

      const query = `SELECT SUM("${month}") as total FROM contribution WHERE "${month}" > 0`;
      db.get(query, (err, row) => {
        if (err) reject(err);
        else resolve(row && row.total ? row.total : 0);
      });
    });
  });
}

// Calculate investment stats for a month without saving to DB
async function getInvestmentStats(month) {
  try {
    // 1. per-month total
    const perMonthTotal = await calculateMonthlyTotalContributions(month);

    // 2. cumulative total up to this month
    const cumulativeTotal = await calculateCumulativeTotalContributions(month);

    // 3. helper to compute cumulative mansa_x up to target month (from existing DB records)
    const getCumulativeMansaFromDB = () => new Promise((res, rej) => {
      db.all("SELECT month, mansa_x FROM investment_tracking", (er, rows) => {
        if (er) return rej(er);
        const target = parseMonthLabelToDate(month);
        const sum = (rows || []).reduce((acc, r) => {
          const d = parseMonthLabelToDate(r.month);
          // Only sum months strictly before or equal to target that are already in DB
          if (d && target && d <= target) return acc + (parseFloat(r.mansa_x) || 0);
          return acc;
        }, 0);
        res(sum);
      });
    });

    const cumulativeMansa = await getCumulativeMansaFromDB();
    const i_and_m_cumulative = cumulativeTotal - cumulativeMansa;

    // Check if record already exists to get current mansa_x
    const existing = await new Promise((res) => {
      db.get("SELECT mansa_x FROM investment_tracking WHERE month = ?", [month], (e, r) => res(r));
    });

    return {
      month,
      total_contributions: perMonthTotal,
      mansa_x: existing ? existing.mansa_x : 0,
      i_and_m: i_and_m_cumulative,
      cumulative_mansa_x: cumulativeMansa,
      total_invested: (cumulativeMansa + i_and_m_cumulative),
      running_total_contributions: cumulativeTotal
    };
  } catch (error) {
    throw error;
  }
}

// Get or create investment record for a month
async function getOrCreateInvestmentRecord(month) {
  return new Promise(async (resolve, reject) => {
    try {
      const stats = await getInvestmentStats(month);

      db.get("SELECT id FROM investment_tracking WHERE month = ?", [month], (err, row) => {
        if (err) return reject(err);

        if (row) {
          // Calculate percentages
          const mansa_x_percentage = stats.total_invested > 0 ? (stats.cumulative_mansa_x / stats.total_invested) * 100 : 0;
          const i_and_m_percentage = stats.total_invested > 0 ? (stats.i_and_m / stats.total_invested) * 100 : 0;
          
          db.run(
            `UPDATE investment_tracking SET total_contributions = ?, i_and_m = ?, cumulative_mansa_x = ?, total_invested = ?, running_total_contributions = ?, mansa_x_percentage = ?, i_and_m_percentage = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ?`,
            [stats.total_contributions, stats.i_and_m, stats.cumulative_mansa_x, stats.total_invested, stats.running_total_contributions, mansa_x_percentage, i_and_m_percentage, month],
            (updateErr) => {
              if (updateErr) return reject(updateErr);
              db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (e, updated) => e ? reject(e) : resolve(updated));
            }
          );
        } else {
          // Calculate percentages
          const mansa_x_percentage = stats.total_invested > 0 ? (stats.cumulative_mansa_x / stats.total_invested) * 100 : 0;
          const i_and_m_percentage = stats.total_invested > 0 ? (stats.i_and_m / stats.total_invested) * 100 : 0;
          
          db.run(
            `INSERT INTO investment_tracking (month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
            [month, stats.total_contributions, stats.i_and_m, stats.cumulative_mansa_x, stats.total_invested, stats.running_total_contributions, mansa_x_percentage, i_and_m_percentage],
            function (insertErr) {
              if (insertErr) return reject(insertErr);
              db.get("SELECT * FROM investment_tracking WHERE id = ?", [this.lastID], (e, created) => e ? reject(e) : resolve(created));
            }
          );
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Update Mansa X amount for a month
async function updateMansaX(month, amount, changedBy = 'admin', reason = '') {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure record exists
      await getOrCreateInvestmentRecord(month);

      // Update the month's mansa_x
      const prevRow = await new Promise((res, rej) => db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (e, r) => e ? rej(e) : res(r)));
      const previousAmount = prevRow ? (prevRow.mansa_x || 0) : 0;

      await new Promise((res, rej) => {
        db.run(`UPDATE investment_tracking SET mansa_x = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ?`, [amount, month], function (err) {
          if (err) rej(err);
          else res();
        });
      });

      // Log history
      db.run(
        `INSERT INTO investment_history (month, previous_amount, new_amount, changed_by, reason) VALUES (?, ?, ?, ?, ?)`,
        [month, previousAmount, amount, changedBy, reason],
        (historyErr) => { if (historyErr) console.error('Error logging investment history:', historyErr); }
      );

      // Recompute cumulative i_and_m for all investment records ordered by month
      const rows = await new Promise((res, rej) => db.all("SELECT * FROM investment_tracking", (e, r) => e ? rej(e) : res(r)));
      // sort by parsed month ascending
      rows.sort((a, b) => {
        const da = parseMonthLabelToDate(a.month) || new Date(0);
        const dbd = parseMonthLabelToDate(b.month) || new Date(0);
        return da - dbd;
      });

      let cumulativeMansa = 0;
      for (const row of rows) {
        cumulativeMansa += parseFloat(row.mansa_x || 0);
        const cumTotal = await calculateCumulativeTotalContributions(row.month);
        const newIandM = cumTotal - cumulativeMansa;
        const newTotalInvested = cumulativeMansa + newIandM;
        
        // Calculate percentages
        const mansa_x_percentage = newTotalInvested > 0 ? (cumulativeMansa / newTotalInvested) * 100 : 0;
        const i_and_m_percentage = newTotalInvested > 0 ? (newIandM / newTotalInvested) * 100 : 0;
        
        await new Promise((res2, rej2) => db.run(`UPDATE investment_tracking SET i_and_m = ?, cumulative_mansa_x = ?, total_invested = ?, mansa_x_percentage = ?, i_and_m_percentage = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ?`, [newIandM, cumulativeMansa, newTotalInvested, mansa_x_percentage, i_and_m_percentage, row.month], (er) => er ? rej2(er) : res2()));
      }

      // Return updated record for the requested month
      db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (e, updated) => e ? reject(e) : resolve(updated));
    } catch (error) {
      reject(error);
    }
  });
}


// Get all investment records with percentage columns
function getAllInvestmentRecords() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage, receipt_path, updated_at FROM investment_tracking`, (err, rows) => {
      if (err) return reject(err);
      // Sort by parsed month date ascending
      rows.sort((a, b) => {
        const da = parseMonthLabelToDate(a.month) || new Date(0);
        const dbd = parseMonthLabelToDate(b.month) || new Date(0);
        return da - dbd;
      });
      resolve(rows);
    });
  });
}

// Get investment record for specific month
function getInvestmentRecord(month) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ===== FUNCTION TO CALCULATE INVESTMENT TRACKING DATA =====
/**
 * Calculates investment tracking data based on:
 * - Monthly contributions from member_monthly_contributions table
 * - Mansa-X investments from investment decisions
 *
 * Business Logic:
 * 1. Get total contributions per month from member contributions
 * 2. Calculate running total of contributions
 * 3. Add Mansa-X investments for each month
 * 4. Calculate cumulative Mansa-X (running sum of mansa_x)
 * 5. Calculate I&M balance = running_total_contributions - cumulative_mansa_x
 * 6. Calculate total_invested = cumulative_mansa_x + i_and_m
 * 7. Cash reserve should be 0 (all money is invested)
 */
function calculateInvestmentData() {
  return new Promise((resolve, reject) => {
    // Step 1: Get monthly totals from member contributions
    db.all(`
      SELECT 
        month,
        SUM(contribution_amount) as total_contributions,
        COUNT(DISTINCT member_email) as member_count
      FROM member_monthly_contributions
      WHERE month IN ('Nov-2025', 'Dec-2025', 'Jan-2026', 'Feb-2026', 'Mar-2026', 'Apr-2026', 
                      'May-2026', 'Jun-2026', 'Jul-2026', 'Aug-2026', 'Sep-2026', 'Oct-2026', 
                      'Nov-2026', 'Dec-2026')
      GROUP BY month
      ORDER BY 
        CASE month
          WHEN 'Nov-2025' THEN 1
          WHEN 'Dec-2025' THEN 2
          WHEN 'Jan-2026' THEN 3
          WHEN 'Feb-2026' THEN 4
          WHEN 'Mar-2026' THEN 5
          WHEN 'Apr-2026' THEN 6
          WHEN 'May-2026' THEN 7
          WHEN 'Jun-2026' THEN 8
          WHEN 'Jul-2026' THEN 9
          WHEN 'Aug-2026' THEN 10
          WHEN 'Sep-2026' THEN 11
          WHEN 'Oct-2026' THEN 12
          WHEN 'Nov-2026' THEN 13
          WHEN 'Dec-2026' THEN 14
          ELSE 15
        END
    `, (err, monthlyTotals) => {
      if (err) {
        reject(err);
        return;
      }

      // Step 2: Get existing Mansa-X investments (from investment_tracking or a separate decisions table)
      // For now, we'll use a sample approach - in production, this would come from user input
      db.all(`
        SELECT month, mansa_x 
        FROM investment_tracking 
        ORDER BY 
          CASE month
            WHEN 'Nov-2025' THEN 1
            WHEN 'Dec-2025' THEN 2
            WHEN 'Jan-2026' THEN 3
            ELSE 4
          END
      `, (err2, existingInvestments) => {
        if (err2) {
          reject(err2);
          return;
        }

        // Create a map of existing Mansa-X investments
        const mansaXMap = {};
        existingInvestments.forEach(inv => {
          mansaXMap[inv.month] = inv.mansa_x;
        });

        // Step 3: Calculate running totals and investment allocations
        let runningTotalContributions = 0;
        let cumulativeMansaX = 0;
        const calculatedData = [];

        monthlyTotals.forEach((row, index) => {
          // Update running total of contributions
          runningTotalContributions += row.total_contributions;

          // Get Mansa-X for this month (from existing data or default to 0)
          const mansaX = mansaXMap[row.month] || 0;

          // Update cumulative Mansa-X
          cumulativeMansaX += mansaX;

          // Calculate I&M balance using the correct formula:
          // I&M Balance = Running Total Contributions - Cumulative Mansa-X
          const iandMBalance = runningTotalContributions - cumulativeMansaX;

          // Total Invested = Cumulative Mansa-X + I&M Balance
          const totalInvested = cumulativeMansaX + iandMBalance;

          // Calculate percentages as actual percentages (0..100)
          const mansaXPercentage = totalInvested > 0
            ? (cumulativeMansaX / totalInvested * 100)
            : 0;
          const iandMPercentage = totalInvested > 0
            ? (iandMBalance / totalInvested * 100)
            : 0;

          calculatedData.push({
            month: row.month,
            total_contributions: row.total_contributions,
            mansa_x: mansaX,
            i_and_m: iandMBalance,
            cumulative_mansa_x: cumulativeMansaX,
            total_invested: totalInvested,
            running_total_contributions: runningTotalContributions,
            mansa_x_percentage: mansaXPercentage,
            i_and_m_percentage: iandMPercentage,
            member_count: row.member_count,
            last_calculated: new Date().toISOString()
          });
        });

        resolve(calculatedData);
      });
    });
  });
}

// Get available months (for dropdowns)
function getAvailableMonths() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT month FROM investment_tracking 
       UNION 
       SELECT DISTINCT month FROM member_monthly_contributions
       UNION 
       SELECT name as month FROM pragma_table_info('contribution') 
       WHERE name NOT IN ('id','member_name','member_email','total_contributions','interest_per_member','final_payout','synced_at')`,
      (err, rows) => {
        if (err) return reject(err);
        const months = (rows || []).map(r => r.month).filter(m => m);
        months.sort((a, b) => {
          const da = parseMonthLabelToDate(a) || new Date(0);
          const dbd = parseMonthLabelToDate(b) || new Date(0);
          return da - dbd;
        });
        resolve(months);
      }
    );
  });
}

// Recompute all investment_tracking rows: per-month totals + cumulative I&M (preserving mansa_x)
async function recomputeAllInvestments() {
  return new Promise(async (resolve, reject) => {
    try {
      const monthCols = await getMonthColumns();

      // Also include any months already present in investment_tracking
      const existing = await new Promise((res, rej) => db.all("SELECT DISTINCT month FROM investment_tracking", (e, r) => e ? rej(e) : res(r)));
      const existingMonths = (existing || []).map(x => x.month).filter(Boolean);

      const monthsSet = new Set([...(monthCols || []), ...existingMonths]);
      const months = Array.from(monthsSet).filter(Boolean);

      // Sort months chronologically using parseMonthLabelToDate; fallback to string
      months.sort((a, b) => {
        const da = parseMonthLabelToDate(a) || new Date(0);
        const dbd = parseMonthLabelToDate(b) || new Date(0);
        return da - dbd;
      });

      // We'll fetch current mansa_x values once and update cumulatively
      let currentRows = await new Promise((res, rej) => db.all("SELECT month, mansa_x FROM investment_tracking", (e, r) => e ? rej(e) : res(r)));
      const mansaMap = {};
      (currentRows || []).forEach(r => { mansaMap[r.month] = parseFloat(r.mansa_x || 0); });

      let cumulativeMansa = 0;
      for (const month of months) {
        const perMonthTotal = await calculateMonthlyTotalContributions(month);
        const cumulativeTotal = await calculateCumulativeTotalContributions(month);

        // update cumulativeMansa including this month's stored mansa_x (if any)
        const thisMansa = parseFloat(mansaMap[month] || 0);
        cumulativeMansa += thisMansa;

        const i_and_m = cumulativeTotal - cumulativeMansa;

        // Upsert into investment_tracking
        const exists = await new Promise((res, rej) => db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (e, r) => e ? rej(e) : res(r)));
        if (exists) {
          const totalInvested = cumulativeMansa + i_and_m;
          
          // Calculate percentages
          const mansa_x_percentage = totalInvested > 0 ? (cumulativeMansa / totalInvested) * 100 : 0;
          const i_and_m_percentage = totalInvested > 0 ? (i_and_m / totalInvested) * 100 : 0;
          
          await new Promise((res2, rej2) => db.run(`UPDATE investment_tracking SET total_contributions = ?, i_and_m = ?, cumulative_mansa_x = ?, total_invested = ?, mansa_x_percentage = ?, i_and_m_percentage = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ?`, [perMonthTotal, i_and_m, cumulativeMansa, totalInvested, mansa_x_percentage, i_and_m_percentage, month], (er) => er ? rej2(er) : res2()));
        } else {
          const totalInvested = cumulativeMansa + i_and_m;
          
          // Calculate percentages
          const mansa_x_percentage = totalInvested > 0 ? (cumulativeMansa / totalInvested) * 100 : 0;
          const i_and_m_percentage = totalInvested > 0 ? (i_and_m / totalInvested) * 100 : 0;
          
          await new Promise((res3, rej3) => db.run(`INSERT INTO investment_tracking (month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, mansa_x_percentage, i_and_m_percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [month, perMonthTotal, thisMansa, i_and_m, cumulativeMansa, totalInvested, mansa_x_percentage, i_and_m_percentage], (er) => er ? rej3(er) : res3()));
        }
      }

      // Return updated rows, sorted chronologically by parsed month
      const updated = await new Promise((res, rej) => db.all("SELECT * FROM investment_tracking", (e, r) => e ? rej(e) : res(r)));
      (updated || []).sort((a, b) => {
        const da = parseMonthLabelToDate(a.month) || new Date(0);
        const dbd = parseMonthLabelToDate(b.month) || new Date(0);
        return da - dbd;
      });
      resolve(updated || []);
    } catch (err) {
      reject(err);
    }
  });
}

// ===== FUNCTION TO UPDATE INVESTMENT TRACKING TABLE =====
/**
 * Updates the investment_tracking table with freshly calculated data
 * following the business logic described in calculateInvestmentData()
 */
function updateInvestmentTrackingTable() {
  return new Promise(async (resolve, reject) => {
    try {
      const calculatedData = await calculateInvestmentData();

      // Use transaction for atomic update
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Insert or replace with new calculated data
        const stmt = db.prepare(`
              INSERT OR REPLACE INTO investment_tracking (
                month, 
                total_contributions, 
                mansa_x, 
                i_and_m, 
                cumulative_mansa_x,
                total_invested,
                running_total_contributions,
                mansa_x_percentage,
                i_and_m_percentage,
                last_calculated,
                updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

        calculatedData.forEach(row => {
          stmt.run(
            row.month,
            row.total_contributions,
            row.mansa_x,
            row.i_and_m,
            row.cumulative_mansa_x,
            row.total_invested,
            row.running_total_contributions,
            row.mansa_x_percentage,
            row.i_and_m_percentage,
            row.last_calculated
          );
        });

        stmt.finalize();

        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            reject(err);
          } else {
            console.log('✅ Investment tracking table updated successfully');
            console.log(`   • Processed ${calculatedData.length} months`);
            if (calculatedData.length) {
              const last = calculatedData[calculatedData.length - 1];
              console.log(`   • Final I&M Balance: KES ${last.i_and_m.toLocaleString()}`);
              console.log(`   • Final Cumulative Mansa-X: KES ${last.cumulative_mansa_x.toLocaleString()}`);
            }
            resolve(calculatedData);
          }
        });
      });

    } catch (error) {
      console.error('Error updating investment tracking table:', error);
      reject(error);
    }
  });
}

// ===== FUNCTION TO SET MANSA-X INVESTMENT FOR A MONTH =====
/**
 * Sets the Mansa-X investment amount for a specific month
 * This triggers recalculation of all dependent values
 */
function setMansaXInvestment(month, amount) {
  return new Promise((resolve, reject) => {
    // First, check if record exists
    db.get(`SELECT id FROM investment_tracking WHERE month = ?`, [month], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row) {
        // Update existing record's mansa_x value
        db.run(
          `UPDATE investment_tracking SET mansa_x = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ?`,
          [amount, month],
          (updateErr) => {
            if (updateErr) {
              reject(updateErr);
            } else {
              // Recalculate all data after update
              updateInvestmentTrackingTable()
                .then(resolve)
                .catch(reject);
            }
          }
        );
      } else {
        // Insert new record with just mansa_x for now
        db.run(
          `INSERT INTO investment_tracking (month, mansa_x, created_at, updated_at) 
               VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [month, amount],
          (insertErr) => {
            if (insertErr) {
              reject(insertErr);
            } else {
              // Recalculate all data after insert
              updateInvestmentTrackingTable()
                .then(resolve)
                .catch(reject);
            }
          }
        );
      }
    });
  });
}

// ===== FUNCTION TO GET INVESTMENT SUMMARY =====
/**
 * Returns a summary of current investment status
 */
function getInvestmentSummary() {
  return new Promise((resolve, reject) => {
    db.get(`
          SELECT 
            SUM(total_contributions) as total_contributions_all,
            SUM(mansa_x) as total_mansa_x_monthly,
            MAX(cumulative_mansa_x) as cumulative_mansa_x_final,
            MAX(i_and_m) as iandm_balance_final,
            MAX(total_invested) as total_invested_final,
            MAX(running_total_contributions) as running_total_final,
            COUNT(*) as months_count
          FROM investment_tracking
        `, (err, summary) => {
      if (err) {
        reject(err);
      } else {
        // Add calculated percentages
        if (summary) {
          summary.mansa_x_percentage = summary.total_invested_final > 0
            ? (summary.cumulative_mansa_x_final / summary.total_invested_final * 100).toFixed(1)
            : 0;
          summary.iandm_percentage = summary.total_invested_final > 0
            ? (summary.iandm_balance_final / summary.total_invested_final * 100).toFixed(1)
            : 0;
        }
        resolve(summary);
      }
    });
  });
}

// ===== VERIFICATION QUERY =====
/**
 * Verifies that the business logic is correctly applied
 * Should return all rows where the formula holds true
 */
function verifyInvestmentLogic() {
  return new Promise((resolve, reject) => {
    db.all(`
          SELECT 
            month,
            total_contributions,
            mansa_x,
            cumulative_mansa_x,
            i_and_m,
            running_total_contributions,
            total_invested,
            (running_total_contributions - total_invested) AS cash_reserve,
            -- Verification formulas
            CASE 
              WHEN ABS(running_total_contributions - (cumulative_mansa_x + i_and_m)) < 0.01 
              THEN '✓' 
              ELSE '✗' 
            END as balance_verified,
            CASE 
              WHEN ABS((running_total_contributions - total_invested)) < 0.01 
              THEN '✓' 
              ELSE '✗' 
            END as cash_verified
          FROM investment_tracking
          ORDER BY 
            CASE month
              WHEN 'Nov-2025' THEN 1
              WHEN 'Dec-2025' THEN 2
              WHEN 'Jan-2026' THEN 3
              ELSE 4
            END
        `, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        console.log('\n🔍 Investment Logic Verification:');
        console.log('=================================');
        rows.forEach(row => {
          console.log(`${row.month}: Balance ${row.balance_verified} | Cash ${row.cash_verified} | I&M: KES ${row.i_and_m.toLocaleString()}`);
        });
        resolve(rows);
      }
    });
  });
}

// Automatically update investment_tracking table with calculated total contributions and zero mansa_x for unedited months
// Synchronous version of autoUpdateInvestmentTracking (for use in callbacks)
function autoUpdateInvestmentTrackingSync() {
  try {
    console.log('🔄 Auto-updating investment_tracking table...');
    
    // Get all available month columns
    const monthColumns = getMonthColumns();
    
    for (const month of monthColumns) {
      // Calculate total contributions for this month (only active months with contributions > 0)
      const totalContributions = calculateMonthlyTotalContributions(month);
      
      // Only process months with actual contributions (active months)
      if (totalContributions > 0) {
        // Check if investment record exists
        db.get("SELECT mansa_x FROM investment_tracking WHERE month = ?", [month], (e, r) => {
          
          // Calculate cumulative totals
          const cumulativeTotal = calculateCumulativeTotalContributions(month);
          
          // Get cumulative mansa_x up to this month
          const getCumulativeMansaFromDB = () => {
            db.all("SELECT month, mansa_x FROM investment_tracking ORDER BY month", (er, rows) => {
              if (er) throw er;
              const target = parseMonthLabelToDate(month);
              const sum = (rows || []).reduce((acc, r) => {
                const rowDate = parseMonthLabelToDate(r.month);
                return rowDate && rowDate <= target ? acc + (parseFloat(r.mansa_x) || 0) : acc;
              }, 0);
              return sum;
            });
          };
          
          const cumulativeMansa = getCumulativeMansaFromDB();
          const i_and_m = cumulativeTotal - cumulativeMansa;
          const total_invested = cumulativeMansa + i_and_m;
          
          // Calculate percentages
          const mansa_x_percentage = total_invested > 0 ? (cumulativeMansa / total_invested) * 100 : 0;
          const i_and_m_percentage = total_invested > 0 ? (i_and_m / total_invested) * 100 : 0;
          
          if (r) {
            // Update existing record - keep mansa_x if it was manually set, otherwise keep 0
            const currentMansaX = r.mansa_x || 0;
            db.run(
              `UPDATE investment_tracking SET 
               total_contributions = ?, 
               i_and_m = ?, 
               cumulative_mansa_x = ?, 
               total_invested = ?, 
               running_total_contributions = ?, 
               mansa_x_percentage = ?,
               i_and_m_percentage = ?,
               updated_at = CURRENT_TIMESTAMP 
               WHERE month = ?`,
              [totalContributions, i_and_m, cumulativeMansa, total_invested, cumulativeTotal, mansa_x_percentage, i_and_m_percentage, month],
              (err) => {
                if (err) console.error('Error updating investment record:', err);
              }
            );
          } else {
            // Insert new record with mansa_x = 0 (default)
            db.run(
              `INSERT INTO investment_tracking 
               (month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage) 
               VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
              [month, totalContributions, i_and_m, cumulativeMansa, total_invested, cumulativeTotal, mansa_x_percentage, i_and_m_percentage],
              (err) => {
                if (err) console.error('Error inserting investment record:', err);
              }
            );
          }
        });
      }
    }
    
    console.log('✅ Investment tracking table auto-update completed');
    return { success: true, message: 'Investment tracking updated successfully' };
  } catch (error) {
    console.error('❌ Error auto-updating investment tracking:', error);
    return { success: false, error: error.message };
  }
}

async function autoUpdateInvestmentTracking() {
  try {
    console.log('🔄 Auto-updating investment_tracking table...');
    
    // Get all available month columns
    const monthColumns = await getMonthColumns();
    
    for (const month of monthColumns) {
      // Calculate total contributions for this month (only active months with contributions > 0)
      const totalContributions = await calculateMonthlyTotalContributions(month);
      
      // Only process months with actual contributions (active months)
      if (totalContributions > 0) {
        // Check if investment record exists
        const existing = await new Promise((resolve, reject) => {
          db.get("SELECT mansa_x FROM investment_tracking WHERE month = ?", [month], (e, r) => resolve(r));
        });
        
        // Calculate cumulative totals
        const cumulativeTotal = await calculateCumulativeTotalContributions(month);
        
        // Get cumulative mansa_x up to this month
        const getCumulativeMansaFromDB = () => new Promise((resolve, reject) => {
          db.all("SELECT month, mansa_x FROM investment_tracking ORDER BY month", (er, rows) => {
            if (er) return reject(er);
            const target = parseMonthLabelToDate(month);
            const sum = (rows || []).reduce((acc, r) => {
              const rowDate = parseMonthLabelToDate(r.month);
              return rowDate && rowDate <= target ? acc + (parseFloat(r.mansa_x) || 0) : acc;
            }, 0);
            resolve(sum);
          });
        });
        
        const cumulativeMansa = await getCumulativeMansaFromDB();
        const i_and_m = cumulativeTotal - cumulativeMansa;
        const total_invested = cumulativeMansa + i_and_m;
        
        // Calculate percentages
        const mansa_x_percentage = total_invested > 0 ? (cumulativeMansa / total_invested) * 100 : 0;
        const i_and_m_percentage = total_invested > 0 ? (i_and_m / total_invested) * 100 : 0;
        
        if (existing) {
          // Update existing record - keep mansa_x if it was manually set, otherwise keep 0
          const currentMansaX = existing.mansa_x || 0;
          await new Promise((res, rej) => {
            db.run(
              `UPDATE investment_tracking SET 
               total_contributions = ?, 
               i_and_m = ?, 
               cumulative_mansa_x = ?, 
               total_invested = ?, 
               running_total_contributions = ?, 
               mansa_x_percentage = ?,
               i_and_m_percentage = ?,
               updated_at = CURRENT_TIMESTAMP 
               WHERE month = ?`,
              [totalContributions, i_and_m, cumulativeMansa, total_invested, cumulativeTotal, mansa_x_percentage, i_and_m_percentage, month],
              (err) => err ? rej(err) : res()
            );
          });
        } else {
          // Insert new record with mansa_x = 0 (default)
          await new Promise((res, rej) => {
            db.run(
              `INSERT INTO investment_tracking 
               (month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage) 
               VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
              [month, totalContributions, i_and_m, cumulativeMansa, total_invested, cumulativeTotal, mansa_x_percentage, i_and_m_percentage],
              (err) => err ? rej(err) : res()
            );
          });
        }
      }
    }
    
    console.log('✅ Investment tracking table auto-update completed');
    return { success: true, message: 'Investment tracking updated successfully' };
  } catch (error) {
    console.error('❌ Error auto-updating investment tracking:', error);
    return { success: false, error: error.message };
  }
}

// ===== SECURITY LOGGING =====
function logSecurityAction(action, user, ip, details) {
  return new Promise((resolve) => {
    db.run(
      `INSERT INTO security_logs (action, user, ip_address, details) VALUES (?, ?, ?, ?)`,
      [action, user, ip, details],
      (err) => {
        if (err) console.error('Error logging security action:', err.message);
        resolve();
      }
    );
  });
}

function getSecurityLogs(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

module.exports = {
  db,
  getMonthColumns,
  addMonthColumns,
  clearColumnCache,
  getDatabaseStats,
  getMemberPhoto,
  getMemberMOU,
  getAllPhotos,
  getAllMOUs,
  // Investment exports
  calculateMonthlyTotalContributions,
  getOrCreateInvestmentRecord,
  updateMansaX,
  getAllInvestmentRecords,
  getInvestmentRecord,
  getInvestmentStats,
  getInvestmentSummary,
  getAvailableMonths,
  recomputeAllInvestments,
  autoUpdateInvestmentTracking,
  autoUpdateInvestmentTrackingSync,
  logSecurityAction,
  getSecurityLogs
};