const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 3001;
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
    lines.push(`"S.No","Member Code","Member Name","CNIC","House / Plot No","Contact","Pass Type","Amount (PKR)","Payment Method","Issue Date","Valid Till","Status","Verification","Notes"`);

    g.passes.forEach(p => {
      const amt = Number(p.amount) || 0;
      totalAmt += amt;
      const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-00000';
      const vStatus = 'Auto-Verified 🟢';
      const payMethod = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
      const row = [
        `"#${p.serialNo || ''}"`,
        `"${memberCode}"`,
        `"${(p.memberName || '').replace(/"/g, '""')}"`,
        `"${(p.cnic || '').replace(/"/g, '""')}"`,
        `"${(p.houseNo || '').replace(/"/g, '""')}"`,
        `"${(p.contact || '').replace(/"/g, '""')}"`,
        `"${p.passType || 'Full'}"`,
        amt,
        `"${payMethod}"`,
        `"${p.issueDate || ''}"`,
        `"${p.validTill || ''}"`,
        `"${p.status || 'active'}"`,
        `"${vStatus}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ];
      lines.push(row.join(','));
    });

    lines.push(`"TOTAL CARDS: ${g.passes.length}","","","","","","TOTAL AMOUNT:","${totalAmt}","","","","","",""`);
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

function syncToGoogleSheets(parsedBody) {
  return new Promise((resolve) => {
    try {
      const dataFolder = path.join(__dirname, 'data');
      const googleConfigPath = path.join(dataFolder, 'google_config.json');
      if (!fs.existsSync(googleConfigPath)) return resolve({ skipped: true, reason: 'No config' });
      
      const config = JSON.parse(fs.readFileSync(googleConfigPath, 'utf8'));
      if (!config.enabled || !config.webhookUrl) return resolve({ skipped: true, reason: 'Sync disabled or missing URL' });

      let passes = Array.isArray(parsedBody?.passes) ? parsedBody.passes : [];
      let members = Array.isArray(parsedBody?.members) ? parsedBody.members : [];

      if (!passes.length) {
        const state = getSystemState();
        passes = Array.isArray(state?.passes) ? state.passes : [];
        members = Array.isArray(state?.members) ? state.members : [];
      }

      const cleanPasses = passes.map(p => {
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

      console.log(`[GoogleSheets] Auto-syncing ${cleanPasses.length} passes to Google Sheets...`);

      postWithRedirects(config.webhookUrl, payload)
        .then(res => {
          console.log('[GoogleSheets] Sync response success:', res);
          config.lastSyncTime = new Date().toISOString();
          config.lastSyncStatus = 'success';
          config.lastSyncCount = cleanPasses.length;
          config.lastSyncError = null;
          try { fs.writeFileSync(googleConfigPath, JSON.stringify(config, null, 2), 'utf8'); } catch(e){}
          resolve({ success: true, count: cleanPasses.length, result: res });
        })
        .catch(err => {
          console.error('[GoogleSheets] Sync error:', err.message);
          config.lastSyncTime = new Date().toISOString();
          config.lastSyncStatus = 'error';
          config.lastSyncError = err.message;
          try { fs.writeFileSync(googleConfigPath, JSON.stringify(config, null, 2), 'utf8'); } catch(e){}
          resolve({ success: false, error: err.message });
        });
    } catch (e) {
      console.error('[GoogleSheets] Trigger error:', e.message);
      resolve({ success: false, error: e.message });
    }
  });
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

  // ── GET System Info & LAN IPs ──
  if (req.method === 'GET' && urlPath === '/api/system-info') {
    const ips = getNetworkIPs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      port: PORT,
      networkIPs: ips,
      primaryIP: ips[0] || 'localhost'
    }));
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

        saveSystemStateAsync(parsedBody, isForce);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST Manual Direct Google Sync ──
  if (req.method === 'POST' && urlPath === '/api/sync-google-now') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let parsedBody = null;
      try { if (body) parsedBody = JSON.parse(body); } catch(e){}
      syncToGoogleSheets(parsedBody || getSystemState())
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
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
        
        let existingConfig = {};
        if (fs.existsSync(googleConfigPath)) {
          try { existingConfig = JSON.parse(fs.readFileSync(googleConfigPath, 'utf8')); } catch(e){}
        }

        const parsed = JSON.parse(body);
        const config = {
          ...existingConfig,
          webhookUrl: parsed.webhookUrl || '',
          enabled: Boolean(parsed.enabled)
        };
        fs.writeFileSync(googleConfigPath, JSON.stringify(config, null, 2), 'utf8');

        // Trigger immediate background sync on save if enabled
        if (config.enabled && config.webhookUrl) {
          syncToGoogleSheets(getSystemState());
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── GET Members API ──
  if (req.method === 'GET' && urlPath === '/api/members') {
    const state = getSystemState();
    const query = (new URL('http://localhost' + req.url).searchParams.get('q') || '').toLowerCase().trim();
    const members = (state.members || []).map(m => ({
      id: m.id,
      name: m.name,
      cnic: m.cnic || 'N/A',
      houseNo: m.houseNo || '',
      contact: m.contact || '',
      photo: m.photo || ''
    }));

    if (!query) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, members: members.slice(0, 50) }));
      return;
    }

    const filtered = members.filter(m => 
      (m.name && m.name.toLowerCase().includes(query)) ||
      (m.cnic && m.cnic.toLowerCase().includes(query)) ||
      (m.houseNo && m.houseNo.toLowerCase().includes(query)) ||
      (String(m.id).includes(query))
    ).slice(0, 30);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, members: filtered }));
    return;
  }

  // ── POST Submit Online Payment & OCR Pass ──
  if (req.method === 'POST' && urlPath === '/api/submit-payment') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const state = getSystemState();
        
        // Build pass
        const assignedSerial = payload.serialNo || String(Math.floor(100 + Math.random() * 900));
        const nowIso = new Date().toISOString();
        const lastDay = new Date(payload.year, payload.month, 0).getDate();
        
        const newPass = {
          id: Date.now(),
          memberId: payload.memberId || Math.floor(1000 + Math.random() * 9000),
          memberName: payload.memberName,
          cnic: payload.cnic || 'N/A',
          houseNo: payload.houseNo || 'Commander City',
          contact: payload.contact || '',
          photo: payload.photo || 'LOGO.png',
          serialNo: assignedSerial,
          paymentSeq: parseInt(assignedSerial, 10) || 1,
          month: parseInt(payload.month, 10),
          year: parseInt(payload.year, 10),
          issueDate: payload.issueDate || `01-${String(payload.month).padStart(2, '0')}-${payload.year}`,
          validTill: payload.validTill || `${String(lastDay).padStart(2, '0')}-${String(payload.month).padStart(2, '0')}-${payload.year}`,
          passType: payload.passType || 'Full',
          amount: Number(payload.amount) || 8000,
          paymentMethod: `Online OCR Verified (${payload.provider || 'Bank'})`,
          transactionId: payload.transactionId,
          status: 'active',
          verified: true,
          verifiedBy: `Auto OCR Acceptance (TID: ${payload.transactionId})`,
          verifiedAt: nowIso,
          createdAt: nowIso
        };

        const newPayment = {
          id: Date.now(),
          passId: newPass.id,
          memberId: newPass.memberId,
          memberName: newPass.memberName,
          amount: newPass.amount,
          transactionId: payload.transactionId,
          provider: payload.provider || 'Online',
          paidAt: nowIso,
          notes: `Online OCR Verified — TID #${payload.transactionId}`,
          status: 'accepted'
        };

        state.passes = state.passes || [];
        state.payments = state.payments || [];
        state.passes.unshift(newPass);
        state.payments.unshift(newPayment);

        saveSystemStateAsync(state, true);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pass: newPass, payment: newPayment }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── POST Google Sync Proxy ──
  if (req.method === 'POST' && urlPath === '/api/google-sync') {
    syncToGoogleSheets(getSystemState())
      .then(resData => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result: resData }));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // Static File Serving
  let filePath = '.' + urlPath;
  if (filePath === './' || filePath === '.') filePath = './index.html';
  if (urlPath === '/portal' || urlPath === '/pay') filePath = './portal.html';

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
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` ⚡ Shuttle Pass System (Ultra-Fast) running at http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
