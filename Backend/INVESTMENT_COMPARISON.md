# SQLite vs MongoDB investment_tracking Comparison

## 📊 Schema Comparison

### SQLite Schema:
```sql
CREATE TABLE investment_tracking (
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
  last_calculated DATETIME,
  receipt_path TEXT,
  receipt_filename TEXT,
  receipt_uploaded_at DATETIME,
  receipt_uploaded_by TEXT
  -- receipt_url is added dynamically (not in original schema)
);
```

### MongoDB Schema:
```javascript
{
  month: String (required, unique),
  total_contributions: Number (default: 0),
  mansa_x: Number (default: 0),
  i_and_m: Number (default: 0),
  cumulative_mansa_x: Number (default: 0),
  total_invested: Number (default: 0),
  running_total_contributions: Number (default: 0),
  mansa_x_percentage: Number (default: 0),
  i_and_m_percentage: Number (default: 0),
  created_at: Date (default: Date.now),
  updated_at: Date (default: Date.now),
  last_calculated: Date,
  receipt_url: String,
  receipt_path: String,
  receipt_filename: String,
  receipt_uploaded_at: Date,
  receipt_uploaded_by: String
}
```

## ✅ Data Verification

### SQLite Data:
- Nov-2025: receipt_url = null
- Dec-2025: receipt_url = "https://drive.google.com/file/d/1hPLZ_gl-r3yPMlSc9TSwz1RjG-20nl7U/view?usp=drive_link"
- Jan-2026: receipt_url = "https://drive.google.com/file/d/1dAVV9vas0T1nbE5usBbfu9baM6D8ypmu/view?usp=drive_link"
- Feb-2026: receipt_url = "https://drive.google.com/file/d/1e8j1YgVwsaVwqXd6voVsOyfWWk0Wqmke/view?usp=drive_link"

### MongoDB Data:
- Nov-2025: receipt_url = null ✅
- Dec-2025: receipt_url = "https://drive.google.com/file/d/1hPLZ_gl-r3yPMlSc9TSwz1RjG-20nl7U/view?usp=drive_link" ✅
- Jan-2026: receipt_url = "https://drive.google.com/file/d/1dAVV9vas0T1nbE5usBbfu9baM6D8ypmu/view?usp=drive_link" ✅
- Feb-2026: receipt_url = "https://drive.google.com/file/d/1e8j1YgVwsaVwqXd6voVsOyfWWk0Wqmke/view?usp=drive_link" ✅

## 🎯 Status: STRUCTURES MATCH!

✅ All fields are present and correctly typed
✅ All data has been synchronized
✅ receipt_url field added to MongoDB schema
✅ All receipt URLs match between SQLite and MongoDB
✅ Timestamps and metadata preserved

The MongoDB investment_tracking collection now perfectly matches the SQLite structure and data!
