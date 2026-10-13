const https = require('https');
const http = require('http');

function postWithRedirects(targetUrl, jsonPayload, method = 'POST', maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    try {
      const urlObj = new URL(targetUrl);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const postData = (method === 'POST' && jsonPayload) ? (typeof jsonPayload === 'string' ? jsonPayload : JSON.stringify(jsonPayload)) : null;

      const headers = {};
      if (method === 'POST' && postData) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: headers
      };

      const req = lib.request(options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
          }
          const nextMethod = (res.statusCode === 307 || res.statusCode === 308) ? method : 'GET';
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
      if (method === 'POST' && postData) {
        req.write(postData);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const webhookUrl = process.env.GOOGLE_WEBHOOK_URL ||
    'https://script.google.com/macros/s/AKfycbyGXUJIPYrAcjE4FHzG97q6_kj95lCVKPgM9hxFANKZZt4_CL1YKukJVmjlRPLuDho/exec';

  try {
    const body = req.body || {};
    const result = await postWithRedirects(webhookUrl, body);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
