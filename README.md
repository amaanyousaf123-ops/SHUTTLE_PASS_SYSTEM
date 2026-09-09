# 🚌 Shuttle Pass Renewal System — Commander City

A standalone web application for managing monthly shuttle pass cards at **Commander City**. It issues monthly passes with auto-generated serial numbers, performs one-click bulk monthly renewals, tracks members and payments, prints pass cards, and syncs manager-approved data to Google Sheets.

Runs entirely on your local network — no cloud database required.

---

## ✨ Features

### 🎫 Monthly Card Management
- Create, edit, search, and print shuttle passes.
- Auto-formatted monthly serial numbers: `SP-YYYY-MM-001`, `SP-YYYY-MM-002`, …
- Pass types (Full / Half) with configurable monthly amounts.
- Card states: `active`, `on_hold`, paused/archived, etc.

### 👥 Members Directory
- Full member profiles: name, CNIC, house/plot number, contact, route, vehicle number, and photo.
- Import members in bulk from Excel (`.xlsx` / `.csv`), including the **"Import August Serial List"** tool which maps your Excel columns and either assigns serials to existing members or auto-creates new ones.

### 🔄 One-Click Bulk Renewal
- Renew all active members into the next month cycle with new serial numbers and valid date ranges in a single click.
- Full **Renewal History** view for audit trails.

### 🖨️ Print Support
- Print single pass cards immediately after issue.
- Batch print sheets for an entire month's passes.

### 📱 Manager Mobile Verification App
- Companion mobile web app (`mobile.html`) served over your LAN.
- Paired to the desktop app via QR code (auto-generated URL).
- Manager login, real-time **pending pass queue**, approve / hold / bulk-verify passes while the desktop app updates instantly over Server-Sent Events.
- Add to home screen / installable via PWA `manifest.json`.

### 📊 Google Sheets Auto-Sync
- One-way auto-sync of **manager-verified** passes and members to Google Sheets via a webhook (Apps Script).
- Test connection and enable/disable sync from the UI. See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md).

### 💾 Reliable Local Persistence
- Browser **IndexedDB** front-end cache for instant UI.
- Background sync to JSON on disk (`data/system_state.json`, plus `members.json`, `passes.json`, `payments.json`, `history.json`).
- **Automatic versioned snapshots** every ~5 minutes (or force-sync with a button).
- **Monthly CSV registers** auto-generated for Excel (`Shuttle_Passes_January_2026.csv`, etc.) with totals and per-pass rows.

### 📡 Real-Time Sync
- Server-Sent Events (SSE) push card approvals from the Manager mobile app to all open desktop clients instantly.
- A "sync guard" ensures manager approvals on the server can never be overwritten by a stale browser tab.

---

## 🏗️ Architecture

```
┌───────────────────────┐      HTTP / JSON       ┌──────────────────────────────┐
│  Desktop (index.html) │ ─────────────────────▶ │  Node.js Host Server         │
│  - Monthly Passes     │ ◀───────────────────── │  server.js :3000             │
│  - Members Directory  │   /api/sync            │  - serves static files       │
│  - Bulk Renewal       │   /api/system-state    │  - writes JSON to data/      │
│  - History            │   /api/events (SSE)    │  - auto CSV registers        │
└───────────────────────┘                        │  - Google Sheets webhook     │
        ▲                                        └──────────────┬───────────────┘
        │ IndexedDB (offline cache)                            │
        │                                        ┌──────────────▼───────────────┐
┌───────────────────────┐    LAN (same Wi-Fi)    │  Manager Mobile App          │
│  mobile.html          │ ─────────────────────▶ │  - login → pending queue     │
│  (phone/tablet)       │   /api/login           │  - approve / hold / bulk OK  │
│  PWA installable      │   /api/pending-passes  │  - real-time via SSE         │
└───────────────────────┘   /api/approve-pass    └──────────────────────────────┘
```

- **Front end**: Vanilla JS (no framework), CSS, Font Awesome icons, SheetJS (Excel parsing), QRCode.js (LAN pairing).
- **Back end**: Node.js standard library only (`http`, `fs`, `path`, `os`) — no npm dependencies.
- **Storage**: Browser IndexedDB + local JSON files. Uploaded to GitHub for public reference **without any customer data**.

---

## 🚀 Getting Started

### Option A — Windows (recommended)
1. Place the folder anywhere (e.g. Desktop).
2. Double-click **`START.bat`**.
3. The app starts at `http://localhost:3000` and opens in your browser automatically.

### Option B — Manual with Node.js
1. Install [Node.js](https://nodejs.org) (any modern LTS).
2. Open a terminal in the project folder.
3. Run:

```bash
node server.js
```

4. Open `http://localhost:3000`.

### Access on your local network
- Desktop UI: `http://localhost:3000` (or `http://YOUR_LAN_IP:3000`).
- Manager Mobile App: open the **"Manager Mobile App QR"** button in the sidebar/top bar and scan it with your phone on the same Wi-Fi — or navigate directly to `http://YOUR_LAN_IP:3000/mobile.html`.
- The server prints all LAN IPs on startup.

### Default Manager Login (mobile app / admin)
| Field | Default |
|-------|---------|
| Username | `admin` (also accepts `manager` / `admin123` password) |
| Password | `admin123` |

> Change the password from the mobile app's password screen, or by creating `data/manager_config.json` with `{ "username": "...", "password": "..." }`.

---

## 📡 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/system-state` | Full system state (members, passes, payments, history) |
| `GET` | `/api/system-info` | Port + LAN IPs + mobile URL |
| `GET` | `/api/events` | Server-Sent Events stream (real-time updates) |
| `POST` | `/api/login` | Manager login for the mobile app |
| `POST` | `/api/change-manager-password` | Change manager password (manager only) |
| `GET` | `/api/pending-passes` | Passes awaiting manager verification |
| `POST` | `/api/approve-pass` | Approve a single pass |
| `POST` | `/api/reject-pass` | Hold/reject a pass with a reason |
| `POST` | `/api/verify-all` | Bulk-verify all pending passes |
| `POST` | `/api/sync` | Save/merge full state; server always wins on verified flags |
| `GET`/`POST` | `/api/google-config` | Read/update Google Sheets webhook config |
| `POST` | `/api/test-google-sync` | Send a test connection payload to the webhook |

---

## 📁 Project Structure

```
shuttle-pass-system/
├── index.html            # Desktop main app (dashboard, passes, members, renewal)
├── admin.html            # Redirect shim to the manager admin panel
├── mobile.html           # Manager Mobile Verification App (PWA)
├── server.js             # Node.js host server (API + static files + CSV/Sheets sync)
├── manifest.json         # PWA manifest for the mobile app
├── START.bat             # One-click Windows launcher
├── css/
│   ├── styles.css        # Desktop UI styles
│   └── mobile.css        # Mobile app styles
├── js/
│   ├── db.js             # IndexedDB layer, seed data, host sync polling
│   ├── app.js            # Desktop app controller (UI logic, imports, printing)
│   └── mobile.js         # Mobile app controller
└── scripts/
    ├── google_apps_script.js    # Paste into Google Apps Script (see GOOGLE_SHEETS_SETUP.md)
    ├── create_quotation.py      # DOCX quotation generator
    ├── create_quotation_pure.py # Quotation generator (pure python-docx)
    ├── extract_d_shuttle_pass.ps1  # Extract member data from Word pass docs
    └── create_shortcuts.ps1     # Create desktop shortcuts
```

---

## 🔒 Privacy & Customer Data

This repository intentionally **excludes all customer data**:

- `.gitignore` blocks `data/` (members, passes, payments, history, backups, exports, Google webhook config), photo directories, imported member JSON, quotation documents, and executables.
- Only application source code is published.

At runtime, all data stays on your own machine/network.

---

## 📊 Google Sheets Sync

See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) for step-by-step setup:

1. Open/Create your Google Sheet → **Extensions → Apps Script**.
2. Paste the contents of `scripts/google_apps_script.js`.
3. **Deploy → New deployment → Web app** (Execute as: *Me*, Access: *Anyone*).
4. Copy the `/exec` URL into **Google Sheets Settings** in the app, enable sync, and click **Test Sync Connection**.

Only passes marked **verified by the manager** are synced (photos stripped from the payload).

---

## 🛠️ Development Notes

- No build step, no package.json, no npm install — just Node.js.
- Front-end data lives in IndexedDB; the server is the source of truth for `verified` flags.
- Editable files: `js/app.js` (desktop UI), `js/db.js` (data layer), `js/mobile.js` (mobile UI), `server.js` (API).
- Port is configurable at the top of `server.js` (`const PORT = 3000;`).

---

## 🧰 Requirements

- **Windows**: any modern version — just double-click `START.bat`.
- **Node.js**: required only for the manual start (Option B).
- A Wi-Fi/LAN connection if you need to use the Manager Mobile App on a phone.