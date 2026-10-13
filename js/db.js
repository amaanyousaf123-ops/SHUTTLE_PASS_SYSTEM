/* ============================================================
   Commander City — Shuttle Pass Renewal System (IndexedDB)
   ============================================================ */

const DB = {
    name: 'ShuttlePassDB',
    version: 3,
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.name, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('members')) {
                    const ms = db.createObjectStore('members', { keyPath: 'id', autoIncrement: true });
                    ms.createIndex('name', 'name', { unique: false });
                    ms.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('passes')) {
                    const ps = db.createObjectStore('passes', { keyPath: 'id', autoIncrement: true });
                    ps.createIndex('memberId', 'memberId', { unique: false });
                    ps.createIndex('month', 'month', { unique: false });
                    ps.createIndex('year', 'year', { unique: false });
                    ps.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('payments')) {
                    const pay = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
                    pay.createIndex('passId', 'passId', { unique: false });
                    pay.createIndex('month', 'month', { unique: false });
                    pay.createIndex('year', 'year', { unique: false });
                }
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    _tx(store, mode) {
        return this.db.transaction(store, mode).objectStore(store);
    },

    /* ── Pass Fee Schedule Management ── */
    getFeeRules() {
        try {
            const saved = localStorage.getItem('shuttle_fee_rules');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.sort((a,b) => (b.startYear * 12 + b.startMonth) - (a.startYear * 12 + a.startMonth));
                }
            }
        } catch(e) {}
        return [
            { id: 2, startYear: 2026, startMonth: 9, fullAmount: 8000, halfAmount: 4000 },
            { id: 1, startYear: 2026, startMonth: 1, fullAmount: 6000, halfAmount: 3000 }
        ].sort((a,b) => (b.startYear * 12 + b.startMonth) - (a.startYear * 12 + a.startMonth));
    },

    saveFeeRules(rules) {
        rules.sort((a,b) => (b.startYear * 12 + b.startMonth) - (a.startYear * 12 + a.startMonth));
        localStorage.setItem('shuttle_fee_rules', JSON.stringify(rules));
        document.dispatchEvent(new CustomEvent('data-changed', { detail: { store: 'feeRules' } }));
    },

    getFeeForMonth(month, year, passType = 'Full') {
        // Free / Employee passes always cost PKR 0
        if (passType === 'Free') return 0;
        const rules = this.getFeeRules();
        const targetVal = parseInt(year) * 12 + parseInt(month);
        let matched = null;
        for (const r of rules) {
            const ruleVal = parseInt(r.startYear) * 12 + parseInt(r.startMonth);
            if (targetVal >= ruleVal) {
                matched = r;
                break;
            }
        }
        if (!matched) {
            return passType === 'Half' ? 4000 : 8000;
        }
        return passType === 'Half' ? Number(matched.halfAmount) : Number(matched.fullAmount);
    },

    getAll(store) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readonly').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    get(store, id) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readonly').get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    add(store, data) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').add(data);
            req.onsuccess = () => {
                document.dispatchEvent(new CustomEvent('data-changed', { detail: { store } }));
                resolve(req.result);
            };
            req.onerror = () => reject(req.error);
        });
    },

    put(store, data) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').put(data);
            req.onsuccess = () => {
                document.dispatchEvent(new CustomEvent('data-changed', { detail: { store } }));
                resolve(req.result);
            };
            req.onerror = () => reject(req.error);
        });
    },

    putSilent(store, data) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    putManySilent(store, items) {
        if (!items || items.length === 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const tx = this._tx(store, 'readwrite');
            const os = tx.objectStore(store);
            items.forEach(item => os.put(item));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    del(store, id) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').delete(id);
            req.onsuccess = () => {
                document.dispatchEvent(new CustomEvent('data-changed', { detail: { store } }));
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    },

    clear(store) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    /* ── One-time migration: move any August records back to July ── */
    async migrateAugToJul() {
        let fixed = 0;

        // Fix passes store
        const passes = await this.getAll('passes');
        for (const p of passes) {
            if (p.month === 8) {
                p.month = 7;
                // Fix date strings: replace -08- with -07- in issueDate / validTill
                if (p.issueDate) p.issueDate = p.issueDate.replace(/-08-/g, '-07-').replace(/^08-/, '07-');
                if (p.validTill) p.validTill = p.validTill.replace(/-08-/g, '-07-').replace(/^08-/, '07-').replace(/^31-08/, '31-07');
                // Recalculate validTill for July (ends 31st)
                if (p.validTill) {
                    const yr = (p.validTill.match(/\d{4}/) || [])[0] || new Date().getFullYear();
                    p.validTill = `31-07-${yr}`;
                }
                if (p.issueDate) {
                    const yr = (p.issueDate.match(/\d{4}/) || [])[0] || new Date().getFullYear();
                    p.issueDate = `01-07-${yr}`;
                }
                await this.put('passes', p);
                fixed++;
            }
        }

        // Fix payments store
        const payments = await this.getAll('payments');
        for (const pay of payments) {
            if (pay.month === 8) {
                pay.month = 7;
                await this.put('payments', pay);
                fixed++;
            }
        }

        return fixed;
    },


    async getPassesForMonth(month, year) {
        const all = await this.getAll('passes');
        return all.filter(p => p.month === month && p.year === year);
    },

    async getNextPaymentSequenceSerial(month, year) {
        // Per-month only — starts from 01 each new month
        const passes = await this.getPassesForMonth(month, year);
        return passes.length + 1;
    },

    /* ── Import August serial list from Excel ── */
    async importAugustList(rows, year) {
        // rows = [{ name, serialNo, houseNo?, cnic?, contact? }, ...]
        const AUG = 8;
        const mm = '08';
        const lastDay = 31;
        const existingMembers = await this.getAll('members');
        const existingPasses = await this.getPassesForMonth(AUG, year);
        const existingPassMemberIds = new Set(existingPasses.map(p => p.memberId));

        const results = { assigned: 0, newIncomplete: 0, alreadyHad: 0, errors: [] };

        for (const row of rows) {
            const rawName = (row.name || '').trim().toUpperCase();
            const serialNo = String(row.serialNo || '').trim();
            if (!rawName || !serialNo) continue;

            // Duplicate serial check
            const serialTaken = existingPasses.find(p => String(p.serialNo) === serialNo);
            if (serialTaken) {
                results.errors.push(`Serial #${serialNo} already issued to ${serialTaken.memberName}`);
                continue;
            }

            // Try to find member by name (case-insensitive, trimmed)
            let member = existingMembers.find(m =>
                m.name.trim().toUpperCase() === rawName ||
                m.name.trim().toUpperCase().includes(rawName) ||
                rawName.includes(m.name.trim().toUpperCase())
            );

            let isNew = false;
            if (!member) {
                // Create a minimal new member — marked incomplete
                const memberData = {
                    name: rawName,
                    cnic: row.cnic || '',
                    houseNo: row.houseNo || '',
                    contact: row.contact || '',
                    photo: null,
                    status: 'active',
                    incomplete: true,   // flag — needs info filled in
                    createdAt: new Date().toISOString()
                };
                const newId = await this.add('members', memberData);
                memberData.id = newId;
                existingMembers.push(memberData); // keep in-memory list updated
                member = memberData;
                isNew = true;
            }

            // Skip if already has August pass
            if (existingPassMemberIds.has(member.id)) {
                results.alreadyHad++;
                continue;
            }

            const passData = {
                memberId: member.id,
                memberName: member.name,
                cnic: member.cnic || row.cnic || '',
                houseNo: member.houseNo || row.houseNo || '',
                contact: member.contact || row.contact || '',
                photo: member.photo || null,
                serialNo: serialNo,
                paymentSeq: parseInt(serialNo) || 0,
                month: AUG,
                year: year,
                passType: 'Full',
                amount: 8000,
                issueDate: `01-${mm}-${year}`,
                validTill: `${lastDay}-${mm}-${year}`,
                status: 'active',
                verified: true,
                incomplete: isNew,   // highlight flag for new/unknown members
                paymentDate: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            await this.add('passes', passData);
            existingPasses.push(passData);
            existingPassMemberIds.add(member.id);

            if (isNew) results.newIncomplete++;
            else results.assigned++;
        }

        return results;
    },



    /* Issue a specific serial number chosen by the user (manual assignment) */
    async processMemberPaymentWithSerial(memberId, month, year, serialNo, amount = null, notes = '', passType = 'Full', paymentMethod = 'Cash', paymentProof = null) {
        const member = await this.get('members', memberId);
        if (!member) throw new Error('Member not found');

        // Check if member already has a pass for this month
        const existingPasses = await this.getPassesForMonth(month, year);
        const existing = existingPasses.find(p => p.memberId === memberId);
        if (existing) {
            return { pass: existing, alreadyIssued: true };
        }

        const passTypeVal = (passType === 'Free') ? 'Free' : (passType === 'Half') ? 'Half' : 'Full';
        const defaultFee = this.getFeeForMonth(month, year, passTypeVal);
        // Free passes are always PKR 0; override any supplied amount
        const finalAmount = passTypeVal === 'Free' ? 0 : ((amount !== null && amount !== undefined && amount !== '' && Number(amount) > 0) ? Number(amount) : defaultFee);
        const issueDay = '01'; // Free passes always start from the 1st

        // Payment method: Cash / Online (Free passes are not transactions)
        const methodVal = passTypeVal === 'Free' ? 'Free' : (paymentMethod === 'Online' ? 'Online' : 'Cash');

        const serialStr = String(serialNo);
        const mm = String(month).padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();

        const passData = {
            memberId: member.id,
            memberName: member.name,
            cnic: member.cnic,
            houseNo: member.houseNo,
            contact: member.contact || '',
            photo: member.photo || null,
            serialNo: serialStr,
            paymentSeq: parseInt(serialStr) || 0,
            month: month,
            year: year,
            passType: passTypeVal,
            amount: finalAmount,
            paymentMethod: methodVal,
            issueDate: `${issueDay}-${mm}-${year}`,
            validTill: `${String(lastDay).padStart(2, '0')}-${mm}-${year}`,
            status: 'active',
            verified: true,
            paymentDate: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        const passId = await this.add('passes', passData);
        passData.id = passId;

        // Record payment transaction log
        await this.add('payments', {
            passId,
            memberId: member.id,
            memberName: member.name,
            serialNo: serialStr,
            month,
            year,
            amount: finalAmount,
            paymentMethod: methodVal,
            paymentProof: paymentProof || null,
            notes,
            paidAt: new Date().toISOString()
        });

        return { pass: passData, alreadyIssued: false };
    },

    /* Record payment for a member & issue next sequential card for the month */
    async processMemberPayment(memberId, month, year, amount = null, notes = '', passType = 'Full', paymentMethod = 'Cash', paymentProof = null) {
        const member = await this.get('members', memberId);
        if (!member) throw new Error('Member not found');

        // Check if member already has a pass for this month
        const existingPasses = await this.getPassesForMonth(month, year);
        const existing = existingPasses.find(p => p.memberId === memberId);
        if (existing) {
            return { pass: existing, alreadyIssued: true };
        }

        const passTypeVal = (passType === 'Free') ? 'Free' : (passType === 'Half') ? 'Half' : 'Full';
        const defaultFee = this.getFeeForMonth(month, year, passTypeVal);
        // Free passes are always PKR 0
        const finalAmount = passTypeVal === 'Free' ? 0 : ((amount !== null && amount !== undefined && amount !== '' && Number(amount) > 0) ? Number(amount) : defaultFee);
        const issueDay = '01';

        // Payment method: Cash / Online (Free passes are not transactions)
        const methodVal = passTypeVal === 'Free' ? 'Free' : (paymentMethod === 'Online' ? 'Online' : 'Cash');

        // Get next serial according to exact payment sequence order
        const serialNo = String(await this.getNextPaymentSequenceSerial(month, year));
        const mm = String(month).padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();

        const passData = {
            memberId: member.id,
            memberName: member.name,
            cnic: member.cnic,
            houseNo: member.houseNo,
            photo: member.photo || null,
            serialNo: serialNo,
            paymentSeq: parseInt(serialNo),
            month: month,
            year: year,
            passType: passTypeVal,
            amount: finalAmount,
            paymentMethod: methodVal,
            issueDate: `${issueDay}-${mm}-${year}`,
            validTill: `${String(lastDay).padStart(2, '0')}-${mm}-${year}`,
            status: 'active',
            verified: true,
            paymentDate: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        const passId = await this.add('passes', passData);
        passData.id = passId;

        // Record payment transaction log
        await this.add('payments', {
            passId,
            memberId: member.id,
            memberName: member.name,
            serialNo,
            month,
            year,
            amount: finalAmount,
            paymentMethod: methodVal,
            paymentProof: paymentProof || null,
            notes,
            paidAt: new Date().toISOString()
        });

        return { pass: passData, alreadyIssued: false };
    },

    /* ── Bulk Renewal of active passes ── */
    async renewMonth(sM, sY, tM, tY, paymentMethod = 'Cash', paymentProof = null) {
        const sourcePasses = await this.getPassesForMonth(sM, sY);
        const targetPasses = await this.getPassesForMonth(tM, tY);
        const targetMemberIds = new Set(targetPasses.map(p => p.memberId));

        let renewedCount = 0;
        for (const sp of sourcePasses) {
            if (sp.status === 'active' && !targetMemberIds.has(sp.memberId)) {
                const serialNo = String(await this.getNextPaymentSequenceSerial(tM, tY));
                const mm = String(tM).padStart(2, '0');
                const lastDay = new Date(tY, tM, 0).getDate();

                const passType = sp.passType || 'Full';
                const amount = this.getFeeForMonth(tM, tY, passType); // 0 for Free passes
                const issueDay = '01';
                const methodVal = passType === 'Free' ? 'Free' : (paymentMethod === 'Online' ? 'Online' : 'Cash');

                const passData = {
                    memberId: sp.memberId,
                    memberName: sp.memberName,
                    cnic: sp.cnic,
                    houseNo: sp.houseNo,
                    contact: sp.contact || '',
                    photo: sp.photo || null,
                    serialNo: serialNo,
                    paymentSeq: parseInt(serialNo),
                    month: tM,
                    year: tY,
                    passType: passType,
                    amount: amount,
                    paymentMethod: methodVal,
                    issueDate: `${issueDay}-${mm}-${tY}`,
                    validTill: `${String(lastDay).padStart(2, '0')}-${mm}-${tY}`,
                    status: 'active',
                    verified: true,
                    paymentDate: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };

                const passId = await this.add('passes', passData);

                // Record payment transaction log
                await this.add('payments', {
                    passId,
                    memberId: sp.memberId,
                    memberName: sp.memberName,
                    serialNo,
                    month: tM,
                    year: tY,
                    amount,
                    paymentMethod: methodVal,
                    paymentProof: paymentProof || null,
                    notes: `Auto-Renew (${passType} Pass)`,
                    paidAt: new Date().toISOString()
                });

                renewedCount++;
                targetPasses.push(passData);
                targetMemberIds.add(sp.memberId);
            }
        }
        return renewedCount;
    },

    async seed() {
        await this.clear('members');
        await this.clear('passes');
        await this.clear('payments');
        await this.clear('history');

        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear = now.getFullYear();

        const sampleMembers = [
            { name: 'SAMPLE USER', cnic: '35201-1111111-1', houseNo: 'R-001 BLOCK X-1', photo: null, status: 'active' },
            { name: 'MUHAMMAD ALI', cnic: '35201-1234567-1', houseNo: 'R-112/32 BLOCK A-2', photo: null, status: 'active' },
            { name: 'AHMAD KHAN', cnic: '35202-2345678-2', houseNo: 'R-205/18 BLOCK B-1', photo: null, status: 'active' },
            { name: 'USMAN SHEIKH', cnic: '35203-3456789-3', houseNo: 'R-045/12 BLOCK C-3', photo: null, status: 'active' }
        ];

        let index = 0;
        for (const m of sampleMembers) {
            const memberId = await this.add('members', m);
            const isHalf = index % 2 === 1;
            const passType = isHalf ? 'Half' : 'Full';
            const amount = isHalf ? 4000 : 8000;
            await this.processMemberPayment(memberId, curMonth, curYear, amount, 'Initial Demo Payment', passType);
            index++;
        }
    },

    async importExtractedCards(records) {
        if (!Array.isArray(records) || !records.length) return 0;

        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear = now.getFullYear();

        const existingMembers = await this.getAll('members');
        let importedCount = 0;

        for (let i = 0; i < records.length; i++) {
            const rec = records[i];
            
            // Match by CNIC or Name
            let member = existingMembers.find(m => 
                (rec.cnic !== 'N/A' && m.cnic === rec.cnic) || 
                (m.name.toLowerCase() === (rec.name || '').toLowerCase())
            );

            if (!member) {
                const memberData = {
                    name: rec.name || `Resident ${i + 1}`,
                    cnic: rec.cnic || 'N/A',
                    houseNo: rec.houseNo && rec.houseNo !== 'House No:' ? rec.houseNo : 'Commander City',
                    contact: rec.contact || '',
                    photo: rec.photo || null,
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
                const memberId = await this.add('members', memberData);
                memberData.id = memberId;
                member = memberData;
            } else {
                if (!member.photo && rec.photo) {
                    member.photo = rec.photo;
                    await this.put('members', member);
                }
            }

            // Check if pass exists for this member in current month
            const passes = await this.getPassesForMonth(curMonth, curYear);
            const passExists = passes.find(p => p.memberId === member.id);

            if (!passExists) {
                let serialNo = rec.rcn ? rec.rcn.replace(/[^0-9]/g, '') : String(i + 1);
                if (!serialNo) serialNo = String(i + 1);

                const mm = String(curMonth).padStart(2, '0');
                const lastDay = new Date(curYear, curMonth, 0).getDate();

                const passData = {
                    memberId: member.id,
                    memberName: member.name,
                    cnic: member.cnic,
                    houseNo: member.houseNo,
                    photo: member.photo || null,
                    serialNo: serialNo,
                    paymentSeq: parseInt(serialNo) || (i + 1),
                    month: curMonth,
                    year: curYear,
                    passType: 'Full',
                    amount: 8000,
                    issueDate: `01-${mm}-${curYear}`,
                    validTill: `${String(lastDay).padStart(2, '0')}-${mm}-${curYear}`,
                    status: 'active',
                    verified: true,
                    sourceFile: rec.sourceFile || 'D:\\Shuttle Pass',
                    paymentDate: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };

                await this.add('passes', passData);
                importedCount++;
            }
        }
        return importedCount;
    },

    async restoreSystem(data) {
        this._isRestoring = true;
        const stores = ['members', 'passes', 'payments', 'history'];
        for (const store of stores) {
            await new Promise((resolve, reject) => {
                const req = this._tx(store, 'readwrite').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
        
        for (const store of stores) {
            if (data[store] && Array.isArray(data[store])) {
                for (const item of data[store]) {
                    await this.put(store, item);
                }
            }
        }

        if (data.feeRules && Array.isArray(data.feeRules)) {
            this.saveFeeRules(data.feeRules);
        }

        this._isRestoring = false;
        await this.syncNow();
        return true;
    },

    // Immediate, awaitable sync — used for manual save button and restoreSystem
    async syncNow(isForce = false) {
        const dot  = document.getElementById('syncBadge')?.querySelector('.sync-dot');
        const lbl  = document.getElementById('syncLabel');
        const setSyncState = (state, label) => {
            if (dot) { dot.className = 'sync-dot sync-' + state; }
            if (lbl) lbl.textContent = label;
        };
        setSyncState('syncing', 'Syncing…');
        try {
            const members  = await this.getAll('members');
            const passes   = await this.getAll('passes');
            const payments = await this.getAll('payments');
            const history  = await this.getAll('history');
            const feeRules = this.getFeeRules();
            const exportData = { members, passes, payments, history, feeRules };
            const url = isForce ? '/api/sync?force=true' : '/api/sync';
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportData)
            });
            if (resp.ok) {
                setSyncState('idle', 'Synced ✔');
                console.log('[Sync] Data saved to data/ folder successfully.');
            } else {
                setSyncState('error', 'Sync Error');
                console.error('[Sync] Server returned error:', resp.status);
            }
        } catch (err) {
            setSyncState('error', 'Sync Failed');
            console.error('[Sync] Sync failed:', err);
            throw err;
        }
    },

    // Debounced auto-sync — used after every data-changed event (waits 2s to bundle rapid changes)
    syncToFolder() {
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            if (!this._isRestoring) {
                this.syncNow();
            }
        }, 2000);
    }
};

document.addEventListener('data-changed', () => {
    // Prevent syncing during full restore process
    if (!DB._isRestoring) {
        DB.syncToFolder();
    }
});

// Auto-save every 5 minutes (300000 ms)
setInterval(() => {
    if (!DB._isRestoring) {
        console.log('[Auto-sync] Running 5-minute auto-sync...');
        DB.syncNow();
    }
}, 300000);
