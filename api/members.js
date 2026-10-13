const fs = require('fs');
const path = require('path');

let cachedMembers = null;

function loadMembers() {
  if (cachedMembers) return cachedMembers;
  try {
    const p = path.join(__dirname, '..', 'data', 'members.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Clean photos to keep response lightweight
      cachedMembers = (Array.isArray(data) ? data : []).map(m => ({
        id: m.id,
        name: m.name,
        cnic: m.cnic || 'N/A',
        houseNo: m.houseNo || '',
        contact: m.contact || '',
        photo: m.photo || ''
      }));
      return cachedMembers;
    }
  } catch (e) {
    console.error('[API members] Error reading members.json:', e.message);
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const query = (req.query && req.query.q ? String(req.query.q).toLowerCase().trim() : '');
  const members = loadMembers();

  if (!query) {
    // Return first 50 members as sample
    return res.status(200).json({ success: true, count: members.length, members: members.slice(0, 50) });
  }

  const filtered = members.filter(m => {
    return (m.name && m.name.toLowerCase().includes(query)) ||
           (m.cnic && m.cnic.toLowerCase().includes(query)) ||
           (m.houseNo && m.houseNo.toLowerCase().includes(query)) ||
           (String(m.id).includes(query));
  }).slice(0, 30);

  return res.status(200).json({ success: true, count: filtered.length, members: filtered });
};
