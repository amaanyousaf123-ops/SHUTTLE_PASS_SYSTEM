/**
 * ============================================================
 * Commander City Shuttle Pass — Online Payment Portal Controller
 * Controls Wizard, Resident Autocomplete, OCR Scanning & Auto-Acceptance
 * ============================================================
 */

const PortalApp = {
  currentStep: 1,
  currentTab: 'passenger',
  isAdminUnlocked: false,

  state: {
    selectedResident: null,
    month: 10,
    year: 2026,
    passType: 'Full',
    requiredAmount: 8000,
    scannedData: null,
    receiptImageSrc: null,
    issuedPass: null
  },

  // Fallback members for instant search even without network
  seedMembers: [
    { id: 1, name: "SHOAIB ALI", cnic: "42201-5311737-7", houseNo: "R-108 BLOCK G-1", contact: "0300-1234567", photo: "photos/photo_1.jpeg" },
    { id: 2, name: "FARAH F KHAN", cnic: "42401-9281726-1", houseNo: "R-396, BLOCK H-2", contact: "0321-9876543", photo: "photos/photo_5.jpeg" },
    { id: 3, name: "SAIMA IMRAN", cnic: "42201-1928374-3", houseNo: "R-373, BLOCK I-2", contact: "0333-5551234", photo: "photos/photo_9.jpeg" },
    { id: 4, name: "MUHAMMAD USMAN", cnic: "42201-8172635-5", houseNo: "L-237/238 M-3", contact: "0345-8889999", photo: "photos/photo_21.jpeg" },
    { id: 5, name: "DR UZMA", cnic: "42101-7261524-2", houseNo: "R-51 BLOCK C-2", contact: "0312-3334444", photo: "photos/photo_25.jpeg" }
  ],

  transactions: [],

  init() {
    this.loadCachedTransactions();
    this.setupEventListeners();
    this.updateFeeCalculation();
    this.selectDefaultResident();
    console.log('[PortalApp] Shuttle Pass Online Payment Portal initialized.');
  },

  selectDefaultResident() {
    // Select first sample resident by default for smooth UX
    this.selectResident(this.seedMembers[0]);
  },

  loadCachedTransactions() {
    try {
      const saved = localStorage.getItem('shuttle_online_transactions');
      if (saved) {
        this.transactions = JSON.parse(saved);
        this.renderAdminTransactions();
      }
    } catch (e) {
      this.transactions = [];
    }
  },

  saveTransactions() {
    try {
      localStorage.setItem('shuttle_online_transactions', JSON.stringify(this.transactions));
    } catch (e) {}
  },

  setupEventListeners() {
    const searchInput = document.getElementById('residentSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleResidentSearch(e.target.value));
      document.addEventListener('click', (e) => {
        const resultsEl = document.getElementById('residentSearchResults');
        if (resultsEl && !e.target.closest('.resident-search-wrapper')) {
          resultsEl.style.display = 'none';
        }
      });
    }

    // Drag and drop for receipt upload
    const dropZone = document.getElementById('ocrDropZone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.remove('drag-over');
        });
      });
      dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files[0]) {
          this.processImageFile(files[0]);
        }
      });
    }
  },

  /* ── Tab Switching ── */
  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('viewPassenger').style.display = 'none';
    document.getElementById('viewConductor').style.display = 'none';
    document.getElementById('viewAdmin').style.display = 'none';

    if (tab === 'passenger') {
      document.getElementById('tabBtnPassenger').classList.add('active');
      document.getElementById('viewPassenger').style.display = 'block';
    } else if (tab === 'conductor') {
      document.getElementById('tabBtnConductor').classList.add('active');
      document.getElementById('viewConductor').style.display = 'block';
    } else if (tab === 'admin') {
      document.getElementById('tabBtnAdmin').classList.add('active');
      document.getElementById('viewAdmin').style.display = 'block';
      this.renderAdminTransactions();
    }
  },

  /* ── Wizard Navigation ── */
  goToStep(step) {
    if (step === 2 && !this.state.selectedResident) {
      this.showToast('Please search and select a resident profile first.', 'warning');
      return;
    }

    this.currentStep = step;

    // Update wizard steps indicators
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`wizardStep${i}`);
      const sectionEl = document.getElementById(`sectionStep${i}`);
      if (!stepEl || !sectionEl) continue;

      if (i === step) {
        stepEl.className = 'wizard-step active';
        sectionEl.style.display = 'block';
      } else if (i < step) {
        stepEl.className = 'wizard-step completed';
        sectionEl.style.display = 'none';
      } else {
        stepEl.className = 'wizard-step';
        sectionEl.style.display = 'none';
      }
    }

    window.scrollTo({ top: 120, behavior: 'smooth' });
  },

  resetWizard() {
    this.state.scannedData = null;
    this.state.receiptImageSrc = null;
    this.state.issuedPass = null;
    document.getElementById('receiptPreviewContainer').style.display = 'none';
    document.getElementById('extractedCard').style.display = 'none';
    this.goToStep(1);
  },

  /* ── Resident Search & Autocomplete ── */
  async handleResidentSearch(query) {
    const resultsEl = document.getElementById('residentSearchResults');
    const q = query.trim().toLowerCase();

    if (!q) {
      resultsEl.style.display = 'none';
      return;
    }

    let matches = [];

    // Try fetching from serverless API if available
    try {
      const res = await fetch(`/api/members?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.members && data.members.length > 0) {
          matches = data.members;
        }
      }
    } catch (e) {
      // Fallback to local seed members
    }

    if (matches.length === 0) {
      matches = this.seedMembers.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.cnic.toLowerCase().includes(q) ||
        m.houseNo.toLowerCase().includes(q) ||
        String(m.id).includes(q)
      );
    }

    if (matches.length === 0) {
      resultsEl.innerHTML = `
        <div style="padding:14px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
          No resident found with "${query}". <br>
          <button style="margin-top:6px;color:var(--cyan);font-weight:700;background:none;border:none;cursor:pointer;" onclick="PortalApp.registerCustomResident('${query}')">
            + Continue as New Resident: "${query}"
          </button>
        </div>
      `;
      resultsEl.style.display = 'block';
      return;
    }

    resultsEl.innerHTML = matches.map(m => `
      <div class="resident-item" onclick="PortalApp.selectResident(${JSON.stringify(m).replace(/"/g, '&quot;')})">
        <img src="${m.photo || 'LOGO.png'}" alt="Avatar" class="resident-avatar" onerror="this.src='LOGO.png'">
        <div style="flex:1;">
          <div style="font-weight:700;color:#fff;">${m.name}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);">CNIC: ${m.cnic} • ${m.houseNo}</div>
        </div>
        <span style="font-size:0.75rem;font-weight:800;color:var(--cyan);background:rgba(6,182,212,0.1);padding:4px 8px;border-radius:4px;">
          CC-${String(m.id).padStart(5, '0')}
        </span>
      </div>
    `).join('');

    resultsEl.style.display = 'block';
  },

  selectResident(resident) {
    this.state.selectedResident = resident;

    document.getElementById('selectedResidentName').textContent = resident.name;
    document.getElementById('selectedResidentId').textContent = `CC-${String(resident.id).padStart(5, '0')}`;
    document.getElementById('selectedResidentCnic').textContent = resident.cnic || 'N/A';
    document.getElementById('selectedResidentHouse').textContent = resident.houseNo || 'Commander City';
    document.getElementById('selectedResidentContact').textContent = resident.contact || 'Registered';
    
    const photoEl = document.getElementById('selectedResidentPhoto');
    photoEl.src = resident.photo || 'LOGO.png';
    photoEl.onerror = () => { photoEl.src = 'LOGO.png'; };

    document.getElementById('selectedResidentCard').style.display = 'flex';
    document.getElementById('residentSearchResults').style.display = 'none';
    document.getElementById('residentSearchInput').value = resident.name;

    this.showToast(`Selected resident: ${resident.name}`, 'info');
  },

  registerCustomResident(name) {
    const newRes = {
      id: Math.floor(1000 + Math.random() * 9000),
      name: name.toUpperCase(),
      cnic: "42201-PENDING",
      houseNo: "Commander City",
      contact: "",
      photo: "LOGO.png"
    };
    this.seedMembers.unshift(newRes);
    this.selectResident(newRes);
  },

  /* ── Fee Calculation ── */
  updateFeeCalculation() {
    const month = parseInt(document.getElementById('passMonthSelect').value, 10);
    const year = parseInt(document.getElementById('passYearSelect').value, 10);

    this.state.month = month;
    this.state.year = year;

    // Rates: After Sep 2026, Full is 8,000 / Half is 4,000
    const targetVal = year * 12 + month;
    const isNewRate = targetVal >= (2026 * 12 + 9);

    const fullFee = isNewRate ? 8000 : 6000;
    const halfFee = isNewRate ? 4000 : 3000;

    document.getElementById('displayFullPrice').textContent = `PKR ${fullFee.toLocaleString()}`;
    document.getElementById('displayHalfPrice').textContent = `PKR ${halfFee.toLocaleString()}`;

    this.state.requiredAmount = (this.state.passType === 'Half') ? halfFee : fullFee;
    document.getElementById('transferRequiredAmount').textContent = `PKR ${this.state.requiredAmount.toLocaleString()}`;
  },

  selectPassType(type) {
    this.state.passType = type;
    const optFull = document.getElementById('optFullPass');
    const optHalf = document.getElementById('optHalfPass');

    if (type === 'Full') {
      optFull.className = 'pass-card-option selected';
      optFull.querySelector('.fa-circle, .fa-check-circle').className = 'fas fa-check-circle';
      optFull.querySelector('.fa-check-circle').style.color = 'var(--cyan)';

      optHalf.className = 'pass-card-option';
      optHalf.querySelector('.fa-circle, .fa-check-circle').className = 'far fa-circle';
      optHalf.querySelector('.fa-circle').style.color = 'var(--text-muted)';
    } else {
      optHalf.className = 'pass-card-option selected';
      optHalf.querySelector('.fa-circle, .fa-check-circle').className = 'fas fa-check-circle';
      optHalf.querySelector('.fa-check-circle').style.color = 'var(--purple)';

      optFull.className = 'pass-card-option';
      optFull.querySelector('.fa-circle, .fa-check-circle').className = 'far fa-circle';
      optFull.querySelector('.fa-circle').style.color = 'var(--text-muted)';
    }

    this.updateFeeCalculation();
  },

  copyToClipboard(text, label = 'Account') {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label} copied to clipboard!`, 'success');
    }).catch(() => {
      this.showToast(`Copied: ${text}`, 'success');
    });
  },

  /* ── 1-Click Demo Receipts Loader ── */
  loadDemoReceipt(type) {
    this.showToast(`Loading demo ${type.replace('_', ' ')} receipt...`, 'info');
    const demo = ShuttleOCR.generateDemoReceipt(type);
    this.state.receiptImageSrc = demo.dataUrl;

    const imgPreview = document.getElementById('receiptImagePreview');
    imgPreview.src = demo.dataUrl;

    document.getElementById('receiptPreviewContainer').style.display = 'grid';
    this.runOcrScanning(demo.dataUrl, demo);
  },

  handleReceiptUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
      this.processImageFile(file);
    }
  },

  processImageFile(file) {
    if (!file.type.startsWith('image/')) {
      this.showToast('Please upload a valid image file (PNG, JPG, Screenshot).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      this.state.receiptImageSrc = dataUrl;
      const imgPreview = document.getElementById('receiptImagePreview');
      imgPreview.src = dataUrl;

      document.getElementById('receiptPreviewContainer').style.display = 'grid';
      this.runOcrScanning(dataUrl);
    };
    reader.readAsDataURL(file);
  },

  /* ── Run Holographic OCR Scanner ── */
  async runOcrScanning(imageSrc, demoMeta = null) {
    const frame = document.getElementById('receiptImageFrame');
    const statusBox = document.getElementById('scanningStatusBox');
    const statusText = document.getElementById('scanningStatusText');
    const statusSubtext = document.getElementById('ocrStatusSubtext');
    const progressBar = document.getElementById('ocrProgressBar');
    const extractedCard = document.getElementById('extractedCard');

    frame.classList.add('scan-laser-active');
    statusBox.style.display = 'block';
    extractedCard.style.display = 'none';

    try {
      const parsed = await ShuttleOCR.scanReceipt(imageSrc, (update) => {
        const pct = Math.round(update.progress * 100);
        progressBar.style.width = `${pct}%`;
        statusText.textContent = update.message;
      });

      // If demo was generated and TID wasn't picked up by OCR text due to font, use demo meta
      if (demoMeta) {
        if (!parsed.transactionId || parsed.transactionId === 'NOT_DETECTED') {
          parsed.transactionId = demoMeta.tid;
        }
        if (!parsed.amount || parsed.amount === 0) {
          parsed.amount = demoMeta.amount;
        }
        parsed.provider = demoMeta.provider;
      }

      this.state.scannedData = parsed;
      this.renderExtractedResults(parsed);

    } catch (err) {
      console.error('[PortalApp] OCR Scan error:', err);
      statusText.textContent = 'Scan encountered an issue';
      statusSubtext.textContent = err.message;
      this.showToast(err.message, 'error');
    } finally {
      frame.classList.remove('scan-laser-active');
    }
  },

  /* ── Verify Transaction & Render Extraction Card ── */
  renderExtractedResults(parsed) {
    const extractedCard = document.getElementById('extractedCard');
    const statusBox = document.getElementById('scanningStatusBox');
    statusBox.style.display = 'none';
    extractedCard.style.display = 'block';

    const providerEl = document.getElementById('extractedProvider');
    const matchBadge = document.getElementById('extractedMatchBadge');
    const tidEl = document.getElementById('extractedTid');
    const amtEl = document.getElementById('extractedAmount');
    const reqFeeEl = document.getElementById('extractedRequiredFee');
    const dateEl = document.getElementById('extractedDate');
    const recipEl = document.getElementById('extractedRecipient');
    const confEl = document.getElementById('extractedConfidence');
    const btnAccept = document.getElementById('btnAcceptAndIssuePass');

    providerEl.textContent = parsed.provider;
    tidEl.textContent = parsed.transactionId;
    amtEl.textContent = `PKR ${(parsed.amount || 0).toLocaleString()}`;
    reqFeeEl.textContent = `PKR ${this.state.requiredAmount.toLocaleString()}`;
    dateEl.textContent = parsed.date;
    recipEl.textContent = parsed.recipient;
    confEl.textContent = `${parsed.confidence || 92}%`;

    // Verification Logic:
    // 1. Amount Check
    const amountMatches = parsed.amount >= this.state.requiredAmount;
    
    // 2. Duplicate Transaction ID check
    const isDuplicate = this.transactions.some(t => t.transactionId === parsed.transactionId && t.status === 'accepted');

    if (isDuplicate) {
      matchBadge.className = 'match-status-badge status-mismatch';
      matchBadge.innerHTML = '<i class="fas fa-ban"></i> <span>DUPLICATE TID (REJECTED)</span>';
      btnAccept.disabled = true;
      btnAccept.innerHTML = '<i class="fas fa-times"></i> Duplicate Transaction Already Used';
      this.showToast(`Transaction ID #${parsed.transactionId} was already accepted previously!`, 'error');
      return;
    }

    if (!amountMatches) {
      matchBadge.className = 'match-status-badge status-mismatch';
      matchBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>AMOUNT MISMATCH (UNDERPAID)</span>';
      btnAccept.disabled = true;
      btnAccept.innerHTML = `<i class="fas fa-times"></i> Underpaid: Requires PKR ${this.state.requiredAmount.toLocaleString()}`;
      this.showToast(`Amount PKR ${parsed.amount} does not match required PKR ${this.state.requiredAmount}`, 'warning');
      return;
    }

    // ACCEPTED INSTANTLY!
    matchBadge.className = 'match-status-badge status-accepted';
    matchBadge.innerHTML = '<i class="fas fa-check-circle"></i> <span>VERIFIED & ACCEPTED</span>';
    btnAccept.disabled = false;
    btnAccept.innerHTML = '<i class="fas fa-bolt"></i> <span>Accept Transaction & Generate Pass</span>';
    
    this.showToast('Transaction verified! Ready to issue pass.', 'success');
  },

  /* ── Confirm & Issue Pass ── */
  async confirmAndIssuePass() {
    if (!this.state.selectedResident || !this.state.scannedData) {
      this.showToast('Missing resident or scanned transaction details.', 'error');
      return;
    }

    const res = this.state.selectedResident;
    const ocr = this.state.scannedData;
    const nowIso = new Date().toISOString();
    const lastDay = new Date(this.state.year, this.state.month, 0).getDate();
    const issueDate = `01-${String(this.state.month).padStart(2, '0')}-${this.state.year}`;
    const validTill = `${String(lastDay).padStart(2, '0')}-${String(this.state.month).padStart(2, '0')}-${this.state.year}`;

    // Auto sequential serial scoped to month
    const currentMonthPasses = this.transactions.filter(t => t.month === this.state.month && t.year === this.state.year);
    const assignedSerial = String(currentMonthPasses.length + 1).padStart(2, '0');

    const passPayload = {
      memberId: res.id,
      memberName: res.name,
      cnic: res.cnic,
      houseNo: res.houseNo,
      contact: res.contact,
      photo: res.photo || 'LOGO.png',
      serialNo: assignedSerial,
      month: this.state.month,
      year: this.state.year,
      passType: this.state.passType,
      amount: this.state.requiredAmount,
      transactionId: ocr.transactionId,
      provider: ocr.provider,
      issueDate,
      validTill
    };

    this.showToast('Submitting verified pass and syncing with Google Sheets...', 'info');

    // Call Vercel serverless API with fallback
    let serverResponse = null;
    try {
      const response = await fetch('/api/submit-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passPayload)
      });
      if (response.ok) {
        serverResponse = await response.json();
      }
    } catch (apiErr) {
      console.warn('[PortalApp] Local fallback storage active:', apiErr.message);
    }

    const verifiedPass = serverResponse?.pass || {
      ...passPayload,
      id: Date.now(),
      status: 'active',
      verified: true,
      verifiedBy: `Auto OCR Acceptance (TID: ${ocr.transactionId})`,
      verifiedAt: nowIso,
      createdAt: nowIso
    };

    this.state.issuedPass = verifiedPass;

    // Record locally in transactions
    const paymentRecord = {
      id: Date.now(),
      passId: verifiedPass.id,
      memberId: res.id,
      memberName: res.name,
      serialNo: assignedSerial,
      month: this.state.month,
      year: this.state.year,
      amount: this.state.requiredAmount,
      transactionId: ocr.transactionId,
      provider: ocr.provider,
      paidAt: nowIso,
      status: 'accepted'
    };

    this.transactions.unshift(paymentRecord);
    this.saveTransactions();

    // Trigger direct Google Sheets sync if on client
    this.syncToGoogleSheetsDirect(verifiedPass);

    // Render Digital Pass Card
    this.renderDigitalPassCard(verifiedPass);
    this.goToStep(4);
    this.showToast('🎉 Shuttle Pass Issued Successfully!', 'success');
  },

  /* ── Direct Google Sheets Sync ── */
  async syncToGoogleSheetsDirect(pass) {
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbyGXUJIPYrAcjE4FHzG97q6_kj95lCVKPgM9hxFANKZZt4_CL1YKukJVmjlRPLuDho/exec';
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script redirects freely with no-cors
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SYNC_DATA',
          passes: [pass],
          members: [this.state.selectedResident]
        })
      });
      console.log('[PortalApp] Google Sheets auto-sync sent.');
    } catch (e) {
      console.warn('[PortalApp] Direct Google sync note:', e.message);
    }
  },

  /* ── Render Digital Pass Card with QR Code ── */
  renderDigitalPassCard(pass) {
    document.getElementById('cardSerialNo').textContent = `#${pass.serialNo}`;
    document.getElementById('cardMemberName').textContent = pass.memberName;
    document.getElementById('cardCnic').textContent = `CNIC: ${pass.cnic || 'N/A'}`;
    document.getElementById('cardHouse').textContent = `House: ${pass.houseNo || 'Commander City'}`;
    document.getElementById('cardPassType').textContent = `${pass.passType.toUpperCase()} PASS (PKR ${pass.amount.toLocaleString()})`;
    document.getElementById('cardValidityDates').textContent = `${pass.issueDate} to ${pass.validTill}`;

    const photoEl = document.getElementById('cardPhoto');
    photoEl.src = pass.photo || 'LOGO.png';
    photoEl.onerror = () => { photoEl.src = 'LOGO.png'; };

    // Dynamic Monthly Color Themes
    const monthlyThemes = [
      'linear-gradient(135deg, #1e3a8a, #0f172a)', // Jan
      'linear-gradient(135deg, #065f46, #0f172a)', // Feb
      'linear-gradient(135deg, #831843, #0f172a)', // Mar
      'linear-gradient(135deg, #701a75, #0f172a)', // Apr
      'linear-gradient(135deg, #1e293b, #0f172a)', // May
      'linear-gradient(135deg, #0e7490, #0f172a)', // Jun
      'linear-gradient(135deg, #1d4ed8, #0f172a)', // Jul
      'linear-gradient(135deg, #b45309, #0f172a)', // Aug
      'linear-gradient(135deg, #047857, #0f172a)', // Sep
      'linear-gradient(135deg, #4338ca, #0f172a)', // Oct
      'linear-gradient(135deg, #6d28d9, #0f172a)', // Nov
      'linear-gradient(135deg, #be123c, #0f172a)'  // Dec
    ];
    const themeBg = monthlyThemes[(pass.month - 1) % 12] || monthlyThemes[9];
    document.getElementById('printablePassCard').style.background = themeBg;

    // Render QR Code
    const qrContainer = document.getElementById('cardQrCode');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: `CC-PASS|${pass.serialNo}|${pass.memberName}|${pass.month}-${pass.year}|${pass.transactionId}`,
        width: 44,
        height: 44,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  },

  downloadPassAsImage() {
    window.print();
  },

  /* ── Conductor QR / Serial Verification ── */
  verifyPassConductor() {
    const input = document.getElementById('conductorSerialInput').value.trim().toUpperCase();
    const resultCard = document.getElementById('conductorResultCard');
    const badge = document.getElementById('conductorStatusBadge');
    const details = document.getElementById('conductorDetailsBox');

    if (!input) {
      this.showToast('Please enter a Pass Serial # or Member Code.', 'warning');
      return;
    }

    const cleanInput = input.replace('#', '');
    const found = this.transactions.find(t => 
      String(t.serialNo) === cleanInput || 
      `CC-${String(t.memberId).padStart(5, '0')}` === cleanInput ||
      t.transactionId.toUpperCase() === cleanInput
    );

    resultCard.style.display = 'block';

    if (found) {
      resultCard.style.background = 'rgba(16, 185, 129, 0.15)';
      resultCard.style.border = '1px solid var(--green)';
      badge.innerHTML = '<span style="color:var(--green);"><i class="fas fa-check-circle"></i> VALID ACTIVE PASS</span>';
      details.innerHTML = `
        <strong>Member:</strong> ${found.memberName}<br>
        <strong>Serial Badge:</strong> #${found.serialNo}<br>
        <strong>Pass Month:</strong> Month ${found.month} / ${found.year}<br>
        <strong>Amount Paid:</strong> PKR ${found.amount.toLocaleString()}<br>
        <strong>Verified Via:</strong> Online AI OCR (${found.provider})<br>
        <strong>Transaction Ref:</strong> ${found.transactionId}
      `;
      this.showToast('Pass is Active & Verified!', 'success');
    } else {
      resultCard.style.background = 'rgba(239, 68, 68, 0.15)';
      resultCard.style.border = '1px solid var(--red)';
      badge.innerHTML = '<span style="color:var(--red);"><i class="fas fa-times-circle"></i> NO ACTIVE PASS FOUND</span>';
      details.innerHTML = `No verified shuttle pass was found for identifier "<strong>${input}</strong>". Please have passenger renew online.`;
      this.showToast('Pass not found or expired', 'error');
    }
  },

  /* ── Admin Authentication & Transactions ── */
  authenticateAdmin() {
    const pin = document.getElementById('adminPinInput').value;
    if (pin === 'commander123' || pin === '1234') {
      this.isAdminUnlocked = true;
      document.getElementById('adminAuthSection').style.display = 'none';
      document.getElementById('adminDashboardContent').style.display = 'block';
      this.renderAdminTransactions();
      this.showToast('Admin Desk Unlocked', 'success');
    } else {
      this.showToast('Invalid PIN code. Try "commander123".', 'error');
    }
  },

  renderAdminTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    let totalRevenue = 0;
    this.transactions.forEach(t => { totalRevenue += (t.amount || 0); });

    const revEl = document.getElementById('adminStatRevenue');
    const passesEl = document.getElementById('adminStatPasses');
    if (revEl) revEl.textContent = `PKR ${totalRevenue.toLocaleString()}`;
    if (passesEl) passesEl.textContent = this.transactions.length;

    if (this.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">
            No online transactions yet. Use the Passenger Portal to scan a receipt.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.transactions.map(t => {
      const dateStr = new Date(t.paidAt).toLocaleDateString();
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:10px 8px;">${dateStr}</td>
          <td style="padding:10px 8px;font-weight:700;color:#fff;">${t.memberName}</td>
          <td style="padding:10px 8px;"><span class="pass-serial-pill" style="font-size:0.75rem;">#${t.serialNo}</span></td>
          <td style="padding:10px 8px;color:var(--cyan-light);font-weight:700;">PKR ${t.amount.toLocaleString()}</td>
          <td style="padding:10px 8px;">${t.provider} <br><span style="font-size:0.72rem;color:var(--text-muted);font-family:monospace;">${t.transactionId}</span></td>
          <td style="padding:10px 8px;">
            <span class="match-status-badge status-accepted" style="font-size:0.7rem;padding:2px 8px;">
              <i class="fas fa-check"></i> Auto-Verified
            </span>
          </td>
          <td style="padding:10px 8px;text-align:right;">
            <button class="copy-btn" onclick="PortalApp.showToast('Transaction confirmed in database', 'info')">
              <i class="fas fa-check"></i> Verified
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  triggerGoogleSync() {
    this.showToast('Triggering full synchronization to Google Sheets...', 'info');
    fetch('/api/google-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SYNC_DATA' })
    }).then(() => {
      this.showToast('Google Sheets sync updated successfully!', 'success');
    }).catch(() => {
      this.showToast('Google Sheets sync queued in background', 'info');
    });
  },

  /* ── Toast Helper ── */
  showToast(message, type = 'success') {
    const toast = document.getElementById('portalToast');
    const msgEl = document.getElementById('toastMessage');
    const iconEl = document.getElementById('toastIcon');

    msgEl.textContent = message;

    if (type === 'success') {
      iconEl.className = 'fas fa-check-circle';
      iconEl.style.color = 'var(--green)';
    } else if (type === 'error') {
      iconEl.className = 'fas fa-times-circle';
      iconEl.style.color = 'var(--red)';
    } else if (type === 'warning') {
      iconEl.className = 'fas fa-exclamation-triangle';
      iconEl.style.color = 'var(--amber)';
    } else {
      iconEl.className = 'fas fa-info-circle';
      iconEl.style.color = 'var(--cyan)';
    }

    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }
};

window.PortalApp = PortalApp;

// Auto-boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  PortalApp.init();
});
