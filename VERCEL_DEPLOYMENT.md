# 🚀 Deploying Commander City Shuttle Pass Portal on Vercel

This application is ready to deploy on **Vercel** with full support for:
- 💳 **Online Payment Portal & Resident Self-Service**
- 🧠 **AI/OCR Receipt Scanning Engine** (JazzCash, EasyPaisa, Meezan, Bank Transfers, Raast)
- 🔒 **Duplicate Transaction Prevention & Auto-Acceptance Rules**
- 🎫 **Digital Print-Ready Pass Cards (CNIC 85.6mm × 54mm format with live QR code)**
- 📊 **Real-Time Google Sheets Auto-Sync**

---

## ⚡ Method 1: Deploy with Vercel CLI (1 Minute)

Run the following command in your terminal from this folder:

```bash
npx vercel
```

1. Select **Y** to link existing project or create new.
2. Accept default project settings (No build command needed — zero configuration static & serverless).
3. Once deployed, you will receive your live URL: `https://your-project-name.vercel.app`.

---

## 🌐 Method 2: Deploy via GitHub / Vercel Dashboard

1. Push your repository to **GitHub**:
   ```bash
   git add .
   git commit -m "Add Online Payment Portal with AI OCR Scanner"
   git push origin main
   ```
2. Go to [https://vercel.com/new](https://vercel.com/new).
3. Import your repository: `shuttle-pass-system`.
4. **Environment Variables** (Optional):
   - `GOOGLE_WEBHOOK_URL`: `https://script.google.com/macros/s/AKfycbyGXUJIPYrAcjE4FHzG97q6_kj95lCVKPgM9hxFANKZZt4_CL1YKukJVmjlRPLuDho/exec`
5. Click **Deploy**.

---

## 🔗 Live Portal Routes on Vercel

| Route | Purpose | Audience |
|---|---|---|
| `/` or `/index.html` | **Full Shuttle Pass System** (Passes, Directory, Renewal, + Merged Online Payment & OCR Portal) | Office Staff & Management |
| `/portal` or `/pay` | **Dedicated Resident Payment Portal** (Direct self-service payment & receipt OCR scanner) | Passengers / Residents |
| `/conductor` | Conductor QR Code Pass Verifier | Bus Conductors |
| `/admin-portal` | Transaction Logs & Audit Desk | Accountants / Managers |
| `/api/submit-payment` | Serverless payment verification & Google Sheets sync endpoint | System API |
| `/api/members` | Instant member lookup API | System API |
| `/api/passes` | Active passes verification API | System API |
| `/api/google-sync` | Google Sheets synchronization proxy | System API |

---

## 💾 Cloud Persistence Architecture (Vercel + Google Sheets)

Because Vercel is a global serverless platform with a read-only filesystem at runtime:
1. **Client-Side Storage**: The dashboard uses browser **IndexedDB** for blazing-fast search, filtering, and printing. On first launch on any device, it automatically seeds all 202 members and existing passes from the repository.
2. **Real-Time Cloud Ledger**: Every time an online transaction is verified via OCR or a pass is issued, it is automatically posted to the live **Google Sheets register** via Google Apps Script Webhook.
3. **Cross-Device Availability**: Passes issued on residents' phones are instantly logged in Google Sheets and visible in the office dashboard upon sync.

---

## 🧠 How the AI OCR System Works

1. **Preprocessing**: Receipt image is enhanced using HTML5 Canvas (contrast stretching and binarization).
2. **Recognition**: Tesseract.js runs directly in browser WASM with zero API key costs.
3. **Regex Extraction**: Custom patterns specifically recognize Pakistani banking formats:
   - **JazzCash**: TID (`012489...`), Amount (`Rs. 8,000`), Status (`Successful`), Recipient (`Commander City`).
   - **EasyPaisa**: Transaction ID (`301984...`), Amount, Date.
   - **Meezan Bank & Banking Apps**: Reference No, Beneficiary Title, Paid Amount.
   - **Raast**: STAN / RRN, 1Link instant transfer confirmation.
4. **Acceptance Rules**:
   - If Extracted Amount matches or exceeds required Pass Fee (PKR 8,000 for Full / PKR 4,000 for Half),
   - And Transaction ID is not a duplicate,
   - **Status is marked ACCEPTED**, a sequential monthly serial number is assigned, and a digital pass card with QR code is generated instantly.
5. **Google Sheets Sync**: The issued pass is automatically pushed to the live Google Sheets register.
