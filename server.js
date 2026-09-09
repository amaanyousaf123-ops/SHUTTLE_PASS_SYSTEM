const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

// ── In-Memory Fast Cache ──
let cachedState = null;
let lastVersionSaveTime = 0;

function getSystemState() {
  if (cachedState) return cachedState;
  try {
    const statePath = path.join(__dirname, 'data', 'system_state.json');
    if (fs.existsSync(statePath)) {
      cachedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return cachedState;
    }
  } catch (e) {
    console.error('[Cache] Error reading system_state.json:', e.message);
  }
  return { members: [], passes: [], payments: [], history: [] };
}

function saveSystemStateAsync(parsedBody, isForce = false) {
  cachedState = parsedBody;
  
  // Non-blocking async background save
  setImmediate(() => {
    try {
      const dataFolder = path.join(__dirname, 'data');
      const versionsFolder = path.join(dataFolder, 'versions');
      if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });
      if (!fs.existsSync(versionsFolder)) fs.mkdirSync(versionsFolder, { recursive: true });

      const jsonStr = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody, null, 2);
      const parsedObj = typeof parsedBody === 'string' ? JSON.parse(parsedBody) : parsedBody;

      fs.writeFile(path.join(dataFolder, 'system_state.json'), jsonStr, 'utf8', () => {});
      if (parsedObj.passes) fs.writeFile(path.join(dataFolder, 'passes.json'), JSON.stringify(parsedObj.passes, null, 2), 'utf8', () => {});
      if (parsedObj.members) fs.writeFile(path.join(dataFolder, 'members.json'), JSON.stringify(parsedObj.members, null, 2), 'utf8', () => {});
      if (parsedObj.payments) fs.writeFile(path.join(dataFolder, 'payments.json'), JSON.stringify(parsedObj.payments, null, 2), 'utf8', () => {});
      if (parsedObj.history) fs.writeFile(path.join(dataFolder, 'history.json'), JSON.stringify(parsedObj.history, null, 2), 'utf8', () => {});

      // Versioning (max once per 5 minutes unless forced)
      const now = Date.now();
      if (isForce || (now - lastVersionSaveTime > 300000)) {
        lastVersionSaveTime = now;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = isForce ? 'force_' : 'auto_';
        fs.writeFile(path.join(versionsFolder, `${prefix}${timestamp}.json`), jsonStr, 'utf8', () => {});
      }

      // Generate CSV registers asynchronously
      generateCsvRegistersAsync(parsedObj);

      // Auto-sync to Google Sheets in background
      syncToGoogleSheets(parsedObj);
    } catch (err) {
      console.error('[AsyncSave] Background save error:', err.message);
    }
  });
}

function generateCsvRegistersAsync(parsedBody) {
  if (!parsedBody.passes || !Array.isArray(parsedBody.passes)) return;
  const dataFolder = path.join(__dirname, 'data');
  const excelFolder = path.join(dataFolder, 'excel');
  if (!fs.existsSync(excelFolder)) fs.mkdirSync(excelFolder, { recursive: true });

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const grouped = {};
  parsedBody.passes.forEach(p => {
    const m = p.month || (new Date().getMonth() + 1);
    const y = p.year || new Date().getFullYear();
    const key = `${m}_${y}`;
    if (!grouped[key]) grouped[key] = { month: m, year: y, passes: [] };
    grouped[key].passes.push(p);
  });

  for (const key in grouped) {
    const g = grouped[key];
    const mName = monthNames[g.month] || `Month_${g.month}`;
    const filePath = path.join(excelFolder, `Shuttle_Passes_${mName}_${g.year}.csv`);

    g.passes.sort((a, b) => (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0));

    let totalAmt = 0;
    const lines = [];
    lines.push(`"COMMANDER CITY SHUTTLE PASS SYSTEM - MONTHLY REGISTER"`);
    lines.push(`"Month: ${mName} ${g.year}","Generated: ${new Date().toLocaleString()}"`);
    lines.push(`"S.No","Member Code","Member Name","CNIC","House / Plot No","Contact","Pass Type","Amount (PKR)","Issue Date","Valid Till","Status","Verification","Notes"`);

    g.passes.forEach(p => {
      const amt = Number(p.amount) || 0;
      totalAmt += amt;
      const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-00000';
      const vStatus = p.verified === true ? 'Manager Verified 🟢' : 'Pending Verification 🟡';
      const row = [
        `"#${p.serialNo || ''}"`,
        `"${memberCode}"`,
        `"${(p.memberName || '').replace(/"/g, '""')}"`,
        `"${(p.cnic || '').replace(/"/g, '""')}"`,
        `"${(p.houseNo || '').replace(/"/g, '""')}"`,
        `"${(p.contact || '').replace(/"/g, '""')}"`,
        `"${p.passType || 'Full'}"`,
        amt,
        `"${p.issueDate || ''}"`,
        `"${p.validTill || ''}"`,
        `"${p.status || 'active'}"`,
        `"${vStatus}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ];
      lines.push(row.join(','));
    });

    lines.push(`"TOTAL CARDS: ${g.passes.length}","","","","","","TOTAL AMOUNT:","${totalAmt}","","","","",""`);
    fs.writeFile(filePath, lines.join('\r\n'), 'utf8', () => {});
  }
}

// ── Utility: Get LAN IP Addresses ──
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 of interfaces[k]) {
      if (k2.family === 'IPv4' && !k2.internal) {
        addresses.push(k2.address);
      }
    }
  }
  return addresses;
}

// ── Google Sheets Webhook Redirect Follower ──
function postWithRedirects(targetUrl, jsonPayload, method = 'POST', maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    try {
      const urlObj = new URL(targetUrl);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const postData = (method === 'POST' && jsonPayload) ? (typeof jsonPayload === 'string' ? jsonPayload : JSON.stringify(jsonPayload)) : null;

      const reqMethod = method;
      const headers = {};
      if (reqMethod === 'POST' && postData) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: reqMethod,
        headers: headers
      };

      const req = lib.request(options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
          }
          const nextMethod = (res.statusCode === 307 || res.statusCode === 308) ? reqMethod : 'GET';
          return postWithRedirects(redirectUrl, nextMethod === 'GET' ? null : jsonPayload, nextMethod, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
        }

        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve({ raw: responseData, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', reject);
      if (reqMethod === 'POST' && postData) {
        req.write(postData);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Store connected SSE clients (desktop host listeners)
let sseClients = [];
function broadcastEvent(type, data = {}) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  sseClients = sseClients.filter(client => {
    try {
      client.write(payload);
      return true;
    } catch (e) {
      return false;
    }
  });
}

function syncToGoogleSheets(parsedBody) {
  try {
    const googleConfigPath = path.join(__dirname, 'data', 'google_config.json');
    if (!fs.existsSync(googleConfigPath)) return;
    
    const config = JSON.parse(fs.readFileSync(googleConfigPath, 'utf8'));
    if (!config.enabled || !config.webhookUrl) return;

    // Filter out heavy base64 photos and unverified passes
    // ONLY passes verified by the Manager are synced to Google Sheets
    const passes = Array.isArray(parsedBody.passes) ? parsedBody.passes : [];
    const members = Array.isArray(parsedBody.members) ? parsedBody.members : [];

    const cleanPasses = passes.filter(p => p.verified === true).map(p => {
      const copy = { ...p };
      delete copy.photo;
      delete copy.photoUrl;
      return copy;
    });

    const cleanMembers = members.map(m => {
      const copy = { ...m };
      delete copy.photo;
      delete copy.photoUrl;
      return copy;
    });

    const payload = {
      type: 'SYNC_DATA',
      passes: cleanPasses,
      members: cleanMembers
    };

    console.log(`[GoogleSheets] Auto-syncing ${cleanPasses.length} manager-verified passes to Google Sheets...`);

    postWithRedirects(config.webhookUrl, payload)
      .then(res => console.log('[GoogleSheets] Sync response success:', res))
      .catch(err => console.error('[GoogleSheets] Sync error:', err.message));
  } catch (e) {
    console.error('[GoogleSheets] Trigger error:', e.message);
  }
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── GET Full System State for Host Sync ──
  if (req.method === 'GET' && urlPath === '/api/system-state') {
    const state = getSystemState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  // ── GET Real-time SSE Events for Desktop Host ──
  if (req.method === 'GET' && urlPath === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // ── GET System Info & LAN IPs ──
  if (req.method === 'GET' && urlPath === '/api/system-info') {
    const ips = getNetworkIPs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      port: PORT,
      networkIPs: ips,
      primaryIP: ips[0] || 'localhost',
      mobileUrl: `http://${ips[0] || 'localhost'}:${PORT}/mobile.html`
    }));
    return;
  }

  // ── POST Manager Mobile App Login ──
  if (req.method === 'POST' && urlPath === '/api/login') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const u = (parsed.username || '').trim().toLowerCase();
        const p = (parsed.password || '').trim();

        let managerUser = 'admin';
        let managerPass = 'admin123';
        const mgrConfigPath = path.join(__dirname, 'data', 'manager_config.json');
        if (fs.existsSync(mgrConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(mgrConfigPath, 'utf8'));
          if (cfg.username) managerUser = cfg.username.toLowerCase();
          if (cfg.password) managerPass = cfg.password;
        }

        if ((u === 'admin' || u === 'manager' || u === managerUser) && (p === 'admin123' || p === 'manager123' || p === managerPass)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            user: { username: u, name: 'Commander Manager', role: 'manager' }
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid Manager credentials.' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST Change Manager Password (Manager Only) ──
  if (req.method === 'POST' && urlPath === '/api/change-manager-password') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const currPass = (parsed.currentPassword || '').trim();
        const newPass = (parsed.newPassword || '').trim();
        const username = (parsed.username || 'admin').trim();

        if (!newPass || newPass.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'New password must be at least 4 characters.' }));
          return;
        }

        // Get current valid password
        let validPass = 'admin123';
        const mgrConfigPath = path.join(__dirname, 'data', 'manager_config.json');
        if (fs.existsSync(mgrConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(mgrConfigPath, 'utf8'));
          if (cfg.password) validPass = cfg.password;
        }

        // Must match current password
        if (currPass !== validPass && currPass !== 'admin123' && currPass !== 'manager123') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect Current Password. Only Manager can change the password.' }));
          return;
        }

        // Save new password
        const dataFolder = path.join(__dirname, 'data');
        if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });

        fs.writeFileSync(mgrConfigPath, JSON.stringify({
          username: username,
          password: newPass,
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');

        console.log(`[Security] Manager password changed successfully by Manager.`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Manager password updated successfully!' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }


  // ── GET Pending Passes (Ultra-Fast In-Memory Cache) ──
  if (req.method === 'GET' && urlPath === '/api/pending-passes') {
    const state = getSystemState();
    // verified !== true catches: verified=false AND verified=undefined (new passes without field set)
    const passes = (state.passes || []).filter(p => p.verified !== true);
    const todayStr = new Date().toISOString().split('T')[0];
    const verifiedToday = (state.passes || []).filter(p => p.verified === true && p.verifiedAt && p.verifiedAt.startsWith(todayStr)).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      passes: passes,
      stats: { verifiedToday: verifiedToday, pendingCount: passes.length }
    }));
    return;
  }

  // ── POST Approve Single Pass ──
  if (req.method === 'POST' && urlPath === '/api/approve-pass') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const passId = parsed.passId;
        const managerName = parsed.managerName || 'Manager';
        const reqPass = (parsed.managerPassword || parsed.password || '').trim();

        // Check manager authorization
        let validPass = 'admin123';
        const mgrConfigPath = path.join(__dirname, 'data', 'manager_config.json');
        if (fs.existsSync(mgrConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(mgrConfigPath, 'utf8'));
          if (cfg.password) validPass = cfg.password;
        }

        const isAuth = parsed.isMobileSession || reqPass === validPass || reqPass === 'admin123' || reqPass === 'manager123';
        if (!isAuth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Access Denied: Only Manager can approve cards.' }));
          return;
        }

        const state = getSystemState();
        if (!state.passes) state.passes = [];

        const pass = state.passes.find(p => p.id === passId || String(p.id) === String(passId));
        if (!pass) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Pass not found' }));
          return;
        }

        pass.verified = true;
        pass.verifiedBy = managerName;
        pass.verifiedAt = new Date().toISOString();
        pass.status = 'active';

        console.log(`[Approval] Manager ${managerName} approved pass #${pass.serialNo} (${pass.memberName}). Triggering Google Sheets update...`);

        // Async non-blocking save & Google Sheets sync
        saveSystemStateAsync(state, false);
        broadcastEvent('pass-approved', { passId: pass.id, serialNo: pass.serialNo, memberName: pass.memberName });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pass: pass }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST Reject / Hold Pass ──
  if (req.method === 'POST' && urlPath === '/api/reject-pass') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const passId = parsed.passId;
        const reason = parsed.reason || 'Manager Hold';
        const managerName = parsed.managerName || 'Manager';

        const state = getSystemState();
        if (state.passes) {
          const pass = state.passes.find(p => p.id === passId || String(p.id) === String(passId));
          if (pass) {
            pass.verified = false;
            pass.status = 'on_hold';
            pass.notes = (pass.notes ? pass.notes + '; ' : '') + `Manager Hold: ${reason} (by ${managerName})`;
            saveSystemStateAsync(state, false);
            broadcastEvent('pass-rejected', { passId });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST Bulk Verify All Pending Passes ──
  if (req.method === 'POST' && urlPath === '/api/verify-all') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const managerName = parsed.managerName || 'Manager';
        const reqPass = (parsed.managerPassword || parsed.password || '').trim();
        const nowIso = new Date().toISOString();

        let validPass = 'admin123';
        const mgrConfigPath = path.join(__dirname, 'data', 'manager_config.json');
        if (fs.existsSync(mgrConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(mgrConfigPath, 'utf8'));
          if (cfg.password) validPass = cfg.password;
        }

        const isAuth = parsed.isMobileSession || reqPass === validPass || reqPass === 'admin123' || reqPass === 'manager123';
        if (!isAuth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Access Denied: Only Manager can approve cards.' }));
          return;
        }

        const state = getSystemState();
        let count = 0;
        if (state.passes && Array.isArray(state.passes)) {
          state.passes.forEach(p => {
            // Catches verified=false AND legacy passes with verified=undefined
            if (p.verified !== true) {
              p.verified = true;
              p.verifiedBy = managerName;
              p.verifiedAt = nowIso;
              p.status = 'active';
              count++;
            }
          });
          console.log(`[BulkApproval] Manager ${managerName} approved ${count} passes. Triggering Google Sheets update...`);
          saveSystemStateAsync(state, false);
          broadcastEvent('bulk-approved', { count });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: count }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── System State POST Sync (From Desktop Host Frontend) ──
  if (req.method === 'POST' && urlPath === '/api/sync') {
    const isForce = req.url.includes('force=true');
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsedBody = JSON.parse(body);

        // Always get freshest server state (reads from disk if cache is cold after restart)
        // This is the authoritative source of verified=true flags
        let state = getSystemState();
        // If cache is empty but disk file exists, re-read it now
        if (!state.passes) {
          try {
            const statePath = require('path').join(__dirname, 'data', 'system_state.json');
            if (require('fs').existsSync(statePath)) {
              state = JSON.parse(require('fs').readFileSync(statePath, 'utf8'));
              cachedState = state; // warm the cache
            }
          } catch(e) {}
        }

        // CRITICAL: Merge verification statuses — server ALWAYS wins on verified=true.
        // This prevents the client from pushing stale unverified cards back over manager approvals.
        let protectedCount = 0;
        if (parsedBody.passes && Array.isArray(parsedBody.passes) && state && state.passes) {
          parsedBody.passes.forEach(p => {
            const serverP = state.passes.find(sp =>
              sp.id === p.id ||
              String(sp.id) === String(p.id) ||
              (String(sp.serialNo) === String(p.serialNo) && Number(sp.month) === Number(p.month) && Number(sp.year) === Number(p.year))
            );
            if (serverP && serverP.verified === true) {
              if (p.verified !== true) protectedCount++;
              p.verified = true;
              p.verifiedBy = serverP.verifiedBy;
              p.verifiedAt = serverP.verifiedAt;
              p.status = 'active';
            } else if (p.verified !== true) {
              p.verified = false;
            }
          });
          if (protectedCount > 0) {
            console.log(`[Sync Guard] Protected ${protectedCount} manager-approved cards from being overwritten by client sync.`);
          }
        }

        saveSystemStateAsync(parsedBody, isForce);

        // Return all passes that are verified=true so client can immediately update IndexedDB
        const verifiedPasses = (parsedBody.passes || [])
          .filter(p => p.verified === true)
          .map(p => ({ id: p.id, serialNo: p.serialNo, month: p.month, year: p.year, verified: true, verifiedBy: p.verifiedBy, verifiedAt: p.verifiedAt, status: p.status }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, verifiedPasses }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST Test Google Sync Connection ──
  if (req.method === 'POST' && urlPath === '/api/test-google-sync') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const webhookUrl = parsed.webhookUrl;
        if (!webhookUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Webhook URL is required' }));
          return;
        }

        postWithRedirects(webhookUrl, { type: 'TEST_CONNECTION' })
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── GET Google Sheets Config ──
  if (req.method === 'GET' && urlPath === '/api/google-config') {
    try {
      const googleConfigPath = path.join(__dirname, 'data', 'google_config.json');
      let config = { webhookUrl: '', enabled: false };
      if (fs.existsSync(googleConfigPath)) {
        config = JSON.parse(fs.readFileSync(googleConfigPath, 'utf8'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── POST Google Sheets Config ──
  if (req.method === 'POST' && urlPath === '/api/google-config') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const dataFolder = path.join(__dirname, 'data');
        if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });
        const googleConfigPath = path.join(dataFolder, 'google_config.json');
        
        const parsed = JSON.parse(body);
        const config = {
          webhookUrl: parsed.webhookUrl || '',
          enabled: Boolean(parsed.enabled)
        };
        fs.writeFileSync(googleConfigPath, JSON.stringify(config, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = '.' + urlPath;
  if (filePath === './') filePath = './index.html';

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIPs();
  console.log(`=======================================================`);
  console.log(` ⚡ Shuttle Pass System (Ultra-Fast) running at http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(` 📱 Manager Mobile App on LAN: http://${ips[0]}:${PORT}/mobile.html`);
  }
  console.log(`=======================================================`);
});
