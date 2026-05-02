# ⚡ Quick Start: Deploy on Render (5 Minutes)

## What You're Getting

✅ **Backend Proxy** (server.js) - Solves CORS issue  
✅ **Frontend App** (index.html) - Works on desktop & mobile  
✅ **Real Data** - Fetches from Dexscreener API via proxy  

---

## Step 1: Prepare Files

You have 3 files:
1. **server.js** - Backend server
2. **package.json** - Dependencies
3. **index.html** - Frontend app

Create a folder on your computer with these 3 files. That's your project.

---

## Step 2: Create GitHub Repo

1. Go to **github.com** (create free account if needed)
2. Click **"New repository"**
3. Name it: `token-analyzer`
4. Keep it **Public**
5. Click **"Create repository"**

---

## Step 3: Push Code to GitHub

Open Command Prompt/Terminal in your project folder:

```bash
git init
git add .
git commit -m "Token analyzer with proxy backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/token-analyzer.git
git push -u origin main
```

(Replace `YOUR_USERNAME` with your GitHub username)

---

## Step 4: Deploy on Render

1. Go to **render.com** (create free account)
2. Click **"New +"** button → **"Web Service"**
3. Click **"Connect GitHub"**
4. Find your `token-analyzer` repo → Click **"Connect"**
5. Set these settings:
   - **Name:** `token-analyzer-proxy`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Click **"Create Web Service"**

**Wait 3-5 minutes...**

You'll get a URL like: `https://token-analyzer-proxy.onrender.com`

---

## Step 5: Update Frontend with Server URL

Edit **index.html** - Find this line (around line 300):

```javascript
let serverUrl = window.location.origin;
```

Replace with your Render URL:

```javascript
let serverUrl = 'https://token-analyzer-proxy.onrender.com';
```

Save and push to GitHub:

```bash
git add index.html
git commit -m "Update server URL"
git push
```

Render will auto-deploy!

---

## Step 6: Test Your App

1. **Desktop:** Go to `https://token-analyzer-proxy.onrender.com`
2. **Mobile:** Open same URL on your phone
3. Click **"⭐ Top 10"**
4. Select **"Solana"**
5. Click **"Load"**
6. Wait a few seconds... **Real data appears!** ✅

---

## 🎯 What Just Happened

- ✅ Deployed backend proxy to Render (free)
- ✅ Backend proxies Dexscreener API (solves CORS)
- ✅ Frontend calls your backend (no CORS issues!)
- ✅ You get real live data on mobile and desktop
- ✅ Works for free (with 30-second cold start after inactivity)

---

## ⚠️ Known Issues & Fixes

### **Issue 1: First request takes 30-50 seconds**
**Why:** Render spins down after 15 mins idle (free tier)  
**Fix:** Click the link again - it wakes up and loads normally  
**Alternative:** Upgrade to Railway ($5/month) for instant response

### **Issue 2: "Server offline" message**
**Why:** Render is starting up  
**Fix:** Wait 10-15 seconds and refresh page

### **Issue 3: Data loads very slowly on mobile**
**Why:** Cold start + network latency  
**Fix:** Normal on free tier. Use app regularly to keep it warm

### **Issue 4: App stops working after a month**
**Why:** Render free tier might have issues  
**Fix:** Switch to Railway (see DEPLOYMENT-GUIDE.md)

---

## 📱 Using on Your Phone

1. Save the URL: `https://token-analyzer-proxy.onrender.com`
2. Open in browser
3. Bookmark it (add to home screen for quick access)
4. Use like any app!

---

## 🚀 Next Steps

1. **Test it thoroughly** - Try different tokens
2. **Check server logs** - In Render dashboard to debug any issues
3. **Use for trading** - Real data, real decisions!
4. **Upgrade if needed** - Railway ($5/month) if you want better performance

---

## 💾 All Your Files

Download these 4 files and keep them safe:
- `server.js`
- `package.json`
- `index.html`
- `DEPLOYMENT-GUIDE.md` (reference)

They're your complete app!

---

## ✅ Success Checklist

- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Render web service created
- [ ] App deployed (shows URL)
- [ ] Render URL updated in index.html
- [ ] Frontend redeployed
- [ ] Tested on desktop (shows real data)
- [ ] Tested on mobile (shows real data)
- [ ] You're analyzing REAL tokens!

---

## 🎉 You're Done!

You now have a working Token Analyzer with:
- ✅ Real data from Dexscreener
- ✅ Works on desktop & mobile
- ✅ Deployed to the cloud
- ✅ Free hosting
- ✅ No CORS issues

**Happy analyzing!** 📊🚀
