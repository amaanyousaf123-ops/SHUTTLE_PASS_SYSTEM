<div align="center">

# Shuttle Pass Renewal System

**A full-stack web application built for Commander City Housing Society to digitize monthly shuttle pass management and replace manual Excel tracking.**

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/pwa/)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)](https://sheets.google.com)

</div>

---

## Client Overview

| | |
|---|---|
| **Client** | Commander City Housing Society |
| **Industry** | Residential Community Management |
| **Role** | Full-Stack Developer (End-to-End Delivery) |
| **Status** | Deployed on local network |

---

## The Problem

Commander City manages monthly shuttle passes for hundreds of residents. Their existing workflow was entirely **manual and paper-based**:

- Passes tracked in Excel spreadsheets with no central system
- Serial numbers assigned manually, causing duplicates and confusion
- Monthly renewals required recreating every pass from scratch
- No audit trail for payments or pass issuance history
- No integration with their existing Google Sheets tracking

The result was **wasted hours every month**, frequent data entry errors, and no reliable record of who held a valid pass.

---

## The Solution

A **complete web-based shuttle pass management system** that runs entirely on the client's local network — no cloud database, no recurring costs, no data leaving their premises.

---

## Screenshots

### Desktop Dashboard

The main dashboard displays all pass cards in a responsive grid with 12 distinct monthly color themes. Each card shows the resident's name, CNIC, house number, serial badge, photo, and validity dates. Includes real-time sync status, search, filtering, and batch operations.

<div align="center">
  <img src="screenshots/dashboard.png" alt="Desktop Dashboard — Monthly Passes View" width="85%">
  <br>
  <em>Desktop Dashboard — Monthly pass cards with dark theme UI, sidebar navigation, and sync status</em>
</div>

<br>

### Monthly Pass Card Design

Pass cards are designed to the **standard CNIC physical dimension** (85.6mm × 54mm) for direct printing on card stock. Each month has a unique color theme (12 total), with member photo, serial badge, house number, and validity period — ready for batch printing.

---

## Key Features

| Module | Description |
|--------|-------------|
| **Monthly Pass Dashboard** | Card-based view with 12 monthly color themes, search, filtering, and batch operations |
| **Members Directory** | Full resident profiles with photo, CNIC, house/plot, contact — importable from Excel |
| **One-Click Bulk Renewal** | Renews all active passes to next month with auto-generated sequential serial numbers |
| **Google Sheets Auto-Sync** | All issued passes sync to Google Sheets via Apps Script webhook |
| **Online Payment Portal (Vercel)** | Resident self-service portal with instant AI/OCR receipt verification (JazzCash, EasyPaisa, Bank Apps) |
| **AI OCR Transaction Scanner** | Holographic laser scanner extracts TID, Amount, and Date, auto-verifying & issuing passes |
| **Conductor QR Pass Verifier** | Bus conductors scan passenger QR codes or serials for real-time validity check |
| **Print-Ready Pass Cards** | CNIC-standard cards (85.6mm × 54mm) with member photo, serial badge, monthly theme |
| **Auto CSV Registers** | Monthly Excel-ready registers with totals, generated in background |

---

## Architecture

```
┌───────────────────────────┐      HTTP / JSON       ┌──────────────────────────────┐
│  Desktop Dashboard        │ ─────────────────────▶ │  Node.js Host Server         │
│  (index.html)             │ ◀───────────────────── │  server.js :3000             │
│  • Monthly Passes         │   /api/sync            │  • Serves static files       │
│  • Members Directory      │   /api/system-state    │  • Writes JSON to data/      │
│  • Bulk Renewal           │                        │  • Auto CSV registers        │
│  • History & Reporting    │                        │  • Google Sheets webhook     │
└───────────────────────────┘                        └──────────────┬───────────────┘
        ▲                                                          │
        │ IndexedDB (offline cache)                                │
        │                                             ┌───────────▼───────────────┐
        │                                             │  Google Sheets            │
        └────────────────────────────────────────────▶ │  Apps Script Webhook     │
                                                      └───────────────────────────┘
```

**Design Decisions:**
- **Zero npm dependencies** — server uses only Node.js built-in modules (`http`, `fs`, `path`, `os`)
- **Browser-first data** — IndexedDB provides instant UI with background sync to disk
- **Local-only by design** — no data leaves the network unless Google Sheets sync is enabled

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript, CSS3, Font Awesome 6, Inter font |
| Backend | Node.js (zero dependencies — stdlib only) |
| Data Layer | Browser IndexedDB + local JSON files |
| Excel Parsing | SheetJS (xlsx) |
| Cloud Sync | Google Apps Script → Google Sheets |

---

## Key Features in Detail

### Smart Serial Number Management
Passes use auto-incrementing serial numbers scoped per month (`01`, `02`, `03`...), ensuring no duplicates. Supports both auto-assignment and manual serial selection.

### Fee Schedule System
Configurable fee rules that change over time — the system applies the correct rate based on pass month/year:

```javascript
// Fee increase from September 2026
{ startYear: 2026, startMonth: 9, fullAmount: 8000, halfAmount: 4000 }
{ startYear: 2026, startMonth: 1, fullAmount: 6000, halfAmount: 3000 }
```

### Manager Verification Workflow
Every pass is issued as immediately active and synced to Google Sheets — no manual approval step is required. Cards are set `verified: true` at issuance, so the system works as a single-step desk workflow.

### Data Safety
- Auto-versioned snapshots every 5 minutes (with force-sync button)

---

## Getting Started

### Quick Start (Windows)
1. Place the folder anywhere
2. Double-click `START.bat`
3. App opens at `http://localhost:3000`

### Manual Start
```bash
node server.js
# → http://localhost:3000
```

---

## Project Structure

```
shuttle-pass-system/
├── index.html                 # Desktop main app
├── server.js                  # Node.js server (API + static + CSV sync)
├── START.bat                  # One-click Windows launcher
├── screenshots/               # Application screenshots for documentation
├── css/
│   └── styles.css             # Desktop UI (dark theme, 12 card designs)
├── js/
│   ├── db.js                  # IndexedDB layer, sync, auto-save
│   └── app.js                 # Desktop app controller
└── scripts/
    └── google_apps_script.js  # Google Sheets Apps Script (paste into Sheets)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/system-state` | Full system state |
| `GET` | `/api/system-info` | Server info + LAN IPs |
| `POST` | `/api/sync` | Save/merge state |
| `GET/POST` | `/api/google-config` | Google Sheets webhook config |
| `POST` | `/api/test-google-sync` | Test webhook connection |

---

## Impact

- **Eliminated manual Excel tracking** — all pass data lives in one system
- **Reduced monthly renewal time** from hours to a single click
- **Zero data loss** — auto-versioned snapshots protect against overwrites
- **Seamless Google Sheets integration** — pass data flows to existing workflow
- **No recurring costs** — runs on local hardware, zero cloud dependencies

---

## Privacy & Data

This repository **excludes all customer data**. The `.gitignore` blocks `data/`, photo directories, imported member files, and business documents. Only application source code and documentation screenshots are published.

At runtime, all data stays on the client's local machine and network.
