const mongoose = require('mongoose');

// Get mongoose.Schema constructor
const { Schema } = mongoose;

// User Schema
const userSchema = new mongoose.Schema({
  member_name: { type: String, required: true },
  member_email: { type: String, required: true, unique: true, lowercase: true },
  role: { type: String, default: 'member', enum: ['member', 'admin'] },
  password_hash: { type: String },
  login_attempts: { type: Number, default: 0 },
  locked_until: { type: Date },
  last_login: { type: Date },
  created_at: { type: Date, default: Date.now },
  synced_at: { type: Date, default: Date.now }
});

// Indexes
userSchema.index({ member_email: 1 });

// Contribution Schema
const contributionSchema = new mongoose.Schema({
  member_name: { type: String, required: true },
  member_email: { type: String, required: true, unique: true, lowercase: true },
  total_contributions: { type: Number, default: 0 },
  interest_per_member: { type: Number, default: 0 },
  final_payout: { type: Number, default: 0 },
  synced_at: { type: Date, default: Date.now },
  // Dynamic monthly contributions stored as embedded document
  monthly_contributions: {
    type: Map,
    of: Number,
    default: new Map()
  }
});

// Indexes
contributionSchema.index({ member_email: 1 });

// Member Document Schema
const memberDocumentSchema = new mongoose.Schema({
  member_email: { type: String, required: true, lowercase: true },
  member_name: { type: String },
  document_type: { type: String, required: true, enum: ['photo', 'mou'] },
  document_title: { type: String },
  file_path: { type: String, required: true },
  file_url: { type: String },
  file_name: { type: String, required: true },
  file_size: { type: Number },
  mime_type: { type: String },
  status: { type: String, default: 'active', enum: ['active', 'expired', 'deleted'] },
  upload_date: { type: Date, default: Date.now },
  expiry_date: { type: Date },
  uploaded_by: { type: String },
  is_primary: { type: Boolean, default: false },
  download_count: { type: Number, default: 0 },
  last_downloaded: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed }
});

// Indexes
memberDocumentSchema.index({ member_email: 1 });
memberDocumentSchema.index({ document_type: 1 });
memberDocumentSchema.index({ status: 1 });
memberDocumentSchema.index({ document_type: 1, is_primary: 1 });

// Member Monthly Contributions Schema
const memberMonthlyContributionSchema = new mongoose.Schema({
  member_email: { type: String, required: true, lowercase: true },
  month: { type: String, required: true },
  contribution_amount: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// Compound index for uniqueness
memberMonthlyContributionSchema.index({ member_email: 1, month: 1 }, { unique: true });
memberMonthlyContributionSchema.index({ member_email: 1 });
memberMonthlyContributionSchema.index({ month: 1 });

// System Settings Schema
const systemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String },
  updated_by: { type: String },
  updated_at: { type: Date, default: Date.now }
});

// Index
systemSettingSchema.index({ key: 1 });

// Contact Submission Schema
const contactSubmissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  category: { type: String, required: true },
  priority: { type: String, default: 'normal', enum: ['low', 'normal', 'high', 'urgent'] },
  message: { type: String, required: true },
  newsletter: { type: Boolean, default: false },
  submitted_at: { type: Date, default: Date.now },
  status: { type: String, default: 'pending', enum: ['pending', 'in_progress', 'resolved', 'closed'] },
  response: { type: String },
  responded_by: { type: String },
  responded_at: { type: Date },
  notes: { type: String }
});

// Indexes
contactSubmissionSchema.index({ email: 1 });
contactSubmissionSchema.index({ status: 1 });
contactSubmissionSchema.index({ category: 1 });

// Security Log Schema
const securityLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: { type: String, required: true },
  user: { type: String },
  ip_address: { type: String },
  details: { type: String }
});

// Index
securityLogSchema.index({ timestamp: 1 });

// Password Reset Token Schema
const passwordResetTokenSchema = new mongoose.Schema({
  user_email: { type: String, required: true, lowercase: true },
  token: { type: String, required: true },
  expires_at: { type: Date, required: true },
  used: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

// Index
passwordResetTokenSchema.index({ user_email: 1 });
passwordResetTokenSchema.index({ token: 1 });

// Investment Tracking Schema
const investmentTrackingSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  total_contributions: { type: Number, default: 0 },
  mansa_x: { type: Number, default: 0 },
  i_and_m: { type: Number, default: 0 },
  cumulative_mansa_x: { type: Number, default: 0 },
  total_invested: { type: Number, default: 0 },
  running_total_contributions: { type: Number, default: 0 },
  mansa_x_percentage: { type: Number, default: 0 },
  i_and_m_percentage: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_calculated: { type: Date },
  // Receipt management
  receipt_url: { type: String },
  receipt_path: { type: String },
  receipt_filename: { type: String },
  receipt_uploaded_at: { type: Date },
  receipt_uploaded_by: { type: String }
}, {
  collection: 'investment_tracking' // Explicitly set collection name
});

// Index
investmentTrackingSchema.index({ month: 1 });

// Investment History Schema
const investmentHistorySchema = new mongoose.Schema({
  month: { type: String, required: true },
  previous_amount: { type: Number, required: true },
  new_amount: { type: Number, required: true },
  changed_by: { type: String },
  change_date: { type: Date, default: Date.now },
  reason: { type: String }
});

// Mansa X Investment Schema
const mansaXInvestmentSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  mansa_x_amount: { type: Number, default: 0 },
  notes: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Index
mansaXInvestmentSchema.index({ month: 1 });

// Create models
const User = mongoose.model('User', userSchema);
const Contribution = mongoose.model('Contribution', contributionSchema);
const MemberDocument = mongoose.model('MemberDocument', memberDocumentSchema);
const MemberMonthlyContribution = mongoose.model('MemberMonthlyContribution', memberMonthlyContributionSchema);
const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
const ContactSubmission = mongoose.model('ContactSubmission', contactSubmissionSchema);
const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
const InvestmentTracking = mongoose.model('InvestmentTracking', investmentTrackingSchema);
const InvestmentHistory = mongoose.model('InvestmentHistory', investmentHistorySchema);
const MansaXInvestment = mongoose.model('MansaXInvestment', mansaXInvestmentSchema);

module.exports = {
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
  MansaXInvestment,
  mongoose
};
