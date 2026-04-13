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

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 1024 * 60 * 60 * 1000 } // 24 hours
}));

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

// ===== ROOT ROUTE - REDIRECT TO CHART =====
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: db.filename || "contributions.db"
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
                md.file_url as photo_url,
                md.document_title as photo_title
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

// --- New API endpoints for dashboards ---

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
        // Normalize output keys
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

// Member monthly contributions endpoint (optionally filter by email)
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
    // Allow alphanumeric and underscores, but be careful of SQL injection
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

// ===== DOCUMENT MANAGEMENT =====
const photosDir = path.join(__dirname, 'uploads', 'photos');
const mouDir = path.join(__dirname, 'uploads', 'mou');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
if (!fs.existsSync(mouDir)) fs.mkdirSync(mouDir, { recursive: true });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import document functions
const { getMemberPhoto, getMemberMOU, getAllPhotos, getAllMOUs } = require("./db");

// ===== PHOTO ENDPOINTS =====
const photoStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, photosDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'PHOTO-' + unique + ext);
    }
});

const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowed = /jpeg|jpg|png|gif/;
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.test(ext) && allowed.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Configure multer for receipt uploads
const receiptStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const receiptDir = path.join(__dirname, 'uploads', 'receipts');
        if (!fs.existsSync(receiptDir)) {
            fs.mkdirSync(receiptDir, { recursive: true });
        }
        cb(null, receiptDir);
    },
    filename: function (req, file, cb) {
        const month = req.params.month.replace(/[^a-zA-Z0-9-]/g, '_');
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `receipt_${month}_${timestamp}${ext}`);
    }
});

const receiptUpload = multer({
    storage: receiptStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /pdf|jpg|jpeg|png|gif/;
        const ext = path.extname(file.originalname).toLowerCase();
        const allowed = allowedTypes.test(ext) &&
            (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf');

        if (allowed) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files (jpg, png, gif) are allowed'));
        }
    }
});


app.post('/users/:id/photo', express.json(), async (req, res) => {
    const id = req.params.id;
    const { file_url } = req.body;

    if (!file_url) {
        return res.status(400).json({ error: 'Photo URL is required' });
    }

    // Validate URL format
    try {
        new URL(file_url);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

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

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents SET is_primary = 0 
                 WHERE member_email = ? AND document_type = 'photo'`,
                [user.member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO member_documents 
                 (member_email, document_type, document_title, file_url, is_primary, uploaded_by, metadata)
                 VALUES (?, 'photo', ?, ?, 1, ?, ?)`,
                [
                    user.member_email,
                    'Profile Photo',
                    file_url,
                    req.body.uploaded_by || 'admin',
                    JSON.stringify({ upload_source: 'url', upload_date: new Date().toISOString() })
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.json({ success: true, photo_url: file_url });

    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for Google Drive images
app.get('/proxy/image', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        // Fetch the image from Google Drive
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch image' });
        }

        // Set appropriate headers
        res.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        // Get the image data as buffer and send it
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (error) {
        console.error('Proxy image error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:email/photo', async (req, res) => {
    try {
        const photo = await getMemberPhoto(req.params.email);
        if (!photo) {
            return res.status(404).json({ error: 'No photo found' });
        }
        
        // Handle Google Drive URLs
        let photoUrl = photo.file_url;
        if (photoUrl && photoUrl.includes('drive.google.com')) {
            // Convert Google Drive URL to proxy URL
            const fileId = photoUrl.match(/\/file\/d\/([^\/]+)/);
            if (fileId && fileId[1]) {
                const directUrl = `https://drive.google.com/uc?export=view&id=${fileId[1]}`;
                photoUrl = `${req.protocol}://${req.get('host')}/proxy/image?url=${encodeURIComponent(directUrl)}`;
            }
        } else if (photoUrl && photoUrl.startsWith('/uploads/')) {
            // Keep local file URLs as is
            photoUrl = photoUrl;
        } else if (photo.file_name) {
            // Fallback to local file path
            photoUrl = `/uploads/photos/${photo.file_name}`;
        }
        
        res.json({
            photo_url: photoUrl,
            upload_date: photo.upload_date,
            document_title: photo.document_title
        });
    } catch (error) {
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
                `SELECT file_path FROM member_documents 
                 WHERE member_email = ? AND document_type = 'photo' AND status = 'active'`,
                [user.member_email],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_documents 
                 SET status = 'deleted' 
                 WHERE member_email = ? AND document_type = 'photo'`,
                [user.member_email],
                (err) => err ? reject(err) : resolve()
            );
        });

        if (photo && fs.existsSync(photo.file_path)) {
            try { fs.unlinkSync(photo.file_path); } catch (e) { }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Photo delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/photos", async (req, res) => {
    try {
        const photos = await getAllPhotos();
        const formattedPhotos = photos.map(p => ({
            ...p,
            photo_url: `/uploads/photos/${p.file_name}`,
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
const mouStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, mouDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'MOU-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const mouUpload = multer({
    storage: mouStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOC files are allowed'));
        }
    }
});

app.post("/mou/upload", express.json(), async (req, res) => {
    const { member_email, document_title, expiry_date, uploaded_by, file_url } = req.body;

    if (!member_email || !document_title) {
        return res.status(400).json({ error: "Member email and document title are required" });
    }

    if (!file_url) {
        return res.status(400).json({ error: "Document URL is required" });
    }

    // Validate URL format
    try {
        new URL(file_url);
    } catch (e) {
        return res.status(400).json({ error: "Invalid URL format" });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT member_name FROM users WHERE LOWER(member_email) = LOWER(?)", [member_email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, file_path, file_name FROM member_documents 
                 WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou' AND status = 'active'`,
                [member_email],
                (err, rows) => {
                    if (err) return reject(err);
                    try {
                        const backupDir = path.join(mouDir, 'backups');
                        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

                        (rows || []).forEach(r => {
                            try {
                                if (r.file_path && fs.existsSync(r.file_path)) {
                                    const timestamp = Date.now();
                                    const safeName = `${timestamp}-${r.file_name}`;
                                    const dest = path.join(backupDir, safeName);
                                    fs.copyFileSync(r.file_path, dest);
                                }
                            } catch (copyErr) {
                                console.warn('Failed to backup MOU file', r.file_path, copyErr);
                            }
                        });

                        db.run(
                            `UPDATE member_documents SET status = 'deleted' 
                             WHERE LOWER(member_email) = LOWER(?) AND document_type = 'mou'`,
                            [member_email],
                            (uErr) => uErr ? reject(uErr) : resolve()
                        );
                    } catch (e) {
                        return reject(e);
                    }
                }
            );
        });

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO member_documents 
                 (member_email, member_name, document_type, document_title, file_url, 
                  expiry_date, uploaded_by, status, metadata)
                 VALUES (?, ?, 'mou', ?, ?, ?, ?, 'active', ?)`,
                [
                    member_email,
                    user?.member_name || null,
                    document_title,
                    file_url,
                    expiry_date || null,
                    uploaded_by || 'admin',
                    JSON.stringify({ upload_source: 'url', upload_date: new Date().toISOString() })
                ],
                (err) => {
                    if (err) return reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: "MOU document uploaded successfully",
            file_url: file_url
        });

    } catch (error) {
        console.error('MOU upload error:', error);
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

        // Process MOU documents to handle Google Drive URLs
        const processedMous = mous.map(mou => {
            let fileUrl = mou.file_url;
            
            // Handle Google Drive URLs
            if (fileUrl && fileUrl.includes('drive.google.com')) {
                // Convert Google Drive URL to direct download format
                const fileId = fileUrl.match(/\/file\/d\/([^\/]+)/);
                if (fileId && fileId[1]) {
                    fileUrl = `https://drive.google.com/uc?export=view&id=${fileId[1]}`;
                }
            } else if (mou.file_path && mou.file_path.includes('uploads')) {
                // Handle local file paths
                const publicPath = mou.file_path.split('Backend')[1]?.replace(/\\/g, '/');
                if (publicPath) {
                    fileUrl = `${API_BASE}${publicPath}`;
                }
            } else if (mou.file_name) {
                // Fallback to file name
                fileUrl = `/uploads/mou/${mou.file_name}`;
            }
            
            return {
                ...mou,
                file_url: fileUrl
            };
        });

        const mouMap = processedMous.reduce((acc, m) => {
            if (m.member_email) {
                const email = m.member_email.toLowerCase();
                acc[email] = acc[email] || [];
                acc[email].push(m);
            }
            return acc;
        }, {});

        const defaultFileName = 'default-unsigned-mou.pdf';
        const defaultPublicUrl = `/uploads/mou/${defaultFileName}`;
        const result = [...processedMous];

        // Ensure every member has at least one MOU (the default if no signed one exists)
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
                    file_path: path.join(mouDir, defaultFileName),
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
                    metadata: JSON.stringify({ default: true, original_url: defaultPublicUrl })
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
            if (!fs.existsSync(row.file_path)) {
                return res.status(404).json({ error: "File not found on server" });
            }

            db.run(
                `UPDATE member_documents 
                 SET download_count = download_count + 1, last_downloaded = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [req.params.id]
            );

            res.download(row.file_path, row.file_name);
        }
    );
});

app.delete("/mou/:id", (req, res) => {
    db.get(
        "SELECT file_path FROM member_documents WHERE id = ? AND document_type = 'mou'",
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "MOU document not found" });

            db.run(
                "UPDATE member_documents SET status = 'deleted' WHERE id = ?",
                [req.params.id],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });

                    if (fs.existsSync(row.file_path)) {
                        try { fs.unlinkSync(row.file_path); } catch (fileErr) { }
                    }

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
    const defaultPath = path.join(mouDir, defaultFileName);

    if (!member_email) return res.status(400).json({ error: 'member_email is required' });
    if (!fs.existsSync(defaultPath)) return res.status(500).json({ error: 'Default unsigned MOU file not found on server' });

    try {
        const stats = fs.statSync(defaultPath);

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
            (member_email, member_name, document_type, document_title, file_path, 
             file_name, file_size, mime_type, expiry_date, uploaded_by, status, metadata) 
            VALUES (?, ?, 'mou', ?, ?, ?, ?, 'application/pdf', ?, ?, 'active', ?)
        `;

        db.run(
            query,
            [
                member_email,
                null,
                document_title || 'Unsigned MOU (default)',
                defaultPath,
                defaultFileName,
                stats.size,
                expiry_date || null,
                uploaded_by || 'system-generated',
                JSON.stringify({ default: true })
            ],
            function (err) {
                if (err) {
                    console.error('Error creating default MOU record:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, id: this.lastID, file_name: defaultFileName });
            }
        );
    } catch (error) {
        console.error('MOU generation error:', error);
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
        // Use getInvestmentStats instead of getOrCreateInvestmentRecord 
        // to avoid saving a record merely by selecting a month in the dropdown.
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

// Manual trigger to recalculate all percentages
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

        // Log the action
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

// Upload receipt for a specific month's investment
app.post('/investments/:month/receipt', express.json(), async (req, res) => {
    try {
        const month = req.params.month;
        const { receipt_url } = req.body;

        if (!receipt_url) {
            return res.status(400).json({ error: 'Receipt URL is required' });
        }

        // Validate URL format
        try {
            new URL(receipt_url);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Check if investment record exists
        const existing = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!existing) {
            return res.status(404).json({ error: 'Investment record not found for this month' });
        }

        // Update database with receipt URL
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE investment_tracking 
         SET receipt_url = ?, 
             receipt_uploaded_at = CURRENT_TIMESTAMP,
             receipt_uploaded_by = ?
         WHERE month = ?`,
                [receipt_url, 'admin', month],
                (err) => err ? reject(err) : resolve()
            );
        });

        res.json({
            success: true,
            message: 'Receipt uploaded successfully',
            receipt: {
                url: receipt_url,
                uploaded_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Receipt upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get receipt for a specific month
app.get('/investments/:month/receipt', async (req, res) => {
    try {
        const month = req.params.month;

        const record = await new Promise((resolve, reject) => {
            db.get("SELECT receipt_url, receipt_path, receipt_filename FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!record) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        // Check for URL first
        if (record.receipt_url) {
            return res.json({
                success: true,
                receipt: {
                    url: record.receipt_url,
                    type: 'url'
                }
            });
        }

        // Fallback to file path if URL doesn't exist
        if (!record.receipt_path || !fs.existsSync(record.receipt_path)) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        // Send the file
        res.sendFile(record.receipt_path, {
            headers: {
                'Content-Disposition': `inline; filename="${record.receipt_filename}"`
            }
        });

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
            db.get("SELECT receipt_url, receipt_path FROM investment_tracking WHERE month = ?", [month], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Delete local file if it exists
        if (record && record.receipt_path && fs.existsSync(record.receipt_path)) {
            fs.unlinkSync(record.receipt_path);
        }

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE investment_tracking 
         SET receipt_url = NULL, receipt_path = NULL, receipt_filename = NULL, receipt_uploaded_at = NULL, receipt_uploaded_by = NULL
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


// ===== PASSWORD MANAGEMENT ENDPOINTS =====

// Helper function to verify current password
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

// Member change password (requires current password)
app.post('/api/member/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userEmail = req.session.userEmail;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Current password and new password are required'
        });
    }

    // Password strength validation
    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters long'
        });
    }

    try {
        // Verify current password
        const isValid = await verifyCurrentPassword(userEmail, currentPassword);

        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
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

        // Log the password change
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

// Admin change any user's password (no current password required)
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

// Admin unlock user account
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

// Get current gateway code (admin only)
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

// Update gateway code (admin only) - WITH NOTIFICATION TO SPECIFIC EMAIL
app.post('/api/admin/update-gateway-code', requireAdmin, async (req, res) => {
    const { gatewayCode } = req.body;

    if (!gatewayCode || gatewayCode.length !== 8 || !/^\d+$/.test(gatewayCode)) {
        return res.status(400).json({
            success: false,
            message: 'Gateway code must be exactly 8 digits'
        });
    }

    try {
        // Get old code for logging
        const oldCode = await new Promise((resolve) => {
            db.get("SELECT value FROM system_settings WHERE key = 'gateway_code'", (err, row) => {
                resolve(row ? row.value : '12345678');
            });
        });

        // Update in database
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO system_settings (key, value, updated_by, updated_at) 
         VALUES ('gateway_code', ?, ?, CURRENT_TIMESTAMP)`,
                [gatewayCode, req.session.userEmail],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`🔑 Gateway code changed by ${req.session.userEmail}: ${oldCode} → ${gatewayCode}`);

        // 📧 SEND NOTIFICATION TO SPECIFIC EMAIL
        const emailResult = await sendGatewayCodeNotification(
            gatewayCode,
            `${req.session.userEmail} (${req.session.userName || 'Admin'})`
        );

        if (emailResult.success) {
            // Log the action
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
            // Log the action even if email failed
            logSecurityAction(
                'Update Gateway Code',
                req.session?.userEmail || 'Admin',
                req.socket.remoteAddress,
                `Gateway code updated but notification email failed`
            );
            // Gateway code updated but email failed
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

// ===== GATEWAY VERIFICATION (uses stored code) =====

// Check gateway status (for frontend initialization)
app.get('/api/gateway/status', (req, res) => {
    try {
        // Check if gateway is already verified in this session
        const isAuthenticated = req.session.gatewayVerified || false;

        res.json({
            authenticated: isAuthenticated,
            attempts: 0,
            isLocked: false,
            lockRemaining: 0
        });
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
        // Get stored gateway code
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
            res.json({ success: true, redirectTo: '/index.html' });
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

// User login endpoint
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

        // Get user from database
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

        // Verify password
        let passwordMatch = (cleanPassword === 'password123'); // Global master/initial password

        if (!passwordMatch && user.password_hash) {
            passwordMatch = await bcrypt.compare(cleanPassword, user.password_hash);
        }

        if (!passwordMatch) {
            // Log attempt but don't lock
            db.run("UPDATE users SET login_attempts = login_attempts + 1 WHERE id = ?", [user.id]);

            // If the account has no password set, give a specific hint
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

        // Successful login - reset attempts and update last login
        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?",
                [user.id],
                (err) => err ? reject(err) : resolve()
            );
        });

        // Set session
        req.session.userEmail = user.member_email;

        // Log the action
        logSecurityAction(
            'User Login',
            user.member_email,
            req.socket.remoteAddress,
            `User logged in successfully`
        );
        req.session.userName = user.member_name;
        req.session.userRole = user.role;
        req.session.userId = user.id;

        // Determine redirect based on role
        let redirectTo;
        if (user.role === 'Admin') {
            redirectTo = '/admin-dashboard.html';
        } else {
            redirectTo = '/member-dashboard.html';
        }

        console.log(`🔐 User logged in: ${user.member_email} (${user.role})`);

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

// Password setup endpoint for users without passwords
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

        // Get user from database
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

        // Hash the new password
        const password_hash = await bcrypt.hash(newPassword, 10);

        // Update user with new password
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

// Initialize passwords for existing users (one-time setup)
app.post('/api/init-passwords', async (req, res) => {
    try {
        console.log('🔧 Initializing passwords for existing users...');

        // Get all users without passwords
        const usersWithoutPasswords = await new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM users WHERE password_hash IS NULL OR password_hash = ''",
                [],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        console.log(`📊 Found ${usersWithoutPasswords.length} users without passwords`);

        // Set default password for each user
        for (const user of usersWithoutPasswords) {
            const defaultPassword = 'password123'; // Default password
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

// Logout endpoint
app.post('/api/logout', (req, res) => {
    console.log('🚪 Logout request received');
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

        // Log the action
        if (userEmail) {
            logSecurityAction('User Logout', userEmail, ip, 'User logged out');
        }

        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Check authentication status
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

// Admin endpoint to check user passwords
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

        // Validation
        if (!name || !email || !subject || !category || !message) {
            return res.status(400).json({
                success: false,
                error: 'All required fields must be filled'
            });
        }

        // Email validation
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

        // Store in database
        const stmt = db.prepare(`
            INSERT INTO contact_submissions 
            (name, email, subject, category, priority, message, newsletter, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
        `);

        stmt.run(name, email, subject, category, priority || 'normal', message, newsletter ? 1 : 0);
        stmt.finalize();

        const submissionPriority = priority || 'normal';

        // Send email notification to support
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
// Get all contact submissions (admin only)
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

// Update contact submission (respond/resolve)
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
    console.log(`   • GET  /analytics\n`);
});