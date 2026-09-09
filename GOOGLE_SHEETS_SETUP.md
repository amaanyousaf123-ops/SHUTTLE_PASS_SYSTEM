# 📊 Google Sheets Auto-Sync Setup Guide

Follow these quick steps to automatically update your Google Sheet whenever a card is created or renewed in your Shuttle Pass System.

---

### Step 1: Open Google Sheets
1. Create a new Google Sheet or open your existing Shuttle Pass Google Sheet.
2. Click **Extensions** in the top menu and select **Apps Script**.

---

### Step 2: Paste the Sync Code
1. Delete any code currently in the script editor.
2. Open the script file [`scripts/google_apps_script.js`](file:///e:/SHUTTLE%20PASS%20PAYMENTS/shuttle-pass-system/scripts/google_apps_script.js) from your project folder.
3. Copy all code and paste it into the Google Apps Script editor.
4. Click the **Save** (floppy disk) icon or press `Ctrl + S`.

---

### Step 3: Deploy as a Web App
1. At the top right of Apps Script, click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the deployment details:
   - **Description**: `Shuttle Pass Auto-Sync`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(Crucial: This allows your Shuttle Pass server to post updates securely)*
4. Click **Deploy**.
5. Grant required Google permissions if prompted:
   - Click **Authorize access**.
   - Select your Google Account.
   - Click **Advanced** > **Go to Untitled project (unsafe)** > **Allow**.
6. Copy the **Web App URL** generated (it will look like `https://script.google.com/macros/s/AKfycb.../exec`).

---

### Step 4: Save Webhook URL in your App
1. Open the Shuttle Pass Renewal System in your browser.
2. Click the **Google Sheets Sync** button in the header/settings bar.
3. Paste your copied **Web App URL** into the Webhook URL field.
4. Toggle **Enable Auto-Sync** to **ON**.
5. Click **Test Sync Connection** to test the connection.
6. Click **Save Google Settings**.

🎉 **You're all set!** Now, whenever a new card is issued or renewed, the member record in your Google Sheet will instantly auto-update!
