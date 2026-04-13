const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
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

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectToMongoDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'friends-in-finance-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ===== ROOT ROUTE - REDIRECT TO INDEX =====
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ===== HEALTH CHECK =====
app.get("/health", async (req, res) => {
    try {
        const stats = await getDatabaseStats();
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            database: "MongoDB",
            stats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== DEBUG ENDPOINT =====
app.get("/debug/data", async (req, res) => {
    try {
        const usersCount = await User.countDocuments();
        const contributionsCount = await Contribution.countDocuments();
        const monthlyCount = await MemberMonthlyContribution.countDocuments();

        res.json({
            users: usersCount,
            contributions: contributionsCount,
            monthly: monthlyCount,
            collections: ['users', 'contributions', 'member_monthly_contributions', 'member_documents', 'system_settings', 'contact_submissions', 'security_logs', 'password_reset_tokens', 'investment_tracking', 'investment_history', 'mansa_x_investments']
        });
    } catch (error) {
        console.error("Debug endpoint error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== AUTHENTICATION MIDDLEWARE =====
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userEmail) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    User.findOne({ member_email: req.session.userEmail })
        .then(user => {
            if (!user || user.role !== 'Admin') {
                return res.status(403).json({ error: 'Admin access required' });
            }
            next();
        })
        .catch(err => {
            console.error('Admin check error:', err);
            res.status(500).json({ error: 'Server error' });
        });
}

// ===== GATEWAY VERIFICATION =====
app.post('/api/gateway/verify', async (req, res) => {
    const { accessCode } = req.body;

    if (!accessCode) {
        return res.status(400).json({
            success: false,
            message: 'Access code is required'
        });
    }

    try {
        // Get stored gateway code
        const setting = await SystemSetting.findOne({ key: 'gateway_code' });
        const storedCode = setting ? setting.value : '12345678';

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
        const user = await User.findOne({ member_email: cleanEmail });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is locked
        if (user.locked_until && user.locked_until > new Date()) {
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked. Please try again later.'
            });
        }

        // Verify password
        let passwordValid = false;
        if (user.password_hash) {
            passwordValid = await bcrypt.compare(cleanPassword, user.password_hash);
        } else {
            // For users without password hash (legacy), use direct comparison
            passwordValid = cleanPassword === 'password123'; // Default password for legacy users
        }

        if (!passwordValid) {
            // Increment login attempts
            const updateData = {
                $inc: { login_attempts: 1 }
            };
            
            if (user.login_attempts >= 4) {
                updateData.$set = { locked_until: new Date(Date.now() + 30 * 60 * 1000) }; // Lock for 30 minutes
            }

            await User.updateOne({ member_email: cleanEmail }, updateData);

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Reset login attempts on successful login
        await User.updateOne(
            { member_email: cleanEmail },
            { 
                $set: { 
                    login_attempts: 0, 
                    locked_until: null, 
                    last_login: new Date() 
                } 
            }
        );

        // Set session
        req.session.userEmail = cleanEmail;
        req.session.userRole = user.role;
        req.session.userName = user.member_name;

        console.log(`✅ Successful login for: ${cleanEmail} (${user.role})`);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                email: user.member_email,
                name: user.member_name,
                role: user.role
            },
            redirectTo: user.role === 'Admin' ? '/admin-dashboard.html' : '/member-dashboard.html'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ===== LOGOUT =====
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }

        res.json({
            success: true,
            message: 'Logout successful'
        });
    });
});

// ===== SYNC ENDPOINTS =====
app.post('/api/sync/contributions', async (req, res) => {
    console.log('🔄 Starting contribution sync...');
    
    try {
        const { contributions, users } = req.body;

        if (!contributions || !Array.isArray(contributions)) {
            return res.status(400).json({ error: 'Invalid contributions data' });
        }

        if (!users || !Array.isArray(users)) {
            return res.status(400).json({ error: 'Invalid users data' });
        }

        console.log(`📊 Processing ${contributions.length} contributions and ${users.length} users`);

        // Get all existing month columns
        const allMonthColumns = await getMonthColumns();

        // Process contributions
        for (const contribution of contributions) {
            if (!contribution.member_email || !contribution.member_name) {
                console.warn('⚠️ Skipping contribution with missing email or name');
                continue;
            }

            // Update contribution record
            const contributionData = {
                member_name: contribution.member_name,
                member_email: contribution.member_email,
                total_contributions: contribution.total_contributions || 0,
                interest_per_member: contribution.interest_per_member || 0,
                final_payout: contribution.final_payout || 0,
                synced_at: new Date(),
                monthly_contributions: new Map()
            };

            // Add monthly contributions to Map
            for (const month of allMonthColumns) {
                if (contribution[month] !== undefined && contribution[month] !== null) {
                    contributionData.monthly_contributions.set(month, parseFloat(contribution[month]) || 0);
                }
            }

            await Contribution.findOneAndUpdate(
                { member_email: contribution.member_email },
                contributionData,
                { upsert: true, new: true }
            );

            // Update member_monthly_contributions
            for (const month of allMonthColumns) {
                const amount = contribution[month];
                if (amount !== undefined && amount !== null && amount > 0) {
                    await MemberMonthlyContribution.findOneAndUpdate(
                        { member_email: contribution.member_email, month },
                        { 
                            member_email: contribution.member_email,
                            month,
                            contribution_amount: parseFloat(amount) || 0,
                            created_at: new Date()
                        },
                        { upsert: true, new: true }
                    );
                }
            }
        }

        // Process users
        for (const user of users) {
            if (!user.member_email || !user.member_name) {
                console.warn('⚠️ Skipping user with missing email or name');
                continue;
            }

            await User.findOneAndUpdate(
                { member_email: user.member_email },
                {
                    member_name: user.member_name,
                    member_email: user.member_email,
                    role: user.role || 'member',
                    synced_at: new Date()
                },
                { upsert: true, new: true }
            );
        }

        console.log('✅ Sync completed successfully');
        res.json({
            success: true,
            message: 'Data synchronized successfully',
            processed: {
                contributions: contributions.length,
                users: users.length
            }
        });

    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== MONTH COLUMN MANAGEMENT =====
async function getMonthColumns() {
    try {
        // Get a sample contribution record to extract month columns
        const sample = await Contribution.findOne();
        if (sample && sample.monthly_contributions) {
            // monthly_contributions may be a Mongoose Map or a plain object depending on migration
            let months = [];
            if (typeof sample.monthly_contributions.keys === 'function') {
                months = Array.from(sample.monthly_contributions.keys());
            } else if (typeof sample.monthly_contributions === 'object') {
                months = Object.keys(sample.monthly_contributions || {});
            }
            if (months && months.length) {
                console.log('📅 Found month columns from contribution.monthly_contributions:', months);
                return months.sort();
            }
        }

        // If no sample found or no months on the sample, get all unique months from member_monthly_contributions
        const monthlyData = await MemberMonthlyContribution.distinct('month');
        console.log('📅 Found month columns from monthly data:', monthlyData);
        return (monthlyData || []).sort();
    } catch (error) {
        console.error('Error getting month columns:', error);
        return [];
    }
}

app.post('/api/add-month-column', async (req, res) => {
    try {
        const { month } = req.body;

        if (!month) {
            return res.status(400).json({ error: 'Month is required' });
        }

        // Check if month column already exists
        const existingColumns = await getMonthColumns();
        if (existingColumns.includes(month)) {
            return res.status(400).json({ error: 'Month column already exists' });
        }

        console.log(`➕ Adding new month column: ${month}`);

        // Get member name from users table
        const user = await User.findOne({ member_email: req.body.member_email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update contribution record
        await Contribution.findOneAndUpdate(
            { member_email: req.body.member_email },
            { 
                $set: { 
                    [`monthly_contributions.${month}`]: parseFloat(req.body.amount) || 0 
                }
            },
            { upsert: true, new: true }
        );

        // Add monthly contribution amount to existing contribution
        await MemberMonthlyContribution.findOneAndUpdate(
            { member_email: req.body.member_email, month },
            { 
                member_email: req.body.member_email,
                month,
                contribution_amount: parseFloat(req.body.amount) || 0,
                created_at: new Date()
            },
            { upsert: true, new: true }
        );

        // Only update total contributions if it's currently 0 or if explicitly requested
        const contribution = await Contribution.findOne({ member_email: req.body.member_email });
        if (contribution && contribution.total_contributions === 0) {
            const monthlyTotal = Array.from(contribution.monthly_contributions.values())
                .reduce((sum, amount) => sum + amount, 0);
            
            await Contribution.updateOne(
                { member_email: req.body.member_email },
                { total_contributions: monthlyTotal }
            );
        }

        res.json({
            success: true,
            message: `Month column ${month} added successfully`
        });

    } catch (error) {
        console.error('Error adding month column:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CONTRIBUTION ENDPOINTS =====
app.get("/contributions", async (req, res) => {
    try {
        console.log("📊 Fetching contributions...");
        
        const contributions = await Contribution.find({})
            .sort({ member_name: 1 });

        // Transform monthly_contributions Map to flat object
        const transformedContributions = contributions.map(contribution => {
            const result = contribution.toObject();
            
            // Convert Map or plain object to flat properties
            const months = contribution.monthly_contributions;
            if (months) {
                if (typeof months.forEach === 'function') {
                    // Mongoose Map
                    months.forEach((value, key) => {
                        result[key] = value;
                    });
                } else if (typeof months === 'object') {
                    Object.entries(months).forEach(([key, value]) => {
                        result[key] = value;
                    });
                }
            }
            
            delete result.monthly_contributions;
            delete result.__v;
            delete result._id;
            
            return result;
        });

        console.log(`📊 Returning ${transformedContributions.length} contributions`);
        res.json(transformedContributions);

    } catch (error) {
        console.error("Error fetching contributions:", error);
        res.status(500).json({ error: error.message });
    }
});

app.put("/contributions/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const updates = req.body;
        
        console.log(`📊 Updating contribution for ${email}:`, updates);
        
        // Find and update the contribution
        const contribution = await Contribution.findOneAndUpdate(
            { member_email: email },
            updates,
            { new: true, upsert: false }
        );
        
        if (!contribution) {
            return res.status(404).json({ 
                success: false, 
                message: 'Contribution not found for this email' 
            });
        }
        
        // Transform the updated contribution for frontend
        const result = contribution.toObject();
        if (contribution.monthly_contributions) {
            contribution.monthly_contributions.forEach((value, key) => {
                result[key] = value;
            });
        }
        delete result.monthly_contributions;
        delete result.__v;
        delete result._id;
        
        console.log(`✅ Contribution updated successfully for ${email}`);
        res.json({
            success: true,
            message: 'Contribution updated successfully',
            data: result
        });
        
    } catch (error) {
        console.error('Error updating contribution:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get("/monthly-contributions", async (req, res) => {
    console.log("📊 Fetching monthly contributions...");
    
    try {
        const monthlyContributions = await MemberMonthlyContribution.aggregate([
            {
                $lookup: {
                    from: 'users',
                    let: { email: '$member_email' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        { $toLower: '$member_email' },
                                        { $toLower: '$$email' }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                member_name: 1,
                                _id: 0
                            }
                        }
                    ],
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    member_email: 1,
                    month: 1,
                    contribution_amount: 1,
                    created_at: 1,
                    member_name: '$user.member_name'
                }
            },
            {
                $sort: { member_name: 1, month: 1 }
            }
        ]);

        res.json(monthlyContributions);

    } catch (error) {
        console.error("Error fetching monthly contributions:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== USER MANAGEMENT =====
app.get("/users", async (req, res) => {
    console.log("👥 Fetching users with photos...");
    
    try {
        const users = await User.aggregate([
            {
                $lookup: {
                    from: 'memberdocuments',
                    let: { email: '$member_email' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$document_type', 'photo'] },
                                        { $eq: [{ $toLower: '$member_email' }, { $toLower: '$$email' }] },
                                        { $eq: ['$status', 'active'] }
                                    ]
                                }
                            }
                        },
                        {
                            $sort: { is_primary: -1, upload_date: -1 }
                        },
                        {
                            $limit: 1
                        },
                        {
                            $project: {
                                file_url: '$file_path',
                                document_title: '$document_title',
                                _id: 0
                            }
                        }
                    ],
                    as: 'photo'
                }
            },
            {
                $unwind: {
                    path: '$photo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    member_name: 1,
                    member_email: 1,
                    role: 1,
                    created_at: 1,
                    synced_at: 1,
                    photo_url: '$photo.file_url',
                    photo_title: '$photo.document_title'
                }
            },
            {
                $sort: { member_name: 1 }
            }
        ]);

        res.json(users);

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/users", async (req, res) => {
    const { member_name, member_email, role } = req.body;

    if (!member_name || !member_email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    try {
        const existingUser = await User.findOne({ member_email });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const user = new User({
            member_name,
            member_email,
            role: role || 'member'
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user
        });

    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: error.message });
    }
});

app.put("/users/:email", async (req, res) => {
    const { member_name, role } = req.body;
    const { email } = req.params;

    try {
        const updateData = {};
        if (member_name) updateData.member_name = member_name;
        if (role) updateData.role = role;

        const user = await User.findOneAndUpdate(
            { member_email: email },
            updateData,
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            user
        });

    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ error: error.message });
    }
});

app.delete("/users/:email", async (req, res) => {
    try {
        const result = await User.deleteOne({ member_email: req.params.email });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Also delete related data
        await Contribution.deleteOne({ member_email: req.params.email });
        await MemberMonthlyContribution.deleteMany({ member_email: req.params.email });
        await MemberDocument.deleteMany({ member_email: req.params.email });

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== ANALYTICS ENDPOINTS =====
app.get("/analytics", async (req, res) => {
    try {
        console.log("📊 Fetching analytics data...");
        
        const monthColumns = await getMonthColumns();

        if (monthColumns.length === 0) {
            const contributions = await Contribution.find({})
                .select('member_name member_email total_contributions interest_per_member final_payout')
                .sort({ member_name: 1 });

            return res.json(contributions);
        }

        const contributions = await Contribution.find({})
            .select('member_name member_email total_contributions interest_per_member final_payout')
            .sort({ member_name: 1 });

        // Transform monthly_contributions Map to flat object
        const transformedContributions = contributions.map(contribution => {
            const result = contribution.toObject();
            
            // Convert Map to object
            if (contribution.monthly_contributions) {
                contribution.monthly_contributions.forEach((value, key) => {
                    result[key] = value;
                });
            }
            
            delete result.monthly_contributions;
            delete result.__v;
            delete result._id;
            
            return result;
        });

        res.json(transformedContributions);

    } catch (error) {
        console.error("Analytics query error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== INVESTMENT TRACKING =====
app.get('/api/investment-tracking', async (req, res) => {
    try {
        const investments = await InvestmentTracking.find({})
            .select('month total_contributions mansa_x i_and_m cumulative_mansa_x total_invested running_total_contributions mansa_x_percentage i_and_m_percentage receipt_url receipt_path receipt_filename receipt_uploaded_at receipt_uploaded_by')
            .sort({ month: 1 });

        res.json(investments);

    } catch (error) {
        console.error('Error fetching investment tracking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Legacy endpoints for frontend compatibility
app.get('/investments', async (req, res) => {
    try {
        const investments = await InvestmentTracking.find({})
            .select('month total_contributions mansa_x i_and_m cumulative_mansa_x total_invested running_total_contributions mansa_x_percentage i_and_m_percentage receipt_url receipt_path receipt_filename receipt_uploaded_at receipt_uploaded_by')
            .sort({ month: 1 });

        res.json(investments);

    } catch (error) {
        console.error('Error fetching investments:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/investments/summary', async (req, res) => {
    try {
        const investments = await InvestmentTracking.find({})
            .select('month total_contributions mansa_x i_and_m cumulative_mansa_x total_invested running_total_contributions mansa_x_percentage i_and_m_percentage receipt_url receipt_path receipt_filename receipt_uploaded_at receipt_uploaded_by')
            .sort({ month: 1 });

        // Calculate summary with field names frontend expects
        // Match SQLite behavior: cumulative/iandm/total_invested should be the latest (MAX), not SUM across months
        const cumulative_mansa_x_final = investments.length ? Math.max(...investments.map(i => i.cumulative_mansa_x || 0)) : 0;
        const iandm_balance_final = investments.length ? Math.max(...investments.map(i => i.i_and_m || 0)) : 0;
        const total_invested_final = investments.length ? Math.max(...investments.map(i => i.total_invested || 0)) : 0;

        const total_contributions_all = investments.reduce((sum, inv) => sum + (inv.total_contributions || 0), 0);
        const total_mansa_x_monthly = investments.reduce((sum, inv) => sum + (inv.mansa_x || 0), 0);

        const summary = {
            total_contributions_all,
            total_mansa_x_monthly,
            cumulative_mansa_x_final,
            iandm_balance_final,
            total_invested_final
        };

        res.json(summary);

    } catch (error) {
        console.error('Error fetching investment summary:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/investments/:month/receipt', async (req, res) => {
    try {
        const { month } = req.params;
        
        // Find investment record for the month
        const investment = await InvestmentTracking.findOne({ month });
        
        if (!investment) {
            return res.status(404).json({ error: 'Investment record not found for month: ' + month });
        }

        // For now, return a simple response
        res.json({ 
            message: 'Receipt functionality would be implemented here',
            month: month,
            investment: investment 
        });

    } catch (error) {
        console.error('Error fetching investment receipt:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/member-monthly-contributions/:email?', async (req, res) => {
    try {
        const email = req.params.email;
        
        if (email) {
            const contributions = await MemberMonthlyContribution.find({ member_email: email })
                .sort({ month: -1 });
            res.json(contributions);
        } else {
            const contributions = await MemberMonthlyContribution.find({})
                .sort({ month: -1, member_email: 1 });
            res.json(contributions);
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== CONTACT FORM =====
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, category, priority, message, newsletter } = req.body;

        const submission = new ContactSubmission({
            name,
            email,
            subject,
            category,
            priority: priority || 'normal',
            message,
            newsletter: newsletter || false
        });

        await submission.save();

        res.status(201).json({
            success: true,
            message: 'Contact form submitted successfully'
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== MEMBER DOCUMENT ENDPOINTS =====
app.get('/users/:email/photo', async (req, res) => {
    try {
        const { email } = req.params;
        
        const documents = await MemberDocument.find({ 
            member_email: email,
            document_type: 'photo',
            status: 'active'
        }).sort({ uploaded_at: -1 });
        
        if (documents.length > 0) {
            const latestPhoto = documents[0];
            res.json({
                photo_url: latestPhoto.file_url || latestPhoto.file_path,
                file_name: latestPhoto.file_name,
                uploaded_at: latestPhoto.uploaded_at,
                document_title: latestPhoto.document_title
            });
        } else {
            res.json({ photo_url: null });
        }
    } catch (error) {
        console.error('Error fetching member photo:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:email/documents', async (req, res) => {
    try {
        const { email } = req.params;
        
        const documents = await MemberDocument.find({ 
            member_email: email,
            status: 'active'
        }).sort({ uploaded_at: -1 });
        
        res.json(documents);
    } catch (error) {
        console.error('Error fetching member documents:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/users/:email/photo', async (req, res) => {
    try {
        const { email } = req.params;
        const { document_title, file_name, file_path } = req.body;
        
        const newDocument = new MemberDocument({
            member_email: email,
            document_type: 'photo',
            document_title: document_title || file_name,
            file_name: file_name,
            file_path: file_path,
            file_url: file_path,
            status: 'active',
            uploaded_by: req.session.userEmail || 'admin',
            uploaded_at: new Date()
        });
        
        await newDocument.save();
        
        res.json({ 
            success: true,
            message: 'Photo uploaded successfully',
            document: newDocument
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== MOU DOCUMENT ENDPOINTS =====
app.get('/mou', async (req, res) => {
    try {
        const documents = await MemberDocument.find({ document_type: 'mou' })
            .sort({ upload_date: -1 });
        
        res.json(documents);
    } catch (error) {
        console.error('Error fetching MOU documents:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/mou/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const documents = await MemberDocument.find({ 
            member_email: email,
            document_type: 'mou'
        }).sort({ upload_date: -1 });
        
        res.json(documents);
    } catch (error) {
        console.error('Error fetching member MOU documents:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/mou', async (req, res) => {
    try {
        const { member_email, document_title, file_name, file_path } = req.body;
        
        if (!member_email || !document_title || !file_name || !file_path) {
            return res.status(400).json({
                success: false,
                message: 'Member email, document title, file name, and file path are required'
            });
        }
        
        const newDocument = new MemberDocument({
            member_email,
            document_type: 'mou',
            document_title,
            file_name,
            file_path,
            file_url: file_path,
            status: 'active',
            upload_date: new Date(),
            uploaded_by: req.session.userEmail || 'admin'
        });
        
        await newDocument.save();
        
        res.json({ 
            success: true,
            message: 'MOU document uploaded successfully',
            document: newDocument
        });
    } catch (error) {
        console.error('Error uploading MOU document:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/mou/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { document_title, file_name, file_path } = req.body;
        
        if (!document_title || !file_name || !file_path) {
            return res.status(400).json({
                success: false,
                message: 'Document title, file name, and file path are required'
            });
        }
        
        const newDocument = new MemberDocument({
            member_email: email,
            document_type: 'mou',
            document_title,
            file_name,
            file_path,
            file_url: file_path,
            status: 'active',
            upload_date: new Date(),
            uploaded_by: req.session.userEmail || 'admin'
        });
        
        await newDocument.save();
        
        res.json({ 
            success: true,
            message: 'MOU document uploaded successfully',
            document: newDocument
        });
    } catch (error) {
        console.error('Error uploading MOU document:', error);
        res.status(500).json.status(500).json({ error: error.message });
    }
});

// ===== DATABASE STATS =====
async function getDatabaseStats() {
    try {
        const stats = {};
        
        stats.users = await User.countDocuments();
        stats.contributions = await Contribution.countDocuments();
        stats.photos = await MemberDocument.countDocuments({ document_type: 'photo' });
        stats.mou_documents = await MemberDocument.countDocuments({ document_type: 'mou' });
        stats.monthly_contributions = await MemberMonthlyContribution.countDocuments();
        stats.contact_submissions = await ContactSubmission.countDocuments();
        stats.security_logs = await SecurityLog.countDocuments();
        stats.investment_tracking = await InvestmentTracking.countDocuments();
        
        return stats;
    } catch (error) {
        console.error('Error getting database stats:', error);
        throw error;
    }
}

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 MongoDB database connected`);
    console.log(`🌐 Frontend available at http://localhost:${PORT}`);
});

module.exports = app;
