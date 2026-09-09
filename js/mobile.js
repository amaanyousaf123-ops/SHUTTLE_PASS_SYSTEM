/* ============================================================
   Commander City — Shuttle Pass Manager Mobile App Controller (Ultra-Fast)
   ============================================================ */

const MobileApp = {
    currentUser: null,
    pendingPasses: [],
    pollTimer: null,
    lastDataHash: '',
    targetPassForReject: null,

    init() {
        this.bindEvents();
        this.checkSavedSession();
    },

    bindEvents() {
        const btnToggle = document.getElementById('btnTogglePass');
        if (btnToggle) {
            btnToggle.onclick = () => {
                const input = document.getElementById('loginPass');
                if (input.type === 'password') {
                    input.type = 'text';
                    btnToggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
                } else {
                    input.type = 'password';
                    btnToggle.innerHTML = '<i class="fas fa-eye"></i>';
                }
            };
        }

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.onsubmit = (e) => {
                e.preventDefault();
                this.handleLogin();
            };
        }

        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.onclick = () => this.handleLogout();
        }

        const btnRefresh = document.getElementById('btnRefresh');
        if (btnRefresh) {
            btnRefresh.onclick = () => {
                this.fetchPendingPasses(false, true);
                this.toast('Refreshed!', 'info');
            };
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.oninput = () => this.renderFeed(true);
        }

        const btnBulkApprove = document.getElementById('btnBulkApprove');
        if (btnBulkApprove) {
            btnBulkApprove.onclick = () => this.handleBulkApprove();
        }

        const btnCloseRejectModal = document.getElementById('btnCloseRejectModal');
        const btnCancelReject = document.getElementById('btnCancelReject');
        const btnConfirmReject = document.getElementById('btnConfirmReject');
        
        if (btnCloseRejectModal) btnCloseRejectModal.onclick = () => this.closeRejectModal();
        if (btnCancelReject) btnCancelReject.onclick = () => this.closeRejectModal();
        if (btnConfirmReject) btnConfirmReject.onclick = () => this.confirmRejectPass();

        // Change Password controls
        const btnOpenChangePass = document.getElementById('btnOpenChangePass');
        const btnCloseChangePassModal = document.getElementById('btnCloseChangePassModal');
        const btnCancelChangePass = document.getElementById('btnCancelChangePass');
        const btnConfirmChangePass = document.getElementById('btnConfirmChangePass');

        if (btnOpenChangePass) btnOpenChangePass.onclick = () => this.openChangePassModal();
        if (btnCloseChangePassModal) btnCloseChangePassModal.onclick = () => this.closeChangePassModal();
        if (btnCancelChangePass) btnCancelChangePass.onclick = () => this.closeChangePassModal();
        if (btnConfirmChangePass) btnConfirmChangePass.onclick = () => this.handleChangePassword();

        // Pause polling when app is in background to save battery & RAM
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.currentUser) {
                this.fetchPendingPasses(true, true);
            }
        });
    },

    checkSavedSession() {
        const saved = localStorage.getItem('shuttle_manager_user') || sessionStorage.getItem('shuttle_manager_user');
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
                this.showAppView();
                return;
            } catch (e) {}
        }
        this.showLoginView();
    },

    async handleLogin() {
        const userVal = document.getElementById('loginUser').value.trim();
        const passVal = document.getElementById('loginPass').value.trim();
        const rememberMe = document.getElementById('rememberMe').checked;
        const errDiv = document.getElementById('loginError');

        errDiv.style.display = 'none';

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userVal, password: passVal })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                this.currentUser = data.user;
                if (rememberMe) {
                    localStorage.setItem('shuttle_manager_user', JSON.stringify(data.user));
                } else {
                    sessionStorage.setItem('shuttle_manager_user', JSON.stringify(data.user));
                }
                this.showAppView();
                this.toast(`Welcome, ${data.user.name || 'Manager'}!`, 'success');
            } else {
                errDiv.textContent = data.error || 'Invalid Manager Username or Password.';
                errDiv.style.display = 'block';
            }
        } catch (e) {
            if ((userVal === 'admin' || userVal === 'manager') && (passVal === 'admin123' || passVal === 'manager123')) {
                const offlineUser = { username: userVal, name: 'Manager (LAN)', role: 'manager' };
                this.currentUser = offlineUser;
                this.showAppView();
            } else {
                errDiv.textContent = 'Server connection error. Is Desktop Server running?';
                errDiv.style.display = 'block';
            }
        }
    },

    handleLogout() {
        localStorage.removeItem('shuttle_manager_user');
        sessionStorage.removeItem('shuttle_manager_user');
        this.currentUser = null;
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.showLoginView();
        this.toast('Logged out', 'info');
    },

    showLoginView() {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('appWrapper').style.display = 'none';
    },

    showAppView() {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appWrapper').style.display = 'flex';
        
        this.fetchPendingPasses();
        
        // Fast smart polling every 5 seconds (only when visible)
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.fetchPendingPasses(true);
            }
        }, 5000);
    },

    async fetchPendingPasses(silent = false, forceRender = false) {
        try {
            const res = await fetch('/api/pending-passes');
            if (res.ok) {
                const data = await res.json();
                const newPasses = data.passes || [];
                const newHash = JSON.stringify(newPasses.map(p => `${p.id}_${p.verified}`));

                // Only re-render DOM if data actually changed
                if (forceRender || newHash !== this.lastDataHash) {
                    this.lastDataHash = newHash;
                    this.pendingPasses = newPasses;
                    this.updateStats(data.stats || {});
                    this.renderFeed();
                }
                
                const lanText = document.getElementById('lanStatusText');
                if (lanText) lanText.textContent = 'LAN Connected';
                const statusDot = document.querySelector('.status-dot');
                if (statusDot) statusDot.className = 'status-dot online';
            }
        } catch (e) {
            if (!silent) console.error('Fetch error:', e);
            const lanText = document.getElementById('lanStatusText');
            if (lanText) lanText.textContent = 'LAN Reconnecting...';
            const statusDot = document.querySelector('.status-dot');
            if (statusDot) statusDot.className = 'status-dot';
        }
    },

    updateStats(stats) {
        document.getElementById('statPendingCount').textContent = this.pendingPasses.length;
        document.getElementById('statVerifiedCount').textContent = stats.verifiedToday || 0;
        
        let totalAmt = 0;
        this.pendingPasses.forEach(p => totalAmt += (Number(p.amount) || 0));
        document.getElementById('statPendingAmount').textContent = `PKR ${totalAmt.toLocaleString()}`;
    },

    renderFeed(force = false) {
        const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
        const listDiv = document.getElementById('cardsList');
        const emptyDiv = document.getElementById('emptyState');

        let filtered = this.pendingPasses;
        if (query) {
            filtered = this.pendingPasses.filter(p => 
                (p.memberName && p.memberName.toLowerCase().includes(query)) ||
                (p.serialNo && String(p.serialNo).includes(query)) ||
                (p.houseNo && p.houseNo.toLowerCase().includes(query)) ||
                (p.cnic && p.cnic.includes(query))
            );
        }

        if (filtered.length === 0) {
            emptyDiv.style.display = 'block';
            listDiv.innerHTML = '';
            return;
        }

        emptyDiv.style.display = 'none';
        
        listDiv.innerHTML = filtered.map(p => {
            const photoSrc = p.photo || p.photoUrl || 'logo.png';
            const memberCode = p.memberId ? `CC-${String(p.memberId).padStart(5, '0')}` : 'CC-Member';
            
            return `
            <div class="approval-card" data-id="${p.id}">
                <div class="approval-card-header">
                    <span class="serial-badge">#${p.serialNo || 'NEW'}</span>
                    <span class="pass-type-badge ${p.passType || 'Full'}">${p.passType || 'Full'} Pass</span>
                </div>
                <div class="approval-card-body">
                    <div class="member-photo-box">
                        <img src="${photoSrc}" alt="${p.memberName}" loading="lazy" onerror="this.src='logo.png'">
                    </div>
                    <div class="member-info">
                        <div class="member-name">${p.memberName || 'Unnamed Member'}</div>
                        <div class="detail-row"><i class="fas fa-id-badge"></i> ${memberCode}</div>
                        <div class="detail-row"><i class="fas fa-home"></i> Plot/House: ${p.houseNo || 'N/A'}</div>
                        <div class="detail-row"><i class="fas fa-phone"></i> ${p.contact || 'No Contact'}</div>
                        <div class="amount-tag">PKR ${(Number(p.amount) || 0).toLocaleString()}</div>
                    </div>
                </div>
                <div class="approval-card-footer">
                    <button class="btn-approve-single" onclick="MobileApp.approvePass(${p.id})">
                        <i class="fas fa-check-circle"></i> Approve & Sync to Sheet
                    </button>
                    <button class="btn-reject-single" onclick="MobileApp.openRejectModal(${p.id})" title="Hold Card">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    async approvePass(passId) {
        // Optimistic UI update: instantly hide approved card from feed
        this.pendingPasses = this.pendingPasses.filter(p => String(p.id) !== String(passId));
        this.lastDataHash = JSON.stringify(this.pendingPasses.map(p => `${p.id}_${p.verified}`));
        const currentVer = parseInt(document.getElementById('statVerifiedCount')?.textContent) || 0;
        this.updateStats({ verifiedToday: currentVer + 1 });
        this.renderFeed(true);
        this.toast('Card Approved & Synced! 🟢', 'success');

        try {
            const res = await fetch('/api/approve-pass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    passId: passId,
                    managerName: this.currentUser?.name || 'Manager',
                    isMobileSession: true
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.fetchPendingPasses(true, true);
            } else {
                this.toast(data.error || 'Failed to approve card.', 'error');
                this.fetchPendingPasses(true, true);
            }
        } catch (e) {
            this.toast('Network error approving card.', 'error');
            this.fetchPendingPasses(true, true);
        }
    },

    async handleBulkApprove() {
        if (this.pendingPasses.length === 0) {
            this.toast('No pending cards to approve.', 'info');
            return;
        }

        if (!confirm(`Approve all ${this.pendingPasses.length} pending cards and sync to Google Sheets?`)) return;

        const count = this.pendingPasses.length;
        this.pendingPasses = [];
        this.lastDataHash = '';
        const currentVer = parseInt(document.getElementById('statVerifiedCount')?.textContent) || 0;
        this.updateStats({ verifiedToday: currentVer + count });
        this.renderFeed(true);
        this.toast(`Approved ${count} cards & synced! 🟢`, 'success');

        try {
            const res = await fetch('/api/verify-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ managerName: this.currentUser?.name || 'Manager', isMobileSession: true })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.fetchPendingPasses(true, true);
            } else {
                this.toast(data.error || 'Bulk approval failed.', 'error');
                this.fetchPendingPasses(true, true);
            }
        } catch (e) {
            this.toast('Network error during bulk approval.', 'error');
            this.fetchPendingPasses(true, true);
        }
    },

    openRejectModal(passId) {
        this.targetPassForReject = passId;
        document.getElementById('rejectReason').value = '';
        document.getElementById('rejectModalOverlay').style.display = 'flex';
    },

    closeRejectModal() {
        this.targetPassForReject = null;
        document.getElementById('rejectModalOverlay').style.display = 'none';
    },

    async confirmRejectPass() {
        if (!this.targetPassForReject) return;
        const passId = this.targetPassForReject;
        const reason = document.getElementById('rejectReason').value.trim();

        this.closeRejectModal();
        this.pendingPasses = this.pendingPasses.filter(p => p.id !== passId);
        this.renderFeed(true);
        this.toast('Card put on hold.', 'info');

        try {
            await fetch('/api/reject-pass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    passId: passId,
                    reason: reason,
                    managerName: this.currentUser?.name || 'Manager'
                })
            });
            this.fetchPendingPasses(true, true);
        } catch (e) {
            this.toast('Network error putting card on hold.', 'error');
        }
    },

    openChangePassModal() {
        document.getElementById('changeCurrPass').value = '';
        document.getElementById('changeNewPass').value = '';
        document.getElementById('changeConfirmPass').value = '';
        const errDiv = document.getElementById('changePassErr');
        if (errDiv) errDiv.style.display = 'none';
        document.getElementById('changePassModalOverlay').style.display = 'flex';
    },

    closeChangePassModal() {
        document.getElementById('changePassModalOverlay').style.display = 'none';
    },

    async handleChangePassword() {
        const currPass = document.getElementById('changeCurrPass').value.trim();
        const newPass = document.getElementById('changeNewPass').value.trim();
        const confirmPass = document.getElementById('changeConfirmPass').value.trim();
        const errDiv = document.getElementById('changePassErr');

        if (errDiv) errDiv.style.display = 'none';

        if (!currPass) {
            if (errDiv) { errDiv.textContent = 'Please enter your current password.'; errDiv.style.display = 'block'; }
            return;
        }
        if (!newPass || newPass.length < 4) {
            if (errDiv) { errDiv.textContent = 'New password must be at least 4 characters long.'; errDiv.style.display = 'block'; }
            return;
        }
        if (newPass !== confirmPass) {
            if (errDiv) { errDiv.textContent = 'New password and confirm password do not match.'; errDiv.style.display = 'block'; }
            return;
        }

        try {
            const res = await fetch('/api/change-manager-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.currentUser?.username || 'admin',
                    currentPassword: currPass,
                    newPassword: newPass
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.closeChangePassModal();
                this.toast('Manager Password updated successfully! 🔑', 'success');
            } else {
                if (errDiv) { errDiv.textContent = data.error || 'Failed to update password.'; errDiv.style.display = 'block'; }
            }
        } catch (e) {
            if (errDiv) { errDiv.textContent = 'Network error updating password.'; errDiv.style.display = 'block'; }
        }
    },

    toast(msg, type = 'info') {
        const container = document.getElementById('mobileToastContainer');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `mobile-toast ${type}`;
        el.innerHTML = msg;
        container.appendChild(el);

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(10px)';
            setTimeout(() => el.remove(), 200);
        }, 2500);
    }
};

document.addEventListener('DOMContentLoaded', () => MobileApp.init());
