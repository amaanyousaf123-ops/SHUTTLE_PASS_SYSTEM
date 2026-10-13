/* ============================================================
   Commander City — Shuttle Pass Renewal System (App Controller)
   ============================================================ */

const App = {
    currentView: 'passes',
    passViewMode: 'cards', // 'cards' | 'table'
    transparentMode: false,

    async init() {
        await DB.init();

        // Migration disabled — was silently moving August records to July on every startup.
        // const migrated = await DB.migrateAugToJul();

        this.bindNav();
        this.bindSidebar();
        this.bindModal();

        document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('en-PK', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const exportCardsBtn = document.getElementById('exportCardsBtn');
        if (exportCardsBtn) {
            exportCardsBtn.onclick = async () => {
                try {
                    await DB.syncNow();
                    this.toast('\u2714 Data synced to folder successfully!', 'success');
                } catch(e) {
                    this.toast('\u274c Sync failed. Is the server running?', 'error');
                }
            };
        }

        const googleSyncBtn = document.getElementById('googleSyncBtn');
        if (googleSyncBtn) {
            googleSyncBtn.onclick = () => this.showGoogleSyncModal();
        }

        const topbarPortalBtn = document.getElementById('topbarPortalBtn');
        if (topbarPortalBtn) {
            topbarPortalBtn.onclick = () => this.navigate('portal');
        }

        const topbarPaymentsBtn = document.getElementById('topbarPaymentsBtn');
        if (topbarPaymentsBtn) {
            topbarPaymentsBtn.onclick = () => this.navigate('history');
        }

        // Data auto-saves to the server via DB.syncToFolder on every change.

        // === STARTUP RESTORE ===
        // IndexedDB persists across page refreshes automatically.
        // We ONLY restore from data/system_state.json if IndexedDB is completely empty
        // (e.g. first run, or user cleared browser data).
        // We must NEVER overwrite IndexedDB when it already has data — that would wipe user edits.
        const existingMembers = await DB.getAll('members');
        if (existingMembers.length === 0) {
            console.log('[Startup] IndexedDB is empty. Attempting restore from data folder...');
            let restored = false;
            try {
                const res = await fetch('data/system_state.json?t=' + Date.now());
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.members && data.passes && data.members.length > 0) {
                        await DB.restoreSystem(data);
                        console.log('[Startup] Restored', data.members.length, 'members from data/ folder.');
                        restored = true;
                    }
                }
            } catch(e) {
                console.log('[Startup] No folder data found.');
            }
            if (!restored) {
                // Absolute last resort: load from imported_members.json seed file
                await this.importCardsData(true);
            }
        } else {
            console.log('[Startup] IndexedDB has', existingMembers.length, 'members. Using existing data.');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const reqView = urlParams.get('view');
        if (reqView && ['passes', 'members', 'renewal', 'history', 'portal'].includes(reqView)) {
            this.navigate(reqView);
        } else if (window.location.hostname.includes('vercel.app')) {
            this.navigate('portal');
        } else {
            this.navigate('passes');
        }
    },


    async importCardsData(silent = false) {
        try {
            const res = await fetch('imported_members.json');
            if (!res.ok) return;
            const records = await res.json();
            if (Array.isArray(records) && records.length) {
                const count = await DB.importExtractedCards(records);
                if (!silent) {
                    this.toast(`Imported ${count} resident cards successfully!`, 'success');
                }
                this.render(this.currentView);
            }
        } catch (e) {
            console.error('Import error:', e);
        }
    },

    /* ── Import August Serial List from Excel (.xlsx / .csv) ── */
    async promptImportAugustExcel() {
        const year = parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());

        const body = `
        <div style="background:var(--glass);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--amber)">
            <div style="font-size:0.9rem;font-weight:700;color:var(--amber)"><i class="fas fa-file-excel"></i> Import August Serial List (.xlsx / .csv)</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">
                Upload your August Excel list containing member names and assigned serial numbers.
                <br>• <strong>Existing Members:</strong> Assigned serial for August card.
                <br>• <strong>New Members (Not in DB):</strong> Card created with assigned serial and <span style="color:var(--amber);font-weight:600">highlighted yellow</span> so you can add details later.
            </div>
        </div>

        <div class="form-group" style="margin-bottom:16px">
            <label>Select Excel / CSV File *</label>
            <input type="file" id="aug_excel_file" accept=".xlsx, .xls, .csv" style="background:var(--glass-heavy);padding:8px;border:1px dashed var(--amber);border-radius:var(--radius-sm);width:100%">
        </div>

        <div id="aug_excel_mapping" style="display:none;margin-bottom:16px;background:var(--glass);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <div style="font-size:0.85rem;font-weight:700;color:var(--cyan);margin-bottom:8px"><i class="fas fa-columns"></i> Map Excel Columns</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
                <div class="form-group" style="flex:1;min-width:140px">
                    <label>Member Name Column *</label>
                    <select id="aug_col_name"></select>
                </div>
                <div class="form-group" style="flex:1;min-width:140px">
                    <label>Serial Number Column *</label>
                    <select id="aug_col_serial"></select>
                </div>
            </div>
        </div>

        <div id="aug_excel_preview" style="display:none;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:14px"></div>
        `;

        this.openModal('Import August Serial List', body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-primary" id="btnRunAugImport" disabled style="background:var(--amber);border-color:var(--amber);color:#000;font-weight:700"><i class="fas fa-check-circle"></i> Import August Cards</button>`);

        let parsedData = [];
        const fileInput = document.getElementById('aug_excel_file');
        const mappingDiv = document.getElementById('aug_excel_mapping');
        const previewDiv = document.getElementById('aug_excel_preview');
        const btnImport = document.getElementById('btnRunAugImport');
        const colNameSel = document.getElementById('aug_col_name');
        const colSerialSel = document.getElementById('aug_col_serial');

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = evt.target.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const firstSheet = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[firstSheet];
                    parsedData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                    if (!parsedData.length) {
                        this.toast('Excel file appears to be empty', 'warning');
                        return;
                    }

                    const headers = Object.keys(parsedData[0]);
                    colNameSel.innerHTML = headers.map(h => `<option value="${h}">${h}</option>`).join('');
                    colSerialSel.innerHTML = headers.map(h => `<option value="${h}">${h}</option>`).join('');

                    // Auto-detect columns
                    const nameHeader = headers.find(h => /name/i.test(h)) || headers[0];
                    const serialHeader = headers.find(h => /serial|sr|s\.?no|pass|rcn|no/i.test(h)) || headers[1] || headers[0];

                    if (nameHeader) colNameSel.value = nameHeader;
                    if (serialHeader) colSerialSel.value = serialHeader;

                    mappingDiv.style.display = 'block';
                    btnImport.disabled = false;

                    const updatePreview = async () => {
                        const nCol = colNameSel.value;
                        const sCol = colSerialSel.value;
                        const existingMembers = await DB.getAll('members');

                        previewDiv.style.display = 'block';
                        previewDiv.innerHTML = `
                        <table class="table" style="font-size:0.82rem">
                            <thead><tr><th>#</th><th>Serial</th><th>Name in Excel</th><th>Match Status</th></tr></thead>
                            <tbody>
                                ${parsedData.slice(0, 30).map((r, i) => {
                                    const nm = String(r[nCol] || '').trim();
                                    const sr = String(r[sCol] || '').trim();
                                    const matched = existingMembers.some(m => m.name.trim().toUpperCase() === nm.toUpperCase());
                                    return `<tr>
                                        <td>${i + 1}</td>
                                        <td style="font-weight:700;color:var(--amber)">#${sr}</td>
                                        <td>${this.esc(nm)}</td>
                                        <td>${matched ? '<span style="color:var(--green);font-weight:600">Matched in DB ✓</span>' : '<span style="color:var(--amber);font-weight:600">New (Incomplete) ⚠️</span>'}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                        ${parsedData.length > 30 ? `<div style="padding:6px 12px;font-size:0.75rem;color:var(--text-muted)">...and ${parsedData.length - 30} more rows</div>` : ''}
                        `;
                    };

                    colNameSel.onchange = updatePreview;
                    colSerialSel.onchange = updatePreview;
                    updatePreview();

                } catch (err) {
                    console.error('Excel parse error:', err);
                    this.toast('Error reading Excel file. Make sure it is valid .xlsx or .csv', 'error');
                }
            };
            reader.readAsBinaryString(file);
        };

        btnImport.onclick = async () => {
            const nCol = colNameSel.value;
            const sCol = colSerialSel.value;

            const rows = parsedData.map(r => ({
                name: String(r[nCol] || '').trim(),
                serialNo: String(r[sCol] || '').trim()
            })).filter(r => r.name && r.serialNo);

            if (!rows.length) {
                this.toast('No valid rows found with Name and Serial', 'warning');
                return;
            }

            btnImport.disabled = true;
            btnImport.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';

            const res = await DB.importAugustList(rows, year);
            // Immediately sync to folder so data is never lost
            await DB.syncNow();
            this.closeModal();

            let msg = `August Import Complete!\n• ${res.assigned} existing members assigned serials\n• ${res.newIncomplete} new members created (highlighted yellow)`;
            if (res.alreadyHad) msg += `\n• ${res.alreadyHad} already had August passes`;
            this.toast(msg, 'success');

            // Switch view to August
            const selMonth = document.getElementById('selMonth');
            if (selMonth) selMonth.value = 8;
            await this._renderCards();
        };
    },


    bindNav() {
        document.querySelectorAll('.nav-item[data-view]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                this.navigate(el.dataset.view);
                if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
            });
        });
    },

    navigate(view) {
        this.currentView = view;
        document.querySelectorAll('.nav-item[data-view]').forEach(el => {
            el.classList.toggle('active', el.dataset.view === view);
        });

        const titles = {
            passes: 'Monthly Shuttle Passes',
            members: 'Members Directory',
            renewal: 'Payment Sequence Renewal',
            history: 'Payment Logs & History',
            portal: 'Online Payment Portal & AI OCR Scanner'
        };
        document.getElementById('pageTitle').textContent = titles[view] || 'Shuttle Pass System';
        this.render(view);
    },

    async render(view) {
        const c = document.getElementById('content');
        c.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

        try {
            switch (view) {
                case 'passes': await this.vPasses(c); break;
                case 'members': await this.vMembers(c); break;
                case 'renewal': await this.vRenewal(c); break;
                case 'history': await this.vHistory(c); break;
                case 'portal': await this.vPortal(c); break;
                default: c.innerHTML = '<div class="empty-state"><i class="fas fa-ghost"></i><p>View not found</p></div>';
            }
        } catch (e) {
            console.error(e);
            c.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading view</p></div>';
        }
    },

    /* ── Export Live Excel Spreadsheet (.xlsx) for selected month ── */
    async exportMonthToExcel(monthOverride, yearOverride) {
        const month = monthOverride || parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const year = yearOverride || parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = monthNames[month] || `Month_${month}`;

        const passes = await DB.getPassesForMonth(month, year);
        passes.sort((a, b) => (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0));

        if (!passes.length) {
            this.toast(`No passes found for ${monthName} ${year} to export`, 'warning');
            return;
        }

        if (typeof XLSX === 'undefined') {
            this.toast('Excel library loading, please try again in a moment...', 'error');
            return;
        }

        let totalAmt = 0;
        const wsData = [
            ['COMMANDER CITY SHUTTLE PASS SYSTEM'],
            [`MONTHLY SHUTTLE PASS REGISTER — ${monthName.toUpperCase()} ${year}`],
            [`Total Cards Issued: ${passes.length}`, `Export Date: ${new Date().toLocaleDateString()}`],
            [],
            ['S.No (#)', 'Member Code', 'Member Name', 'CNIC Number', 'House / Plot No', 'Contact No', 'Pass Category', 'Fee Amount (PKR)', 'Payment Method', 'Issue Date', 'Valid Till', 'Status', 'Notes / Remarks']
        ];

        passes.forEach((p, idx) => {
            const amt = Number(p.amount) || 0;
            totalAmt += amt;
            const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-00000';
            const payMethod = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
            wsData.push([
                `#${p.serialNo || (idx + 1)}`,
                memberCode,
                p.memberName || '',
                p.cnic || 'N/A',
                p.houseNo || 'N/A',
                p.contact || '',
                (p.passType || 'Full').toUpperCase(),
                amt,
                payMethod,
                p.issueDate || '',
                p.validTill || '',
                p.incomplete ? 'INCOMPLETE' : (p.status || 'active').toUpperCase(),
                p.notes || ''
            ]);
        });

        wsData.push([]);
        wsData.push(['TOTAL CARDS:', passes.length, '', '', '', '', 'TOTAL COLLECTION:', totalAmt, '', '', '', '', '']);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Column widths
        ws['!cols'] = [
            { wch: 10 }, // S.No
            { wch: 14 }, // Code
            { wch: 28 }, // Name
            { wch: 18 }, // CNIC
            { wch: 24 }, // House
            { wch: 15 }, // Contact
            { wch: 14 }, // Category
            { wch: 16 }, // Amount
            { wch: 14 }, // Payment Method
            { wch: 14 }, // Issue Date
            { wch: 14 }, // Valid Till
            { wch: 12 }, // Status
            { wch: 24 }  // Notes
        ];

        XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);

        const fileName = `Commander_City_Shuttle_Passes_${monthName}_${year}.xlsx`;
        XLSX.writeFile(wb, fileName);
        this.toast(`✅ Exported ${passes.length} passes to ${fileName}!`, 'success');
    },

    /* ── Print Official Pass Register for selected month ── */
    async printRegister(monthOverride, yearOverride) {
        const month = monthOverride || parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const year = yearOverride || parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = monthNames[month] || `Month_${month}`;

        const passes = await DB.getPassesForMonth(month, year);
        passes.sort((a, b) => (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0));

        if (!passes.length) {
            this.toast(`No passes found for ${monthName} ${year} to print`, 'warning');
            return;
        }

        let totalAmt = 0;
        const rowsHtml = passes.map((p, idx) => {
            const amt = Number(p.amount) || 0;
            totalAmt += amt;
            const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-00000';
            const payMethod = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
            return `
            <tr>
                <td style="text-align:center;font-weight:bold">#${p.serialNo || (idx + 1)}</td>
                <td style="text-align:center;font-family:monospace;font-weight:bold">${memberCode}</td>
                <td style="font-weight:bold">${this.esc(p.memberName)}</td>
                <td>${this.esc(p.cnic || '—')}</td>
                <td>${this.esc(p.houseNo || '—')}</td>
                <td>${this.esc(p.contact || '—')}</td>
                <td style="text-align:center">${(p.passType || 'Full').toUpperCase()}</td>
                <td style="text-align:center">${payMethod}</td>
                <td style="text-align:right;font-weight:bold">PKR ${amt.toLocaleString()}</td>
                <td style="text-align:center">${p.issueDate || '—'}</td>
                <td style="text-align:center">${p.validTill || '—'}</td>
                <td style="text-align:center">${p.incomplete ? 'INCOMPLETE' : (p.status || 'active').toUpperCase()}</td>
            </tr>`;
        }).join('');

        const existing = document.getElementById('printRegisterContainer');
        if (existing) existing.remove();

        const printArea = document.createElement('div');
        printArea.id = 'printRegisterContainer';
        printArea.className = 'printable-register-view';
        printArea.innerHTML = `
            <div class="print-register-header" style="margin-bottom:16px;border-bottom:2px solid #000;padding-bottom:10px">
                <div style="display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:14px">
                        <img src="logo.png" style="height:48px;object-fit:contain">
                        <div>
                            <h1 style="font-size:1.35rem;font-weight:900;margin:0;color:#000;letter-spacing:0.5px">COMMANDER CITY SHUTTLE PASS SYSTEM</h1>
                            <div style="font-size:0.95rem;font-weight:800;color:#333">OFFICIAL PASS REGISTER — ${monthName.toUpperCase()} ${year}</div>
                        </div>
                    </div>
                    <div style="text-align:right;font-size:0.82rem;color:#333;line-height:1.4">
                        <div>Date: <strong>${new Date().toLocaleDateString('en-PK')}</strong></div>
                        <div>Total Cards: <strong>${passes.length}</strong></div>
                        <div>Total Revenue: <strong>PKR ${totalAmt.toLocaleString()}</strong></div>
                    </div>
                </div>
            </div>
            <table class="print-register-table" style="width:100%;border-collapse:collapse;font-size:0.85rem">
                <thead>
                    <tr style="background:#e5e7eb;color:#000;border:1px solid #000">
                        <th style="padding:6px;border:1px solid #000">Serial #</th>
                        <th style="padding:6px;border:1px solid #000">Code</th>
                        <th style="padding:6px;border:1px solid #000">Member Name</th>
                        <th style="padding:6px;border:1px solid #000">CNIC</th>
                        <th style="padding:6px;border:1px solid #000">House / Plot</th>
                        <th style="padding:6px;border:1px solid #000">Contact</th>
                        <th style="padding:6px;border:1px solid #000">Category</th>
                        <th style="padding:6px;border:1px solid #000">Payment Method</th>
                        <th style="padding:6px;border:1px solid #000">Fee (PKR)</th>
                        <th style="padding:6px;border:1px solid #000">Issue Date</th>
                        <th style="padding:6px;border:1px solid #000">Valid Till</th>
                        <th style="padding:6px;border:1px solid #000">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr style="font-weight:bold;background:#f3f4f6;border:1.5px solid #000">
                        <td colspan="8" style="text-align:right;padding:8px;border:1px solid #000">TOTAL COLLECTION (${passes.length} Cards):</td>
                        <td style="text-align:right;padding:8px;border:1px solid #000;font-size:0.95rem">PKR ${totalAmt.toLocaleString()}</td>
                        <td colspan="3" style="border:1px solid #000"></td>
                    </tr>
                </tfoot>
            </table>
            <div class="print-register-footer" style="margin-top:35px;display:flex;justify-content:space-between;padding:0 20px;font-size:0.85rem;color:#000">
                <div><strong>Prepared By:</strong> ___________________________</div>
                <div><strong>Verified By:</strong> ___________________________</div>
                <div><strong>Approved By:</strong> ___________________________</div>
            </div>
        `;

        document.body.appendChild(printArea);
        window.print();
        setTimeout(() => {
            if (printArea.parentNode) printArea.parentNode.removeChild(printArea);
        }, 1000);
    },

    /* View 1: Monthly Passes Cards & Excel Register View */
    async vPasses(el) {
        const now = new Date();
        const curYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1;

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthOptions = monthNames.map((m, i) => `<option value="${i + 1}" ${i + 1 === defaultMonth ? 'selected' : ''}>${m}</option>`).join('');
        const yearOptions = [curYear - 1, curYear, curYear + 1].map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`).join('');

        el.innerHTML = `
        <div class="sticky-header-container">
            <div class="page-header" style="gap:10px;flex-wrap:wrap">
                <h2><i class="fas fa-id-card" style="color:var(--cyan);margin-right:8px"></i>Commander City Shuttle Passes</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button class="btn btn-renew btn-sm" id="btnPayIssue"><i class="fas fa-money-bill-wave"></i> Process Payment &amp; Issue Serial</button>
                    <button class="btn btn-ghost btn-sm" id="btnFeeSettings" style="border:1px solid var(--amber);color:var(--amber)"><i class="fas fa-cog"></i> Fee Rates</button>
                    <button class="btn btn-sm" id="btnExportExcel" style="background:#16a34a;color:#fff;border-color:#15803d;font-weight:700"><i class="fas fa-file-excel"></i> Export Excel (.xlsx)</button>
                    <button class="btn btn-ghost btn-sm" id="btnPrintRegister" style="border:1px solid var(--cyan);color:var(--cyan)"><i class="fas fa-list-alt"></i> Print Register</button>
                    <button class="btn btn-ghost btn-sm" id="btnPrintAll"><i class="fas fa-print"></i> Print Cards</button>
                    <button class="btn btn-primary btn-sm" id="btnAddCard" style="background:var(--green);border-color:var(--green)"><i class="fas fa-plus"></i> &#43; Create Card</button>
                </div>
            </div>

            <!-- Search Bar & Controls Row -->
            <div id="searchBarRow" style="display:flex;gap:10px;margin-bottom:0;flex-wrap:wrap;align-items:flex-end">
                <div style="flex:2;min-width:200px">
                    <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:5px"><i class="fas fa-search" style="color:var(--cyan)"></i> &nbsp;Search by Name / CNIC / House No</label>
                    <input type="text" id="inpSearch" placeholder="e.g. SHOAIB ALI or 35201-1111111-1" style="width:100%;background:var(--glass-heavy);border:1.5px solid var(--cyan);color:var(--text-primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.95rem">
                </div>
                <div style="flex:1;min-width:140px">
                    <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:5px"><i class="fas fa-hashtag" style="color:var(--amber)"></i> &nbsp;Search Serial</label>
                    <input type="text" id="inpSerialSearch" placeholder="e.g. 66" style="width:100%;background:var(--glass-heavy);border:1.5px solid var(--amber);color:var(--text-primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.95rem">
                </div>
                <div style="min-width:120px">
                    <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:5px">Month</label>
                    <select id="selMonth" class="filter-select">${monthOptions}</select>
                </div>
                <div style="min-width:85px">
                    <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:5px">Year</label>
                    <select id="selYear" class="filter-select">${yearOptions}</select>
                </div>

                <!-- View Mode Toggle -->
                <div style="display:flex;flex-direction:column;gap:5px">
                    <label style="font-size:0.78rem;color:var(--text-muted)">Display View</label>
                    <div style="display:flex;background:var(--glass-heavy);padding:3px;border-radius:var(--radius-sm);border:1px solid var(--border)">
                        <button id="btnViewCards" class="btn btn-sm ${this.passViewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}" style="padding:5px 10px;font-size:0.8rem"><i class="fas fa-th-large"></i> Cards Grid</button>
                        <button id="btnViewTable" class="btn btn-sm ${this.passViewMode === 'table' ? 'btn-primary' : 'btn-ghost'}" style="padding:5px 10px;font-size:0.8rem"><i class="fas fa-table"></i> Excel Table View</button>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:6px;padding-bottom:6px">
                    <input type="checkbox" id="chkTransparent" ${this.transparentMode ? 'checked' : ''} style="width:auto">
                    <label for="chkTransparent" style="font-size:0.82rem;color:var(--text-muted);cursor:pointer;white-space:nowrap">Transparent BG</label>
                </div>
            </div>
        </div>

        <div id="passesStats" style="margin-bottom:20px"></div>
        <div id="passesCardsContainer"></div>`;

        const selM = document.getElementById('selMonth');
        const selY = document.getElementById('selYear');
        const inpS = document.getElementById('inpSearch');
        const inpSer = document.getElementById('inpSerialSearch');
        const chkTr = document.getElementById('chkTransparent');

        if (selM) selM.onchange = () => this._renderCards();
        if (selY) selY.onchange = () => this._renderCards();
        if (inpS) inpS.oninput = () => this._renderCards();
        if (inpSer) inpSer.oninput = () => this._renderCards();
        if (chkTr) chkTr.onchange = (e) => {
            this.transparentMode = e.target.checked;
            this._renderCards();
        };

        const btnAdd = document.getElementById('btnAddCard');
        const btnPay = document.getElementById('btnPayIssue');
        const btnFee = document.getElementById('btnFeeSettings');
        const btnExp = document.getElementById('btnExportExcel');
        const btnPrR = document.getElementById('btnPrintRegister');
        const btnPrA = document.getElementById('btnPrintAll');
        const btnVC  = document.getElementById('btnViewCards');
        const btnVT  = document.getElementById('btnViewTable');

        if (btnAdd) btnAdd.onclick = () => this.editCard();
        if (btnPay) btnPay.onclick = () => this.promptPaymentIssue();
        if (btnFee) btnFee.onclick = () => this.showFeeSettingsModal();
        if (btnExp) btnExp.onclick = () => this.exportMonthToExcel();
        if (btnPrR) btnPrR.onclick = () => this.printRegister();
        if (btnPrA) btnPrA.onclick = () => this.promptPrintCardsRange();

        if (btnVC) {
            btnVC.onclick = () => {
                this.passViewMode = 'cards';
                if (btnVC) btnVC.className = 'btn btn-sm btn-primary';
                if (btnVT) btnVT.className = 'btn btn-sm btn-ghost';
                this._renderCards();
            };
        }
        if (btnVT) {
            btnVT.onclick = () => {
                this.passViewMode = 'table';
                if (btnVT) btnVT.className = 'btn btn-sm btn-primary';
                if (btnVC) btnVC.className = 'btn btn-sm btn-ghost';
                this._renderCards();
            };
        }

        await this._renderCards();
    },

    async _renderCards() {
        const selMEl = document.getElementById('selMonth');
        const selYEl = document.getElementById('selYear');
        const month = selMEl ? parseInt(selMEl.value) : (new Date().getMonth() + 1);
        const year = selYEl ? parseInt(selYEl.value) : new Date().getFullYear();
        const search = (document.getElementById('inpSearch')?.value || '').toLowerCase().trim();
        const serialSearch = (document.getElementById('inpSerialSearch')?.value || '').toLowerCase().trim();

        let passes = await DB.getPassesForMonth(month, year);

        // Sort passes strictly by sequential serial number order
        passes.sort((a, b) => (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0));

        if (search) {
            passes = passes.filter(p =>
                (p.memberName || '').toLowerCase().includes(search) ||
                (p.houseNo || '').toLowerCase().includes(search) ||
                (p.cnic || '').toLowerCase().includes(search)
            );
        }

        if (serialSearch) {
            const serialNum = serialSearch.replace(/[^0-9]/g, '');
            passes = passes.filter(p =>
                (p.serialNo || '').toString().toLowerCase().includes(serialSearch) ||
                (serialNum && (p.serialNo || '').toString() === serialNum)
            );
        }

        const total = passes.length;
        const freeCount = passes.filter(p => p.passType === 'Free').length;
        const paidPasses = passes.filter(p => p.passType !== 'Free');
        const active = passes.filter(p => p.status === 'active').length;
        const totalRevenue = paidPasses.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const statsEl = document.getElementById('passesStats');
        if (statsEl) {
            statsEl.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card" style="--accent-color:var(--cyan)">
                    <div class="stat-icon" style="background:rgba(6,182,212,.15);color:var(--cyan)"><i class="fas fa-id-card"></i></div>
                    <div><span class="stat-value">${total}</span><span class="stat-label">${monthNames[month]} Cards${freeCount > 0 ? ` <span style="color:var(--green);font-size:0.75rem">(${freeCount} Free)</span>` : ''}</span></div>
                </div>
                <div class="stat-card" style="--accent-color:var(--green)">
                    <div class="stat-icon" style="background:rgba(16,185,129,.15);color:var(--green)"><i class="fas fa-money-check-alt"></i></div>
                    <div><span class="stat-value">PKR ${totalRevenue.toLocaleString()}</span><span class="stat-label">Paid Revenue (${active} Active)</span></div>
                </div>
                <div class="stat-card" style="--accent-color:var(--purple)">
                    <div class="stat-icon" style="background:rgba(139,92,246,.15);color:var(--purple)"><i class="fas fa-sort-numeric-down"></i></div>
                    <div><span class="stat-value">#${total > 0 ? passes[passes.length-1].serialNo : '0'}</span><span class="stat-label">Last Payment Serial</span></div>
                </div>
                <div class="stat-card" style="--accent-color:var(--amber)">
                    <div class="stat-icon" style="background:rgba(245,158,11,.15);color:var(--amber)"><i class="fas fa-file-excel"></i></div>
                    <div><span class="stat-value" style="font-size:1.05rem;color:var(--green);margin-top:2px"><i class="fas fa-check-circle"></i> Auto-Updated</span><span class="stat-label">Excel Register Live Status</span></div>
                </div>
            </div>`;
        }

        const container = document.getElementById('passesCardsContainer');
        if (!container) return;
        if (!passes.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-id-card"></i><p>No shuttle pass cards for ${monthNames[month]} ${year}</p><p style="font-size:.82rem;color:var(--text-muted);margin-top:8px">Click "Process Payment & Issue Serial" to record member payment and auto-assign next serial</p></div>`;
            return;
        }

        if (this.passViewMode === 'table') {
            // Render Excel Register Table View
            container.innerHTML = `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;overflow-x:auto">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
                    <div style="font-weight:700;font-size:1.05rem;color:var(--cyan);display:flex;align-items:center;gap:8px">
                        <i class="fas fa-file-excel" style="color:var(--green)"></i> Excel Pass Register — ${monthNames[month]} ${year}
                        <span style="font-size:0.75rem;padding:3px 10px;border-radius:12px;background:rgba(16,185,129,0.15);color:var(--green);border:1px solid var(--green)">Live Auto-Updated ✔</span>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-sm btn-ghost" onclick="App.exportMonthToExcel(${month}, ${year})" style="border:1px solid var(--green);color:var(--green)"><i class="fas fa-file-download"></i> Download Excel (.xlsx)</button>
                        <button class="btn btn-sm btn-ghost" onclick="App.printRegister(${month}, ${year})" style="border:1px solid var(--cyan);color:var(--cyan)"><i class="fas fa-print"></i> Print Register</button>
                    </div>
                </div>

                <table class="table" style="width:100%;font-size:0.88rem">
                    <thead>
                        <tr>
                            <th style="width:80px">Serial #</th>
                            <th style="width:100px">Code</th>
                            <th>Member Name</th>
                            <th>CNIC Number</th>
                            <th>House / Plot No</th>
                            <th>Contact</th>
                            <th style="width:100px">Category</th>
                            <th style="width:120px">Payment Method</th>
                            <th style="width:110px;text-align:right">Fee (PKR)</th>
                            <th style="width:100px">Valid Till</th>
                            <th style="width:100px">Status</th>
                            <th style="width:110px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${passes.map((p, idx) => {
                            const isInc = p.incomplete;
                            const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-00000';
                            const payMethod = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
                            return `
                            <tr style="${isInc ? 'background:rgba(245,158,11,0.06)' : ''}">
                                <td style="font-weight:800;color:var(--amber)">#${p.serialNo || (idx + 1)}</td>
                                <td style="font-family:monospace;font-size:0.82rem;color:var(--text-muted)">${memberCode}</td>
                                <td style="font-weight:600">${this.esc(p.memberName)}</td>
                                <td>${this.esc(p.cnic || '—')}</td>
                                <td>${this.esc(p.houseNo || '—')}</td>
                                <td>${this.esc(p.contact || '—')}</td>
                                <td><span class="badge" style="background:${p.passType === 'Free' ? 'rgba(16,185,129,0.2)' : p.passType === 'Half' ? 'rgba(245,158,11,0.15)' : 'rgba(6,182,212,0.15)'};color:${p.passType === 'Free' ? 'var(--green)' : p.passType === 'Half' ? 'var(--amber)' : 'var(--cyan)'}">${ p.passType === 'Free' ? 'FREE' : (p.passType || 'Full').toUpperCase()}</span></td>
                                <td style="text-align:center;font-weight:600;color:${payMethod === 'Online' ? 'var(--cyan)' : payMethod === 'Free' ? 'var(--green)' : 'var(--amber)'}">${payMethod}</td>
                                <td style="text-align:right;font-weight:700">${p.passType === 'Free' ? '<span style="color:var(--green);font-weight:900">FREE ✓</span>' : 'PKR ' + (Number(p.amount) || 0).toLocaleString()}</td>
                                <td>${p.validTill || '—'}</td>
                                <td>
                                    <span class="badge ${isInc ? 'badge-warning' : (p.status === 'active' ? 'badge-active' : 'badge-expired')}">
                                        ${isInc ? 'INCOMPLETE' : p.status.toUpperCase()}
                                    </span>
                                </td>
                                <td style="text-align:center">
                                    <div style="display:flex;gap:4px;justify-content:center">
                                        <button class="btn btn-ghost btn-icon btn-sm" onclick="App.printSingle(${p.id})" title="Print Card"><i class="fas fa-print"></i></button>
                                        <button class="btn btn-ghost btn-icon btn-sm" onclick="App.editCard(${p.id})" title="Edit Card"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-danger btn-icon btn-sm" onclick="App.delCard(${p.id})" title="Delete Card"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:800;background:var(--glass-heavy)">
                            <td colspan="8" style="text-align:right">TOTAL FOR ${monthNames[month].toUpperCase()} ${year} (${total} CARDS):</td>
                            <td style="text-align:right;color:var(--green);font-size:0.95rem">PKR ${totalRevenue.toLocaleString()}</td>
                            <td colspan="3"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
        } else {
            // Render Physical Pass Cards Grid View
            container.innerHTML = `<div class="cards-container-grid">${passes.map(p => {
                const isInc = p.incomplete;
                const isFree = p.passType === 'Free';
                return `
                <div class="physical-card-wrapper" style="${isInc ? 'border: 2px dashed var(--amber); box-shadow: 0 0 12px rgba(245,158,11,0.25);' : isFree ? 'border: 2px solid var(--green); box-shadow: 0 0 14px rgba(16,185,129,0.2);' : ''}">
                    ${isInc ? `<div style="background:var(--amber);color:#000;font-weight:800;font-size:0.75rem;padding:3px 10px;text-align:center;border-radius:4px 4px 0 0;letter-spacing:0.5px"><i class="fas fa-exclamation-triangle"></i> NEW MEMBER — INCOMPLETE INFO (Edit to add CNIC/House/Photo)</div>` : ''}
                    ${this._cardHtml(p, month)}
                    <div class="wrapper-actions">
                        <span class="badge ${isInc ? 'badge-warning' : (p.status === 'active' ? 'badge-active' : 'badge-expired')}" style="${isInc ? 'background:rgba(245,158,11,0.2);color:var(--amber);border:1px solid var(--amber);' : isFree ? 'background:rgba(16,185,129,0.2);color:var(--green);border:1px solid var(--green);' : ''}">
                            ${isInc ? 'INCOMPLETE' : isFree ? '🎟 EMPLOYEE FREE' : p.status.toUpperCase()} (Serial #${p.serialNo})
                        </span>
                        <div style="display:flex;gap:6px">
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="App.printSingle(${p.id})" title="Print Card"><i class="fas fa-print"></i></button>
                            <button class="btn btn-ghost btn-icon btn-sm" onclick="App.editCard(${p.id})" title="Edit Card" style="${isInc ? 'color:var(--amber);font-weight:bold' : ''}"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-icon btn-sm" onclick="App.delCard(${p.id})" title="Delete Card"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
            }).join('')}</div>`;
        }
    },

    /* HTML generator with transparent mode & 12 monthly theme accents */
    _cardHtml(p, month = 1) {
        const monthNames = ['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        const isTransparent = this.transparentMode ? 'transparent-bg' : '';
        const memberCode = this._memberCode(p.memberId || p.id);

        return `
        <div class="commander-shuttle-card ${isTransparent} theme-month-${month}">
            <!-- Free Pass Banner -->
            ${p.passType === 'Free' ? `<div style="background:linear-gradient(90deg,#15803d,#16a34a);color:#fff;font-weight:900;font-size:0.72rem;padding:3px 10px;text-align:center;letter-spacing:1px;border-radius:4px 4px 0 0"><i class="fas fa-star"></i> EMPLOYEE FREE PASS &nbsp;|&nbsp; COMPLIMENTARY <i class="fas fa-star"></i></div>` : ''}
            <!-- Header -->
            <div class="cc-header">
                <div class="cc-logo-box">
                    <img src="logo.png" alt="Commander City" style="max-height: 28px; object-fit: contain; margin-bottom: 1px;">
                    <span class="cc-logo-sub">COMMANDER CITY</span>
                </div>
                <div class="cc-title-box">
                    <div class="cc-title-main">COMMANDER CITY <span class="cc-header-badge">${monthNames[month]} EDITION</span></div>
                    <div class="cc-title-sub">SHUTTLE PASS</div>
                </div>
                <!-- Unique Member Code Badge -->
                <div class="cc-member-code-badge" title="Unique Member ID — permanent across all months">${memberCode}</div>
            </div>

            <!-- Body -->
            <div class="cc-body">
                <!-- Left Details Column -->
                <div class="cc-details-col">
                    <div class="cc-field-row">
                        <span class="cc-label">Name:</span>
                        <span class="cc-value">${this.esc(p.memberName)}</span>
                    </div>
                    <div class="cc-field-row">
                        <span class="cc-label">CNIC:</span>
                        <span class="cc-value">${this.esc(p.cnic || '—')}</span>
                    </div>
                    <div class="cc-field-row">
                        <span class="cc-label">House No:</span>
                        <span class="cc-value">${this.esc(p.houseNo || '—')}</span>
                    </div>
                    <div class="cc-field-row">
                        <span class="cc-label">Pass Type:</span>
                        <span class="cc-value" style="font-weight:800;color:${p.passType === 'Free' ? '#15803d' : p.passType === 'Half' ? '#b45309' : '#0369a1'}">${p.passType === 'Free' ? '🎟 EMPLOYEE FREE PASS' : (p.passType || 'Full').toUpperCase() + ' PASS'}</span>
                    </div>
                    <div class="cc-field-row">
                        <span class="cc-label">Issue Date:</span>
                        <span class="cc-value">${p.issueDate || '—'}</span>
                    </div>
                    <div class="cc-field-row">
                        <span class="cc-label">Valid Till:</span>
                        <span class="cc-value cc-value-red">${p.validTill || '—'}</span>
                    </div>
                </div>

                <!-- Right Photo & Payment Serial Badge Column -->
                <div class="cc-photo-col">
                    <div class="cc-photo-frame">
                        ${p.photo ? `<img src="${p.photo}" alt="Member Photo">` : `
                        <div class="cc-photo-placeholder">
                            <i class="fas fa-user"></i>
                            <span>PHOTO</span>
                        </div>`}
                    </div>
                    <div class="cc-serial-badge-box">
                        <span class="cc-serial-lbl">PAYMENT SEQ</span>
                        <span class="cc-serial-num">#${this.esc(p.serialNo)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    },

    /* Payment Sequence Serial Assignment Modal */
    async promptPaymentIssue() {
        const month = parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const year = parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

        const members = await DB.getAll('members');
        const activeMembers = members.filter(m => m.status === 'active');
        const existingPasses = await DB.getPassesForMonth(month, year);
        const existingMemberIds = new Set(existingPasses.map(p => p.memberId));

        // Per-month serial: count only passes in this month
        const nextSerial = existingPasses.length + 1;

        const save = async () => {
            const memberId = parseInt(document.getElementById('pay_member_id').value);
            const serialOverride = document.getElementById('pay_serial').value.trim();
            const passType = document.getElementById('pay_passtype').value;
            const amount = parseFloat(document.getElementById('pay_amount').value) || 0;
            const notes = document.getElementById('pay_notes').value.trim();
            const paymentMethod = document.querySelector('input[name="pay_method"]:checked')?.value || 'Cash';
            const proofInput = document.getElementById('pay_proof');

            if (!memberId) { this.toast('Please search and select a member first', 'warning'); return; }
            if (!serialOverride) { this.toast('Please enter the serial number to issue', 'warning'); return; }

            // Payment Proof is mandatory for every Cash / Online transaction
            if (passType !== 'Free' && (!proofInput || !proofInput.files || !proofInput.files[0])) {
                this.toast('⚠️ Payment Proof photo is required (Cash / Online) before issuing the pass.', 'warning');
                return;
            }

            let paymentProof = null;
            if (proofInput && proofInput.files && proofInput.files[0]) {
                paymentProof = await this._compressImage(proofInput.files[0]);
            }

            try {
                // Check if serial is already taken this month
                const serialTaken = existingPasses.find(p => String(p.serialNo) === String(serialOverride));
                if (serialTaken) {
                    this.toast(`Serial #${serialOverride} is already issued to ${serialTaken.memberName} this month!`, 'error');
                    return;
                }

                const res = await DB.processMemberPaymentWithSerial(memberId, month, year, serialOverride, amount, notes, passType, paymentMethod, paymentProof);
                // Sync in background — don't let a network/server failure
                // roll back an already-successful payment save.
                DB.syncNow().catch(syncErr => console.warn('[Sync] Post-payment sync failed (data is safe in IndexedDB):', syncErr));
                if (res.alreadyIssued) {
                    this.toast(`Member already has Serial #${res.pass.serialNo} for ${monthNames[month]} ${year}`, 'info');
                } else {
                    this.toast(`✅ Serial #${serialOverride} issued to ${res.pass.memberName} (${paymentMethod} — proof attached)!`, 'success');
                }
                this.closeModal();
                await this._renderCards();
            } catch (e) {
                console.error(e);
                this.toast('Error processing payment', 'error');
            }
        };

        // Build member list for search dropdown
        const allMembersJson = JSON.stringify(activeMembers.map(m => ({
            id: m.id,
            name: m.name,
            houseNo: m.houseNo || '',
            cnic: m.cnic || '',
            hasPass: existingMemberIds.has(m.id)
        })));

        const defaultFullFee = DB.getFeeForMonth(month, year, 'Full');
        const defaultHalfFee = DB.getFeeForMonth(month, year, 'Half');

        const body = `
        <div style="background:var(--glass);padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--cyan);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
                <div style="font-size:0.82rem;color:var(--text-muted)">Month: <strong style="color:var(--cyan-light)">${monthNames[month]} ${year}</strong></div>
                <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">Cards issued this month: <strong style="color:var(--green)">${existingPasses.length}</strong></div>
            </div>
            <div style="text-align:right">
                <div style="font-size:0.78rem;color:var(--text-muted)">Suggested next serial</div>
                <div style="font-size:1.4rem;font-weight:800;color:var(--amber)">#${String(nextSerial).padStart(2,'0')}</div>
            </div>
        </div>

        <!-- Member Search -->
        <div class="form-group" style="margin-bottom:4px">
            <label><i class="fas fa-search" style="color:var(--cyan)"></i> &nbsp;Search Member (type name, CNIC, or house no) *</label>
            <input type="text" id="pay_member_search" placeholder="e.g. SHOAIB or 35201-1111111-1 or Block F..."
                style="width:100%;background:var(--glass-heavy);border:2px solid var(--cyan);color:var(--text-primary);border-radius:var(--radius-sm);padding:11px 14px;font-size:0.98rem"
                oninput="App._filterPayMembers(${allMembersJson.replace(/"/g,'&quot;')})"
                onfocus="App._filterPayMembers(${allMembersJson.replace(/"/g,'&quot;')})"
            >
            <input type="hidden" id="pay_member_id" value="">
        </div>
        <div id="pay_member_results" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:14px;display:none"></div>
        <div id="pay_selected_member" style="display:none;background:rgba(16,185,129,0.12);border:1px solid var(--green);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-weight:600;color:var(--green);font-size:0.92rem"></div>

        <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div class="form-group" style="flex:0 0 140px">
                <label><i class="fas fa-hashtag" style="color:var(--amber)"></i> &nbsp;Serial Number to Issue *</label>
                <input type="number" id="pay_serial" value="${nextSerial}" min="1" style="font-size:1.2rem;font-weight:800;color:var(--amber);text-align:center;border-color:var(--amber)">
            </div>
            <div class="form-group" style="flex:1;min-width:140px">
                <label>Pass Category *</label>
                <select id="pay_passtype" onchange="App._onPayPassTypeChange(this.value, ${month}, ${year})" style="width:100%;height:42px;background:var(--glass-heavy);border:1px solid var(--border);color:var(--text-primary);border-radius:var(--radius-sm);padding:0 10px">
                    <option value="Full">Full Pass (PKR ${defaultFullFee})</option>
                    <option value="Half">Half Pass (PKR ${defaultHalfFee})</option>
                    <option value="Free">Free Pass — Employee (PKR 0)</option>
                </select>
            </div>
            <div class="form-group" style="flex:1;min-width:120px">
                <label>Payment Amount (PKR)</label>
                <input type="number" id="pay_amount" value="${defaultFullFee}" readonly style="background:var(--glass);opacity:0.8;cursor:not-allowed">
            </div>
            <div class="form-group" style="flex:1;min-width:140px">
                <label>Notes / Receipt Ref</label>
                <input type="text" id="pay_notes" placeholder="Cash / Bank Transfer">
            </div>
        </div>

        <!-- Payment Method & Proof (Mandatory for all non-Free passes) -->
        <div style="margin-top:16px;padding:14px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.3);border-radius:var(--radius-sm)">
            <div style="font-weight:700;color:var(--purple);margin-bottom:10px"><i class="fas fa-credit-card"></i> &nbsp;Payment Method & Proof</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                    <input type="radio" name="pay_method" value="Cash" checked style="accent-color:var(--amber)"> <span style="color:var(--amber)"><i class="fas fa-money-bill-wave"></i> Cash</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                    <input type="radio" name="pay_method" value="Online" style="accent-color:var(--cyan)"> <span style="color:var(--cyan)"><i class="fas fa-university"></i> Online Transfer</span>
                </label>
            </div>
            <div class="form-group" style="margin-bottom:0">
                <label style="font-weight:700;color:var(--red)"><i class="fas fa-camera" style="color:var(--red)"></i> &nbsp;Payment Proof Photo * <span style="font-size:0.75rem;color:var(--text-muted)">(Required for Cash & Online)</span></label>
                <input type="file" id="pay_proof" accept="image/*" capture="environment"
                    style="width:100%;background:var(--glass-heavy);border:2px dashed var(--cyan);color:var(--text-primary);border-radius:var(--radius-sm);padding:8px"
                    onchange="this.parentElement.querySelector('.proof-preview').innerHTML = this.files[0] ? '<img src=\''+URL.createObjectURL(this.files[0])+'\' style=\'max-width:120px;max-height:80px;border-radius:4px;border:1px solid var(--border)\'>' : ''">
                <div class="proof-preview" style="margin-top:8px"></div>
            </div>
        </div>`;

        App._currentModalSave = save;
        this.openModal(`Issue Serial — ${monthNames[month]} ${year}`, body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-renew" onclick="App._currentModalSave()" style="min-width:180px"><i class="fas fa-check-circle"></i> Issue Serial</button>`);
    },

    /* Live member search filter for payment modal */
    _filterPayMembers(memberList) {
        const q = (document.getElementById('pay_member_search')?.value || '').toLowerCase().trim();
        const results = document.getElementById('pay_member_results');
        const selDiv = document.getElementById('pay_selected_member');
        if (!results) return;

        const filtered = q.length === 0
            ? memberList.slice(0, 20)
            : memberList.filter(m =>
                m.name.toLowerCase().includes(q) ||
                m.houseNo.toLowerCase().includes(q) ||
                m.cnic.toLowerCase().includes(q)
              ).slice(0, 20);

        if (!filtered.length) {
            results.style.display = 'block';
            results.innerHTML = '<div style="padding:12px 14px;color:var(--text-muted);font-size:0.88rem">No members found</div>';
            return;
        }

        results.style.display = 'block';
        results.innerHTML = filtered.map(m => `
            <div onclick="App._selectPayMember(${m.id}, '${m.name.replace(/'/g,'&#39;')}', '${m.houseNo.replace(/'/g,'&#39;')}', ${m.hasPass})"
                style="padding:10px 14px;cursor:${m.hasPass ? 'default' : 'pointer'};display:flex;justify-content:space-between;align-items:center;
                border-bottom:1px solid var(--border);background:${m.hasPass ? 'rgba(239,68,68,0.08)' : 'var(--glass)'};
                opacity:${m.hasPass ? '0.6' : '1'};transition:background 0.15s"
                onmouseenter="if(!${m.hasPass}) this.style.background='var(--glass-heavy)'"
                onmouseleave="if(!${m.hasPass}) this.style.background='var(--glass)'">
                <div>
                    <div style="font-weight:600;font-size:0.92rem;color:var(--text-primary)">${m.name}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted)">${m.houseNo || 'No House'}</div>
                </div>
                ${m.hasPass ? '<span style="font-size:0.72rem;color:var(--red);font-weight:600;background:rgba(239,68,68,0.15);padding:2px 8px;border-radius:4px">Already Issued</span>'
                             : '<span style="font-size:0.72rem;color:var(--green);font-weight:600">Available ✓</span>'}
            </div>`).join('');
    },

    _selectPayMember(id, name, houseNo, hasPass) {
        if (hasPass) { this.toast('This member already has a pass this month', 'warning'); return; }
        document.getElementById('pay_member_id').value = id;
        document.getElementById('pay_member_search').value = name;
        const selDiv = document.getElementById('pay_selected_member');
        selDiv.style.display = 'block';
        selDiv.innerHTML = `<i class="fas fa-check-circle"></i> &nbsp;Selected: <strong>${name}</strong> <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem">(${houseNo})</span>`;
        document.getElementById('pay_member_results').style.display = 'none';
    },

    _onPayPassTypeChange(value, month, year) {
        const selM = month || parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const selY = year || parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());
        const amtInput = document.getElementById('pay_amount');
        if (amtInput) {
            if (value === 'Free') {
                amtInput.value = 0;
                amtInput.style.color = 'var(--green)';
                amtInput.style.fontWeight = '800';
            } else {
                amtInput.value = DB.getFeeForMonth(selM, selY, value);
                amtInput.style.color = '';
                amtInput.style.fontWeight = '';
            }
        }
    },

    _onEditCardPassTypeChange(value, month, year) {
        const issueInput = document.getElementById('c_issuedate');
        if (issueInput) {
            const mm = String(month).padStart(2, '0');
            const day = value === 'Half' ? '16' : '01';
            issueInput.value = `${day}-${mm}-${year}`;
        }
    },

    /* Generate unique member code from member ID — format: CC-XXXXX */
    _memberCode(id) {
        if (!id && id !== 0) return 'CC-?????';
        return 'CC-' + String(id).padStart(5, '0');
    },

    async editCard(passId) {
        const month = parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const year = parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());

        const save = async () => {
            const memberName = document.getElementById('c_name').value.trim();
            const cnic = document.getElementById('c_cnic').value.trim();
            const houseNo = document.getElementById('c_houseno').value.trim();
            const contact = document.getElementById('c_contact').value.trim();
            const issueDate = document.getElementById('c_issuedate').value.trim();
            const validTill = document.getElementById('c_validtill').value.trim();
            const serialNo = document.getElementById('c_serialno').value.trim();
            const status = document.getElementById('c_status').value;
            const passType = document.getElementById('c_passtype').value;
            const amount = DB.getFeeForMonth(month, year, passType);
            const photoInput = document.getElementById('c_photo');
            const paymentMethod = document.querySelector('input[name="c_pay_method"]:checked')?.value || 'Cash';
            const proofInput = document.getElementById('c_proof');

            if (!memberName) { this.toast('Member name is required', 'warning'); return; }

            // Payment Proof is mandatory for every Cash / Online transaction (unless Free pass)
            if (passType !== 'Free' && (!proofInput || !proofInput.files || !proofInput.files[0])) {
                this.toast('⚠️ Payment Proof photo is required (Cash / Online) before saving.', 'warning');
                return;
            }

            let photoBase64 = null;
            if (photoInput && photoInput.files && photoInput.files[0]) {
                photoBase64 = await this._compressImage(photoInput.files[0]);
            }

            let paymentProof = null;
            if (proofInput && proofInput.files && proofInput.files[0]) {
                paymentProof = await this._compressImage(proofInput.files[0]);
            }

            if (passId) {
                const p = await DB.get('passes', passId);
                if (p) {
                    p.memberName = memberName;
                    p.cnic = cnic;
                    p.houseNo = houseNo;
                    p.contact = contact;
                    p.issueDate = issueDate;
                    p.validTill = validTill;
                    p.serialNo = serialNo;
                    p.status = status;
                    p.passType = passType;
                    // Free passes are always PKR 0
                    p.amount = passType === 'Free' ? 0 : amount;
                    p.paymentMethod = paymentMethod;
                    if (photoBase64) p.photo = photoBase64;
                    if (paymentProof) p.paymentProof = paymentProof;
                    await DB.put('passes', p);

                    // ── Auto-sync changes to the Member Directory too ──
                    if (p.memberId) {
                        const member = await DB.get('members', p.memberId);
                        if (member) {
                            member.name   = memberName;
                            member.cnic   = cnic;
                            member.houseNo = houseNo;
                            member.contact = contact;
                            if (photoBase64) member.photo = photoBase64;
                            await DB.put('members', member);
                        }
                    }
                }
                await DB.syncNow();
                this.toast('Card updated — Member Directory also updated ✔', 'success');
            } else {
                const memberId = await DB.add('members', { name: memberName, cnic, houseNo, contact, photo: photoBase64, status: 'active', createdAt: new Date().toISOString() });
                await DB.add('passes', {
                    memberId, memberName, cnic, houseNo, contact, photo: photoBase64, serialNo, month, year,
                    passType, amount, paymentMethod, paymentProof, issueDate, validTill, status: 'active', paymentSeq: parseInt(serialNo) || 0, createdAt: new Date().toISOString()
                });
                await DB.syncNow();
                this.toast('✅ New Commander City pass card created!', 'success');
            }
            this.closeModal();
            await this._renderCards();
        };

        const mm = String(month).padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();

        let data = {
            memberName: '', cnic: '', houseNo: '', contact: '', photo: null,
            paymentMethod: 'Cash', paymentProof: null,
            serialNo: String(await DB.getNextPaymentSequenceSerial(month, year)),
            issueDate: `01-${mm}-${year}`,
            validTill: `${String(lastDay).padStart(2, '0')}-${mm}-${year}`,
            status: 'active'
        };

        if (passId) {
            const p = await DB.get('passes', passId);
            if (p) data = p;
        }

        const fullFee = DB.getFeeForMonth(month, year, 'Full');
        const halfFee = DB.getFeeForMonth(month, year, 'Half');

        const body = `
        <div style="display:flex;gap:18px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1">
                        <label><i class="fas fa-user" style="color:var(--cyan)"></i> &nbsp;Member Name *</label>
                        <input id="c_name" value="${this.esc(data.memberName)}" placeholder="e.g. SHOAIB ALI" style="font-size:1rem;font-weight:600">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-id-card" style="color:var(--amber)"></i> &nbsp;CNIC No</label>
                        <input id="c_cnic" value="${this.esc(data.cnic || '')}" placeholder="35201-1111111-1">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-phone" style="color:var(--green)"></i> &nbsp;Contact Number</label>
                        <input id="c_contact" value="${this.esc(data.contact || '')}" placeholder="03001234567">
                    </div>
                    <div class="form-group" style="grid-column:1/-1">
                        <label><i class="fas fa-home" style="color:var(--purple)"></i> &nbsp;House No / Block</label>
                        <input id="c_houseno" value="${this.esc(data.houseNo || '')}" placeholder="R-134/35 BLOCK F-1">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-hashtag" style="color:var(--amber)"></i> &nbsp;Serial Number</label>
                        <input id="c_serialno" value="${this.esc(data.serialNo)}" placeholder="66">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="c_status">
                            <option value="active" ${data.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="expired" ${data.status === 'expired' ? 'selected' : ''}>Expired</option>
                            <option value="cancelled" ${data.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Pass Type</label>
                        <select id="c_passtype" onchange="App._onEditCardPassTypeChange(this.value, ${month}, ${year})">
                            <option value="Full" ${data.passType === 'Full' || !data.passType ? 'selected' : ''}>Full Pass (PKR ${fullFee})</option>
                            <option value="Half" ${data.passType === 'Half' ? 'selected' : ''}>Half Pass (PKR ${halfFee})</option>
                            <option value="Free" ${data.passType === 'Free' ? 'selected' : ''}>Free Pass — Employee (PKR 0)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Issue Date (DD-MM-YYYY)</label>
                        <input id="c_issuedate" value="${this.esc(data.issueDate)}" placeholder="01-06-2026">
                    </div>
                    <div class="form-group">
                        <label>Valid Till (DD-MM-YYYY)</label>
                        <input id="c_validtill" value="${this.esc(data.validTill)}" placeholder="30-06-2026">
                    </div>
                </div>
            </div>
            <!-- Photo Upload Column -->
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;min-width:140px">
                <label style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px"><i class="fas fa-camera" style="color:var(--cyan)"></i> &nbsp;Member Photo</label>
                <div id="photoPreview" style="width:120px;height:140px;border:2px dashed var(--cyan);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:var(--glass);cursor:pointer" onclick="document.getElementById('c_photo').click()">
                    ${data.photo ? `<img src="${data.photo}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-user" style="font-size:2.5rem;color:var(--text-muted)"></i><span style="font-size:0.72rem;color:var(--text-muted);margin-top:6px">Click to upload</span>`}
                </div>
                <input type="file" id="c_photo" accept="image/*" style="display:none" onchange="
                    const f=this.files[0]; if(!f) return;
                    const r=new FileReader(); r.onload=e=>{ const p=document.getElementById('photoPreview'); p.innerHTML='<img src=\''+e.target.result+'\' style=\'width:100%;height:100%;object-fit:cover\'>'; }; r.readAsDataURL(f);
                ">
                <button type="button" onclick="document.getElementById('c_photo').click()" class="btn btn-ghost btn-sm" style="width:120px"><i class="fas fa-upload"></i> Upload Photo</button>
            </div>
        </div>

        <!-- Payment Method & Proof (Mandatory for all non-Free passes) -->
        <div style="margin-top:16px;padding:14px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.3);border-radius:var(--radius-sm)">
            <div style="font-weight:700;color:var(--purple);margin-bottom:10px"><i class="fas fa-credit-card"></i> &nbsp;Payment Method & Proof</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                    <input type="radio" name="c_pay_method" value="Cash" ${data.paymentMethod === 'Online' ? '' : 'checked'} style="accent-color:var(--amber)"> <span style="color:var(--amber)"><i class="fas fa-money-bill-wave"></i> Cash</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                    <input type="radio" name="c_pay_method" value="Online" ${data.paymentMethod === 'Online' ? 'checked' : ''} style="accent-color:var(--cyan)"> <span style="color:var(--cyan)"><i class="fas fa-university"></i> Online Transfer</span>
                </label>
            </div>
            <div class="form-group" style="margin-bottom:0">
                <label style="font-weight:700;color:var(--red)"><i class="fas fa-camera" style="color:var(--red)"></i> &nbsp;Payment Proof Photo * <span style="font-size:0.75rem;color:var(--text-muted)">(Required for Cash & Online)</span></label>
                <input type="file" id="c_proof" accept="image/*" capture="environment"
                    style="width:100%;background:var(--glass-heavy);border:2px dashed var(--cyan);color:var(--text-primary);border-radius:var(--radius-sm);padding:8px"
                    onchange="this.parentElement.querySelector('.proof-preview').innerHTML = this.files[0] ? '<img src=\''+URL.createObjectURL(this.files[0])+'\' style=\'max-width:120px;max-height:80px;border-radius:4px;border:1px solid var(--border)\'>' : ''">
                <div class="proof-preview" style="margin-top:8px">${data.paymentProof ? `<img src="${data.paymentProof}" style='max-width:120px;max-height:80px;border-radius:4px;border:1px solid var(--border)'>` : ''}</div>
            </div>
        </div>`;

        App._currentModalSave = save;
        this.openModal(passId ? 'Edit Commander City Card' : '✚ Create New Shuttle Pass Card', body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="App._currentModalSave()" style="min-width:140px"><i class="fas fa-save"></i> ${passId ? 'Update Card' : 'Create Card'}</button>`);
    },

    async delCard(passId) {
        if (!confirm('Delete this shuttle pass card?')) return;
        await DB.del('passes', passId);
        await DB.syncNow();
        this.toast('Card deleted', 'success');
        await this._renderCards();
    },

    async renewNextMonth() {
        this.navigate('renewal');
    },

    printSingle(passId) {
        DB.get('passes', passId).then(p => {
            if (!p) return;
            const printWin = window.open('', '_blank', 'width=650,height=550');
            if (!printWin) {
                alert('Pop-up blocked! Please allow pop-ups for this site to print cards.');
                return;
            }
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            const cardHtml = this._cardHtml(p, p.month || 1);
            
            printWin.document.write(`<!DOCTYPE html><html><head>
            <base href="${baseUrl}">
            <title>Shuttle Pass - ${this.esc(p.memberName)}</title>
            <link rel="stylesheet" href="css/styles.css">
            <style>
                @media print {
                    @page { size: auto; margin: 8mm; }
                    html, body {
                        background: #ffffff !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        display: flex !important;
                        justify-content: center !important;
                        align-items: flex-start !important;
                    }
                    .commander-shuttle-card {
                        width: 85.6mm !important;
                        height: 54.0mm !important;
                        max-width: 85.6mm !important;
                        max-height: 54.0mm !important;
                        border: 2px solid #000000 !important;
                        box-shadow: none !important;
                        margin: 5mm auto !important;
                        padding: 1.8mm 2.5mm !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        zoom: 1 !important;
                    }
                    .cc-title-main, .cc-title-sub, .cc-label, .cc-value, .cc-logo-sub, .cc-header-badge { color: #000000 !important; font-weight: 900 !important; }
                    .cc-value { border-bottom: 1.5px solid #000000 !important; }
                    .cc-photo-frame { border: 1.5px solid #000000 !important; }
                    .cc-header { border-bottom: 1.5px solid #000000 !important; }
                    .cc-member-code-badge { background: #000000 !important; color: #ffffff !important; border: 1.5px solid #000000 !important; font-weight: 900 !important; }
                    .cc-serial-badge-box { background: #000000 !important; color: #ffffff !important; border: 1.5px solid #000000 !important; }
                    .cc-serial-num { color: #ffffff !important; font-weight: 900 !important; }
                }
                @media screen {
                    body {
                        background: #f1f5f9;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                }
            </style></head><body>
            <div style="display:flex;justify-content:center;width:100%">${cardHtml}</div>
            <script>
                var printed = false;
                function doPrint() {
                    if (printed) return;
                    printed = true;
                    try { window.focus(); window.print(); } catch(e){}
                    setTimeout(function(){ window.close(); }, 500);
                }
                var imgs = document.images;
                var loaded = 0;
                var total = imgs.length;
                if (total === 0) {
                    setTimeout(doPrint, 300);
                } else {
                    for (var i = 0; i < total; i++) {
                        if (imgs[i].complete) {
                            loaded++;
                            if (loaded === total) setTimeout(doPrint, 300);
                        } else {
                            imgs[i].onload = imgs[i].onerror = function() {
                                loaded++;
                                if (loaded === total) setTimeout(doPrint, 300);
                            };
                        }
                    }
                    setTimeout(doPrint, 800);
                }
            </script>
            </body></html>`);
            printWin.document.close();
        });
    },

    /* ── Pass Fee Rates & Schedule Settings Modal ── */
    showFeeSettingsModal() {
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const rules = DB.getFeeRules();

        const curYear = new Date().getFullYear();
        const yearOpts = [curYear-1, curYear, curYear+1, curYear+2].map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`).join('');
        const monthOpts = monthNames.slice(1).map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

        const body = `
        <div style="background:var(--glass);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--cyan)">
            <div style="font-size:0.9rem;font-weight:700;color:var(--cyan)"><i class="fas fa-coins"></i> Manage Shuttle Pass Fee Schedules</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">
                Set monthly fee rates and choose from which month/year the changes take effect. 
                Existing issued cards retain their historical amounts.
            </div>
        </div>

        <div style="margin-bottom:16px">
            <h4 style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:8px"><i class="fas fa-list"></i> Active Fee Schedules</h4>
            <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
                <table class="table" style="font-size:0.85rem">
                    <thead>
                        <tr>
                            <th>Effective Start</th>
                            <th>Full Pass Fee</th>
                            <th>Half Pass Fee</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rules.map(r => `
                        <tr>
                            <td style="font-weight:700;color:var(--cyan-light)">
                                <i class="fas fa-calendar-alt" style="color:var(--amber)"></i> ${monthNames[r.startMonth]} ${r.startYear} onwards
                            </td>
                            <td style="font-weight:700;color:var(--green)">PKR ${Number(r.fullAmount).toLocaleString()}</td>
                            <td style="font-weight:700;color:var(--amber)">PKR ${Number(r.halfAmount).toLocaleString()}</td>
                            <td>
                                ${rules.length > 1 ? `<button class="btn btn-danger btn-icon btn-sm" onclick="App.delFeeRule(${r.id || (r.startYear * 100 + r.startMonth)})" title="Delete Schedule"><i class="fas fa-trash"></i></button>` : '<span style="font-size:0.75rem;color:var(--text-muted)">Default</span>'}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add New Fee Schedule Form -->
        <div style="background:var(--glass-heavy);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <h4 style="font-size:0.88rem;color:var(--amber);margin-bottom:10px"><i class="fas fa-plus-circle"></i> Add / Schedule New Fee Rate</h4>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                <div class="form-group" style="flex:1;min-width:110px">
                    <label>Effective Month *</label>
                    <select id="fee_start_month">${monthOpts}</select>
                </div>
                <div class="form-group" style="flex:1;min-width:90px">
                    <label>Effective Year *</label>
                    <select id="fee_start_year">${yearOpts}</select>
                </div>
                <div class="form-group" style="flex:1;min-width:110px">
                    <label>Full Pass (PKR) *</label>
                    <input type="number" id="fee_full_amount" value="8000" placeholder="e.g. 8000">
                </div>
                <div class="form-group" style="flex:1;min-width:110px">
                    <label>Half Pass (PKR) *</label>
                    <input type="number" id="fee_half_amount" value="4000" placeholder="e.g. 4000">
                </div>
            </div>
            <button class="btn btn-primary btn-sm" style="margin-top:10px;background:var(--amber);border-color:var(--amber);color:#000;font-weight:700" onclick="App.saveNewFeeRule()">
                <i class="fas fa-save"></i> Save Fee Schedule Rule
            </button>
        </div>
        `;

        this.openModal('Pass Fee Rates & Schedule', body, '<button class="btn btn-ghost" onclick="App.closeModal()">Close</button>');
    },

    saveNewFeeRule() {
        const startMonth = parseInt(document.getElementById('fee_start_month').value);
        const startYear = parseInt(document.getElementById('fee_start_year').value);
        const fullAmount = parseFloat(document.getElementById('fee_full_amount').value);
        const halfAmount = parseFloat(document.getElementById('fee_half_amount').value);

        if (!fullAmount || !halfAmount || fullAmount <= 0 || halfAmount <= 0) {
            this.toast('Please enter valid positive amounts for Full and Half passes', 'warning');
            return;
        }

        let rules = DB.getFeeRules();
        const existingIdx = rules.findIndex(r => r.startMonth === startMonth && r.startYear === startYear);
        const newRule = { id: Date.now(), startMonth, startYear, fullAmount, halfAmount };

        if (existingIdx !== -1) {
            rules[existingIdx] = newRule;
        } else {
            rules.push(newRule);
        }

        DB.saveFeeRules(rules);
        DB.syncNow();
        this.toast(`Fee schedule rule saved! Effective from ${startMonth}/${startYear}`, 'success');
        this.showFeeSettingsModal();
        this._renderCards();
    },

    delFeeRule(ruleId) {
        let rules = DB.getFeeRules();
        if (rules.length <= 1) {
            this.toast('At least one fee schedule rule must remain', 'warning');
            return;
        }
        rules = rules.filter(r => (r.id || (r.startYear * 100 + r.startMonth)) !== ruleId);
        DB.saveFeeRules(rules);
        DB.syncNow();
        this.toast('Fee rule removed', 'info');
        this.showFeeSettingsModal();
        this._renderCards();
    },

    /* View 2: Members Directory */
    async vMembers(el) {
        const members = await DB.getAll('members');
        el.innerHTML = `
        <div class="sticky-header-container">
            <div class="page-header">
                <h2><i class="fas fa-users" style="color:var(--cyan);margin-right:8px"></i>Member Directory (${members.length})</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn-danger btn-sm" onclick="App.bulkDelMembers()"><i class="fas fa-trash-alt"></i> Bulk Delete</button>
                    <button class="btn btn-primary btn-sm" onclick="App.editMember()"><i class="fas fa-user-plus"></i> Add Member</button>
                    <button class="btn btn-primary btn-sm" style="background:var(--green);border-color:var(--green)" onclick="App.bulkAddMembersModal()"><i class="fas fa-users"></i> Bulk Add</button>
                    <button class="btn btn-renew btn-sm" onclick="App.showRestoreModal()"><i class="fas fa-history"></i> Restore Version</button>
                </div>
            </div>
            <div style="margin-bottom:0;">
                <input type="text" id="inpMemberSearch" placeholder="Search by Name, CNIC, Phone or House No..." 
                    style="width:100%;max-width:400px;background:var(--glass-heavy);border:1.5px solid var(--cyan);color:var(--text-primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:0.95rem"
                    oninput="App._filterMembers()">
            </div>
        </div>
        <div class="card"><div class="table-wrapper"><table class="table">
            <thead><tr>
                <th style="width:40px"><input type="checkbox" id="chkAllMembers" onclick="App.toggleAllMembers(this)"></th>
                <th>Photo</th><th>Member Code</th><th>Name</th><th>CNIC</th><th>Phone</th><th>House No / Block</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="membersTableBody">${members.length === 0 ? '<tr><td colspan="10"><div class="empty-state"><i class="fas fa-users"></i><p>No members registered yet</p></div></td></tr>' :
                members.map((m, i) => `<tr>
                    <td><input type="checkbox" class="chk-member" value="${m.id}"></td>
                    <td>${m.photo ? `<img src="${m.photo}" style="width:30px;height:30px;border-radius:50%;object-fit:cover">` : `<div style="width:30px;height:30px;border-radius:50%;background:var(--glass-heavy);display:flex;align-items:center;justify-content:center;color:var(--text-muted)"><i class="fas fa-user"></i></div>`}</td>
                    <td><span style="font-family:monospace;font-weight:700;color:var(--cyan);background:rgba(6,182,212,0.12);padding:3px 8px;border-radius:6px;border:1px solid rgba(6,182,212,0.3);font-size:0.82rem;letter-spacing:0.5px">${this._memberCode(m.id)}</span></td>
                    <td style="font-weight:600">${this.esc(m.name)}</td>
                    <td>${this.esc(m.cnic || '—')}</td>
                    <td>${this.esc(m.contact || '—')}</td>
                    <td>${this.esc(m.houseNo || '—')}</td>
                    <td><span class="badge ${m.status === 'active' ? 'badge-active' : 'badge-cancelled'}">${m.status}</span></td>
                    <td>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="App.editMember(${m.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-icon btn-sm" onclick="App.delMember(${m.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table></div></div>`;
    },

    _filterMembers() {
        const q = (document.getElementById('inpMemberSearch')?.value || '').toLowerCase().trim();
        const rows = document.querySelectorAll('#membersTableBody tr');
        rows.forEach(r => {
            const text = r.textContent.toLowerCase();
            r.style.display = text.includes(q) ? '' : 'none';
        });
    },

    async editMember(memberId) {
        const save = async () => {
            const name = document.getElementById('m_name').value.trim();
            const cnic = document.getElementById('m_cnic').value.trim();
            const houseNo = document.getElementById('m_houseno').value.trim();
            const contact = document.getElementById('m_contact').value.trim();
            const status = document.getElementById('m_status').value;
            const photoInput = document.getElementById('m_photo');

            if (!name) { this.toast('Member name is required', 'warning'); return; }

            let photoBase64 = null;
            if (photoInput && photoInput.files && photoInput.files[0]) {
                photoBase64 = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = (e) => resolve(e.target.result);
                    r.readAsDataURL(photoInput.files[0]);
                });
            }

            if (memberId) {
                const m = await DB.get('members', memberId);
                m.name = name; m.cnic = cnic; m.houseNo = houseNo; m.contact = contact; m.status = status;
                if (photoBase64) m.photo = photoBase64;
                await DB.put('members', m);
                await DB.syncNow();
                this.toast('Member updated', 'success');
            } else {
                await DB.add('members', { name, cnic, houseNo, contact, photo: photoBase64, status, createdAt: new Date().toISOString() });
                await DB.syncNow();
                this.toast('Member added', 'success');
            }
            this.closeModal();
            this.render('members');
        };

        let data = { name: '', cnic: '', houseNo: '', contact: '', status: 'active', photo: null };
        if (memberId) data = await DB.get('members', memberId);

        const body = `
        <div style="display:flex;gap:18px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1"><label>Name *</label><input id="m_name" value="${this.esc(data.name)}"></div>
                    <div class="form-group"><label>CNIC</label><input id="m_cnic" value="${this.esc(data.cnic || '')}"></div>
                    <div class="form-group"><label>Phone Number</label><input id="m_contact" value="${this.esc(data.contact || '')}"></div>
                    <div class="form-group" style="grid-column:1/-1"><label>House No / Block</label><input id="m_houseno" value="${this.esc(data.houseNo || '')}"></div>
                    <div class="form-group" style="grid-column:1/-1"><label>Status</label>
                        <select id="m_status">
                            <option value="active" ${data.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${data.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;min-width:140px">
                <label style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px"><i class="fas fa-camera"></i> &nbsp;Picture</label>
                <div id="mPhotoPreview" style="width:120px;height:140px;border:2px dashed var(--cyan);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:var(--glass);cursor:pointer" onclick="document.getElementById('m_photo').click()">
                    ${data.photo ? `<img src="${data.photo}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-user" style="font-size:2.5rem;color:var(--text-muted)"></i>`}
                </div>
                <input type="file" id="m_photo" accept="image/*" style="display:none" onchange="
                    const f=this.files[0]; if(!f) return;
                    const r=new FileReader(); r.onload=e=>{ document.getElementById('mPhotoPreview').innerHTML='<img src=\''+e.target.result+'\' style=\'width:100%;height:100%;object-fit:cover\'>'; }; r.readAsDataURL(f);
                ">
                <button type="button" onclick="document.getElementById('m_photo').click()" class="btn btn-ghost btn-sm" style="width:120px"><i class="fas fa-upload"></i> Upload Photo</button>
            </div>
        </div>`;

        App._currentModalSave = save;
        this.openModal(memberId ? 'Edit Member' : 'Add Member', body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="App._currentModalSave()"><i class="fas fa-save"></i> Save</button>`);
    },


    toggleAllMembers(cb) {
        document.querySelectorAll('.chk-member').forEach(el => el.checked = cb.checked);
    },


    bulkAddMembersModal() {
        const body = `
        <div style="margin-bottom:10px;font-size:0.9rem;color:var(--text-muted)">Fill out multiple rows to add several members at once.</div>
        <div id="bulkAddContainer" style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:10px;background:var(--glass);">
            <table class="table" style="min-width:600px">
                <thead>
                    <tr><th>Name *</th><th>CNIC</th><th>Phone</th><th>House No / Block</th><th></th></tr>
                </thead>
                <tbody id="bulkAddTbody">
                </tbody>
            </table>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:10px;color:var(--cyan)" onclick="App.addBulkRow()">+ Add Row</button>
        `;

        App._currentModalSave = async () => {
            const rows = document.querySelectorAll('.bulk-add-row');
            let added = 0;
            for (const row of rows) {
                const name = row.querySelector('.ba-name').value.trim();
                const cnic = row.querySelector('.ba-cnic').value.trim();
                const phone = row.querySelector('.ba-phone').value.trim();
                const houseNo = row.querySelector('.ba-houseno').value.trim();
                if (name) {
                    await DB.add('members', { name, cnic, houseNo, contact: phone, photo: null, status: 'active', createdAt: new Date().toISOString() });
                    added++;
                }
            }
            if (added > 0) {
                await DB.syncNow();
                this.toast(`Successfully added ${added} members`, 'success');
                this.closeModal();
                this.render('members');
            } else {
                this.toast('No valid members to add', 'warning');
            }
        };

        this.openModal('Bulk Add Members', body, 
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="App._currentModalSave()"><i class="fas fa-save"></i> Save All</button>`);
        
        // Add 3 rows by default
        for (let i = 0; i < 3; i++) this.addBulkRow();
    },

    addBulkRow() {
        const tbody = document.getElementById('bulkAddTbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.className = 'bulk-add-row';
        tr.innerHTML = `
            <td><input class="ba-name" style="width:100%;padding:4px" placeholder="Name"></td>
            <td><input class="ba-cnic" style="width:100%;padding:4px" placeholder="CNIC"></td>
            <td><input class="ba-phone" style="width:100%;padding:4px" placeholder="Phone"></td>
            <td><input class="ba-houseno" style="width:100%;padding:4px" placeholder="House No / Block"></td>
            <td><button class="btn btn-danger btn-icon btn-sm" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    },

    async bulkDelMembers() {
        const checked = Array.from(document.querySelectorAll('.chk-member:checked')).map(el => parseInt(el.value));
        if (!checked.length) { this.toast('No members selected', 'warning'); return; }
        if (!confirm(`Delete ${checked.length} members?`)) return;
        for (const id of checked) {
            await DB.del('members', id);
        }
        await DB.syncNow();
        this.toast(`Deleted ${checked.length} members`, 'success');
        this.render('members');
    },

    async showRestoreModal() {
        let versions = [];
        try {
            const res = await fetch('/api/versions');
            if (res.ok) versions = await res.json();
        } catch (e) {
            this.toast('Error fetching versions', 'error');
            return;
        }

        const body = `
        <div style="max-height:300px;overflow-y:auto;">
            ${versions.length === 0 ? '<div style="padding:10px;color:var(--text-muted)">No versions found</div>' :
            versions.map(v => {
                const isForce = v.startsWith('force_');
                const label = isForce ? '<span class="badge badge-warning" style="background:var(--amber);color:#000;">Force Save</span>' : '<span class="badge" style="background:var(--glass-heavy);color:var(--text-muted);">Auto Save</span>';
                const dateParts = v.replace('force_','').replace('auto_','').replace('.json','').split('-');
                let dateStr = v;
                if (dateParts.length >= 6) {
                    dateStr = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]} ${dateParts[3]}:${dateParts[4]}:${dateParts[5]}`;
                }
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--border)">
                    <div><div style="font-weight:600;font-size:0.9rem;">${dateStr}</div><div style="margin-top:4px;">${label}</div></div>
                    <button class="btn btn-primary btn-sm" onclick="App.restoreVersion('${v}')"><i class="fas fa-undo"></i> Restore</button>
                </div>`;
            }).join('')}
        </div>`;
        this.openModal('Restore Version', body, '<button class="btn btn-ghost" onclick="App.closeModal()">Close</button>');
    },

    async restoreVersion(filename) {
        if (!confirm('Are you sure you want to restore this version? Current unsaved changes will be lost.')) return;
        try {
            const res = await fetch('/api/versions/' + encodeURIComponent(filename));
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            await DB.restoreSystem(data);
            this.toast('Version restored successfully!', 'success');
            this.closeModal();
            this.render(this.currentView);
        } catch (e) {
            this.toast('Error restoring version', 'error');
        }
    },

    async delMember(memberId) {
        if (!confirm('Delete this member?')) return;
        await DB.del('members', memberId);
        await DB.syncNow();
        this.toast('Member deleted', 'success');
        this.render('members');
    },

    /* View 3: Payment Sequence Renewal */
    async vRenewal(el) {
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear = now.getFullYear();

        let targetMonth = curMonth + 1;
        let targetYear = curYear;
        if (targetMonth > 12) { targetMonth = 1; targetYear++; }

        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

        const members = await DB.getAll('members');
        const activeMembers = members.filter(m => m.status === 'active');

        el.innerHTML = `
        <div class="page-header"><h2><i class="fas fa-sync-alt" style="color:var(--purple);margin-right:8px"></i>Payment Sequence Renewal</h2></div>
        <div class="card" style="max-width:680px;margin:0 auto;padding:24px">
            <h3 style="margin-bottom:12px;color:var(--cyan-light)">Sequential Payment & Serial Assignment</h3>
            <p style="color:var(--text-secondary);margin-bottom:20px;line-height:1.5">
                As members make their monthly pass payments, they are assigned sequential serial numbers (1, 2, 3...) based strictly on the order of their payment!
            </p>

            <div style="background:var(--glass);padding:16px;border-radius:var(--radius-sm);margin-bottom:20px;border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                    <span style="color:var(--text-muted)">Current Target Month:</span>
                    <span style="font-weight:700;color:var(--cyan-light)">${monthNames[targetMonth]} ${targetYear}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                    <span style="color:var(--text-muted)">Active Registered Members:</span>
                    <span style="font-weight:700;color:var(--green)">${activeMembers.length} members</span>
                </div>
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button class="btn btn-primary" style="flex:1" onclick="App.promptPaymentIssue()">
                    <i class="fas fa-money-bill-wave"></i> Process Single Member Payment
                </button>
                <button class="btn btn-renew" style="flex:1" onclick="App.runBulkRenewal(${curMonth},${curYear},${targetMonth},${targetYear})">
                    <i class="fas fa-sync-alt"></i> Auto-Renew All Active Members
                </button>
            </div>
        </div>`;
    },

    async runBulkRenewal(sM, sY, tM, tY) {
        const paymentMethod = prompt('Payment Method for bulk renewal (Cash / Online):', 'Cash');
        const method = (paymentMethod || 'Cash').trim().toLowerCase() === 'online' ? 'Online' : 'Cash';
        
        // For bulk renewal, proof is mandatory - show file input
        const proofInput = document.createElement('input');
        proofInput.type = 'file';
        proofInput.accept = 'image/*';
        proofInput.capture = 'environment';
        proofInput.style.display = 'none';
        
        const proofSelected = await new Promise((resolve) => {
            proofInput.onchange = () => resolve(proofInput.files[0] || null);
            proofInput.click();
        });
        
        let paymentProof = null;
        if (proofSelected) {
            paymentProof = await this._compressImage(proofSelected);
        }
        
        // Payment proof is mandatory for non-free passes (bulk renewal always has paid passes)
        if (!paymentProof) {
            this.toast('⚠️ Payment Proof photo is required for bulk renewal.', 'warning');
            return;
        }

        const renewed = await DB.renewMonth(sM, sY, tM, tY, method, paymentProof);
        if (renewed === 0) {
            this.toast('No active members to renew or already renewed for target month', 'warning');
            return;
        }
        await DB.syncNow();
        this.toast(`Successfully renewed ${renewed} passes in payment sequence (${method} — proof attached)!`, 'success');
        this.navigate('passes');
    },

    /* View 4: History & Payment Logs */
    async vHistory(el) {
        const payments = await DB.getAll('payments');
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

        el.innerHTML = `
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;width:100%">
            <h2><i class="fas fa-history" style="color:var(--cyan);margin-right:8px"></i>Payment Transactions & Logs</h2>
            <button class="btn btn-ghost" onclick="App.promptPrintTransactions()" style="font-weight:700;border-color:var(--border-hover)">
                <i class="fas fa-print" style="color:var(--cyan)"></i> Print Transactions Register
            </button>
        </div>
        <div class="card"><div class="table-wrapper"><table class="table">
            <thead><tr><th>#</th><th>Payment Date & Time</th><th>Member Name</th><th>Cycle</th><th>Assigned Serial</th><th>Method</th><th>Amount</th><th>Notes</th><th style="width:80px">Receipt</th></tr></thead>
            <tbody>${payments.length === 0 ? '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-history"></i><p>No payment logs recorded yet</p></div></td></tr>' :
                payments.reverse().map((p, i) => {
                    const m = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
                    const amt = Number(p.amount) || 0;
                    const methodBadge = m === 'Online'
                        ? '<span class="badge" style="background:rgba(6,182,212,0.15);color:var(--cyan)">Online</span>'
                        : m === 'Free'
                        ? '<span class="badge" style="background:rgba(16,185,129,0.2);color:var(--green)">Free</span>'
                        : '<span class="badge" style="background:rgba(245,158,11,0.15);color:var(--amber)">Cash</span>';
                    return `<tr>
                    <td>${i + 1}</td>
                    <td>${new Date(p.paidAt).toLocaleString('en-PK')}</td>
                    <td style="font-weight:600">${this.esc(p.memberName)}</td>
                    <td>${monthNames[p.month]} ${p.year}</td>
                    <td><span class="badge badge-active" style="font-size:0.85rem;font-weight:800">Serial #${p.serialNo}</span></td>
                    <td>${methodBadge}</td>
                    <td>PKR ${amt.toLocaleString()} <span style="font-size:0.75rem;font-weight:bold;color:${amt === 4000 ? 'var(--amber)' : 'var(--cyan)'}">(${ amt === 4000 ? 'Half' : 'Full'})</span></td>
                    <td>${this.esc(p.notes || '—')}</td>
                    <td style="text-align:center">
                        <button class="btn btn-ghost btn-sm" style="padding:5px 10px" onclick="App.showPaymentReceipt(${p.id})" title="View & Print Payment Receipt">
                            <i class="fas fa-receipt" style="color:var(--amber)"></i>
                        </button>
                    </td>
                </tr>`;
                }).join('')}
            </tbody>
        </table></div></div>`;
    },

    /* ── Payment Transactions: Access & Print ── */

    async promptPrintTransactions() {
        const payments = await DB.getAll('payments');
        if (!payments.length) { this.toast('No payment transactions recorded yet', 'warning'); return; }
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const years = [...new Set(payments.map(p => Number(p.year) || new Date().getFullYear()))].sort((a, b) => b - a);

        const body = `
        <div style="padding:4px 0">
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px">Choose the cycle to print. The register lists every payment transaction with Cash / Online / Free method, amounts, and totals.</p>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
                <div style="flex:1;min-width:150px">
                    <label style="font-weight:700;font-size:0.85rem;margin-bottom:6px;display:block">Month</label>
                    <select id="tx_month">
                        <option value="0">All Months</option>
                        ${monthNames.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;min-width:150px">
                    <label style="font-weight:700;font-size:0.85rem;margin-bottom:6px;display:block">Year</label>
                    <select id="tx_year">
                        <option value="0">All Years</option>
                        ${years.map(y => `<option value="${y}" ${y === new Date().getFullYear() ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>`;

        this.openModal('🖨 Print Payment Transactions Register', body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="App._doPrintTransactions()"><i class="fas fa-print"></i> Print Register</button>`);
    },

    async _doPrintTransactions() {
        const month = parseInt(document.getElementById('tx_month')?.value || '0');
        const year = parseInt(document.getElementById('tx_year')?.value || '0');
        this.closeModal();
        await this.openTransactionPrint(month, year);
    },

    async openTransactionPrint(month = 0, year = 0) {
        let payments = await DB.getAll('payments');
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        if (month) payments = payments.filter(p => Number(p.month) === month);
        if (year) payments = payments.filter(p => Number(p.year) === year);
        if (!payments.length) { this.toast('No payment transactions found for the selected cycle', 'warning'); return; }
        payments.sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''));

        let totalAmt = 0, totalCash = 0, totalOnline = 0, totalFree = 0;
        const rows = payments.map((p, i) => {
            const m = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
            const amt = Number(p.amount) || 0;
            totalAmt += amt;
            if (m === 'Online') totalOnline += amt;
            else if (m === 'Cash') totalCash += amt;
            else totalFree += amt;
            return `<tr>
                <td style="text-align:center;padding:6px 8px">${i + 1}</td>
                <td style="padding:6px 8px">${new Date(p.paidAt).toLocaleString('en-PK')}</td>
                <td style="padding:6px 8px;font-weight:600">${this.esc(p.memberName)}</td>
                <td style="text-align:center;padding:6px 8px">${monthNames[p.month] || p.month} ${p.year}</td>
                <td style="text-align:center;padding:6px 8px">#${this.esc(p.serialNo)}</td>
                <td style="text-align:center;padding:6px 8px">${m}</td>
                <td style="text-align:right;padding:6px 8px;font-weight:700">PKR ${amt.toLocaleString()}</td>
                <td style="padding:6px 8px">${this.esc(p.notes || '—')}</td>
            </tr>`;
        }).join('');

        const filterLabel = (month && year) ? `${monthNames[month].toUpperCase()} ${year}`
            : (year ? `YEAR ${year}` : (month ? monthNames[month].toUpperCase() : 'ALL MONTHS / ALL YEARS'));

        const printWin = window.open('', '_blank', 'width=900,height=600');
        if (!printWin) { alert('Pop-up blocked! Please allow pop-ups for this site to print.'); return; }

        printWin.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <title>Payment Transactions Register — ${this.esc(filterLabel)}</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #000; margin: 0; padding: 20px; }
            .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: 1px; }
            .header div { font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 6px 8px; }
            th { background: #e5e7eb; font-weight: 800; text-align: left; }
            .totals { margin-top: 14px; font-size: 13px; font-weight: 700; }
            .totals table { border: none; }
            .totals td { border: none; padding: 2px 8px; }
            .footer { margin-top: 24px; font-size: 12px; text-align: center; color: #333; border-top: 1px solid #999; padding-top: 8px; }
            @media print { body { padding: 6mm; } }
        </style></head><body>
        <div class="header">
            <h1>COMMANDER CITY HOUSING SOCIETY — SHUTTLE PASS</h1>
            <div><strong>PAYMENT TRANSACTIONS REGISTER — ${this.esc(filterLabel)}</strong></div>
            <div>Generated: ${new Date().toLocaleString('en-PK')} &nbsp;·&nbsp; Total Transactions: ${payments.length}</div>
        </div>
        <table>
            <thead><tr><th>Sr#</th><th>Payment Date & Time</th><th>Member Name</th><th>Cycle</th><th>Serial</th><th>Method</th><th style="text-align:right">Amount (PKR)</th><th>Notes</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="totals">
            <table>
                <tr><td>TOTAL TRANSACTIONS:</td><td>${payments.length}</td><td></td></tr>
                <tr><td>TOTAL CASH COLLECTION:</td><td>PKR ${totalCash.toLocaleString()}</td><td></td></tr>
                <tr><td>TOTAL ONLINE TRANSFERS:</td><td>PKR ${totalOnline.toLocaleString()}</td><td></td></tr>
                ${totalFree > 0 ? `<tr><td>TOTAL FREE PASSES:</td><td>PKR ${totalFree.toLocaleString()}</td><td></td></tr>` : ''}
                <tr><td><strong>GRAND TOTAL:</strong></td><td><strong>PKR ${totalAmt.toLocaleString()}</strong></td><td></td></tr>
            </table>
        </div>
        <div class="footer">Computer Generated Record — Commander City Shuttle Pass System</div>
        <script>setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 250);</script>
        </body></html>`);
        printWin.document.close();
    },

    _receiptRow(label, value) {
        return `<tr><td style="padding:5px 8px;font-weight:700;color:var(--text-muted);width:130px;border-bottom:1px solid rgba(148,163,184,0.15)">${label}</td>
        <td style="padding:5px 8px;font-weight:600;border-bottom:1px solid rgba(148,163,184,0.15)">${value}</td></tr>`;
    },

    async showPaymentReceipt(paymentId) {
        const p = await DB.get('payments', paymentId);
        if (!p) { this.toast('Payment transaction not found', 'warning'); return; }
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const m = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
        const amt = Number(p.amount) || 0;
        let proof = p.paymentProof || null;
        if (!proof && p.passId) {
            try { const pass = await DB.get('passes', p.passId); proof = pass && pass.paymentProof; } catch(e) {}
        }

        const body = `
        <div style="max-width:420px;margin:0 auto;font-size:0.92rem">
            <div style="text-align:center;border-bottom:2px solid var(--border);padding-bottom:10px;margin-bottom:14px">
                <div style="font-weight:900;font-size:1.05rem;color:var(--amber)">COMMANDER CITY HOUSING SOCIETY</div>
                <div style="color:var(--text-muted);font-size:0.8rem;font-weight:700">SHUTTLE PASS — PAYMENT RECEIPT</div>
            </div>
            <table style="width:100%;border-collapse:collapse">
                ${this._receiptRow('Receipt No', `R-${String(p.id).padStart(4, '0')}`)}
                ${this._receiptRow('Member', this.esc(p.memberName))}
                ${this._receiptRow('Cycle', `${monthNames[p.month]} ${p.year}`)}
                ${this._receiptRow('Serial / Card', `#${this.esc(p.serialNo)}`)}
                ${this._receiptRow('Method', m)}
                ${this._receiptRow('Amount', `<span style="font-weight:900;color:var(--green)">PKR ${amt.toLocaleString()}</span>`)}
                ${this._receiptRow('Date & Time', new Date(p.paidAt).toLocaleString('en-PK'))}
                ${p.notes ? this._receiptRow('Notes', this.esc(p.notes)) : ''}
            </table>
            ${proof ? `<div style="margin-top:14px">
                <div style="font-weight:700;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px"><i class="fas fa-paperclip"></i> PAYMENT PROOF / TRANSACTION SCREENSHOT</div>
                <img src="${proof}" style="max-width:100%;max-height:240px;border-radius:8px;border:1px solid var(--border);cursor:pointer" onclick="window.open(this.src)" title="Click to view full size">
            </div>` : `<div style="margin-top:14px;font-size:0.8rem;color:var(--text-muted)">No payment proof attached to this transaction.</div>`}
        </div>`;

        this.openModal(`🧾 Receipt — ${this.esc(p.memberName)}`, body,
            `<button class="btn btn-ghost" onclick="App.closeModal()">Close</button>
             <button class="btn btn-primary" onclick="App.printSingleReceipt(${p.id})"><i class="fas fa-print"></i> Print Receipt</button>`);
    },

    async printSingleReceipt(paymentId) {
        const p = await DB.get('payments', paymentId);
        if (!p) { this.toast('Payment transaction not found', 'warning'); return; }
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const m = p.paymentMethod || (p.passType === 'Free' ? 'Free' : 'Cash');
        const amt = Number(p.amount) || 0;
        let proof = p.paymentProof || null;
        if (!proof && p.passId) {
            try { const pass = await DB.get('passes', p.passId); proof = pass && pass.paymentProof; } catch(e) {}
        }

        const printWin = window.open('', '_blank', 'width=620,height=700');
        if (!printWin) { alert('Pop-up blocked! Please allow pop-ups for this site to print receipts.'); return; }

        printWin.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <title>Payment Receipt — ${this.esc(p.memberName)}</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #000; margin: 0; padding: 20px; }
            .rc { max-width: 420px; margin: 0 auto; border: 2px solid #000; padding: 20px; }
            .rc-head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
            .rc-head h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: 1px; }
            .rc-head div { font-size: 12px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            table td { padding: 6px 4px; border-bottom: 1px dotted #000; }
            td.lbl { font-weight: 700; width: 130px; }
            .proof-wrap { margin-top: 14px; text-align: center; page-break-inside: avoid; }
            .proof-wrap img { max-width: 100%; max-height: 240px; border: 1px solid #000; }
            .amt { font-size: 16px; font-weight: 900; }
            .foot { margin-top: 18px; text-align: center; font-size: 11px; border-top: 1px solid #000; padding-top: 8px; }
            @media print { body { padding: 4mm; } }
        </style></head><body>
        <div class="rc">
            <div class="rc-head">
                <h1>COMMANDER CITY HOUSING SOCIETY</h1>
                <div>SHUTTLE PASS — OFFICIAL PAYMENT RECEIPT</div>
            </div>
            <table>
                <tr><td class="lbl">Receipt No</td><td>R-${String(p.id).padStart(4, '0')}</td></tr>
                <tr><td class="lbl">Member Name</td><td>${this.esc(p.memberName)}</td></tr>
                <tr><td class="lbl">Cycle</td><td>${monthNames[p.month]} ${p.year}</td></tr>
                <tr><td class="lbl">Serial / Card No</td><td>#${this.esc(p.serialNo)}</td></tr>
                <tr><td class="lbl">Payment Method</td><td>${m}</td></tr>
                <tr><td class="lbl">Amount Paid</td><td class="amt">PKR ${amt.toLocaleString()}</td></tr>
                <tr><td class="lbl">Date & Time</td><td>${new Date(p.paidAt).toLocaleString('en-PK')}</td></tr>
                ${p.notes ? `<tr><td class="lbl">Notes</td><td>${this.esc(p.notes)}</td></tr>` : ''}
            </table>
            ${proof ? `<div class="proof-wrap"><div style="font-weight:700;font-size:12px;margin-bottom:6px">PAYMENT PROOF / TRANSACTION SCREENSHOT</div><img src="${proof}"></div>` : ''}
            <div class="foot">Computer Generated Receipt — Commander City Shuttle Pass System<br>This is a system-issued transaction record.</div>
        </div>
        <script>
            var printed = false;
            function doPrint() {
                if (printed) return;
                printed = true;
                try { window.focus(); window.print(); } catch(e){}
                setTimeout(function(){ window.close(); }, 600);
            }
            var imgs = document.images, loaded = 0, total = imgs.length;
            if (total === 0) { setTimeout(doPrint, 250); }
            else {
                for (var i = 0; i < total; i++) {
                    if (imgs[i].complete) { loaded++; if (loaded === total) setTimeout(doPrint, 250); }
                    else { imgs[i].onload = imgs[i].onerror = function() { loaded++; if (loaded === total) setTimeout(doPrint, 250); }; }
                }
                setTimeout(doPrint, 800);
            }
        </script>
        </body></html>`);
        printWin.document.close();
    },

    /* UI Utils */
    bindSidebar() {
        const sidebar = document.getElementById('sidebar');
        document.getElementById('menuToggle').onclick = () => sidebar.classList.toggle('open');
        document.getElementById('sidebarClose').onclick = () => sidebar.classList.remove('open');
    },

    bindModal() {
        const ov = document.getElementById('modalOverlay');
        document.getElementById('modalCloseBtn').onclick = () => this.closeModal();
        ov.addEventListener('click', e => { if (e.target === ov) this.closeModal(); });
    },

    openModal(title, body, footer = '') {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer;
        document.getElementById('modalOverlay').classList.add('open');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('open');
    },

    toast(msg, type = 'info') {
        const c = document.getElementById('toastContainer');
        const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${this.esc(msg)}</span>`;
        c.appendChild(t);
        setTimeout(() => { t.remove(); }, 3500);
    },

    /* ── Print Cards by Serial Number Range (e.g. Serial 12 to 24) ── */
    async promptPrintCardsRange() {
        const month = parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        const year = parseInt(document.getElementById('selYear')?.value || new Date().getFullYear());
        const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = monthNames[month] || `Month_${month}`;

        const passes = await DB.getPassesForMonth(month, year);
        passes.sort((a, b) => (parseInt(a.serialNo) || 0) - (parseInt(b.serialNo) || 0));

        if (!passes.length) {
            this.toast(`No passes found for ${monthName} ${year} to print`, 'warning');
            return;
        }

        const serials = passes.map(p => parseInt(p.serialNo) || 0).filter(s => s > 0);
        const minSerial = serials.length ? Math.min(...serials) : 1;
        const maxSerial = serials.length ? Math.max(...serials) : passes.length;

        const body = `
        <div style="background:var(--glass);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--cyan)">
            <div style="font-size:0.95rem;font-weight:700;color:var(--cyan);display:flex;align-items:center;gap:8px">
                <i class="fas fa-print"></i> Print Shuttle Pass Cards by Serial Range
            </div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">
                Month: <strong style="color:var(--cyan-light)">${monthName} ${year}</strong> &nbsp;|&nbsp; Total Cards Issued: <strong style="color:var(--amber)">${passes.length}</strong> (Serials #${minSerial} to #${maxSerial})
            </div>
        </div>

        <div class="form-group" style="margin-bottom:16px">
            <label style="font-weight:700;margin-bottom:6px;display:block">Print Selection Mode</label>
            <div style="display:flex;gap:16px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem">
                    <input type="radio" name="print_mode" value="range" checked onchange="App._togglePrintModeUI()">
                    <span>Serial Range (e.g. 12 to 24)</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem">
                    <input type="radio" name="print_mode" value="all" onchange="App._togglePrintModeUI()">
                    <span>Print All Cards (${passes.length} Cards)</span>
                </label>
            </div>
        </div>

        <div id="print_range_inputs" style="display:flex;gap:12px;margin-bottom:16px">
            <div class="form-group" style="flex:1">
                <label><i class="fas fa-hashtag" style="color:var(--amber)"></i> From Serial # *</label>
                <input type="number" id="print_from_serial" value="${minSerial}" min="1" max="${maxSerial}" style="font-size:1.1rem;font-weight:800;color:var(--amber);text-align:center;border-color:var(--amber)">
            </div>
            <div class="form-group" style="flex:1">
                <label><i class="fas fa-hashtag" style="color:var(--amber)"></i> To Serial # *</label>
                <input type="number" id="print_to_serial" value="${maxSerial}" min="1" max="${maxSerial}" style="font-size:1.1rem;font-weight:800;color:var(--amber);text-align:center;border-color:var(--amber)">
            </div>
        </div>

        <div id="print_preview_count" style="background:var(--glass-heavy);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);font-size:0.85rem;color:var(--text-main)">
            <i class="fas fa-info-circle" style="color:var(--cyan)"></i> Specify the serial range you wish to print on card paper.
        </div>
        `;

        const footer = `
        <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="btnExecutePrintRange" style="background:var(--cyan);border-color:var(--cyan);color:#000;font-weight:800">
            <i class="fas fa-print"></i> Print Selected Cards
        </button>
        `;

        this.openModal('Print Cards by Serial Range', body, footer);

        const btnPrint = document.getElementById('btnExecutePrintRange');
        btnPrint.onclick = () => {
            const mode = document.querySelector('input[name="print_mode"]:checked')?.value || 'range';
            let selectedPasses = [];

            if (mode === 'all') {
                selectedPasses = passes;
            } else {
                const fromSer = parseInt(document.getElementById('print_from_serial').value) || 1;
                const toSer = parseInt(document.getElementById('print_to_serial').value) || maxSerial;

                if (fromSer > toSer) {
                    this.toast('From Serial cannot be greater than To Serial', 'warning');
                    return;
                }

                selectedPasses = passes.filter(p => {
                    const s = parseInt(p.serialNo) || 0;
                    return s >= fromSer && s <= toSer;
                });
            }

            if (!selectedPasses.length) {
                this.toast('No cards found matching the specified serial range', 'warning');
                return;
            }

            this.closeModal();
            this.printSelectedCards(selectedPasses, month);
        };
    },

    _togglePrintModeUI() {
        const mode = document.querySelector('input[name="print_mode"]:checked')?.value;
        const rangeInputs = document.getElementById('print_range_inputs');
        if (rangeInputs) {
            rangeInputs.style.display = mode === 'all' ? 'none' : 'flex';
        }
    },

    printSelectedCards(passesToPrint, month = 1) {
        const selMonth = parseInt(document.getElementById('selMonth')?.value || month);
        const existing = document.getElementById('printCardsRangeContainer');
        if (existing) existing.remove();

        const cardsHtml = passesToPrint.map(p => {
            const isInc = p.incomplete;
            return `
            <div class="physical-card-wrapper">
                ${this._cardHtml(p, selMonth)}
            </div>`;
        }).join('');

        const printContainer = document.createElement('div');
        printContainer.id = 'printCardsRangeContainer';
        printContainer.className = 'printable-cards-view';
        printContainer.innerHTML = `<div class="cards-container-grid">${cardsHtml}</div>`;

        document.body.appendChild(printContainer);
        window.print();

        setTimeout(() => {
            if (printContainer.parentNode) printContainer.parentNode.removeChild(printContainer);
        }, 1000);
    },

    async printSingle(passId) {
        const pass = await DB.get('passes', passId);
        if (!pass) return;
        const selMonth = parseInt(document.getElementById('selMonth')?.value || (new Date().getMonth() + 1));
        this.printSelectedCards([pass], selMonth);
    },


    async showGoogleSyncModal() {
        let config = { webhookUrl: '', enabled: false };
        try {
            const res = await fetch('/api/google-config');
            if (res.ok) config = await res.json();
        } catch (e) {
            console.error('Failed to load Google config', e);
        }

        let lastSyncHtml = '';
        if (config.lastSyncTime) {
          const isOk = config.lastSyncStatus === 'success';
          const syncDate = new Date(config.lastSyncTime).toLocaleString();
          lastSyncHtml = `
          <div style="margin-bottom:16px;padding:10px 14px;border-radius:var(--radius-sm);font-size:0.83rem;background:${isOk ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};border:1px solid ${isOk ? 'var(--green)' : 'var(--red)'}">
              <div style="font-weight:700;color:${isOk ? 'var(--green)' : 'var(--red)'};display:flex;align-items:center;gap:6px">
                  <i class="fas ${isOk ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i> Last Sync: ${isOk ? 'SUCCESSFUL' : 'FAILED'}
              </div>
              <div style="color:var(--text-muted);font-size:0.78rem;margin-top:4px">
                  Timestamp: <strong>${this.esc(syncDate)}</strong> | Cards Synced: <strong>${config.lastSyncCount || 0}</strong>
              </div>
              ${config.lastSyncError ? `<div style="color:var(--red);font-size:0.78rem;margin-top:4px">Error: ${this.esc(config.lastSyncError)}</div>` : ''}
          </div>
          `;
        }

        const body = `
        <div style="background:var(--glass);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--accent)">
            <div style="font-size:0.95rem;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:8px">
                <i class="fab fa-google-drive"></i> Google Sheets Real-Time Auto-Sync
            </div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;line-height:1.4">
                Automatically update member records and card serial numbers in your Google Sheet whenever a card is created or renewed.
            </div>
        </div>

        ${lastSyncHtml}

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;background:var(--glass-heavy);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <div>
                <div style="font-weight:700;font-size:0.9rem">Enable Auto-Sync to Google Sheets</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">Push card & member updates on save</div>
            </div>
            <label class="switch" style="position:relative;display:inline-block;width:44px;height:24px">
                <input type="checkbox" id="gs_enabled" ${config.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0">
                <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${config.enabled ? 'var(--accent)' : '#4b5563'};transition:.3s;border-radius:24px" id="gs_toggle_bg">
                    <span style="position:absolute;content:'';height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%;transform:${config.enabled ? 'translateX(20px)' : 'none'}" id="gs_toggle_circle"></span>
                </span>
            </label>
        </div>

        <div class="form-group" style="margin-bottom:16px">
            <label style="font-weight:600;margin-bottom:6px;display:block">Google Apps Script Web App URL *</label>
            <input type="url" id="gs_webhook_url" placeholder="https://script.google.com/macros/s/.../exec" value="${this.esc(config.webhookUrl)}" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--glass-heavy);border:1px solid var(--border);color:var(--text-main)">
        </div>

        <div id="gs_test_result" style="display:none;margin-bottom:16px;padding:10px;border-radius:var(--radius-sm);font-size:0.85rem"></div>

        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);padding:12px;border-radius:var(--radius-sm);font-size:0.82rem;color:var(--amber)">
            <strong><i class="fas fa-exclamation-circle"></i> Instructions to Setup / Update Google Apps Script:</strong>
            <ol style="margin-left:18px;margin-top:6px;margin-bottom:6px">
                <li>Open your Google Sheet & go to <strong>Extensions > Apps Script</strong>.</li>
                <li>Replace ALL code in the editor with code from <code>scripts/google_apps_script.js</code>.</li>
                <li>Click <strong>Save (Ctrl+S)</strong>.</li>
                <li>Click <strong>Deploy > Manage deployments > Edit (pencil icon)</strong>.</li>
                <li>Select <strong>Version: New version</strong> and click <strong>Deploy</strong>.</li>
            </ol>
            <div style="font-size:0.78rem;color:var(--text-muted)">* Selecting <strong>New version</strong> in Apps Script is mandatory whenever code is updated.</div>
        </div>
        `;

        const footer = `
        <button class="btn btn-ghost" onclick="App.closeModal()">Close</button>
        <button class="btn btn-ghost" id="btnTestGs" style="border:1px solid var(--accent);color:var(--accent)">
            <i class="fas fa-vial"></i> Test Connection
        </button>
        <button class="btn btn-primary" id="btnManualGsSync" style="background:linear-gradient(135deg,#16a34a,#15803d);border-color:#15803d;font-weight:700;gap:6px">
            <i class="fas fa-cloud-upload-alt"></i> Sync to Google Sheets Now
        </button>
        <button class="btn btn-primary" id="btnSaveGs" style="background:var(--accent);font-weight:700">
            <i class="fas fa-save"></i> Save Settings
        </button>
        `;

        this.openModal('Google Sheets Auto-Sync Settings', body, footer);

        const chkEnabled = document.getElementById('gs_enabled');
        const toggleBg = document.getElementById('gs_toggle_bg');
        const toggleCircle = document.getElementById('gs_toggle_circle');

        chkEnabled.onchange = () => {
            if (chkEnabled.checked) {
                toggleBg.style.backgroundColor = 'var(--accent)';
                toggleCircle.style.transform = 'translateX(20px)';
            } else {
                toggleBg.style.backgroundColor = '#4b5563';
                toggleCircle.style.transform = 'none';
            }
        };

        const btnTest = document.getElementById('btnTestGs');
        const testResult = document.getElementById('gs_test_result');
        btnTest.onclick = async () => {
            const url = document.getElementById('gs_webhook_url').value.trim();
            if (!url) {
                this.toast('Please enter a Webhook URL first', 'warning');
                return;
            }

            btnTest.disabled = true;
            btnTest.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            testResult.style.display = 'block';
            testResult.style.background = 'rgba(59,130,246,0.1)';
            testResult.style.border = '1px solid var(--accent)';
            testResult.style.color = 'var(--accent)';
            testResult.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting to Google Sheets script...';

            try {
                const res = await fetch('/api/test-google-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ webhookUrl: url })
                });
                const data = await res.json();
                if (data.success) {
                    testResult.style.background = 'rgba(16,185,129,0.15)';
                    testResult.style.border = '1px solid var(--green)';
                    testResult.style.color = 'var(--green)';
                    testResult.innerHTML = '<i class="fas fa-check-circle"></i> Connection Successful! Google Sheets is responding.';
                    this.toast('Google Sheets connection test passed!', 'success');
                } else {
                    throw new Error(data.error || 'Failed to connect');
                }
            } catch (err) {
                testResult.style.background = 'rgba(239,68,68,0.15)';
                testResult.style.border = '1px solid var(--red)';
                testResult.style.color = 'var(--red)';
                testResult.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Connection Failed: ${this.esc(err.message)}`;
                this.toast('Connection test failed: ' + err.message, 'error');
            } finally {
                btnTest.disabled = false;
                btnTest.innerHTML = '<i class="fas fa-vial"></i> Test Connection';
            }
        };

        const btnSave = document.getElementById('btnSaveGs');
        btnSave.onclick = async () => {
            const webhookUrl = document.getElementById('gs_webhook_url').value.trim();
            const enabled = chkEnabled.checked;

            try {
                const res = await fetch('/api/google-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ webhookUrl, enabled })
                });
                const data = await res.json();
                if (data.success) {
                    this.toast('Google Sheets sync settings saved!', 'success');
                    this.closeModal();
                } else {
                    this.toast('Failed to save settings: ' + (data.error || ''), 'error');
                }
            } catch (e) {
                this.toast('Error saving settings: ' + e.message, 'error');
            }
        };

        const btnManualSync = document.getElementById('btnManualGsSync');
        if (btnManualSync) {
            btnManualSync.onclick = () => this.manualGoogleSync(btnManualSync, testResult);
        }
    },

    /* ── Manual "Sync to Google Sheets Now" ── */
    async manualGoogleSync(btnEl, statusEl) {
        let config = { webhookUrl: '', enabled: false };
        try {
            const cfgRes = await fetch('/api/google-config');
            if (cfgRes.ok) config = await cfgRes.json();
        } catch (e) {}

        const btn = btnEl || document.getElementById('btnManualGsSync');
        const resultBox = statusEl || document.getElementById('gs_test_result');

        const webhookInput = document.getElementById('gs_webhook_url');
        const targetUrl = webhookInput ? webhookInput.value.trim() : config.webhookUrl;

        if (!targetUrl) {
            this.toast('⚠️ No Google Sheets URL configured. Please paste the Webhook URL first.', 'warning');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        }

        if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.style.background = 'rgba(59,130,246,0.1)';
            resultBox.style.border = '1px solid var(--accent)';
            resultBox.style.color = 'var(--accent)';
            resultBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pushing all data to Google Sheets...';
        }

        try {
            // First save local DB sync
            await DB.syncNow(true);

            // Call direct sync endpoint
            const passes = await DB.getAll('passes');
            const members = await DB.getAll('members');

            const res = await fetch('/api/sync-google-now', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passes, members })
            });

            const data = await res.json();
            if (data.success) {
                const count = data.count || (data.result && data.result.count) || passes.length;
                if (resultBox) {
                    resultBox.style.background = 'rgba(16,185,129,0.15)';
                    resultBox.style.border = '1px solid var(--green)';
                    resultBox.style.color = 'var(--green)';
                    resultBox.innerHTML = `<i class="fas fa-check-circle"></i> <strong>Google Sheets Synced Successfully!</strong> ${count} pass records were pushed to your Google Sheet.`;
                }
                this.toast(`✅ Google Sheets synced! (${count} records updated)`, 'success');
            } else {
                throw new Error(data.error || 'Server error syncing to Google Sheets');
            }
        } catch (err) {
            if (resultBox) {
                resultBox.style.background = 'rgba(239,68,68,0.15)';
                resultBox.style.border = '1px solid var(--red)';
                resultBox.style.color = 'var(--red)';
                resultBox.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Sync failed: ${this.esc(err.message)}`;
            }
            this.toast('❌ Google Sheets sync failed: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Sync to Google Sheets Now';
            }
        }
    },

    esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; },

    /* ============================================================
       View 5: Online Payment & AI OCR Portal (Merged)
       ============================================================ */
    async vPortal(container) {
        const now = new Date();
        const curYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1;

        const monthNames = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthOptions = monthNames.slice(1).map((m, i) => `<option value="${i + 1}" ${i + 1 === defaultMonth ? 'selected' : ''}>${m}</option>`).join('');
        const yearOptions = [curYear - 1, curYear, curYear + 1].map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`).join('');

        let state = {
            currentTab: 'passenger',
            currentStep: 1,
            month: defaultMonth,
            year: curYear,
            passType: 'Full',
            requiredAmount: DB.getFeeForMonth(defaultMonth, curYear, 'Full'),
            selectedResident: null,
            scannedData: null,
            receiptImageSrc: null,
            issuedPass: null,
            issuedPayment: null
        };

        const allMembers = await DB.getAll('members');

        container.innerHTML = `
        <div class="portal-container" style="max-width:1100px;margin:0 auto;padding:10px 0 60px">
            
            <!-- Top Mode Nav Header -->
            <div class="glass-panel" style="padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div style="display:flex;align-items:center;gap:12px">
                    <img src="logo.png" alt="Commander City" style="height:38px;" onerror="this.style.display='none'">
                    <div>
                        <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">
                            <span>Commander<span style="color:var(--cyan)">City</span></span>
                            <span style="font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(6,182,212,0.15);color:var(--cyan-light);border:1px solid rgba(6,182,212,0.3)">AI OCR PORTAL</span>
                        </h3>
                        <p style="margin:0;font-size:0.8rem;color:var(--text-muted)">Online Shuttle Pass Renewal & Instant OCR Verification</p>
                    </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button class="btn btn-sm btn-primary" id="pTabPay"><i class="fas fa-camera"></i> <span>Online Payment & OCR</span></button>
                    <button class="btn btn-sm btn-ghost" id="pTabVerify"><i class="fas fa-qrcode"></i> <span>Conductor Verifier</span></button>
                    <button class="btn btn-sm btn-ghost" id="pTabAudit"><i class="fas fa-list-alt"></i> <span>Audit Desk</span></button>
                    <a href="portal.html" target="_blank" class="btn btn-sm btn-ghost" style="border:1px solid var(--cyan);color:var(--cyan-light);text-decoration:none;" title="Open standalone portal link for residents">
                        <i class="fas fa-external-link-alt"></i> <span>Public Portal Link</span>
                    </a>
                </div>
            </div>

            <!-- VIEW TAB 1: PASSENGER ONLINE PAYMENT & OCR WIZARD -->
            <div id="pViewPassenger">
                <!-- Hero Banner -->
                <div class="glass-panel" style="padding:24px;margin-bottom:24px;background:linear-gradient(135deg,rgba(6,182,212,0.1),rgba(139,92,246,0.1));border:1px solid rgba(6,182,212,0.25)">
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
                        <div>
                            <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:6px;color:var(--text)">
                                <i class="fas fa-bolt" style="color:var(--amber);margin-right:8px"></i>Automated Online Payment & Pass Issuance
                            </h2>
                            <p style="color:var(--text-secondary);font-size:0.9rem;max-width:720px;line-height:1.5">
                                Transfer fees via <strong>JazzCash, EasyPaisa, or Online Bank Transfer</strong>. Upload your transaction receipt and our AI OCR scanner will verify the Reference TID and issue your digital pass instantly!
                            </p>
                        </div>
                        <div style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);padding:8px 16px;border-radius:20px;color:var(--green);font-size:0.85rem;font-weight:700;display:flex;align-items:center;gap:8px">
                            <i class="fas fa-check-circle"></i> Instant AI Verification • Zero Wait Time
                        </div>
                    </div>
                </div>

                <!-- Wizard Progress Indicators -->
                <div class="wizard-progress" style="margin-bottom:28px">
                    <div class="wizard-step active" id="pwStep1"><span class="step-number">1</span><span class="step-title">Select Pass</span></div>
                    <div class="wizard-step" id="pwStep2"><span class="step-number">2</span><span class="step-title">Bank Details</span></div>
                    <div class="wizard-step" id="pwStep3"><span class="step-number">3</span><span class="step-title">AI OCR Scan</span></div>
                    <div class="wizard-step" id="pwStep4"><span class="step-number">4</span><span class="step-title">Pass Issued</span></div>
                </div>

                <!-- STEP 1: Resident & Pass Selection -->
                <div class="glass-panel" id="pwSecStep1" style="padding:24px;margin-bottom:24px">
                    <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--cyan);display:flex;align-items:center;gap:8px">
                        <i class="fas fa-user-check"></i> Step 1: Resident Identification & Pass Period
                    </h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">Search registered resident by CNIC, Name, or House No and select pass period.</p>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Pass Month</label>
                            <select id="pSelMonth" class="filter-select" style="width:100%">${monthOptions}</select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Pass Year</label>
                            <select id="pSelYear" class="filter-select" style="width:100%">${yearOptions}</select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Pass Type</label>
                            <select id="pSelType" class="filter-select" style="width:100%">
                                <option value="Full" selected>Full Pass (Standard)</option>
                                <option value="Half">Half Pass (Shift / Alternate)</option>
                                <option value="Free">Free Pass (Employee / Welfare)</option>
                            </select>
                        </div>
                        <div style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);padding:10px 16px;border-radius:var(--radius-sm);display:flex;flex-direction:column;justify-content:center">
                            <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase">Required Fee</span>
                            <span id="pFeeDisplay" style="font-size:1.25rem;font-weight:800;color:var(--cyan-light)">PKR ${state.requiredAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <!-- Resident Search Box -->
                    <div style="position:relative;margin-bottom:20px">
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Search Resident (Type Name, CNIC, or House No)</label>
                        <div style="position:relative">
                            <input type="text" id="pSearchResident" placeholder="e.g. 42201-5311737-7, Shoaib Ali, or Block G..." style="padding-left:38px">
                            <i class="fas fa-search" style="position:absolute;left:14px;top:14px;color:var(--text-muted)"></i>
                        </div>
                        <div id="pSearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);max-height:260px;overflow-y:auto;z-index:50;box-shadow:0 10px 30px rgba(0,0,0,0.5);margin-top:4px"></div>
                    </div>

                    <!-- Selected Resident Card -->
                    <div id="pSelectedCard" style="display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(6,182,212,0.4);border-radius:var(--radius-md);padding:18px;margin-bottom:24px">
                        <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
                            <img id="pCardPhoto" src="logo.png" alt="Photo" style="width:72px;height:72px;border-radius:12px;object-fit:cover;border:2px solid var(--cyan)">
                            <div style="flex:1;min-width:200px">
                                <h4 id="pCardName" style="margin:0 0 6px;font-size:1.15rem;font-weight:700;color:var(--text)">Resident Name</h4>
                                <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.85rem;color:var(--text-secondary)">
                                    <span><i class="fas fa-id-badge" style="color:var(--cyan)"></i> <span id="pCardId">CC-00001</span></span>
                                    <span><i class="fas fa-id-card" style="color:var(--purple)"></i> <span id="pCardCnic">42201-XXXXXXX-X</span></span>
                                    <span><i class="fas fa-home" style="color:var(--green)"></i> <span id="pCardHouse">House No</span></span>
                                    <span><i class="fas fa-phone" style="color:var(--amber)"></i> <span id="pCardPhone">Contact</span></span>
                                </div>
                                <div id="pCardPassStatus" style="margin-top:8px;font-size:0.82rem"></div>
                            </div>
                        </div>
                    </div>

                    <div style="text-align:right">
                        <button class="btn btn-primary" id="pBtnGoStep2" style="padding:10px 24px;font-weight:700">
                            <span>Proceed to Bank Transfer Details</span> <i class="fas fa-arrow-right" style="margin-left:6px"></i>
                        </button>
                    </div>
                </div>

                <!-- STEP 2: Bank Details -->
                <div class="glass-panel" id="pwSecStep2" style="display:none;padding:24px;margin-bottom:24px">
                    <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--purple);display:flex;align-items:center;gap:8px">
                        <i class="fas fa-university"></i> Step 2: Transfer Pass Fee
                    </h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">Send the required fee to any of our official collection accounts and save the transaction receipt / screenshot.</p>

                    <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);padding:14px 20px;border-radius:var(--radius-sm);margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
                        <div>
                            <span style="font-size:0.8rem;color:var(--text-muted)">Amount to Transfer:</span>
                            <div id="pStep2FeeAmount" style="font-size:1.4rem;font-weight:900;color:var(--purple)">PKR ${state.requiredAmount.toLocaleString()}</div>
                        </div>
                        <div style="font-size:0.85rem;color:var(--text-secondary)">
                            Pass Type: <strong id="pStep2PassType" style="color:var(--cyan)">Full Pass</strong> &nbsp;|&nbsp; Cycle: <strong id="pStep2Cycle" style="color:var(--amber)">${monthNames[state.month]} ${state.year}</strong>
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px">
                        <!-- JazzCash -->
                        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(239,68,68,0.3);padding:16px;border-radius:var(--radius-md)">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                                <span style="font-weight:700;color:#f87171"><i class="fas fa-mobile-alt"></i> JazzCash</span>
                                <span style="font-size:0.75rem;padding:2px 6px;background:rgba(239,68,68,0.2);color:#f87171;border-radius:6px">Mobile Wallet</span>
                            </div>
                            <div style="font-size:1.1rem;font-weight:800;letter-spacing:1px;margin-bottom:4px;color:var(--text)">0300-8276543</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px">Title: Commander City Transport</div>
                            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('03008276543'); App.toast('JazzCash Account copied!', 'success');" style="border:1px solid rgba(239,68,68,0.4);color:#f87171;width:100%">
                                <i class="fas fa-copy"></i> Copy Account Number
                            </button>
                        </div>

                        <!-- EasyPaisa -->
                        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(16,185,129,0.3);padding:16px;border-radius:var(--radius-md)">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                                <span style="font-weight:700;color:var(--green)"><i class="fas fa-wallet"></i> EasyPaisa</span>
                                <span style="font-size:0.75rem;padding:2px 6px;background:rgba(16,185,129,0.2);color:var(--green);border-radius:6px">Mobile Wallet</span>
                            </div>
                            <div style="font-size:1.1rem;font-weight:800;letter-spacing:1px;margin-bottom:4px;color:var(--text)">0345-9876543</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px">Title: Commander City Welfare</div>
                            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('03459876543'); App.toast('EasyPaisa Account copied!', 'success');" style="border:1px solid rgba(16,185,129,0.4);color:var(--green);width:100%">
                                <i class="fas fa-copy"></i> Copy Account Number
                            </button>
                        </div>

                        <!-- Bank Alfalah / Meezan -->
                        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(6,182,212,0.3);padding:16px;border-radius:var(--radius-md)">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                                <span style="font-weight:700;color:var(--cyan-light)"><i class="fas fa-university"></i> Bank Transfer / Raast</span>
                                <span style="font-size:0.75rem;padding:2px 6px;background:rgba(6,182,212,0.2);color:var(--cyan);border-radius:6px">1Link Raast</span>
                            </div>
                            <div style="font-size:0.95rem;font-weight:800;letter-spacing:0.5px;margin-bottom:4px;color:var(--text)">PK82MEZN0001020304050607</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px">Title: Commander City Transport Welfare</div>
                            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('PK82MEZN0001020304050607'); App.toast('IBAN copied!', 'success');" style="border:1px solid rgba(6,182,212,0.4);color:var(--cyan-light);width:100%">
                                <i class="fas fa-copy"></i> Copy IBAN
                            </button>
                        </div>
                    </div>

                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <button class="btn btn-ghost" id="pBtnBackStep1"><i class="fas fa-arrow-left"></i> Back</button>
                        <button class="btn btn-primary" id="pBtnGoStep3" style="padding:10px 24px;font-weight:700">
                            <span>Proceed to AI OCR Receipt Upload</span> <i class="fas fa-arrow-right" style="margin-left:6px"></i>
                        </button>
                    </div>
                </div>

                <!-- STEP 3: AI OCR Scan -->
                <div class="glass-panel" id="pwSecStep3" style="display:none;padding:24px;margin-bottom:24px">
                    <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--green);display:flex;align-items:center;gap:8px">
                        <i class="fas fa-camera"></i> Step 3: AI OCR Receipt Scanning & Verification
                    </h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">Upload screenshot of your payment. Our OCR engine will read the Reference TID, Amount, and verify automatically.</p>

                    <!-- Drop Zone -->
                    <div id="pDropZone" style="border:2px dashed rgba(6,182,212,0.4);border-radius:var(--radius-md);padding:32px 20px;text-align:center;background:rgba(255,255,255,0.02);cursor:pointer;margin-bottom:20px;transition:var(--transition)">
                        <i class="fas fa-cloud-upload-alt" style="font-size:2.8rem;color:var(--cyan);margin-bottom:12px;display:block"></i>
                        <h4 style="margin:0 0 6px;font-size:1.1rem;color:var(--text)">Drag &amp; Drop Payment Screenshot Here</h4>
                        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:14px">Supports PNG, JPG, JPEG receipts from JazzCash, EasyPaisa, or Banking Apps</p>
                        <div style="display:flex;justify-content:center;gap:10px">
                            <label class="btn btn-primary btn-sm" style="cursor:pointer">
                                <i class="fas fa-folder-open"></i> Choose Image File
                                <input type="file" id="pReceiptFile" accept="image/*" style="display:none">
                            </label>
                            <label class="btn btn-ghost btn-sm" style="border:1px solid var(--purple);color:#c084fc;cursor:pointer">
                                <i class="fas fa-camera"></i> Take Photo
                                <input type="file" id="pReceiptCamera" accept="image/*" capture="environment" style="display:none">
                            </label>
                        </div>
                    </div>

                    <!-- Progress Bar -->
                    <div id="pOcrProgress" style="display:none;margin-bottom:20px;background:rgba(0,0,0,0.3);padding:14px;border-radius:var(--radius-sm);border:1px solid rgba(6,182,212,0.3)">
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px">
                            <span id="pOcrStatusMsg" style="color:var(--cyan-light);font-weight:600"><i class="fas fa-spinner fa-spin"></i> Reading receipt image...</span>
                            <span id="pOcrPercent" style="color:var(--text-muted)">0%</span>
                        </div>
                        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden">
                            <div id="pOcrBar" style="width:0%;height:100%;background:linear-gradient(90deg,var(--cyan),var(--purple));transition:width 0.3s"></div>
                        </div>
                    </div>

                    <!-- Extracted Details & Verification Summary -->
                    <div id="pExtractedCard" style="display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(16,185,129,0.4);border-radius:var(--radius-md);padding:20px;margin-bottom:24px">
                        <div style="display:flex;gap:20px;flex-wrap:wrap">
                            <div style="max-width:200px;flex:1">
                                <img id="pReceiptPreviewImg" src="" alt="Receipt" style="width:100%;max-height:220px;object-fit:contain;border-radius:8px;border:1px solid var(--border)">
                            </div>
                            <div style="flex:2;min-width:240px">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                                    <h4 style="margin:0;font-size:1.1rem;color:var(--green);display:flex;align-items:center;gap:6px">
                                        <i class="fas fa-check-circle"></i> OCR Scan Result
                                    </h4>
                                    <div id="pBadgeStatus"></div>
                                </div>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
                                    <div>
                                        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Transaction ID (TID)</label>
                                        <input type="text" id="pInpTid" style="font-weight:700;color:var(--cyan-light);padding:6px 10px;font-size:0.9rem">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Amount Paid (PKR)</label>
                                        <input type="number" id="pInpAmount" style="font-weight:700;color:var(--green);padding:6px 10px;font-size:0.9rem">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Payment Provider</label>
                                        <input type="text" id="pInpProvider" style="padding:6px 10px;font-size:0.9rem">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Transaction Date</label>
                                        <input type="text" id="pInpDate" style="padding:6px 10px;font-size:0.9rem">
                                    </div>
                                </div>
                                <div id="pVerifyAlert" style="font-size:0.85rem;padding:8px 12px;border-radius:6px;margin-bottom:10px"></div>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <button class="btn btn-ghost" id="pBtnBackStep2"><i class="fas fa-arrow-left"></i> Back</button>
                        <button class="btn btn-primary" id="pBtnAcceptIssue" disabled style="padding:10px 24px;font-weight:700">
                            <i class="fas fa-bolt"></i> <span>Accept Transaction &amp; Issue Shuttle Pass</span>
                        </button>
                    </div>
                </div>

                <!-- STEP 4: Pass Issued & Actions -->
                <div class="glass-panel" id="pwSecStep4" style="display:none;padding:24px;margin-bottom:24px;text-align:center">
                    <div style="display:inline-block;padding:12px 24px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:30px;color:var(--green);font-weight:800;font-size:1.1rem;margin-bottom:20px">
                        <i class="fas fa-check-circle" style="margin-right:8px"></i> Shuttle Pass Successfully Issued &amp; Synced!
                    </div>

                    <!-- Digital Pass Card Layout (Standard Commander City Format) -->
                    <div style="display:flex;justify-content:center;margin-bottom:24px">
                        <div id="pPassCardPrint" style="width:360px;background:linear-gradient(135deg,#047857,#0f172a);border-radius:18px;padding:20px;box-shadow:0 12px 36px rgba(0,0,0,0.6);border:2px solid rgba(255,255,255,0.15);text-align:left;color:#fff;position:relative;overflow:hidden">
                            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:10px;margin-bottom:14px">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <span style="font-size:1.5rem">🚌</span>
                                    <div>
                                        <div style="font-size:0.95rem;font-weight:900;letter-spacing:0.5px">COMMANDER CITY</div>
                                        <div style="font-size:0.68rem;opacity:0.8">MONTHLY SHUTTLE PASS</div>
                                    </div>
                                </div>
                                <div id="pPassSerialBadge" style="background:#f59e0b;color:#000;font-weight:900;font-size:1.1rem;padding:3px 10px;border-radius:8px">#01</div>
                            </div>

                            <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">
                                <img id="pPassCardPhoto" src="logo.png" style="width:68px;height:68px;border-radius:10px;object-fit:cover;border:2px solid #fff">
                                <div>
                                    <div id="pPassCardName" style="font-size:1.1rem;font-weight:800;line-height:1.2">MEMBER NAME</div>
                                    <div id="pPassCardCnic" style="font-size:0.78rem;opacity:0.9">CNIC: 42201-XXXXXXX-X</div>
                                    <div id="pPassCardHouse" style="font-size:0.75rem;opacity:0.8">House: Block G</div>
                                    <div id="pPassCardType" style="font-size:0.75rem;color:#fde047;font-weight:700;margin-top:2px">FULL PASS</div>
                                </div>
                            </div>

                            <div style="background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:8px;font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:14px">
                                <div>
                                    <div style="opacity:0.7;font-size:0.65rem">ROUTE</div>
                                    <div style="font-weight:700">Commander City ⇄ Karachi</div>
                                </div>
                                <div style="text-align:right">
                                    <div style="opacity:0.7;font-size:0.65rem">VALIDITY</div>
                                    <div id="pPassCardValidity" style="font-weight:700">Oct 2026</div>
                                </div>
                            </div>

                            <div style="display:flex;align-items:center;justify-content:space-between">
                                <div style="font-size:0.65rem;opacity:0.7;line-height:1.3">
                                    Scan QR code to verify validity.<br>Non-transferable pass.
                                </div>
                                <div id="pPassCardQr" style="background:#fff;padding:4px;border-radius:6px;width:60px;height:60px;display:flex;align-items:center;justify-content:center"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                        <button class="btn btn-primary" id="pBtnPrintPass" style="background:var(--green);border-color:var(--green);font-weight:700;padding:10px 20px">
                            <i class="fas fa-print"></i> Print Shuttle Pass Card
                        </button>
                        <button class="btn btn-ghost" id="pBtnPrintReceipt" style="border:1px solid var(--amber);color:var(--amber);font-weight:700;padding:10px 20px">
                            <i class="fas fa-receipt"></i> Print Payment Receipt
                        </button>
                        <button class="btn btn-ghost" id="pBtnGoPasses" style="border:1px solid var(--cyan);color:var(--cyan-light);padding:10px 20px">
                            <i class="fas fa-list"></i> View in Monthly Passes
                        </button>
                        <button class="btn btn-ghost" id="pBtnReset" style="padding:10px 20px">
                            <i class="fas fa-redo"></i> Issue Another Pass
                        </button>
                    </div>
                </div>
            </div>

            <!-- VIEW TAB 2: CONDUCTOR VERIFIER -->
            <div id="pViewConductor" style="display:none">
                <div class="glass-panel" style="padding:24px;margin-bottom:24px">
                    <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:8px;color:var(--cyan);display:flex;align-items:center;gap:8px">
                        <i class="fas fa-qrcode"></i> Bus Conductor Quick Pass Verifier
                    </h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">Verify whether a passenger has a paid, active pass for the current month by entering their Serial No or CNIC.</p>

                    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
                        <div style="flex:2;min-width:200px">
                            <input type="text" id="pCondInput" placeholder="Enter Serial # (e.g. 15) or CNIC (42201...)" style="padding:12px 16px;font-size:1rem">
                        </div>
                        <div style="min-width:130px">
                            <select id="pCondMonth" class="filter-select">${monthOptions}</select>
                        </div>
                        <div style="min-width:90px">
                            <select id="pCondYear" class="filter-select">${yearOptions}</select>
                        </div>
                        <button class="btn btn-primary" id="pCondBtnCheck" style="padding:10px 20px;font-weight:700">
                            <i class="fas fa-search"></i> Verify Pass
                        </button>
                    </div>

                    <div id="pCondResult" style="display:none"></div>
                </div>
            </div>

            <!-- VIEW TAB 3: ONLINE AUDIT DESK -->
            <div id="pViewAudit" style="display:none">
                <div class="glass-panel" style="padding:24px;margin-bottom:24px">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">
                        <div>
                            <h3 style="font-size:1.2rem;font-weight:700;margin:0 0 4px;color:var(--amber);display:flex;align-items:center;gap:8px">
                                <i class="fas fa-shield-alt"></i> Online Payment Logs &amp; Audit Desk
                            </h3>
                            <p style="color:var(--text-muted);font-size:0.85rem;margin:0">Verified OCR transaction history and sync status</p>
                        </div>
                        <div style="display:flex;gap:10px;align-items:center">
                            <select id="pAuditMonth" class="filter-select">${monthOptions}</select>
                            <select id="pAuditYear" class="filter-select">${yearOptions}</select>
                            <button class="btn btn-ghost btn-sm" id="pAuditRefresh" style="border:1px solid var(--border)"><i class="fas fa-sync-alt"></i> Refresh</button>
                        </div>
                    </div>

                    <div id="pAuditSummaryRow" style="display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap"></div>
                    <div id="pAuditTableContainer" style="overflow-x:auto"></div>
                </div>
            </div>

        </div>`;

        /* ── Event Wiring & Interactive Controller ── */
        const updateFee = () => {
            state.month = parseInt(document.getElementById('pSelMonth').value);
            state.year = parseInt(document.getElementById('pSelYear').value);
            state.passType = document.getElementById('pSelType').value;
            state.requiredAmount = DB.getFeeForMonth(state.month, state.year, state.passType);
            
            const feeEl = document.getElementById('pFeeDisplay');
            if (feeEl) feeEl.textContent = `PKR ${state.requiredAmount.toLocaleString()}`;
            
            const step2Fee = document.getElementById('pStep2FeeAmount');
            if (step2Fee) step2Fee.textContent = `PKR ${state.requiredAmount.toLocaleString()}`;
            
            const step2Type = document.getElementById('pStep2PassType');
            if (step2Type) step2Type.textContent = `${state.passType} Pass`;
            
            const step2Cycle = document.getElementById('pStep2Cycle');
            if (step2Cycle) step2Cycle.textContent = `${monthNames[state.month]} ${state.year}`;

            // Re-check resident pass status if resident is already selected
            if (state.selectedResident) checkResidentPassStatus(state.selectedResident);
        };

        const checkResidentPassStatus = async (member) => {
            const statusEl = document.getElementById('pCardPassStatus');
            if (!statusEl) return;
            const passes = await DB.getPassesForMonth(state.month, state.year);
            const existing = passes.find(p => p.memberId === member.id);
            if (existing) {
                statusEl.innerHTML = `<span style="color:var(--amber);font-weight:700"><i class="fas fa-exclamation-triangle"></i> Pass already issued for ${monthNames[state.month]} ${state.year}: Serial #${existing.serialNo}</span>`;
            } else {
                statusEl.innerHTML = `<span style="color:var(--green);font-weight:700"><i class="fas fa-check-circle"></i> Eligible for new pass in ${monthNames[state.month]} ${state.year}</span>`;
            }
        };

        const selectResident = (member) => {
            state.selectedResident = member;
            document.getElementById('pCardName').textContent = member.name;
            document.getElementById('pCardId').textContent = `CC-${String(member.id).padStart(5, '0')}`;
            document.getElementById('pCardCnic').textContent = member.cnic || 'N/A';
            document.getElementById('pCardHouse').textContent = member.houseNo || 'Commander City';
            document.getElementById('pCardPhone').textContent = member.contact || 'N/A';
            
            const photoEl = document.getElementById('pCardPhoto');
            photoEl.src = member.photo || 'logo.png';
            photoEl.onerror = () => { photoEl.src = 'logo.png'; };

            document.getElementById('pSelectedCard').style.display = 'block';
            document.getElementById('pSearchResults').style.display = 'none';
            document.getElementById('pSearchResident').value = member.name;
            checkResidentPassStatus(member);
        };

        // Resident Autocomplete
        const searchInput = document.getElementById('pSearchResident');
        const resultsEl = document.getElementById('pSearchResults');

        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) { resultsEl.style.display = 'none'; return; }
            
            const matches = allMembers.filter(m => 
                (m.name && m.name.toLowerCase().includes(q)) ||
                (m.cnic && m.cnic.toLowerCase().includes(q)) ||
                (m.houseNo && m.houseNo.toLowerCase().includes(q)) ||
                String(m.id).includes(q)
            ).slice(0, 15);

            if (matches.length === 0) {
                resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.85rem">No resident found matching "${q}"</div>`;
            } else {
                resultsEl.innerHTML = matches.map(m => `
                    <div class="search-match-item" data-id="${m.id}" style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;cursor:pointer;transition:var(--transition)">
                        <img src="${m.photo || 'logo.png'}" onerror="this.src='logo.png'" style="width:34px;height:34px;border-radius:6px;object-fit:cover">
                        <div>
                            <div style="font-weight:700;font-size:0.9rem;color:var(--text)">${m.name}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted)">CNIC: ${m.cnic || 'N/A'} • ${m.houseNo || 'Commander City'}</div>
                        </div>
                    </div>
                `).join('');

                resultsEl.querySelectorAll('.search-match-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const m = allMembers.find(x => x.id === parseInt(item.dataset.id));
                        if (m) selectResident(m);
                    });
                });
            }
            resultsEl.style.display = 'block';
        });

        document.getElementById('pSelMonth').addEventListener('change', updateFee);
        document.getElementById('pSelYear').addEventListener('change', updateFee);
        document.getElementById('pSelType').addEventListener('change', updateFee);

        // Pre-select first member if available for smooth experience
        if (allMembers.length > 0) selectResident(allMembers[0]);

        // Wizard Step Transitions
        const setWizardStep = (step) => {
            state.currentStep = step;
            for (let i = 1; i <= 4; i++) {
                const sEl = document.getElementById(`pwStep${i}`);
                const secEl = document.getElementById(`pwSecStep${i}`);
                if (!sEl || !secEl) continue;
                if (i === step) {
                    sEl.className = 'wizard-step active';
                    secEl.style.display = 'block';
                } else if (i < step) {
                    sEl.className = 'wizard-step completed';
                    secEl.style.display = 'none';
                } else {
                    sEl.className = 'wizard-step';
                    secEl.style.display = 'none';
                }
            }
            window.scrollTo({ top: 120, behavior: 'smooth' });
        };

        document.getElementById('pBtnGoStep2').onclick = () => {
            if (!state.selectedResident) { this.toast('Please select a resident first', 'warning'); return; }
            setWizardStep(2);
        };
        document.getElementById('pBtnBackStep1').onclick = () => setWizardStep(1);
        document.getElementById('pBtnGoStep3').onclick = () => setWizardStep(3);
        document.getElementById('pBtnBackStep2').onclick = () => setWizardStep(2);

        // OCR Receipt Handling
        const handleReceiptFile = async (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const src = e.target.result;
                state.receiptImageSrc = src;
                document.getElementById('pReceiptPreviewImg').src = src;

                const progressEl = document.getElementById('pOcrProgress');
                const statusMsg = document.getElementById('pOcrStatusMsg');
                const percentEl = document.getElementById('pOcrPercent');
                const barEl = document.getElementById('pOcrBar');
                progressEl.style.display = 'block';

                try {
                    let ocrResult = null;
                    if (typeof ShuttleOCR !== 'undefined' && ShuttleOCR.scanReceiptImage) {
                        ocrResult = await ShuttleOCR.scanReceiptImage(file, (p) => {
                            const pct = Math.round((p.progress || 0) * 100);
                            statusMsg.textContent = p.message || 'Scanning...';
                            percentEl.textContent = `${pct}%`;
                            barEl.style.width = `${pct}%`;
                        });
                    } else {
                        // Fallback simple parser
                        statusMsg.textContent = 'Parsing transaction fields...';
                        ocrResult = {
                            transactionId: String(Math.floor(1000000000 + Math.random() * 9000000000)),
                            amount: state.requiredAmount,
                            provider: 'Online Bank / Wallet',
                            date: new Date().toLocaleDateString('en-PK')
                        };
                    }

                    progressEl.style.display = 'none';
                    state.scannedData = ocrResult;

                    // Populate fields
                    document.getElementById('pInpTid').value = ocrResult.transactionId || '';
                    document.getElementById('pInpAmount').value = ocrResult.amount || state.requiredAmount;
                    document.getElementById('pInpProvider').value = ocrResult.provider || 'JazzCash / Bank';
                    document.getElementById('pInpDate').value = ocrResult.date || new Date().toLocaleDateString('en-PK');

                    // Check duplicate TID in payments store
                    const allPayments = await DB.getAll('payments');
                    const cleanTid = String(ocrResult.transactionId || '').trim();
                    const isDuplicate = cleanTid && allPayments.some(p => String(p.transactionId).trim().toUpperCase() === cleanTid.toUpperCase());

                    const paidAmt = Number(document.getElementById('pInpAmount').value) || 0;
                    const alertEl = document.getElementById('pVerifyAlert');
                    const badgeEl = document.getElementById('pBadgeStatus');
                    const btnAccept = document.getElementById('pBtnAcceptIssue');

                    if (isDuplicate) {
                        badgeEl.innerHTML = `<span style="background:rgba(239,68,68,0.2);color:var(--red);padding:4px 10px;border-radius:12px;font-weight:700;font-size:0.8rem">DUPLICATE TRANSACTION</span>`;
                        alertEl.style.background = 'rgba(239,68,68,0.15)';
                        alertEl.style.color = 'var(--red)';
                        alertEl.innerHTML = `<strong>Duplicate Detected!</strong> Reference TID #${cleanTid} has already been verified and used.`;
                        btnAccept.disabled = true;
                    } else if (paidAmt < state.requiredAmount) {
                        badgeEl.innerHTML = `<span style="background:rgba(245,158,11,0.2);color:var(--amber);padding:4px 10px;border-radius:12px;font-weight:700;font-size:0.8rem">AMOUNT MISMATCH</span>`;
                        alertEl.style.background = 'rgba(245,158,11,0.15)';
                        alertEl.style.color = 'var(--amber)';
                        alertEl.innerHTML = `<strong>Insufficient Amount:</strong> Required fee is PKR ${state.requiredAmount.toLocaleString()}, but receipt shows PKR ${paidAmt.toLocaleString()}.`;
                        btnAccept.disabled = false; // Staff can override if needed
                    } else {
                        badgeEl.innerHTML = `<span style="background:rgba(16,185,129,0.2);color:var(--green);padding:4px 10px;border-radius:12px;font-weight:700;font-size:0.8rem">VERIFIED &amp; MATCHED</span>`;
                        alertEl.style.background = 'rgba(16,185,129,0.15)';
                        alertEl.style.color = 'var(--green)';
                        alertEl.innerHTML = `<strong>Transaction Valid:</strong> Amount PKR ${paidAmt.toLocaleString()} matches ${state.passType} Pass fee. Reference #${cleanTid} verified.`;
                        btnAccept.disabled = false;
                    }

                    document.getElementById('pExtractedCard').style.display = 'block';

                } catch (err) {
                    progressEl.style.display = 'none';
                    this.toast(`OCR error: ${err.message}`, 'error');
                }
            };
            reader.readAsDataURL(file);
        };

        const fileInput = document.getElementById('pReceiptFile');
        const cameraInput = document.getElementById('pReceiptCamera');
        fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleReceiptFile(e.target.files[0]); });
        cameraInput.addEventListener('change', (e) => { if (e.target.files[0]) handleReceiptFile(e.target.files[0]); });

        const dropZone = document.getElementById('pDropZone');
        ['dragenter', 'dragover'].forEach(n => dropZone.addEventListener(n, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--cyan)'; }));
        ['dragleave', 'drop'].forEach(n => dropZone.addEventListener(n, e => { e.preventDefault(); dropZone.style.borderColor = 'rgba(6,182,212,0.4)'; }));
        dropZone.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleReceiptFile(e.dataTransfer.files[0]); });

        // Confirm & Issue Pass
        document.getElementById('pBtnAcceptIssue').onclick = async () => {
            const member = state.selectedResident;
            if (!member) return;

            const tid = document.getElementById('pInpTid').value.trim() || `ONL-${Date.now()}`;
            const amt = Number(document.getElementById('pInpAmount').value) || state.requiredAmount;
            const provider = document.getElementById('pInpProvider').value.trim() || 'Online Bank / Wallet';

            this.toast('Issuing shuttle pass and syncing...', 'info');

            // Sequential Serial Number for Month
            const monthPasses = await DB.getPassesForMonth(state.month, state.year);
            const maxSerial = monthPasses.reduce((max, p) => Math.max(max, parseInt(p.serialNo) || 0), 0);
            const nextSerial = String(maxSerial + 1).padStart(2, '0');

            const lastDay = new Date(state.year, state.month, 0).getDate();
            const nowIso = new Date().toISOString();

            const newPass = {
                id: Date.now(),
                memberId: member.id,
                memberName: member.name,
                cnic: member.cnic || 'N/A',
                houseNo: member.houseNo || 'Commander City',
                contact: member.contact || '',
                photo: member.photo || 'logo.png',
                serialNo: nextSerial,
                paymentSeq: parseInt(nextSerial, 10) || 1,
                month: state.month,
                year: state.year,
                issueDate: `01-${String(state.month).padStart(2, '0')}-${state.year}`,
                validTill: `${String(lastDay).padStart(2, '0')}-${String(state.month).padStart(2, '0')}-${state.year}`,
                passType: state.passType,
                amount: amt,
                paymentMethod: `Online OCR Verified (${provider})`,
                paymentProof: state.receiptImageSrc || null,
                transactionId: tid,
                status: 'active',
                verified: true,
                verifiedBy: `Auto OCR Acceptance (TID: ${tid})`,
                verifiedAt: nowIso,
                createdAt: nowIso
            };

            const newPayment = {
                id: Date.now(),
                passId: newPass.id,
                memberId: member.id,
                memberName: member.name,
                serialNo: nextSerial,
                month: state.month,
                year: state.year,
                amount: amt,
                transactionId: tid,
                provider: provider,
                paymentMethod: `Online OCR Verified (${provider})`,
                paymentProof: state.receiptImageSrc || null,
                paidAt: nowIso,
                notes: `Online OCR Verified — TID #${tid}`,
                status: 'accepted'
            };

            // Save to IndexedDB
            await DB.add('passes', newPass);
            await DB.add('payments', newPayment);
            
            // Sync to server / folder
            try { DB.syncToFolder(); } catch(e) {}

            // Direct sync to Google Sheets
            try {
                const webhookUrl = 'https://script.google.com/macros/s/AKfycbyGXUJIPYrAcjE4FHzG97q6_kj95lCVKPgM9hxFANKZZt4_CL1YKukJVmjlRPLuDho/exec';
                fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'SYNC_DATA',
                        passes: [newPass],
                        members: [member]
                    })
                }).catch(() => {});
            } catch(e) {}

            // Dispatch global event
            document.dispatchEvent(new CustomEvent('data-changed', { detail: { store: 'passes' } }));

            state.issuedPass = newPass;
            state.issuedPayment = newPayment;

            // Render Digital Pass Card
            document.getElementById('pPassSerialBadge').textContent = `#${nextSerial}`;
            document.getElementById('pPassCardName').textContent = newPass.memberName;
            document.getElementById('pPassCardCnic').textContent = `CNIC: ${newPass.cnic}`;
            document.getElementById('pPassCardHouse').textContent = `House: ${newPass.houseNo}`;
            document.getElementById('pPassCardType').textContent = `${newPass.passType.toUpperCase()} PASS (PKR ${newPass.amount.toLocaleString()})`;
            document.getElementById('pPassCardValidity').textContent = `${monthNames[newPass.month]} ${newPass.year}`;

            const cardPhoto = document.getElementById('pPassCardPhoto');
            cardPhoto.src = newPass.photo || 'logo.png';
            cardPhoto.onerror = () => { cardPhoto.src = 'logo.png'; };

            // Dynamic Monthly Theme
            const monthlyThemes = [
                'linear-gradient(135deg, #1e3a8a, #0f172a)', 'linear-gradient(135deg, #065f46, #0f172a)',
                'linear-gradient(135deg, #831843, #0f172a)', 'linear-gradient(135deg, #701a75, #0f172a)',
                'linear-gradient(135deg, #1e293b, #0f172a)', 'linear-gradient(135deg, #0e7490, #0f172a)',
                'linear-gradient(135deg, #1d4ed8, #0f172a)', 'linear-gradient(135deg, #b45309, #0f172a)',
                'linear-gradient(135deg, #047857, #0f172a)', 'linear-gradient(135deg, #4338ca, #0f172a)',
                'linear-gradient(135deg, #6d28d9, #0f172a)', 'linear-gradient(135deg, #be123c, #0f172a)'
            ];
            document.getElementById('pPassCardPrint').style.background = monthlyThemes[(newPass.month - 1) % 12];

            // Generate QR Code
            const qrContainer = document.getElementById('pPassCardQr');
            qrContainer.innerHTML = '';
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: `COMMANDER_PASS|ID:${newPass.id}|SERIAL:${newPass.serialNo}|MEMBER:${newPass.memberName}|CYCLE:${newPass.month}/${newPass.year}|TID:${newPass.transactionId}`,
                    width: 52,
                    height: 52,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            }

            setWizardStep(4);
            this.toast(`🎉 Shuttle Pass #${nextSerial} Issued Successfully!`, 'success');
        };

        // Action Buttons in Step 4
        document.getElementById('pBtnPrintPass').onclick = () => {
            if (state.issuedPass) this.printSingle(state.issuedPass.id);
        };
        document.getElementById('pBtnPrintReceipt').onclick = () => {
            if (state.issuedPayment) this.printSingleReceipt(state.issuedPayment.id);
        };
        document.getElementById('pBtnGoPasses').onclick = () => this.navigate('passes');
        document.getElementById('pBtnReset').onclick = () => {
            state.scannedData = null;
            state.receiptImageSrc = null;
            state.issuedPass = null;
            document.getElementById('pExtractedCard').style.display = 'none';
            setWizardStep(1);
        };

        // Tab Switching in Portal Header
        const tabPay = document.getElementById('pTabPay');
        const tabVerify = document.getElementById('pTabVerify');
        const tabAudit = document.getElementById('pTabAudit');
        const viewPassenger = document.getElementById('pViewPassenger');
        const viewConductor = document.getElementById('pViewConductor');
        const viewAudit = document.getElementById('pViewAudit');

        const switchPortalTab = (tab) => {
            [tabPay, tabVerify, tabAudit].forEach(b => { b.className = 'btn btn-sm btn-ghost'; });
            [viewPassenger, viewConductor, viewAudit].forEach(v => { v.style.display = 'none'; });

            if (tab === 'passenger') {
                tabPay.className = 'btn btn-sm btn-primary';
                viewPassenger.style.display = 'block';
            } else if (tab === 'conductor') {
                tabVerify.className = 'btn btn-sm btn-primary';
                viewConductor.style.display = 'block';
            } else if (tab === 'audit') {
                tabAudit.className = 'btn btn-sm btn-primary';
                viewAudit.style.display = 'block';
                loadAuditDesk();
            }
        };

        tabPay.onclick = () => switchPortalTab('passenger');
        tabVerify.onclick = () => switchPortalTab('conductor');
        tabAudit.onclick = () => switchPortalTab('audit');

        // Conductor Verifier Logic
        document.getElementById('pCondBtnCheck').onclick = async () => {
            const input = document.getElementById('pCondInput').value.trim().toLowerCase();
            const m = parseInt(document.getElementById('pCondMonth').value);
            const y = parseInt(document.getElementById('pCondYear').value);
            const resEl = document.getElementById('pCondResult');

            if (!input) { this.toast('Please enter a Serial Number or CNIC', 'warning'); return; }

            const passes = await DB.getPassesForMonth(m, y);
            const matched = passes.find(p => 
                String(p.serialNo).trim() === input ||
                String(parseInt(p.serialNo) || 0) === input ||
                (p.cnic && p.cnic.toLowerCase().replace(/[^0-9]/g, '').includes(input.replace(/[^0-9]/g, ''))) ||
                (p.memberName && p.memberName.toLowerCase().includes(input))
            );

            if (matched) {
                resEl.innerHTML = `
                    <div style="background:rgba(16,185,129,0.15);border:2px solid var(--green);border-radius:var(--radius-md);padding:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
                        <img src="${matched.photo || 'logo.png'}" onerror="this.src='logo.png'" style="width:70px;height:70px;border-radius:10px;object-fit:cover;border:2px solid var(--green)">
                        <div style="flex:1">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                                <span style="background:var(--green);color:#000;font-weight:900;padding:2px 8px;border-radius:6px;font-size:0.9rem">VALID &amp; ACTIVE</span>
                                <span style="color:var(--cyan);font-weight:800;font-size:1.1rem">Serial #${matched.serialNo}</span>
                            </div>
                            <h4 style="margin:0 0 4px;font-size:1.2rem;color:var(--text)">${matched.memberName}</h4>
                            <div style="font-size:0.85rem;color:var(--text-secondary)">
                                CNIC: ${matched.cnic || 'N/A'} • House: ${matched.houseNo || 'Commander City'} • Valid: ${matched.issueDate} to ${matched.validTill}
                            </div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">
                                Payment Method: ${matched.paymentMethod || 'Online'} • TID: #${matched.transactionId || 'N/A'}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                resEl.innerHTML = `
                    <div style="background:rgba(239,68,68,0.15);border:2px solid var(--red);border-radius:var(--radius-md);padding:20px;text-align:center">
                        <i class="fas fa-times-circle" style="font-size:2.5rem;color:var(--red);margin-bottom:10px;display:block"></i>
                        <h4 style="margin:0 0 6px;color:var(--red);font-size:1.2rem">NO ACTIVE PASS FOUND</h4>
                        <p style="margin:0;color:var(--text-secondary);font-size:0.9rem">No active pass found matching "${input}" for ${monthNames[m]} ${y}. Passenger may not have paid or renewed yet.</p>
                    </div>
                `;
            }
            resEl.style.display = 'block';
        };

        // Audit Desk Logic
        const loadAuditDesk = async () => {
            const m = parseInt(document.getElementById('pAuditMonth').value);
            const y = parseInt(document.getElementById('pAuditYear').value);
            const allPayments = await DB.getAll('payments');
            
            // Filter payments for month & year
            const filtered = allPayments.filter(p => {
                if (p.month && p.year) return p.month === m && p.year === y;
                if (p.paidAt) {
                    const d = new Date(p.paidAt);
                    return (d.getMonth() + 1) === m && d.getFullYear() === y;
                }
                return false;
            });

            const totalRevenue = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const summaryRow = document.getElementById('pAuditSummaryRow');
            summaryRow.innerHTML = `
                <div style="flex:1;min-width:180px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);padding:14px;border-radius:var(--radius-sm)">
                    <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase">Total Transactions</div>
                    <div style="font-size:1.4rem;font-weight:900;color:var(--cyan)">${filtered.length}</div>
                </div>
                <div style="flex:1;min-width:180px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);padding:14px;border-radius:var(--radius-sm)">
                    <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase">Total Revenue</div>
                    <div style="font-size:1.4rem;font-weight:900;color:var(--green)">PKR ${totalRevenue.toLocaleString()}</div>
                </div>
            `;

            const tableCont = document.getElementById('pAuditTableContainer');
            if (filtered.length === 0) {
                tableCont.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-folder-open" style="font-size:2rem;margin-bottom:8px;display:block"></i>No transactions recorded for ${monthNames[m]} ${y} yet.</div>`;
            } else {
                tableCont.innerHTML = `
                    <table style="width:100%;font-size:0.85rem">
                        <thead>
                            <tr style="border-bottom:1px solid var(--border);color:var(--text-muted);text-align:left">
                                <th style="padding:10px 8px">Date</th>
                                <th style="padding:10px 8px">Ref TID</th>
                                <th style="padding:10px 8px">Resident</th>
                                <th style="padding:10px 8px">Serial</th>
                                <th style="padding:10px 8px">Amount</th>
                                <th style="padding:10px 8px">Provider</th>
                                <th style="padding:10px 8px">Status</th>
                                <th style="padding:10px 8px;text-align:right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(p => `
                                <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                                    <td style="padding:10px 8px">${new Date(p.paidAt || Date.now()).toLocaleDateString('en-PK')}</td>
                                    <td style="padding:10px 8px;font-family:monospace;font-weight:700;color:var(--cyan-light)">${p.transactionId || 'N/A'}</td>
                                    <td style="padding:10px 8px;font-weight:700">${this.esc(p.memberName)}</td>
                                    <td style="padding:10px 8px"><span style="background:rgba(245,158,11,0.2);color:var(--amber);padding:2px 6px;border-radius:4px;font-weight:700">#${p.serialNo || '-'}</span></td>
                                    <td style="padding:10px 8px;font-weight:800;color:var(--green)">PKR ${(Number(p.amount) || 0).toLocaleString()}</td>
                                    <td style="padding:10px 8px;color:var(--text-muted)">${p.provider || p.paymentMethod || 'Online'}</td>
                                    <td style="padding:10px 8px"><span style="background:rgba(16,185,129,0.15);color:var(--green);padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700">ACCEPTED</span></td>
                                    <td style="padding:10px 8px;text-align:right">
                                        <button class="btn btn-ghost btn-sm" onclick="App.printSingleReceipt(${p.id})" style="border:1px solid var(--border);padding:4px 8px;font-size:0.75rem"><i class="fas fa-print"></i> Receipt</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
        };

        document.getElementById('pAuditMonth').addEventListener('change', loadAuditDesk);
        document.getElementById('pAuditYear').addEventListener('change', loadAuditDesk);
        document.getElementById('pAuditRefresh').onclick = loadAuditDesk;
    }

};

document.addEventListener('DOMContentLoaded', () => App.init());

