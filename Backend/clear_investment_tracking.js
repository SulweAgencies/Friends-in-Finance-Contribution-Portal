const sqlite3 = require("sqlite3").verbose();
const path = require('path');

// Database connection - use absolute path
const dbPath = path.join(__dirname, "contributions.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
    console.error("❌ Database path:", dbPath);
    process.exit(1);
  }
  console.log("✅ Connected to contributions.db");
});

async function clearInvestmentTracking() {
  return new Promise((resolve, reject) => {
    console.log("🔄 Starting investment tracking records cleanup...");
    
    // Begin transaction for safety
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error("❌ Error beginning transaction:", err.message);
        reject(err);
        return;
      }
      
      // First, check what records exist
      db.all("SELECT COUNT(*) as count FROM investment_tracking", (err, countResult) => {
        if (err) {
          console.error("❌ Error checking records:", err.message);
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        
        const recordCount = countResult[0].count;
        console.log(`📊 Found ${recordCount} investment tracking records`);
        
        if (recordCount === 0) {
          console.log("ℹ️  No investment tracking records to clear");
          db.run('COMMIT');
          resolve({ cleared: 0, message: "No records to clear" });
          return;
        }
        
        // Clear all records from investment_tracking table
        db.run("DELETE FROM investment_tracking", function(err) {
          if (err) {
            console.error("❌ Error clearing investment_tracking:", err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          console.log(`✅ Successfully cleared ${this.changes} investment tracking records`);
          
          // Reset auto-increment ID
          db.run("DELETE FROM sqlite_sequence WHERE name = 'investment_tracking'", (seqErr) => {
            if (seqErr) {
              console.warn("⚠️  Warning: Could not reset auto-increment:", seqErr.message);
            } else {
              console.log("✅ Reset auto-increment ID");
            }
            
            // Commit transaction
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error("❌ Error committing transaction:", commitErr.message);
                reject(commitErr);
                return;
              }
              
              console.log("✅ Transaction committed successfully");
              resolve({ 
                cleared: this.changes, 
                message: "Investment tracking records cleared successfully" 
              });
            });
          });
        });
      });
    });
  });
}

// Main execution
async function main() {
  try {
    console.log("🚀 Investment Tracking Clear Utility");
    console.log("=====================================");
    
    const result = await clearInvestmentTracking();
    
    console.log("\n📋 Summary:");
    console.log(`- Records cleared: ${result.cleared}`);
    console.log(`- Status: ${result.message}`);
    console.log("\n💡 Next steps:");
    console.log("1. Run 'node recalc_investments.js' to rebuild tracking from current contributions");
    console.log("2. Check the investment tracking data in the application");
    
    // Close database connection
    db.close((err) => {
      if (err) {
        console.error("❌ Error closing database:", err.message);
        process.exit(1);
      }
      console.log("✅ Database connection closed");
      process.exit(0);
    });
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    db.close();
    process.exit(1);
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  console.log("\n⚠️  Process interrupted - rolling back changes...");
  db.run('ROLLBACK');
  db.close();
  process.exit(1);
});

// Run the script
main();
