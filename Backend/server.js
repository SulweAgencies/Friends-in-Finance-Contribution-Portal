const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const nodemailer = require("nodemailer");
require('dotenv').config();
const { db, getMonthColumns, addMonthColumns, clearColumnCache,
    // investment exports
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
    logSecurityAction,
    getSecurityLogs
} = require("./db");
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ===== CLOUDINARY IMPORTS =====
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// Production environment check
const isProduction = process.env.NODE_ENV === 'production';
const isRenderEnvironment = process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL;

// ===== CLOUDINARY CONFIGURATION =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection on startup
cloudinary.api.ping()
  .then(() => console.log('✅ Cloudinary connected successfully'))
  .catch(err => console.log('❌ Cloudinary connection error:', err.message));

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production or Render environment, allow specific origins
    if (isProduction || isRenderEnvironment) {
      const allowedOrigins = [
        'https://friendsinfinancecontributionportal.netlify.app',
        'https://www.friendsinfinancecontributionportal.netlify.app',
        'https://friends-in-finance-contribution-portal.onrender.com'
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    } else {
      // In development, allow localhost
      if (/^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add CORS pre-flight handling
app.options('*', cors(corsOptions));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'finance-portal.sid',
    cookie: { 
        secure: isProduction || isRenderEnvironment, // Use secure cookies in production or Render
        httpOnly: true,
        sameSite: 'lax', // Always use lax for better compatibility
        maxAge: 24 * 60 * 60 * 1000,
        domain: undefined // Remove domain restriction for better compatibility
    },
    proxy: isProduction || isRenderEnvironment // Trust proxy in production/Render
}));

// Session debugging middleware
app.use((req, res, next) => {
    console.log(`🔑 Session: ${req.sessionID}, User: ${req.session.userEmail || 'Not logged in'}`);
    console.log(`🌍 Environment: NODE_ENV=${process.env.NODE_ENV}, isProduction=${isProduction}, isRender=${isRenderEnvironment}`);
    console.log(`🔗 Origin: ${req.get('origin') || 'No origin'}`);
    next();
});

// Add request logging middleware for debugging
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
        next();
    });
}

// ===== AUTHENTICATION MIDDLEWARE =====
const requireAuth = (req, res, next) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    db.get("SELECT role FROM users WHERE LOWER(member_email) = LOWER(?)",
        [req.session.userEmail],
        (err, user) => {
            if (err || !user || user.role !== 'Admin') {
                return res.status(403).json({ error: 'Admin access required' });
            }
            next();
        }
    );
};

// Email transporter for gateway code notifications
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify email configuration on startup
emailTransporter.verify((error, success) => {
    if (error) {
        console.log('⚠️ Gateway email notification error:', error.message);
        console.log('📧 Check your EMAIL_USER and EMAIL_PASS in .env file');
    } else {
        console.log('📧 Gateway email notification service ready');
        console.log(`📧 Notifications will be sent to: ${process.env.NOTIFICATION_EMAIL}`);
    }
});

// ===== CONTACT FORM EMAIL TRANSPORTER =====
const contactEmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Send gateway code update notification to specific email
async function sendGatewayCodeNotification(newGatewayCode, changedBy) {
    const date = new Date().toLocaleString();
    const recipientEmail = process.env.NOTIFICATION_EMAIL;

    if (!recipientEmail) {
        console.error('❌ NOTIFICATION_EMAIL not set in .env file');
        return { success: false, error: 'Notification email not configured' };
    }

    const mailOptions = {
        from: `"Investment App" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: `🔐 GATEWAY CODE UPDATED - ${date}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333; border-bottom: 2px solid #dc3545; padding-bottom: 10px;">⚠️ Gateway Code Changed</h2>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0; font-size: 16px;"><strong>📅 Date & Time:</strong> ${date}</p>
          <p style="margin: 5px 0; font-size: 16px;"><strong>👤 Changed by:</strong> ${changedBy}</p>
        </div>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; border: 2px solid #ffc107;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #856404;"><strong>NEW GATEWAY CODE:</strong></p>
          <p style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333;">${newGatewayCode}</p>
        </div>
        
        <p style="font-size: 14px; color: #777; margin-top: 20px;">
          The gateway access code has been updated. Please update your records accordingly.
        </p>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
          This is an automated notification. Please do not reply to this email.
        </p>
      </div>
    `
    };

    try {
        const info = await emailTransporter.sendMail(mailOptions);
        console.log(`📧 Gateway code notification sent to ${recipientEmail}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending gateway notification:', error);
        return { success: false, error: error.message };
    }
}

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ===== ROOT ROUTE - REDIRECT TO INDEX =====
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: db.filename || "contributions.db",
        cloudinary: "connected"
    });
});

// ===== DEBUG ENDPOINT =====
app.get("/debug/data", async (req, res) => {
    try {
        const usersCount = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => resolve(row?.count || 0));
        });

        const contributionsCount = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM contribution", (err, row) => resolve(row?.count || 0));
        });

        const monthlyCount = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM member_monthly_contributions", (err, row) => resolve(row?.count || 0));
        });

        const tables = await new Promise((resolve) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => resolve(rows || []));
        });

        res.json({
            users: usersCount,
            contributions: contributionsCount,
            monthly: monthlyCount,
            tables: tables.map(row => row.name)
        });
    } catch (error) {
        console.error("Debug endpoint error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== SYNC ENDPOINT =====
app.post("/sync", express.json(), async (req, res) => {
    try {
        const { contributions, users } = req.body;

        if (!contributions || !Array.isArray(contributions) ||
            !users || !Array.isArray(users)) {
            return res.status(400).json({ error: "Invalid payload format" });
        }

        console.log(`📥 Syncing ${contributions.length} contributions and ${users.length} users`);

        // Extract all unique month keys from contributions
        const monthKeys = new Set();
        contributions.forEach(contribution => {
            Object.keys(contribution).forEach(key => {
                if (key !== 'member_name' &&
                    key !== 'member_email' &&
                    key !== 'total_contributions' &&
                    key !== 'interest_per_member' &&
                    key !== 'final_payout') {
                    monthKeys.add(key);
                }
            });
        });

        // Add any missing month columns
        if (monthKeys.size > 0) {
            await addMonthColumns(Array.from(monthKeys));
        }

        // Get all current month columns
        const allMonthColumns = await getMonthColumns();

        // Process each contribution
        const processContribution = (contribution) => {
            return new Promise((resolve, reject) => {
                // Build the column list for the query
                const allColumns = [
                    'member_name',
                    'member_email',
                    'total_contributions',
                    'interest_per_member',
                    'final_payout',
                    ...allMonthColumns
                ];

                // Build the values array
                const values = [
                    contribution.member_name || '',
                    contribution.member_email || '',
                    contribution.total_contributions || 0,
                    contribution.interest_per_member || 0,
                    contribution.final_payout || 0
                ];

                // Add month values (use 0 if not provided)
                allMonthColumns.forEach(month => {
                    values.push(contribution[month] || 0);
                });

                // Build placeholders
                const placeholders = values.map(() => '?').join(', ');

                // Build SET clause for UPDATE
                const updateClause = [
                    'member_name = excluded.member_name',
                    'total_contributions = excluded.total_contributions',
                    'interest_per_member = excluded.interest_per_member',
                    'final_payout = excluded.final_payout'
                ];

                allMonthColumns.forEach(month => {
                    updateClause.push(`"${month}" = excluded."${month}"`);
                });

                const query = `
                    INSERT INTO contribution (
                        ${allColumns.map(col => `"${col}"`).join(', ')}
                    ) VALUES (${placeholders})
                    ON CONFLICT(member_email) 
                    DO UPDATE SET 
                        ${updateClause.join(', ')},
                        synced_at = CURRENT_TIMESTAMP
                `;

                db.run(query, values, function (err) {
                    if (err) {
                        console.error(`Error processing contribution for ${contribution.member_email}:`, err);
                        reject(err);
                    } else {
                        // After saving summary, save individual monthly contributions
                        for (const month of allMonthColumns) {
                            const amount = contribution[month];
                            if (amount !== undefined && amount !== null && amount > 0) {
                                db.run(
                                    `INSERT INTO member_monthly_contributions (member_email, month, contribution_amount) 
                                     VALUES (?, ?, ?)
                                     ON CONFLICT(member_email, month) DO UPDATE SET 
                                        contribution_amount = excluded.contribution_amount,
                                        created_at = CURRENT_TIMESTAMP`,
                                    [contribution.member_email, month, amount],
                                    (err) => {
                                        if (err) console.error(`Error saving monthly contribution for ${month}:`, err);
                                    }
                                );
                            }
                        }
                        resolve();
                    }
                });
            });
        };

        // Process all contributions sequentially
        for (const contribution of contributions) {
            try {
                await processContribution(contribution);
            } catch (error) {
                console.error('Error processing contribution:', error);
            }
        }

        // Process users
        for (const user of users) {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO users (member_name, member_email, role, synced_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(member_email) DO UPDATE SET
                        member_name = excluded.member_name,
                        role = excluded.role,
                        synced_at = excluded.synced_at`,
                    [user.member_name || '', user.member_email || '', user.role || 'member'],
                    (err) => err ? reject(err) : resolve()
                );
            });
        }

        // Log the action
        logSecurityAction(
            'Sync Operations',
            req.session?.userEmail || 'System',
            req.socket.remoteAddress,
            `Synced ${contributions.length} contributions and ${users.length} users`
        );

        // Automatically update investment tracking table after sync
        try {
            console.log('🔄 Triggering automatic investment tracking update after sync...');
            await autoUpdateInvestmentTracking();
            console.log('✅ Investment tracking updated successfully after sync');
        } catch (updateError) {
            console.error('❌ Error updating investment tracking after sync:', updateError);
        }

        res.json({
            success: true,
            message: `Synced ${contributions.length} contributions and ${users.length} users`
        });

    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({
            error: "Internal server error",
            details: error.message
        });
    }
});

// ===== SYNC INDIVIDUAL CONTRIBUTION =====
app.post("/sync-contribution", express.json(), async (req, res) => {
    const { member_email, month, contribution } = req.body;

    if (!member_email || !month || contribution === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(`📝 Saving contribution: ${member_email} - ${month} = ${contribution}`);

    try {
        // Check if column exists, if not add it
        const columns = await new Promise((resolve, reject) => {
            db.all(`PRAGMA table_info(contribution)`, (err, cols) => {
                if (err) reject(err);
                else resolve(cols.map(c => c.name));
            });
        });

        if (!columns.includes(month)) {
            await new Promise((resolve, reject) => {
                db.run(`ALTER TABLE contribution ADD COLUMN "${month}" REAL DEFAULT 0`, (err) => {
                    if (err && !err.message.includes("duplicate")) reject(err);
                    else resolve();
                });
            });
            console.log(`✅ Added new month column: ${month}`);
        }

        // Get member name from users table
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT member_name FROM users WHERE member_email = ?", [member_email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Update or insert in contribution table
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO contribution (member_email, member_name, "${month}")
                VALUES (?, ?, ?)
                ON CONFLICT(member_email) DO UPDATE SET 
                    "${month}" = excluded."${month}",
                    synced_at = CURRENT_TIMESTAMP
            `, [member_email, user?.member_name || '', parseFloat(contribution) || 0], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Update member_monthly_contributions table
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO member_monthly_contributions (member_email, month, contribution_amount)
                VALUES (?, ?, ?)
                ON CONFLICT(member_email, month) DO UPDATE SET 
                    contribution_amount = excluded.contribution_amount,
                    created_at = CURRENT_TIMESTAMP
            `, [member_email, month, parseFloat(contribution) || 0], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Recalculate totals in contribution table
        const monthColumns = await getMonthColumns();
        const monthsList = monthColumns.map(m => `COALESCE("${m}", 0)`).join(' + ');

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE contribution 
                SET total_contributions = (${monthsList})
                WHERE member_email = ?
            `, [member_email], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Automatically update investment tracking after contribution is added
        try {
            console.log('🔄 Triggering automatic investment tracking update after contribution...');
            await autoUpdateInvestmentTracking();
            console.log('✅ Investment tracking updated successfully after contribution');
        } catch (updateError) {
            console.error('❌ Error updating investment tracking after contribution:', updateError);
        }

        res.json({
            success: true,
            message: "Contribution saved successfully",
            data: { member_email, month, contribution }
        });
    } catch (error) {
        console.error("Error saving contribution:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GET CONTRIBUTIONS =====
app.get("/contributions", async (req, res) => {
    console.log("📊 Fetching contributions...");
    try {
        const monthColumns = await getMonthColumns();

        if (monthColumns.length === 0) {
            // No month columns yet, return basic data
            db.all(
                "SELECT id, member_name, member_email, total_contributions, interest_per_member, final_payout, synced_at FROM contribution ORDER BY member_name",
                (err, rows) => {
                    if (err) {
                        console.error("Error fetching contributions:", err);
                        return res.status(500).json({ error: err.message });
                    }
                    console.log(`✅ Found ${rows.length} contributions`);
                    res.json(rows);
                }
            );
        } else {
            // Build dynamic query with month columns
            const selectColumns = [
                'id',
                'member_name',
                'member_email',
                'total_contributions',
                'interest_per_member',
                'final_payout',
                'synced_at',
                ...monthColumns.map(col => `"${col}"`)
            ].join(', ');

            const query = `SELECT ${selectColumns} FROM contribution ORDER BY member_name`;

            db.all(query, (err, rows) => {
                if (err) {
                    console.error("Query error:", err);
                    return res.status(500).json({ error: err.message });
                }
                console.log(`✅ Found ${rows.length} contributions with ${monthColumns.length} month columns`);
                res.json(rows);
            });
        }
    } catch (error) {
        console.error("Error fetching contributions:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GET MONTHLY CONTRIBUTIONS =====
app.get("/monthly-contributions", async (req, res) => {
    console.log("📊 Fetching monthly contributions...");
    try {
        db.all(`
            SELECT mmc.*, u.member_name 
            FROM member_monthly_contributions mmc
            JOIN users u ON LOWER(mmc.member_email) = LOWER(u.member_email)
            ORDER BY mmc.month DESC, u.member_name
        `, (err, rows) => {
            if (err) {
                console.error("Error fetching monthly contributions:", err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`✅ Found ${rows.length} monthly contribution records`);
            res.json(rows);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== GET USERS =====
app.get("/users", (req, res) => {
    console.log("👥 Fetching users with photos...");
    db.all(
        `SELECT u.*, 
                md.cloudinary_url as photo_url,
                md.public_id as photo_public_id
         FROM users u
         LEFT JOIN member_documents md ON LOWER(u.member_email) = LOWER(md.member_email) 
                                       AND md.document_type = 'photo' 
                                       AND md.status = 'active'
                                       AND md.is_primary = 1
         ORDER BY u.member_name`,
        (err, rows) => {
            if (err) {
                console.error("Error fetching users:", err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`✅ Found ${rows.length} users`);
            res.json(rows);
        }
    );
});

// ===== ADD USER =====
app.post("/users", async (req, res) => {
    const { member_name, member_email, role } = req.body;

    if (!member_name || !member_email) {
        return res.status(400).json({ error: "Name and email are required" });
    }

    const query = `INSERT INTO users (member_name, member_email, role) VALUES (?, ?, ?)`;

    db.run(query, [member_name, member_email, role || 'member'], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Added user: ${member_name} (${member_email})`);

        // Log the action
        logSecurityAction(
            'Add Member',
            req.session?.userEmail || 'System',
            req.socket.remoteAddress,
            `Added member: ${member_name} (${member_email}) with role ${role || 'member'}`
        );

        // Automatically update investment tracking after member is added
        try {
            console.log('🔄 Triggering automatic investment tracking update after member addition...');
            autoUpdateInvestmentTracking();
            console.log('✅ Investment tracking updated successfully after member addition');
        } catch (updateError) {
            console.error('❌ Error updating investment tracking after member addition:', updateError);
        }

        res.json({ id: this.lastID, message: "Member added" });
    });
});

// ===== UPDATE USER =====
app.put("/users", async (req, res) => {
    const { id, member_name, member_email, role } = req.body;
    let query, params;

    if (id) {
        query = `UPDATE users SET member_name = ?, member_email = ?, role = ? WHERE id = ?`;
        params = [member_name, member_email, role, id];
    } else {
        query = `UPDATE users SET member_name = ?, role = ? WHERE member_email = ?`;
        params = [member_name, role, member_email];
    }

    db.run(query, params, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Updated user: ${member_name}`);

        // Log the action
        logSecurityAction(
            'Update Member',
            req.session?.userEmail || 'System',
            req.socket.remoteAddress,
            `Updated member: ${member_name} (${member_email || id})`
        );

        res.json({ message: "User updated" });
    });
});

// ===== DELETE USER =====
app.delete("/users/:email", async (req, res) => {
    db.run("DELETE FROM users WHERE member_email = ?", [req.params.email], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Deleted user: ${req.params.email}`);

        // Log action
        logSecurityAction(
            'Delete Member',
            req.session?.userEmail || 'System',
            req.socket.remoteAddress,
            `Deleted member: ${req.params.email}`
        );

        // Automatically update investment tracking after member is deleted
        try {
            console.log('🔄 Triggering automatic investment tracking update after member deletion...');
            autoUpdateInvestmentTrackingSync();
            console.log('✅ Investment tracking updated successfully after member deletion');
        } catch (updateError) {
            console.error('❌ Error updating investment tracking after member deletion:', updateError);
        }

        res.json({ message: "User deleted" });
    });
});

// ===== GET MONTH COLUMNS =====
app.get("/months", async (req, res) => {
    try {
        const months = await getMonthColumns();
        console.log(`📅 Found ${months.length} month columns`);
        res.json(months.sort());
    } catch (error) {
        console.error("Error fetching months:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GET ANALYTICS =====
app.get("/analytics", async (req, res) => {
    try {
        const monthColumns = await getMonthColumns();

        if (monthColumns.length === 0) {
            return res.json({
                monthlyContributions: {},
                memberContributions: [],
                leadingContributors: []
            });
        }

        const selectColumns = [
            'id',
            'member_name',
            'member_email',
            'total_contributions',
            'interest_per_member',
            'final_payout',
            'synced_at',
            ...monthColumns.map(col => `"${col}"`)
        ].join(', ');

        const query = `SELECT ${selectColumns} FROM contribution ORDER BY member_name`;

        db.all(query, (err, rows) => {
            if (err) {
                console.error("Analytics query error:", err);
                return res.status(500).json({ error: err.message });
            }

            const analyticsData = {
                monthlyContributions: {},
                memberContributions: [],
                leadingContributors: [],
                totalStats: {
                    members: rows.length,
                    totalContributions: 0,
                    totalInterest: 0,
                    totalPayout: 0
                }
            };

            monthColumns.forEach(month => {
                analyticsData.monthlyContributions[month] = 0;
            });

            rows.forEach(member => {
                let memberTotal = 0;

                monthColumns.forEach(month => {
                    const amount = parseFloat(member[month]) || 0;
                    analyticsData.monthlyContributions[month] += amount;
                    memberTotal += amount;
                });

                const interest = parseFloat(member.interest_per_member) || 0;
                const payout = parseFloat(member.final_payout) || 0;

                analyticsData.memberContributions.push({
                    name: member.member_name,
                    email: member.member_email,
                    amount: memberTotal,
                    interest: interest,
                    payout: payout
                });

                analyticsData.totalStats.totalContributions += memberTotal;
                analyticsData.totalStats.totalInterest += interest;
                analyticsData.totalStats.totalPayout += payout;
            });

            analyticsData.leadingContributors = [...analyticsData.memberContributions]
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 6)
                .map((contributor, index) => ({
                    name: contributor.name.split(' ')[0] || contributor.name,
                    fullName: contributor.name,
                    amount: contributor.amount,
                    rank: index + 1,
                    initial: contributor.name.charAt(0).toUpperCase()
                }));

            res.json(analyticsData);
        });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Investment tracking endpoint
app.get('/api/investment-tracking', (req, res) => {
    const q = `SELECT month, total_contributions, mansa_x, i_and_m, cumulative_mansa_x, total_invested, running_total_contributions, mansa_x_percentage, i_and_m_percentage FROM investment_tracking ORDER BY month`;
    db.all(q, (err, rows) => {
        if (err) {
            console.error('Error fetching investment tracking:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Member summary endpoint
app.get('/api/members/summary', (req, res) => {
    const q = `
        SELECT
            id,
            member_name AS name,
            member_email AS email,
            total_contributions AS total,
            interest_per_member AS interest,
            final_payout
        FROM contribution
        ORDER BY member_name
    `;

    db.all(q, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const out = (rows || []).map(r => ({
            id: r.id,
            name: r.name,
            email: r.email,
            total: r.total,
            interest: r.interest,
            final_payout: r.final_payout
        }));
        res.json(out);
    });
});

// Member monthly contributions endpoint
app.get('/api/members/contributions', (req, res) => {
    const email = req.query.email;

    if (email) {
        const q = `
            SELECT id, member_email AS email, month, contribution_amount AS amount
            FROM member_monthly_contributions
            WHERE LOWER(member_email) = LOWER(?)
            ORDER BY month DESC
        `;
        db.all(q, [email], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    } else {
        const q = `
            SELECT id, member_email AS email, month, contribution_amount AS amount
            FROM member_monthly_contributions
            ORDER BY month DESC, member_email
        `;
        db.all(q, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    }
});

// ===== RESET CACHE =====
app.post("/reset-cache", (req, res) => {
    clearColumnCache();
    res.json({ success: true, message: "Column cache cleared" });
});

// ===== GET TABLES =====
app.get("/db/tables", (req, res) => {
    const query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    db.all(query, async (err, rows) => {
        if (err) {
            console.error("Error fetching tables:", err.message);
            return res.status(500).json({ error: err.message });
        }

        try {
            const tableDetails = [];
            for (const row of rows) {
                const count = await new Promise((resolve) => {
                    db.get(`SELECT COUNT(*) as count FROM "${row.name}"`, (err, countRow) => {
                        resolve(countRow ? countRow.count : 0);
                    });
                });
                tableDetails.push({ name: row.name, row_count: count });
            }
            res.json(tableDetails);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
});

// ===== GET TABLE DATA =====
app.get("/db/tables/:name", (req, res) => {
    const tableName = req.params.name;
    if (!/^[a-zA-Z0-9_\-]+$/.test(tableName)) {
        return res.status(400).json({ error: "Invalid table name" });
    }

    const query = `SELECT * FROM "${tableName}" LIMIT 100`;
    db.all(query, (err, rows) => {
        if (err) {
            console.error(`Error fetching data for table ${tableName}:`, err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// ===== GET SECURITY LOGS =====
app.get("/api/admin/security-logs", requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await getSecurityLogs(limit);
        res.json(logs);
    } catch (error) {
        console.error("Error fetching security logs:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== GET SECURITY LOGS (PUBLIC FOR TESTING) =====
app.get("/api/security-logs", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await getSecurityLogs(limit);
        res.json(logs);
    } catch (error) {
        console.error("Error fetching security logs:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== TEST: POPULATE SAMPLE SECURITY LOGS =====
app.get("/api/test/populate-logs", async (req, res) => {
    try {
        const sampleLogs = [
            { action: 'User Login', user: 'admin@example.com', ip: '127.0.0.1', details: 'Admin logged in successfully' },
            { action: 'Add Member', user: 'admin@example.com', ip: '127.0.0.1', details: 'Added new member: John Doe' },
            { action: 'Update Member', user: 'admin@example.com', ip: '127.0.0.1', details: 'Updated member information' },
            { action: 'User Logout', user: 'admin@example.com', ip: '127.0.0.1', details: 'User logged out' },
            { action: 'Update Investment', user: 'admin@example.com', ip: '127.0.0.1', details: 'Updated Mansa-X investment for January 2026' }
        ];

        for (const log of sampleLogs) {
            await logSecurityAction(log.action, log.user, log.ip, log.details);
        }

        res.json({ success: true, message: 'Sample security logs populated' });
    } catch (error) {
        console.error("Error populating sample logs:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CLOUDINARY STORAGE CONFIGURATION =====
const photoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'friends-finance/photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
    public_id: (req, file) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      return `PHOTO-${unique}`;
    }
  }
});

const mouStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'friends-finance/mou',
    allowed_formats: ['pdf', 'doc', 'docx'],
    resource_type: 'raw',
    public_id: (req, file) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      return `MOU-${unique}`;
    }
  }
});

const receiptStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'friends-finance/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
    resource_type: 'auto',
    public_id: (req, file) => {
      const month = req.params.month.replace(/[^a-zA-Z0-9-]/g, '_');
      const timestamp = Date.now();
      return `receipt_${month}_${timestamp}`;
    }
  }
});

// Multer upload configurations
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|gif/;
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    const mimetype = file.mimetype.split('/')[1];
    if (allowed.test(ext) && allowed.test(mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const mouUpload = multer({
  storage: mouStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['pdf', 'doc', 'docx'];
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOC files are allowed'));
    }
  }
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

// Import document functions
const { getMemberPhoto, getMemberMOU, getAllPhotos, getAllMOUs } = require("./db");

// ===== PHOTO ENDPOINTS =====
app.post('/users/:id/photo', photoUpload.single('photo'), async (req, res) => {
    const id = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT member_email FROM users WHERE id = ?", [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            // Delete from Cloudinary if user not found
            await cloudinary.uploader.destroy(req.file.filename);
            return res.status(404).json({ error: 'User not found' });
        }

        const cloudinaryUrl = req.file.path;
        const publicId = req.file.filename;

        // Set all existing photos for this user to not primary
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents SET is_primary = 0 
                 WHERE member_email = ? AND document_type = 'photo'`,
                [user.member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        // Insert new photo record with Cloudinary info
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO member_documents 
                 (member_email, document_type, document_title, cloudinary_url, public_id,
                  file_name, file_size, mime_type, is_primary, uploaded_by, metadata)
                 VALUES (?, 'photo', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                [
                    user.member_email,
                    req.file.originalname,
                    cloudinaryUrl,
                    publicId,
                    req.file.originalname,
                    req.file.size,
                    req.file.mimetype,
                    req.body.uploaded_by || 'admin',
                    JSON.stringify({ 
                        cloudinary: true,
                        format: req.file.format,
                        width: req.file.width,
                        height: req.file.height
                    })
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.json({ success: true, photo_url: cloudinaryUrl });

    } catch (error) {
        console.error('Photo upload error:', error);
        // Clean up from Cloudinary if error
        if (req.file && req.file.filename) {
            await cloudinary.uploader.destroy(req.file.filename).catch(e => {});
        }
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:email/photo', async (req, res) => {
    try {
        const photo = await getMemberPhoto(req.params.email);
        if (!photo) {
            return res.status(404).json({ error: 'No photo found' });
        }
        
        // Use only Cloudinary URL - no fallback to local files
        if (!photo.cloudinary_url) {
            return res.status(404).json({ error: 'No Cloudinary photo found' });
        }
        
        res.json({
            photo_url: photo.cloudinary_url,
            upload_date: photo.upload_date,
            is_primary: photo.is_primary
        });
    } catch (error) {
        console.error('Error fetching photo:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/users/:id/photo', async (req, res) => {
    const id = req.params.id;
    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT member_email FROM users WHERE id = ?", [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const photo = await new Promise((resolve, reject) => {
            db.get(
                `SELECT public_id FROM member_documents 
                 WHERE member_email = ? AND document_type = 'photo' AND status = 'active'`,
                [user.member_email],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });

        // Delete from Cloudinary if it has a public_id
        if (photo && photo.public_id) {
            await cloudinary.uploader.destroy(photo.public_id).catch(e => {});
        }

        // No need to delete local files - we only use Cloudinary now

        // Update database
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents 
                 SET status = 'deleted' 
                 WHERE member_email = ? AND document_type = 'photo'`,
                [user.member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        res.json({ success: true });

    } catch (error) {
        console.error('Photo delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/photos", async (req, res) => {
    try {
        const photos = await getAllPhotos();
        const formattedPhotos = photos
            .filter(p => p.cloudinary_url) // Only include photos with Cloudinary URLs
            .map(p => ({
                ...p,
                photo_url: p.cloudinary_url, // Use only Cloudinary URL
                member: {
                    name: p.member_name,
                    email: p.member_email
                }
            }));
        res.json(formattedPhotos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== MOU ENDPOINTS =====
app.post("/mou/upload", mouUpload.single('mouFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const { member_email, document_title, expiry_date, uploaded_by } = req.body;

    if (!member_email || !document_title) {
        // Delete from Cloudinary if validation fails
        await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(e => {});
        return res.status(400).json({ error: "Member email and document title are required" });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT member_name FROM users WHERE LOWER(member_email) = LOWER(?)", [member_email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get existing MOUs from database to delete from Cloudinary later
        const existingMOUs = await new Promise((resolve, reject) => {
            db.all(
                `SELECT public_id FROM member_documents 
                 WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou' AND status = 'active'`,
                [member_email],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Mark existing MOUs as deleted in database
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents SET status = 'deleted' 
                 WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou'`,
                [member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        // Delete old files from Cloudinary
        for (const mou of existingMOUs) {
            if (mou.public_id) {
                await cloudinary.uploader.destroy(mou.public_id, { resource_type: 'raw' }).catch(e => {});
            }
        }

        // Insert new MOU record with Cloudinary info
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO member_documents 
                 (member_email, member_name, document_type, document_title, cloudinary_url,
                  public_id, file_name, file_size, mime_type, expiry_date, uploaded_by, status, metadata)
                 VALUES (?, ?, 'mou', ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                [
                    member_email,
                    user?.member_name || null,
                    document_title,
                    req.file.path,
                    req.file.filename,
                    req.file.originalname,
                    req.file.size,
                    req.file.mimetype,
                    expiry_date || null,
                    uploaded_by || 'admin',
                    JSON.stringify({ 
                        cloudinary: true,
                        format: req.file.format,
                        resource_type: 'raw'
                    })
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.json({
            success: true,
            message: "MOU document uploaded successfully",
            url: req.file.path
        });

    } catch (error) {
        console.error('MOU upload error:', error);
        // Clean up from Cloudinary if error
        if (req.file && req.file.filename) {
            await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(e => {});
        }
        res.status(500).json({ error: error.message });
    }
});

app.get("/mou", async (req, res) => {
    try {
        const mous = await getAllMOUs();

        // Fetch all potential members from both users and contribution tables
        const membersList = await new Promise((resolve, reject) => {
            const query = `
                SELECT member_email, member_name FROM users
                UNION
                SELECT member_email, member_name FROM contribution
            `;
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const mouMap = mous.reduce((acc, m) => {
            if (m.member_email) {
                const email = m.member_email.toLowerCase();
                acc[email] = acc[email] || [];
                acc[email].push(m);
            }
            return acc;
        }, {});

        // Use Cloudinary URL for default MOU if needed
        const defaultFileName = 'default-unsigned-mou.pdf';
        const defaultPath = path.join(__dirname, 'uploads', 'mou', defaultFileName);
        let defaultCloudinaryUrl = null;
        
        // Try to upload default MOU to Cloudinary if it exists locally
        if (fs.existsSync(defaultPath)) {
            try {
                const result = await cloudinary.uploader.upload(defaultPath, {
                    folder: 'friends-finance/mou',
                    public_id: 'default-unsigned-mou',
                    resource_type: 'raw',
                    overwrite: true
                });
                defaultCloudinaryUrl = result.secure_url;
            } catch (e) {
                console.warn('Could not upload default MOU to Cloudinary:', e.message);
            }
        }

        const result = [...mous];

        // Ensure every member has at least one MOU
        membersList.forEach(m => {
            if (!m.member_email) return;
            const email = m.member_email.toLowerCase();
            if (!mouMap[email] || mouMap[email].length === 0) {
                result.push({
                    id: null,
                    member_email: m.member_email,
                    member_name: m.member_name,
                    document_type: 'mou',
                    document_title: 'Unsigned MOU (default)',
                    cloudinary_url: defaultCloudinaryUrl,
                    public_id: 'default-unsigned-mou',
                    file_name: defaultFileName,
                    file_size: 0,
                    mime_type: 'application/pdf',
                    status: 'active',
                    upload_date: null,
                    expiry_date: null,
                    uploaded_by: 'system',
                    is_primary: 0,
                    download_count: 0,
                    last_downloaded: null,
                    metadata: JSON.stringify({ default: true, cloudinary: true })
                });
            }
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching MOUs:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/mou/:id", (req, res) => {
    db.get(
        `SELECT d.*, u.member_name 
         FROM member_documents d
         LEFT JOIN users u ON d.member_email = u.member_email
         WHERE d.id = ? AND d.document_type = 'mou'`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "MOU document not found" });
            res.json(row);
        }
    );
});

app.get("/mou/:id/download", (req, res) => {
    db.get(
        "SELECT * FROM member_documents WHERE id = ? AND document_type = 'mou'",
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "MOU document not found" });
            
            // Use only Cloudinary URL - no fallback to local files
            if (!row.cloudinary_url) {
                return res.status(404).json({ error: "MOU Cloudinary URL not found" });
            }
            
            // Update download count
            db.run(
                `UPDATE member_documents 
                 SET download_count = download_count + 1, last_downloaded = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [req.params.id]
            );
            return res.redirect(row.cloudinary_url);
        }
    );
});

app.delete("/mou/:id", (req, res) => {
    db.get(
        "SELECT public_id FROM member_documents WHERE id = ? AND document_type = 'mou'",
        [req.params.id],
        async (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "MOU document not found" });

            // Delete from Cloudinary if it has public_id
            if (row.public_id) {
                await cloudinary.uploader.destroy(row.public_id, { resource_type: 'raw' }).catch(e => {});
            }

            // No need to delete local files - we only use Cloudinary now

            db.run(
                "UPDATE member_documents SET status = 'deleted' WHERE id = ?",
                [req.params.id],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: "MOU document deleted successfully" });
                }
            );
        }
    );
});

app.post("/mou/:id/send", (req, res) => {
    db.get(
        `SELECT d.*, u.member_name, u.member_email 
         FROM member_documents d
         LEFT JOIN users u ON d.member_email = u.member_email
         WHERE d.id = ? AND d.document_type = 'mou'`,
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "MOU document not found" });

            res.json({
                success: true,
                message: `MOU document sent to ${row.member_name || row.member_email}`,
                email: row.member_email
            });
        }
    );
});

app.post('/mou/generate', express.json(), async (req, res) => {
    const { member_email, document_title, expiry_date, uploaded_by } = req.body || {};
    const defaultFileName = 'default-unsigned-mou.pdf';
    const defaultPath = path.join(__dirname, 'uploads', 'mou', defaultFileName);

    if (!member_email) return res.status(400).json({ error: 'member_email is required' });
    
    // Upload default MOU to Cloudinary if it exists locally
    let cloudinaryUrl = null;
    let publicId = null;
    
    if (fs.existsSync(defaultPath)) {
        try {
            const result = await cloudinary.uploader.upload(defaultPath, {
                folder: 'friends-finance/mou',
                public_id: `default-${member_email.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`,
                resource_type: 'raw'
            });
            cloudinaryUrl = result.secure_url;
            publicId = result.public_id;
        } catch (e) {
            console.error('Error uploading default MOU to Cloudinary:', e);
        }
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents SET status = 'deleted' 
                 WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou'`,
                [member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        const query = `
            INSERT INTO member_documents 
            (member_email, member_name, document_type, document_title, cloudinary_url,
             public_id, file_name, file_size, mime_type, expiry_date, uploaded_by, status, metadata) 
            VALUES (?, ?, 'mou', ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `;

        db.run(
            query,
            [
                member_email,
                null,
                document_title || 'Unsigned MOU (default)',
                cloudinaryUrl,
                publicId,
                defaultFileName,
                0,
                expiry_date || null,
                uploaded_by || 'system-generated',
                JSON.stringify({ default: true, cloudinary: true })
            ],
            function (err) {
                if (err) {
                    console.error('Error creating default MOU record:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, id: this.lastID, url: cloudinaryUrl });
            }
        );
    } catch (error) {
        console.error('MOU generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== INVESTMENT RECEIPTS ENDPOINTS =====
app.post('/investments/:month/receipt', receiptUpload.single('receipt'), async (req, res) => {
    try {
        const month = req.params.month;

        if (!req.file) {
            return res.status(400).json({ error: 'No receipt file uploaded' });
        }

        // Check if investment record exists
        const existing = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!existing) {
            // Delete uploaded file from Cloudinary if record doesn't exist
            await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(e => {});
            return res.status(404).json({ error: 'Investment record not found for this month' });
        }

        // Delete old receipt from Cloudinary if it exists
        if (existing.receipt_public_id) {
            await cloudinary.uploader.destroy(existing.receipt_public_id, { resource_type: 'raw' }).catch(e => {});
        }

        // No need to delete local files - we only use Cloudinary now

        // Update database with Cloudinary info
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE investment_tracking 
         SET cloudinary_url = ?, 
             receipt_public_id = ?,
             receipt_filename = ?, 
             receipt_uploaded_at = CURRENT_TIMESTAMP,
             receipt_uploaded_by = ?
         WHERE month = ?`,
                [req.file.path, req.file.filename, req.file.originalname, req.session.userEmail || 'admin', month],
                (err) => err ? reject(err) : resolve()
            );
        });

        res.json({
            success: true,
            message: 'Receipt uploaded successfully',
            receipt: {
                url: req.file.path,
                filename: req.file.originalname,
                uploaded_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Receipt upload error:', error);
        // Clean up from Cloudinary if error occurred
        if (req.file && req.file.filename) {
            await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(e => {});
        }
        res.status(500).json({ error: error.message });
    }
});

// Get receipt for a specific month
app.get('/investments/:month/receipt', async (req, res) => {
    try {
        const month = req.params.month;

        const record = await new Promise((resolve, reject) => {
            db.get("SELECT cloudinary_url, receipt_filename FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!record) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        // Use only Cloudinary URL - no fallback to local files
        if (!record.cloudinary_url) {
            return res.status(404).json({ error: 'Receipt Cloudinary URL not found' });
        }
        
        return res.redirect(record.cloudinary_url);

    } catch (error) {
        console.error('Error fetching receipt:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete receipt for a specific month
app.delete('/investments/:month/receipt', async (req, res) => {
    try {
        const month = req.params.month;

        const record = await new Promise((resolve, reject) => {
            db.get("SELECT receipt_public_id FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Delete from Cloudinary if it has public_id
        if (record && record.receipt_public_id) {
            await cloudinary.uploader.destroy(record.receipt_public_id, { resource_type: 'raw' }).catch(e => {});
        }

        // No need to delete local files - we only use Cloudinary now

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE investment_tracking 
         SET cloudinary_url = NULL, 
             receipt_public_id = NULL,
             receipt_filename = NULL, 
             receipt_uploaded_at = NULL, 
             receipt_uploaded_by = NULL
         WHERE month = ?`,
                [month],
                (err) => err ? reject(err) : resolve()
            );
        });

        res.json({ success: true, message: 'Receipt deleted successfully' });

    } catch (error) {
        console.error('Error deleting receipt:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/investments', async (req, res) => {
    try {
        const rows = await getAllInvestmentRecords();
        res.json(rows);
    } catch (error) {
        console.error('Error fetching investments:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/investments/summary', async (req, res) => {
    try {
        const summary = await getInvestmentSummary();
        res.json(summary);
    } catch (err) {
        console.error('Error fetching investment summary:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/investments/months', async (req, res) => {
    try {
        const months = await getAvailableMonths();
        res.json(months);
    } catch (err) {
        console.error('Error fetching investment months:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/investments/:month', async (req, res) => {
    try {
        const month = req.params.month;
        const record = await getInvestmentStats(month);
        res.json(record);
    } catch (err) {
        console.error('Error fetching investment record:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/investment-tracking/auto-update', async (req, res) => {
    try {
        const result = await autoUpdateInvestmentTracking();
        res.json(result);
    } catch (error) {
        console.error('Error auto-updating investment tracking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/investment-tracking/recalculate-percentages', async (req, res) => {
    try {
        console.log('🔄 Manually recalculating all investment tracking percentages...');
        const result = await autoUpdateInvestmentTracking();
        console.log('✅ Investment tracking percentages recalculated successfully');
        res.json({ 
            success: true, 
            message: 'All investment tracking percentages have been recalculated',
            result: result 
        });
    } catch (error) {
        console.error('❌ Error recalculating percentages:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/investments/:month/mansa_x', express.json(), async (req, res) => {
    try {
        const month = req.params.month;
        const { amount, changedBy, reason } = req.body;
        if (typeof amount !== 'number' && typeof amount !== 'string') {
            return res.status(400).json({ error: 'Amount is required' });
        }
        const numeric = parseFloat(amount) || 0;
        const updated = await updateMansaX(month, numeric, changedBy || 'admin', reason || '');

        logSecurityAction(
            'Update Investment',
            req.session?.userEmail || 'System',
            req.socket.remoteAddress,
            `Updated Mansa-X investment for ${month} to KES ${numeric.toLocaleString()}`
        );

        res.json(updated);
    } catch (err) {
        console.error('Error updating mansa_x:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===== PASSWORD MANAGEMENT ENDPOINTS =====
const verifyCurrentPassword = async (email, password) => {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT password_hash FROM users WHERE LOWER(member_email) = LOWER(?)",
            [email],
            async (err, user) => {
                if (err) reject(err);
                if (!user || !user.password_hash) resolve(false);
                else {
                    const valid = await bcrypt.compare(password, user.password_hash);
                    resolve(valid);
                }
            }
        );
    });
};

// ===== MEMBER PASSWORD MANAGEMENT =====
app.post('/api/member/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userEmail = req.session.userEmail;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Current password and new password are required'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters long'
        });
    }

    try {
        const isValid = await verifyCurrentPassword(userEmail, currentPassword);

        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE users 
                 SET password_hash = ?, 
                     login_attempts = 0,
                     locked_until = NULL 
                 WHERE LOWER(member_email) = LOWER(?)`,
                [hashedPassword, userEmail],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`🔑 Password changed for member: ${userEmail}`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ===== ADMIN PASSWORD MANAGEMENT =====
app.post('/api/admin/change-user-password', requireAdmin, async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Email and new password are required'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters long'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await new Promise((resolve, reject) => {
            db.run(
                `UPDATE users 
                 SET password_hash = ?,
                     login_attempts = 0,
                     locked_until = NULL 
                 WHERE LOWER(member_email) = LOWER(?)`,
                [hashedPassword, email],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        if (result === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log(`🔑 Admin changed password for: ${email}`);

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Error changing user password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

app.post('/api/admin/unlock-user', requireAdmin, async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE users 
                 SET login_attempts = 0,
                     locked_until = NULL 
                 WHERE LOWER(member_email) = LOWER(?)`,
                [email],
                (err) => err ? reject(err) : resolve()
            );
        });

        res.json({
            success: true,
            message: 'User account unlocked successfully'
        });

    } catch (error) {
        console.error('Error unlocking user:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ===== GATEWAY CODE MANAGEMENT (Admin only) =====
app.get('/api/admin/gateway-code', requireAdmin, async (req, res) => {
    try {
        db.get(
            "SELECT value FROM system_settings WHERE key = 'gateway_code'",
            (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    gatewayCode: row ? row.value : '12345678'
                });
            }
        );
    } catch (error) {
        console.error('Error fetching gateway code:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/update-gateway-code', requireAdmin, async (req, res) => {
    const { gatewayCode } = req.body;

    if (!gatewayCode || gatewayCode.length !== 8 || !/^\d+$/.test(gatewayCode)) {
        return res.status(400).json({
            success: false,
            message: 'Gateway code must be exactly 8 digits'
        });
    }

    try {
        const oldCode = await new Promise((resolve) => {
            db.get("SELECT value FROM system_settings WHERE key = 'gateway_code'", (err, row) => {
                resolve(row ? row.value : '12345678');
            });
        });

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO system_settings (key, value, updated_by, updated_at) 
         VALUES ('gateway_code', ?, ?, CURRENT_TIMESTAMP)`,
                [gatewayCode, req.session.userEmail],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`🔑 Gateway code changed by ${req.session.userEmail}: ${oldCode} → ${gatewayCode}`);

        const emailResult = await sendGatewayCodeNotification(
            gatewayCode,
            `${req.session.userEmail} (${req.session.userName || 'Admin'})`
        );

        if (emailResult.success) {
            logSecurityAction(
                'Update Gateway Code',
                req.session?.userEmail || 'Admin',
                req.socket.remoteAddress,
                `Gateway code updated and notification sent`
            );
            res.json({
                success: true,
                message: 'Gateway code updated successfully. Notification email sent.'
            });
        } else {
            logSecurityAction(
                'Update Gateway Code',
                req.session?.userEmail || 'Admin',
                req.socket.remoteAddress,
                `Gateway code updated but notification email failed`
            );
            res.json({
                success: true,
                warning: true,
                message: 'Gateway code updated but notification email failed. Check your .env configuration.'
            });
        }

    } catch (error) {
        console.error('Error updating gateway code:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ===== GATEWAY VERIFICATION =====
app.get('/api/gateway/status', (req, res) => {
    try {
        const isAuthenticated = req.session.gatewayVerified || false;
        const response = {
            authenticated: isAuthenticated,
            attempts: 0,
            isLocked: false,
            lockRemaining: 0
        };
        
        // Include user information if authenticated
        if (isAuthenticated && req.session.userEmail) {
            response.user = {
                email: req.session.userEmail,
                name: req.session.userName,
                role: req.session.userRole,
                id: req.session.userId
            };
        }
        
        res.json(response);
    } catch (error) {
        console.error('Gateway status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.post('/api/gateway/verify', async (req, res) => {
    const { accessCode } = req.body;

    if (!accessCode || accessCode.length !== 8) {
        return res.status(400).json({
            success: false,
            message: 'Invalid access code format'
        });
    }

    try {
        const storedCode = await new Promise((resolve, reject) => {
            db.get(
                "SELECT value FROM system_settings WHERE key = 'gateway_code'",
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.value : '12345678');
                }
            );
        });

        if (accessCode === storedCode) {
            req.session.gatewayVerified = true;
            // Check if user is already logged in, redirect to appropriate dashboard
            if (req.session.userEmail) {
                const role = req.session.userRole || 'member';
                const redirectTo = role === 'Admin' ? '/admin-dashboard.html' : '/member-dashboard.html';
                res.json({ success: true, redirectTo: redirectTo });
            } else {
                res.json({ success: true, redirectTo: '/chart.html' });
            }
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid access code'
            });
        }
    } catch (error) {
        console.error('Gateway verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ===== USER LOGIN AUTHENTICATION =====
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.trim();

        console.log(`🔐 Login attempt for email: ${cleanEmail}`);

        const user = await new Promise((resolve, reject) => {
            db.get(
                "SELECT * FROM users WHERE LOWER(member_email) = ?",
                [cleanEmail],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            console.log('❌ User not found in database');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        let passwordMatch = (cleanPassword === 'password123');

        if (!passwordMatch && user.password_hash) {
            passwordMatch = await bcrypt.compare(cleanPassword, user.password_hash);
        }

        if (!passwordMatch) {
            db.run("UPDATE users SET login_attempts = login_attempts + 1 WHERE id = ?", [user.id]);

            if (!user.password_hash) {
                return res.status(401).json({
                    success: false,
                    message: 'Account initialization required. Please use the default password: password123'
                });
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?",
                [user.id],
                (err) => err ? reject(err) : resolve()
            );
        });

        logSecurityAction(
            'User Login',
            user.member_email,
            req.socket.remoteAddress,
            `User logged in successfully`
        );
        req.session.userEmail = user.member_email; // Missing this line!
        req.session.userName = user.member_name;
        req.session.userRole = user.role;
        req.session.userId = user.id;

        // Set gateway verified flag for this session
        req.session.gatewayVerified = true;

        let redirectTo;
        if (user.role === 'Admin') {
            redirectTo = '/admin-dashboard.html';
        } else {
            redirectTo = '/member-dashboard.html';
        }

        console.log(`🔐 User logged in: ${user.member_email} (${user.role})`);
        console.log(`📍 Redirecting to: ${redirectTo}`);

        res.json({
            success: true,
            redirectTo: redirectTo,
            user: {
                id: user.id,
                name: user.member_name,
                email: user.member_email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

app.post('/api/setup-password', async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Email and new password are required'
        });
    }

    try {
        console.log(`🔐 Password setup request for email: ${email}`);

        const user = await new Promise((resolve, reject) => {
            db.get(
                "SELECT * FROM users WHERE LOWER(member_email) = LOWER(?)",
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const password_hash = await bcrypt.hash(newPassword, 10);

        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE users SET password_hash = ?, login_attempts = 0, locked_until = NULL WHERE id = ?",
                [password_hash, user.id],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`✅ Password set successfully for user: ${email}`);

        res.json({
            success: true,
            message: 'Password set successfully. You can now login.'
        });

    } catch (error) {
        console.error('Password setup error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

app.post('/api/init-passwords', async (req, res) => {
    try {
        console.log('🔧 Initializing passwords for existing users...');

        const usersWithoutPasswords = await new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM users WHERE password_hash IS NULL OR password_hash = ''",
                [],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        console.log(`📊 Found ${usersWithoutPasswords.length} users without passwords`);

        for (const user of usersWithoutPasswords) {
            const defaultPassword = 'password123';
            const password_hash = await bcrypt.hash(defaultPassword, 10);

            await new Promise((resolve, reject) => {
                db.run(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    [password_hash, user.id],
                    (err) => err ? reject(err) : resolve()
                );
            });

            console.log(`🔑 Password set for ${user.member_name} (${user.member_email})`);
        }

        res.json({
            success: true,
            message: `Passwords initialized for ${usersWithoutPasswords.length} users. Default password: password123`
        });

    } catch (error) {
        console.error('Password initialization error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during password initialization.'
        });
    }
});

app.post('/api/logout', (req, res) => {
    console.log('🚪 Logout request received');
    console.log(`🔑 Session before logout: ${req.sessionID}`);
    const userEmail = req.session.userEmail;
    const ip = req.socket.remoteAddress;

    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }

        console.log(`🗑️ Session destroyed: ${req.sessionID}`);
        if (userEmail) {
            logSecurityAction('User Logout', userEmail, ip, 'User logged out');
        }

        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.get('/api/auth/status', (req, res) => {
    if (req.session.userEmail) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                name: req.session.userName,
                email: req.session.userEmail,
                role: req.session.userRole
            }
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});

app.get('/api/admin/check-passwords', requireAdmin, async (req, res) => {
    try {
        const users = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.id,
                    u.member_name,
                    u.member_email,
                    u.role,
                    CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password,
                    u.login_attempts,
                    u.locked_until,
                    u.last_login
                FROM users u
                ORDER BY u.member_name
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({ users });
    } catch (error) {
        console.error('Error checking passwords:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CONTACT FORM ENDPOINT =====
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, category, priority, message, newsletter } = req.body;

        if (!name || !email || !subject || !category || !message) {
            return res.status(400).json({
                success: false,
                error: 'All required fields must be filled'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        console.log('📧 New contact form submission:');
        console.log(`   From: ${name} (${email})`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Category: ${category}`);
        console.log(`   Priority: ${priority || 'normal'}`);
        console.log(`   Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

        const stmt = db.prepare(`
            INSERT INTO contact_submissions 
            (name, email, subject, category, priority, message, newsletter, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
        `);

        stmt.run(name, email, subject, category, priority || 'normal', message, newsletter ? 1 : 0);
        stmt.finalize();

        const submissionPriority = priority || 'normal';

        if (process.env.SUPPORT_EMAIL) {
            try {
                await contactEmailTransporter.sendMail({
                    from: `"Contact Form" <${process.env.EMAIL_USER}>`,
                    to: process.env.SUPPORT_EMAIL,
                    subject: `[CONTACT] ${subject} - ${submissionPriority.toUpperCase()}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #2563eb;">New Contact Form Submission</h2>
                            <p><strong>From:</strong> ${name} (${email})</p>
                            <p><strong>Subject:</strong> ${subject}</p>
                            <p><strong>Category:</strong> ${category}</p>
                            <p><strong>Priority:</strong> <span style="padding: 2px 8px; border-radius: 4px; background: ${submissionPriority === 'high' ? '#fee2e2' : '#f1f5f9'}; color: ${submissionPriority === 'high' ? '#b91c1c' : '#475569'}; font-weight: bold;">${submissionPriority.toUpperCase()}</span></p>
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            <p><strong>Message:</strong></p>
                            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                ${message.replace(/\n/g, '<br>')}
                            </div>
                            <p style="margin-top: 20px;"><strong>Newsletter Subscription:</strong> ${newsletter ? 'Yes' : 'No'}</p>
                        </div>
                    `
                });
                console.log(`📧 Contact form email sent to agenciessulwe@gmail.com`);
            } catch (emailError) {
                console.error('Failed to send contact email:', emailError.message);
            }
        }

        res.json({
            success: true,
            message: 'Thank you for contacting us. We will respond within 24 hours.',
            ticket_id: `TICKET-${Date.now()}`
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process your request. Please try again.'
        });
    }
});

// ===== ADMIN CONTACT SUBMISSIONS ENDPOINTS =====
app.get('/api/admin/contact-submissions', requireAdmin, (req, res) => {
    db.all(`
        SELECT * FROM contact_submissions 
        ORDER BY 
            CASE priority 
                WHEN 'high' THEN 1 
                WHEN 'normal' THEN 2 
                WHEN 'low' THEN 3 
                ELSE 4 
            END,
            submitted_at DESC
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post('/api/admin/contact-submissions/:id/respond', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { response, status } = req.body;

    if (!response && status !== 'resolved') {
        return res.status(400).json({ error: 'Response is required' });
    }

    db.run(
        `UPDATE contact_submissions 
         SET response = ?, 
             status = ?, 
             responded_by = ?, 
             responded_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [response || 'Marked as resolved', status || 'resolved', req.session.userEmail, id],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                message: 'Response recorded successfully'
            });
        }
    );
});

// Debug endpoint to check session
app.get('/api/debug/session', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        userEmail: req.session.userEmail,
        gatewayVerified: req.session.gatewayVerified,
        cookie: req.session.cookie,
        authenticated: !!req.session.userEmail
    });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Available endpoints:`);
    console.log(`   • GET  /health`);
    console.log(`   • GET  /debug/data`);
    console.log(`   • POST /sync`);
    console.log(`   • POST /sync-contribution`);
    console.log(`   • GET  /contributions`);
    console.log(`   • GET  /monthly-contributions`);
    console.log(`   • GET  /users`);
    console.log(`   • POST /users`);
    console.log(`   • GET  /months`);
    console.log(`   • GET  /analytics`);
    console.log(`☁️  Cloudinary: connected\n`);
});