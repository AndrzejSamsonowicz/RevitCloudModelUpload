// Initialize Firebase
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let authToken = null;
let allUsers = [];
let allLicenses = [];
let allAnalytics = [];

const serverURL = window.location.origin;

// Check admin authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        // Not logged in - redirect to login
        window.location.replace('/login');
        return;
    }
    
    try {
        // Check if user is admin in Firestore users collection
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists || !userDoc.data().isAdmin) {
            // User is authenticated but NOT an admin - deny access
            console.warn('Access denied: User is not an admin');
            await auth.signOut();
            window.location.replace('/login');
            return;
        }
        
        // User is verified admin - grant access
        currentUser = user;
        authToken = await user.getIdToken();
        document.getElementById('adminEmail').textContent = user.email;
        
        // Load all data
        await loadAllData();
        
        // Initialize event listeners after DOM is ready
        initializeEventListeners();
        
    } catch (error) {
        console.error('Admin check error:', error);
        // Error verifying admin status - deny access for security
        await auth.signOut();
        window.location.replace('/login');
    }
});

// Initialize event listeners
function initializeEventListeners() {
    // Header buttons
    const goToAppBtn = document.getElementById('goToAppBtn');
    if (goToAppBtn) {
        goToAppBtn.addEventListener('click', () => window.location.href = '/');
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Tab buttons
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            if (tabName) switchTab(tabName);
        });
    });
    
    // User management buttons
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    if (resetPasswordBtn) {
        resetPasswordBtn.addEventListener('click', resetPasswordSelectedUser);
    }
    
    const verifyUsersBtn = document.getElementById('verifyUsersBtn');
    if (verifyUsersBtn) {
        verifyUsersBtn.addEventListener('click', verifySelectedUsers);
    }
    
    const deleteUsersBtn = document.getElementById('deleteUsersBtn');
    if (deleteUsersBtn) {
        deleteUsersBtn.addEventListener('click', deleteSelectedUsers);
    }
    
    const fixEmailsBtn = document.getElementById('fixEmailsBtn');
    if (fixEmailsBtn) {
        fixEmailsBtn.addEventListener('click', fixUserEmails);
    }
    
    // Refresh buttons
    document.querySelectorAll('.refresh-btn').forEach(btn => {
        btn.addEventListener('click', refreshData);
    });
    
    const analyticsRefreshBtn = document.getElementById('analyticsRefreshBtn');
    if (analyticsRefreshBtn) {
        analyticsRefreshBtn.addEventListener('click', loadAnalytics);
    }
    
    // Modal buttons
    const revokeModalCancelBtn = document.getElementById('revokeModalCancelBtn');
    if (revokeModalCancelBtn) {
        revokeModalCancelBtn.addEventListener('click', () => closeModal('revokeModal'));
    }
    
    const revokeModalConfirmBtn = document.getElementById('revokeModalConfirmBtn');
    if (revokeModalConfirmBtn) {
        revokeModalConfirmBtn.addEventListener('click', confirmRevoke);
    }
    
    const extendModalCancelBtn = document.getElementById('extendModalCancelBtn');
    if (extendModalCancelBtn) {
        extendModalCancelBtn.addEventListener('click', () => closeModal('extendModal'));
    }
    
    const extendModalConfirmBtn = document.getElementById('extendModalConfirmBtn');
    if (extendModalConfirmBtn) {
        extendModalConfirmBtn.addEventListener('click', confirmExtend);
    }
    
    const activateModalCancelBtn = document.getElementById('activateModalCancelBtn');
    if (activateModalCancelBtn) {
        activateModalCancelBtn.addEventListener('click', () => closeModal('activateModal'));
    }
    
    const activateModalConfirmBtn = document.getElementById('activateModalConfirmBtn');
    if (activateModalConfirmBtn) {
        activateModalConfirmBtn.addEventListener('click', confirmActivate);
    }
    
    const deactivateModalCancelBtn = document.getElementById('deactivateModalCancelBtn');
    if (deactivateModalCancelBtn) {
        deactivateModalCancelBtn.addEventListener('click', () => closeModal('deactivateModal'));
    }
    
    const deactivateModalConfirmBtn = document.getElementById('deactivateModalConfirmBtn');
    if (deactivateModalConfirmBtn) {
        deactivateModalConfirmBtn.addEventListener('click', confirmDeactivate);
    }
    
    const deleteCancelBtn = document.getElementById('deleteCancelBtn');
    if (deleteCancelBtn) {
        deleteCancelBtn.addEventListener('click', () => closeModal('deleteUsersModal'));
    }
    
    const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', confirmDeleteUsers);
    }
    
    const resetPasswordCancelBtn = document.getElementById('resetPasswordCancelBtn');
    if (resetPasswordCancelBtn) {
        resetPasswordCancelBtn.addEventListener('click', () => closeModal('resetPasswordModal'));
    }
    
    const resetPasswordConfirmBtn = document.getElementById('resetPasswordConfirmBtn');
    if (resetPasswordConfirmBtn) {
        resetPasswordConfirmBtn.addEventListener('click', confirmResetPassword);
    }
    
    const generatePasswordBtn = document.getElementById('generatePasswordBtn');
    if (generatePasswordBtn) {
        generatePasswordBtn.addEventListener('click', generateRandomPassword);
    }
    
    // Filter inputs
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', filterUsers);
    }
    
    const verificationFilter = document.getElementById('verificationFilter');
    if (verificationFilter) {
        verificationFilter.addEventListener('change', filterUsers);
    }
    
    const licenseSearch = document.getElementById('licenseSearch');
    if (licenseSearch) {
        licenseSearch.addEventListener('input', filterLicenses);
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', filterLicenses);
    }
    
    // Close modals on outside click
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.remove('active');
        }
    });
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadUsers(),
        loadLicenses(),
        loadAnalytics()
    ]);
    updateStats();
    checkAlerts();
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch(`${serverURL}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            allUsers = data.users || [];
            renderUsers();
        } else {
            throw new Error('Failed to load users');
        }
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableContainer').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Error loading users</p></div>';
    }
}

// Load licenses
async function loadLicenses() {
    try {
        const response = await fetch(`${serverURL}/api/admin/licenses`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            allLicenses = data.licenses || [];
            renderLicenses();
        } else {
            throw new Error('Failed to load licenses');
        }
    } catch (error) {
        console.error('Load licenses error:', error);
        document.getElementById('licensesTableContainer').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Error loading licenses</p></div>';
    }
}

// Load analytics
async function loadAnalytics() {
    try {
        const days = document.getElementById('analyticsRange')?.value || 30;
        const response = await fetch(`${serverURL}/api/admin/analytics?days=${days}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            allAnalytics = data.analytics || [];
            renderAnalytics();
        } else {
            throw new Error('Failed to load analytics');
        }
    } catch (error) {
        console.error('Load analytics error:', error);
        document.getElementById('analyticsContainer').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Error loading analytics</p></div>';
    }
}

// Render users table
function renderUsers(filtered = null) {
    const users = filtered || allUsers;
    const container = document.getElementById('usersTableContainer');
    
    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No users found</p></div>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th style="width: 40px;"><input type="checkbox" id="selectAllUsers"></th>
                    <th>Email</th>
                    <th>License Key</th>
                    <th>Status</th>
                    <th>Expiry</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach(user => {
        const expiryDate = user.licenseExpiry ? new Date(user.licenseExpiry) : null;
        const isExpired = expiryDate && expiryDate < new Date();
        const statusClass = user.emailVerified ? 'badge-active' : 'badge-pending';
        const statusText = user.emailVerified ? 'Verified' : 'Unverified';
        
        html += `
            <tr>
                <td><input type="checkbox" class="user-checkbox" data-user-id="${user.userId}" data-user-email="${user.email}"></td>
                <td><strong>${user.email}</strong></td>
                <td><code>${user.licenseKey || 'N/A'}</code></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${expiryDate ? formatDate(expiryDate) : 'N/A'} ${isExpired ? '<span class="badge badge-expired">Expired</span>' : ''}</td>
                <td>${user.lastLogin ? formatDate(new Date(user.lastLogin)) : 'Never'}</td>
                <td>${formatDate(new Date(user.createdAt))}</td>
                <td>
                    ${!user.licenseKey ? 
                        `<button class="btn btn-success btn-sm activate-license-btn" data-user-id="${user.userId}" data-email="${user.email}">Activate License</button>` : 
                        `<button class="btn btn-warning btn-sm deactivate-license-btn" data-user-id="${user.userId}" data-email="${user.email}" data-license-key="${user.licenseKey}">Deactivate License</button>`}
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Re-attach event listeners for dynamically created elements
    attachUserTableListeners();
}

// Attach event listeners to user table elements
function attachUserTableListeners() {
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => toggleAllUsers(e.target.checked));
    }
    
    const userCheckboxes = document.querySelectorAll('.user-checkbox');
    userCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateDeleteButton);
    });
    
    const activateLicenseBtns = document.querySelectorAll('.activate-license-btn');
    activateLicenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-user-id');
            const email = e.target.getAttribute('data-email');
            activateUserLicense(userId, email);
        });
    });
    
    const deactivateLicenseBtns = document.querySelectorAll('.deactivate-license-btn');
    deactivateLicenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-user-id');
            const email = e.target.getAttribute('data-email');
            const licenseKey = e.target.getAttribute('data-license-key');
            deactivateUserLicense(userId, email, licenseKey);
        });
    });
}

// Render licenses table
function renderLicenses(filtered = null) {
    const licenses = filtered || allLicenses;
    const container = document.getElementById('licensesTableContainer');
    
    // Only show active licenses (current/present licenses)
    const activeLicensesOnly = licenses.filter(l => l.status === 'active');
    
    if (activeLicensesOnly.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎫</div><p>No active licenses found</p></div>';
        return;
    }
    
    const LICENSE_PRICE = 900;
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>License Key</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Purchase Date</th>
                    <th>Expiry Date</th>
                    <th>Amount</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    activeLicensesOnly.forEach(license => {
        const expiryDate = license.expiryDate ? new Date(license.expiryDate) : null;
        const daysLeft = expiryDate ? Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
        
        html += `
            <tr>
                <td><code>${license.licenseKey}</code></td>
                <td>${license.email}</td>
                <td><span class="badge badge-active">Active</span></td>
                <td>${license.purchaseDate ? formatDate(new Date(license.purchaseDate)) : 'N/A'}</td>
                <td>
                    ${expiryDate ? formatDate(expiryDate) : 'N/A'}
                    ${daysLeft !== null && daysLeft > 0 && daysLeft < 30 ? 
                        `<br><small style="color: #ffc107;">(${daysLeft} days left)</small>` : ''}
                </td>
                <td>€${LICENSE_PRICE}</td>
                <td>
                    <button class="btn btn-danger btn-sm revoke-license-btn" data-license-key="${license.licenseKey}" data-email="${license.email}">Revoke</button>
                    <button class="btn btn-warning btn-sm extend-license-btn" data-license-key="${license.licenseKey}" data-expiry="${expiryDate}">Extend</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Re-attach event listeners for dynamically created elements
    attachLicenseTableListeners();
}

// Attach event listeners to license table elements
function attachLicenseTableListeners() {
    const revokeLicenseBtns = document.querySelectorAll('.revoke-license-btn');
    revokeLicenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const licenseKey = e.target.getAttribute('data-license-key');
            const email = e.target.getAttribute('data-email');
            revokeLicense(licenseKey, email);
        });
    });
    
    const extendLicenseBtns = document.querySelectorAll('.extend-license-btn');
    extendLicenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const licenseKey = e.target.getAttribute('data-license-key');
            const currentExpiry = e.target.getAttribute('data-expiry');
            extendLicense(licenseKey, currentExpiry);
        });
    });
}

// Render payments
function renderPayments() {
    const container = document.getElementById('paymentsTableContainer');
    const paidLicenses = allLicenses.filter(l => l.status !== 'pending');
    
    if (paidLicenses.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><p>No payments found</p></div>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Email</th>
                    <th>License Key</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>PayPal Order ID</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    paidLicenses.forEach(license => {
        html += `
            <tr>
                <td>${formatDate(new Date(license.purchaseDate))}</td>
                <td>${license.email}</td>
                <td><code>${license.licenseKey}</code></td>
                <td><strong>€${license.price}</strong></td>
                <td><span class="badge badge-active">Completed</span></td>
                <td><small>${license.paypalOrderId || 'N/A'}</small></td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Render analytics
function renderAnalytics() {
    const container = document.getElementById('analyticsContainer');
    
    if (allAnalytics.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No analytics data available</p></div>';
        return;
    }
    
    // Group by action
    const actionCounts = {};
    allAnalytics.forEach(a => {
        actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    });
    
    let html = '<h3 style="margin-bottom: 20px;">Activity Summary</h3>';
    html += '<table><thead><tr><th>Action</th><th>Count</th></tr></thead><tbody>';
    
    Object.entries(actionCounts).forEach(([action, count]) => {
        html += `<tr><td>${action}</td><td><strong>${count}</strong></td></tr>`;
    });
    
    html += '</tbody></table>';
    
    html += '<h3 style="margin-top: 30px; margin-bottom: 20px;">Recent Activity</h3>';
    html += '<table><thead><tr><th>Timestamp</th><th>User</th><th>Action</th></tr></thead><tbody>';
    
    allAnalytics.slice(0, 50).forEach(a => {
        html += `
            <tr>
                <td>${formatDate(new Date(a.timestamp))}</td>
                <td>${a.metadata?.email || a.userId || 'N/A'}</td>
                <td>${a.action}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Update stats
function updateStats() {
    document.getElementById('totalUsers').textContent = allUsers.length;
    
    const activeLicenses = allLicenses.filter(l => l.status === 'active').length;
    document.getElementById('activeLicenses').textContent = activeLicenses;
    
    // Calculate revenue: €900 per active license (excluding admin licenses)
    const LICENSE_PRICE = 900;
    const paidLicenses = allLicenses.filter(l => l.status === 'active').length;
    const totalRevenue = paidLicenses * LICENSE_PRICE;
    document.getElementById('totalRevenue').textContent = `€${totalRevenue.toLocaleString()}`;
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = allLicenses.filter(l => {
        if (l.status !== 'active' || !l.expiryDate) return false;
        const expiry = new Date(l.expiryDate);
        return expiry > now && expiry <= thirtyDaysFromNow;
    }).length;
    document.getElementById('expiringSoon').textContent = expiringSoon;
    
    const unpaid = allLicenses.filter(l => l.status === 'pending').length;
    document.getElementById('unpaidOrders').textContent = unpaid;
}

// Check and display alerts
function checkAlerts() {
    const alertsSection = document.getElementById('alertsSection');
    let alerts = '';
    
    const unpaid = allLicenses.filter(l => l.status === 'pending');
    if (unpaid.length > 0) {
        alerts += `
            <div class="section">
                <div class="section-body">
                    <div class="alert alert-warning">
                        <span style="font-size: 24px;">⚠️</span>
                        <div>
                            <strong>${unpaid.length} Unpaid Order${unpaid.length > 1 ? 's' : ''}</strong>
                            <p style="margin-top: 5px;">Customer${unpaid.length > 1 ? 's' : ''} started checkout but didn't complete payment.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiring = allLicenses.filter(l => {
        if (l.status !== 'active' || !l.expiryDate) return false;
        const expiry = new Date(l.expiryDate);
        return expiry > now && expiry <= thirtyDaysFromNow;
    });
    
    if (expiring.length > 0) {
        alerts += `
            <div class="section">
                <div class="section-body">
                    <div class="alert alert-warning">
                        <span style="font-size: 24px;">📅</span>
                        <div>
                            <strong>${expiring.length} License${expiring.length > 1 ? 's' : ''} Expiring Soon</strong>
                            <p style="margin-top: 5px;">Send renewal reminders to: ${expiring.map(l => l.email).join(', ')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    alertsSection.innerHTML = alerts;
}

// Tab switching
function switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(tab + 'Tab').style.display = 'block';
    
    // Render specific content
    if (tab === 'payments') {
        renderPayments();
    }
}

// Filter functions
function filterUsers() {
    const search = document.getElementById('userSearch').value.toLowerCase();
    const verificationFilter = document.getElementById('verificationFilter').value;
    
    let filtered = allUsers;
    
    if (search) {
        filtered = filtered.filter(u => u.email.toLowerCase().includes(search));
    }
    
    if (verificationFilter === 'verified') {
        filtered = filtered.filter(u => u.emailVerified);
    } else if (verificationFilter === 'unverified') {
        filtered = filtered.filter(u => !u.emailVerified);
    }
    
    renderUsers(filtered);
}

function filterLicenses() {
    const search = document.getElementById('licenseSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filtered = allLicenses;
    
    // Always show only active licenses
    filtered = filtered.filter(l => l.status === 'active');
    
    if (search) {
        filtered = filtered.filter(l => 
            l.email.toLowerCase().includes(search) || 
            l.licenseKey.toLowerCase().includes(search)
        );
    }
    
    renderLicenses(filtered);
}

// Revoke license
let currentRevokeLicense = null;
function revokeLicense(licenseKey, email) {
    currentRevokeLicense = licenseKey;
    document.getElementById('revokeKey').textContent = licenseKey;
    document.getElementById('revokeEmail').textContent = email;
    document.getElementById('revokeModal').classList.add('active');
}

async function confirmRevoke() {
    try {
        const response = await fetch(`${serverURL}/api/admin/revoke-license`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ licenseKey: currentRevokeLicense })
        });
        
        if (response.ok) {
            alert('License revoked successfully');
            closeModal('revokeModal');
            await refreshData();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Revoke error:', error);
        alert('Failed to revoke license');
    }
}

// Extend license
let currentExtendLicense = null;
function extendLicense(licenseKey, currentExpiry) {
    currentExtendLicense = licenseKey;
    document.getElementById('extendKey').textContent = licenseKey;
    document.getElementById('extendCurrentExpiry').textContent = formatDate(new Date(currentExpiry));
    document.getElementById('extendModal').classList.add('active');
}

async function confirmExtend() {
    try {
        const days = parseInt(document.getElementById('extendDuration').value);
        const license = allLicenses.find(l => l.licenseKey === currentExtendLicense);
        const currentExpiry = new Date(license.expiryDate);
        const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
        
        // Update in Firestore directly
        await db.collection('licenses').doc(currentExtendLicense).update({
            expiryDate: firebase.firestore.Timestamp.fromDate(newExpiry)
        });
        
        // Also update user document
        if (license.userId) {
            await db.collection('users').doc(license.userId).update({
                licenseExpiry: firebase.firestore.Timestamp.fromDate(newExpiry)
            });
        }
        
        alert(`License extended successfully!\nNew expiry: ${formatDate(newExpiry)}`);
        closeModal('extendModal');
        await refreshData();
        
    } catch (error) {
        console.error('Extend error:', error);
        alert('Failed to extend license');
    }
}

// Manual license activation
let currentActivateUser = null;
function activateUserLicense(userId, email) {
    currentActivateUser = userId;
    document.getElementById('activateEmail').textContent = email;
    document.getElementById('activateModal').classList.add('active');
}

async function confirmActivate() {
    try {
        const days = parseInt(document.getElementById('activateDuration').value);
        
        // Call server endpoint to activate license
        const response = await fetch(`${serverURL}/api/admin/activate-license`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ 
                userId: currentActivateUser,
                days: days
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`License activated successfully!\nKey: ${data.licenseKey}\nExpiry: ${new Date(data.expiryDate).toLocaleDateString()}`);
            closeModal('activateModal');
            await refreshData();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Activation error:', error);
        alert('Failed to activate license: ' + error.message);
    }
}

// Deactivate license
let currentDeactivateUser = null;
let currentDeactivateLicenseKey = null;
function deactivateUserLicense(userId, email, licenseKey) {
    currentDeactivateUser = userId;
    currentDeactivateLicenseKey = licenseKey;
    document.getElementById('deactivateEmail').textContent = email;
    document.getElementById('deactivateKey').textContent = licenseKey;
    document.getElementById('deactivateModal').classList.add('active');
}

async function confirmDeactivate() {
    try {
        const response = await fetch(`${serverURL}/api/admin/deactivate-license`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ 
                userId: currentDeactivateUser,
                licenseKey: currentDeactivateLicenseKey
            })
        });
        
        if (response.ok) {
            alert('License deactivated successfully!');
            closeModal('deactivateModal');
            await refreshData();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Deactivation error:', error);
        alert('Failed to deactivate license: ' + error.message);
    }
}

// Modal helpers
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Refresh data
async function refreshData() {
    await loadAllData();
}

// Format date helper
function formatDate(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Toggle all user checkboxes
function toggleAllUsers(checked) {
    document.querySelectorAll('.user-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    updateDeleteButton();
}

// Update delete and verify button visibility
function updateDeleteButton() {
    const selectedCount = document.querySelectorAll('.user-checkbox:checked').length;
    const deleteBtn = document.getElementById('deleteUsersBtn');
    const verifyBtn = document.getElementById('verifyUsersBtn');
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    
    if (selectedCount > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `🗑️ Delete Selected (${selectedCount})`;
        verifyBtn.style.display = 'block';
        verifyBtn.textContent = `✓ Verify Email (${selectedCount})`;
        
        // Show reset password button only if exactly 1 user is selected
        if (selectedCount === 1) {
            resetPasswordBtn.style.display = 'block';
            resetPasswordBtn.textContent = '🔑 Reset Password';
        } else {
            resetPasswordBtn.style.display = 'none';
        }
    } else {
        deleteBtn.style.display = 'none';
        verifyBtn.style.display = 'none';
        resetPasswordBtn.style.display = 'none';
    }
}

// Verify email for selected users
async function verifySelectedUsers() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one user to verify');
        return;
    }
    
    const userIds = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-user-id'));
    const emails = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-user-email'));
    
    if (!confirm(`Are you sure you want to manually verify email for ${userIds.length} user(s)?\n\n${emails.join('\n')}`)) {
        return;
    }
    
    // Ensure we have a fresh token
    if (!currentUser) {
        alert('Session expired. Please refresh the page.');
        return;
    }
    
    try {
        const token = await currentUser.getIdToken(true);
        let successCount = 0;
        let errorCount = 0;
        
        // Verify each user
        for (const userId of userIds) {
            try {
                const response = await fetch(`${serverURL}/api/admin/verify-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ userId })
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error('Error verifying user:', userId, error);
                errorCount++;
            }
        }
        
        if (successCount > 0) {
            alert(`✅ Successfully verified ${successCount} user(s)`);
            await refreshData();
        }
        
        if (errorCount > 0) {
            alert(`⚠️ Failed to verify ${errorCount} user(s)`);
        }
        
    } catch (error) {
        console.error('Verify users error:', error);
        alert('❌ Error verifying users: ' + error.message);
    }
}

// Reset password for selected user (only works with 1 user)
function resetPasswordSelectedUser() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select a user to reset password');
        return;
    }
    
    if (selectedCheckboxes.length > 1) {
        alert('Please select only ONE user to reset password');
        return;
    }
    
    const checkbox = selectedCheckboxes[0];
    const userId = checkbox.getAttribute('data-user-id');
    const email = checkbox.getAttribute('data-user-email');
    
    // Store in global variable for later use
    window.resetPasswordUserId = userId;
    
    // Reset form
    document.getElementById('resetPasswordEmail').textContent = email;
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('resetPasswordForm').style.display = 'block';
    document.getElementById('resetPasswordProgress').style.display = 'none';
    
    // Show modal
    document.getElementById('resetPasswordModal').classList.add('active');
}

// Generate random password
function generateRandomPassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one lowercase, one uppercase, one number, one special char
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    // Fill the rest
    for (let i = password.length; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    
    document.getElementById('newPasswordInput').value = password;
}

// Confirm reset password
async function confirmResetPassword() {
    const newPassword = document.getElementById('newPasswordInput').value.trim();
    const userId = window.resetPasswordUserId;
    
    if (!newPassword) {
        alert('Please enter a new password');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    if (!userId) {
        alert('User ID not found. Please try again.');
        return;
    }
    
    // Ensure we have a fresh token
    if (!currentUser) {
        alert('Session expired. Please refresh the page.');
        return;
    }
    
    // Show progress
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordProgress').style.display = 'block';
    document.getElementById('resetPasswordCancelBtn').disabled = true;
    document.getElementById('resetPasswordConfirmBtn').disabled = true;
    
    try {
        const token = await currentUser.getIdToken(true);
        
        const response = await fetch(`${serverURL}/api/admin/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId, newPassword })
        });
        
        if (response.ok) {
            alert(`✅ Password reset successfully!\n\nNew password: ${newPassword}\n\nPlease share this with the user securely.`);
            closeModal('resetPasswordModal');
            await refreshData();
        } else {
            const errorData = await response.json();
            alert('❌ Error resetting password: ' + (errorData.error || 'Unknown error'));
            
            // Reset modal state
            document.getElementById('resetPasswordForm').style.display = 'block';
            document.getElementById('resetPasswordProgress').style.display = 'none';
            document.getElementById('resetPasswordCancelBtn').disabled = false;
            document.getElementById('resetPasswordConfirmBtn').disabled = false;
        }
        
    } catch (error) {
        console.error('Reset password error:', error);
        alert('❌ Error resetting password: ' + error.message);
        
        // Reset modal state
        document.getElementById('resetPasswordForm').style.display = 'block';
        document.getElementById('resetPasswordProgress').style.display = 'none';
        document.getElementById('resetPasswordCancelBtn').disabled = false;
        document.getElementById('resetPasswordConfirmBtn').disabled = false;
    }
}

// Delete selected users
function deleteSelectedUsers() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one user to delete');
        return;
    }
    
    // Reset modal state
    document.getElementById('deleteWarning').style.display = 'block';
    document.getElementById('deletingProgress').classList.remove('active');
    document.getElementById('deleteCancelBtn').disabled = false;
    document.getElementById('deleteConfirmBtn').disabled = false;
    
    // Populate modal with selected users
    const usersList = document.getElementById('deleteUsersList');
    usersList.innerHTML = '';
    
    selectedCheckboxes.forEach(cb => {
        const email = cb.getAttribute('data-user-email');
        const li = document.createElement('li');
        li.textContent = email;
        usersList.appendChild(li);
    });
    
    document.getElementById('deleteUserCount').textContent = selectedCheckboxes.length;
    document.getElementById('deleteUsersModal').classList.add('active');
}

// Confirm delete users
async function confirmDeleteUsers() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    const userIds = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-user-id'));
    
    if (userIds.length === 0) {
        alert('No users selected');
        return;
    }
    
    // Ensure we have a fresh token
    if (!currentUser) {
        alert('Session expired. Please refresh the page.');
        return;
    }
    
    // Show progress indicator
    document.getElementById('deleteWarning').style.display = 'none';
    document.getElementById('deletingProgress').classList.add('active');
    document.getElementById('deleteCancelBtn').disabled = true;
    document.getElementById('deleteConfirmBtn').disabled = true;
    
    try {
        // Get fresh token before making the request
        const token = await currentUser.getIdToken(true);
        
        const response = await fetch(`${serverURL}/api/admin/delete-users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userIds })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`✅ Successfully deleted ${result.deletedCount} user(s)`);
            closeModal('deleteUsersModal');
            await refreshData();
        } else {
            const errorText = await response.text();
            let errorMessage;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error;
            } catch (e) {
                errorMessage = 'Server returned an error: ' + response.status;
                console.error('Server response:', errorText);
            }
            alert('❌ Error deleting users: ' + errorMessage);
            
            // Reset modal state on error
            document.getElementById('deleteWarning').style.display = 'block';
            document.getElementById('deletingProgress').classList.remove('active');
            document.getElementById('deleteCancelBtn').disabled = false;
            document.getElementById('deleteConfirmBtn').disabled = false;
        }
    } catch (error) {
        console.error('Delete users error:', error);
        alert('❌ Failed to delete users: ' + error.message);
        
        // Reset modal state on error
        document.getElementById('deleteWarning').style.display = 'block';
        document.getElementById('deletingProgress').classList.remove('active');
        document.getElementById('deleteCancelBtn').disabled = false;
        document.getElementById('deleteConfirmBtn').disabled = false;
    }
}

// Fix user emails (restore Firebase emails from Auth)
async function fixUserEmails() {
    if (!confirm('This will restore Firebase login emails from Firebase Auth to Firestore. Continue?')) {
        return;
    }
    
    try {
        const response = await fetch(`${serverURL}/api/admin/fix-user-emails`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            let message = `✅ Email Fix Complete!\n\n`;
            message += `Total Users: ${result.summary.total}\n`;
            message += `Fixed: ${result.summary.fixed}\n`;
            message += `Skipped (already correct): ${result.summary.skipped}\n`;
            message += `Errors: ${result.summary.errors}\n\n`;
            
            if (result.summary.fixed > 0) {
                message += `Details:\n`;
                result.results.filter(r => r.status === 'fixed').forEach(r => {
                    message += `• ${r.message}\n`;
                });
            }
            
            alert(message);
            await refreshData();
        } else {
            alert('❌ Failed to fix emails: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Fix emails error:', error);
        alert('❌ Error: ' + error.message);
    }
}

// Logout
async function handleLogout() {
    await auth.signOut();
    window.location.href = '/login';
}

console.log('Admin.js loaded successfully');
