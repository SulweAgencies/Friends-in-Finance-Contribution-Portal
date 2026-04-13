# MongoDB Atlas IP Whitelist Setup Guide

## 🚨 Required Action: Add Your IP to MongoDB Atlas Whitelist

Your MongoDB Atlas cluster is rejecting connections because your IP address is not whitelisted.

### 🔧 Quick Fix Steps:

1. **Go to MongoDB Atlas Dashboard**: https://cloud.mongodb.com/
2. **Navigate to your cluster**: "friendsfinance" cluster
3. **Click "Connect" button**
4. **Select "Network Access"** from left menu
5. **Click "Add IP Address"**
6. **Choose "Allow Access from Anywhere"** (0.0.0.0/0) for testing
   - OR add your specific IP address
7. **Click "Confirm"**

### 🌐 Alternative: Use Current IP

Your current IP needs to be added. You can find it by visiting:
- https://whatismyipaddress.com/
- Or search "what is my IP" in Google

### ⚡ Quick Test Connection

After whitelisting, test with:

```bash
cd Backend
node test-connection.js
```

### 🚀 Start MongoDB Server

Once IP is whitelisted:

```bash
cd Backend
node server-mongodb.js
```

### 📊 Expected Output

```
✅ MongoDB connection successful!
📊 Database name: friends_in_finance
🚀 Server running on port 3000
📊 MongoDB database connected
```

## 🔥 Why This Happens

MongoDB Atlas requires IP whitelisting for security. This prevents unauthorized access to your database.

## 💡 Production Tip

For production, use specific IP addresses instead of "Allow Access from Anywhere" for better security.
