let sessionId = null;
let userId = null; // Consistent APS user ID for Firestore
let historyRefreshInterval = null; // Auto-refresh interval for pending entries

/**
 * Detect Revit version from filename OR file metadata
 * Priority: 1) File metadata (revitVersion field), 2) Filename pattern
 * Returns: '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', or null if not detected
 */
function detectRevitVersion(fileName, fileMetadata) {
    // First priority: Check if we have it from API metadata
    if (fileMetadata && fileMetadata.revitVersion) {
        // Try to extract year from version string (e.g., "2022", "Revit 2023", "R2024")
        const match = fileMetadata.revitVersion.match(/20(1[89]|2[0-6])/); // 2018-2026
        if (match) {
            console.log(`✓ Detected Revit ${match[0]} from file metadata for: ${fileName}`);
            return match[0];
        }
    }
    
    // Second priority: Try to parse from filename (fallback)
    if (fileName) {
        const match = fileName.match(/20(1[89]|2[0-6])/); // 2018-2026
        if (match) {
            console.log(`⚠ Detected Revit ${match[0]} from filename for: ${fileName} (metadata not available)`);
            return match[0];
        }
    }
    
    console.log(`✗ No Revit version detected for: ${fileName}, will default to R2026 Activity`);
    return null; // Not detected, will use default
}

// Global interval ID for time updates
let timeSincePublishInterval = null;

// Update all "Time Since Publish" cells dynamically
function updateTimeSinceCells() {
    const timeCells = document.querySelectorAll('.time-since-cell');
    timeCells.forEach(cell => {
        const publishDate = cell.dataset.publishDate;
        if (publishDate) {
            const publishedTime = new Date(publishDate);
            const now = new Date();
            const diffMs = now - publishedTime;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            let timeText = 'N/A';
            if (diffMins < 60) {
                timeText = `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
            } else if (diffHours < 24) {
                timeText = `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
            } else {
                timeText = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
            }
            cell.textContent = timeText;
        }
    });
}

// Credentials Management with Firestore (server-side encryption)

// Load credentials from Firestore
async function loadCredentialsFromFirestore() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('[Credentials] No user logged in');
            return { clientId: '', clientSecret: '' };
        }
        
        console.log('[Credentials] Loading credentials for user:', user.uid);
        
        const token = await user.getIdToken();
        const response = await fetch('/api/auth/user/credentials', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('[Credentials] Load response status:', response.status);
        
        if (!response.ok) {
            console.error('[Credentials] Failed to load credentials from Firestore');
            return { clientId: '', clientSecret: '' };
        }
        
        const data = await response.json();
        console.log('[Credentials] Loaded data:', data);
        console.log('[Credentials] ClientId length:', data.credentials?.clientId?.length || 0);
        console.log('[Credentials] ClientSecret length:', data.credentials?.clientSecret?.length || 0);
        
        return {
            clientId: data.credentials.clientId || '',
            clientSecret: data.credentials.clientSecret || ''
        };
    } catch (error) {
        console.error('[Credentials] Load credentials error:', error);
        return { clientId: '', clientSecret: '' };
    }
}

async function showCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    const messageDiv = document.getElementById('credentialsMessage');
    
    messageDiv.textContent = 'Loading credentials...';
    messageDiv.style.display = 'block';
    messageDiv.style.backgroundColor = '#e3f2fd';
    messageDiv.style.color = '#1976d2';
    
    modal.style.display = 'block';
    
    // Load from Firestore
    const { clientId, clientSecret } = await loadCredentialsFromFirestore();
    
    document.getElementById('clientIdInput').value = clientId || '';
    document.getElementById('clientSecretInput').value = clientSecret || '';
    
    messageDiv.textContent = '';
    messageDiv.style.display = 'none';
}

function closeCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    modal.style.display = 'none';
    document.getElementById('credentialsMessage').textContent = '';
}

async function saveCredentials() {
    const clientId = document.getElementById('clientIdInput').value.trim();
    const clientSecret = document.getElementById('clientSecretInput').value.trim();
    const messageDiv = document.getElementById('credentialsMessage');
    
    if (!clientId || !clientSecret) {
        messageDiv.textContent = 'Please enter both Client ID and Client Secret';
        messageDiv.style.display = 'block';
        messageDiv.style.backgroundColor = '#ffebee';
        messageDiv.style.color = '#c62828';
        return;
    }
    
    messageDiv.textContent = 'Saving credentials...';
    messageDiv.style.display = 'block';
    messageDiv.style.backgroundColor = '#e3f2fd';
    messageDiv.style.color = '#1976d2';
    
    try {
        // Check if user is authenticated
        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('You must be logged in to save credentials. Please login first.');
        }
        
        console.log('Saving credentials for user:', user.uid);
        
        // Check if email is verified
        if (!user.emailVerified) {
            throw new Error('Please verify your email before saving credentials.');
        }
        
        const token = await user.getIdToken();
        console.log('Got ID token, making request...');
        
        const response = await fetch('/api/auth/user/credentials', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ clientId, clientSecret })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            console.error('Server error:', error);
            throw new Error(error.error || 'Failed to save credentials');
        }
        
        const result = await response.json();
        console.log('Credentials saved successfully:', result);
        
        messageDiv.textContent = 'Credentials saved successfully!';
        messageDiv.style.backgroundColor = '#e8f5e9';
        messageDiv.style.color = '#2e7d32';
        
        setTimeout(() => {
            closeCredentialsModal();
        }, 1500);
    } catch (error) {
        console.error('Save credentials error:', error);
        messageDiv.textContent = error.message || 'Failed to save credentials';
        messageDiv.style.backgroundColor = '#ffebee';
        messageDiv.style.color = '#c62828';
    }
}

function openApsGuide() {
    window.open('https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/', '_blank');
}

// Loading Modal Functions
function showLoadingModal(text) {
    const modal = document.getElementById('loadingModal');
    const modalText = document.getElementById('loadingModalText');
    const modalContent = document.querySelector('.loading-modal-content');
    const progressBar = document.querySelector('.progress-bar-container');
    modalText.textContent = text || 'Loading...';
    modalContent.style.backgroundColor = '#fefefe';
    modalText.style.color = '#333';
    progressBar.style.display = 'block';
    modal.style.display = 'flex';
}

function showLoadingModalError(text) {
    const modal = document.getElementById('loadingModal');
    const modalText = document.getElementById('loadingModalText');
    const modalContent = document.querySelector('.loading-modal-content');
    const progressBar = document.querySelector('.progress-bar-container');
    modalText.textContent = text || 'Error';
    modalContent.style.backgroundColor = '#ffebee';
    modalText.style.color = '#c62828';
    progressBar.style.display = 'none';
    modal.style.display = 'flex';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideLoadingModal();
    }, 3000);
}

function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'none';
}

// Check for session on page load
window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    
    // Check Firebase authentication first
    if (typeof firebase !== 'undefined' && firebase.auth()) {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user && user.emailVerified) {
                // User is authenticated with Firebase
                console.log('Firebase user authenticated:', user.email);
                userId = user.uid;
                
                // Check for Autodesk OAuth session
                sessionId = params.get('session');
                if (!sessionId) {
                    sessionId = sessionStorage.getItem('aps_session');
                }

                if (sessionId) {
                    // Store session for persistence
                    sessionStorage.setItem('aps_session', sessionId);
                    
                    const isAuthenticated = await checkSession();
                    if (isAuthenticated) {
                        // Both Firebase and Autodesk OAuth authenticated
                        document.body.style.visibility = 'visible';
                        updateAuthUI(true);
                        // Note: Auto-upload removed - Activities are created automatically during publish workflow
                    } else {
                        // Firebase authenticated but OAuth session invalid
                        sessionStorage.removeItem('aps_session');
                        sessionId = null;
                        document.body.style.visibility = 'visible';
                        updateAuthUI(true);
                        await loadHubs(); // This will show "Login with Autodesk" button
                    }
                    // Clean URL
                    window.history.replaceState({}, document.title, '/');
                } else {
                    // Firebase authenticated but no OAuth session
                    // Show app and let user authenticate with Autodesk when needed
                    document.body.style.visibility = 'visible';
                    updateAuthUI(true);
                    await loadHubs(); // This will show "Login with Autodesk" button
                }
            } else {
                // Not authenticated with Firebase, redirect to login
                console.log('No Firebase authentication, redirecting to login...');
                window.location.href = '/login';
            }
        });
    } else {
        // Firebase not available, redirect to login
        console.warn('Firebase not initialized');
        window.location.href = '/login';
    }

    if (params.get('error')) {
        showMessage('authMessage', 'Authentication failed. Please try again.', 'error');
    }
});

// Authentication functions
async function login() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Please log in with Firebase first');
            return;
        }
        
        const token = await user.getIdToken();
        window.location.href = `/oauth/login?firebaseToken=${token}`;
    } catch (error) {
        console.error('Login error:', error);
        alert('Failed to initiate Autodesk login');
    }
}

async function logout() {
    try {
        // Sign out from Firebase first
        if (typeof firebase !== 'undefined' && firebase.auth()) {
            await firebase.auth().signOut();
            console.log('Signed out from Firebase');
        }
        
        if (sessionId) {
            await fetch(`/oauth/logout/${sessionId}`, { method: 'POST' });
        }
        sessionId = null;
        userId = null;
        
        // Clear local storage
        localStorage.clear();
        
        // Clear session storage (including stored sessionId)
        sessionStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        updateAuthUI(false);
        
        // Redirect to login page
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect even if logout API call fails
        window.location.href = '/login';
    }
}

async function checkSession() {
    if (!sessionId) return false;

    try {
        const response = await fetch(`/oauth/session/${sessionId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                userId = data.userId; // Store consistent user ID
                console.log('User authenticated:', data.userEmail || userId);
                updateAuthUI(true);
                // Auto-load hubs after authentication
                await loadHubs();
                return true;
            } else {
                sessionId = null;
                userId = null;
                updateAuthUI(false);
                return false;
            }
        } else {
            sessionId = null;
            userId = null;
            updateAuthUI(false);
            return false;
        }
    } catch (error) {
        console.error('Session check failed:', error);
        updateAuthUI(false);
        return false;
    }
}

function updateAuthUI(authenticated) {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsBtn2 = document.getElementById('settingsBtn2');
    const autodeskLoginBtn = document.getElementById('autodeskLoginBtn');
    const loginScreen = document.getElementById('loginScreen');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');

    if (authenticated) {
        // Hide login screen, show main content
        if (loginScreen) loginScreen.style.display = 'none';
        if (contentDiv) contentDiv.style.display = 'block';
        if(loginBtn) loginBtn.classList.add('hidden');
        if (settingsBtn) settingsBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (settingsBtn2) settingsBtn2.classList.remove('hidden');
        if (errorDiv) errorDiv.style.display = 'none';
        
        // Show/hide Autodesk login button based on session
        if (autodeskLoginBtn) {
            if (sessionId) {
                autodeskLoginBtn.classList.add('hidden');
            } else {
                autodeskLoginBtn.classList.remove('hidden');
            }
        }
    } else {
        // Show login screen, hide main content
        if (loginScreen) loginScreen.style.display = 'block';
        if (contentDiv) contentDiv.style.display = 'none';
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (settingsBtn) settingsBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (settingsBtn2) settingsBtn2.classList.add('hidden');
        if (autodeskLoginBtn) autodeskLoginBtn.classList.add('hidden');
    }
}

// Setup functions
async function setNickname() {
    const nickname = document.getElementById('nickname').value.trim();
    
    if (!nickname) {
        showMessage('setupMessage', 'Please enter a nickname', 'error');
        return;
    }

    try {
        const response = await fetch('/api/design-automation/setup/nickname', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('setupMessage', `Nickname set to: ${nickname}`, 'success');
        } else {
            showMessage('setupMessage', `Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('setupMessage', `Request failed: ${error.message}`, 'error');
    }
}

async function autoUploadAppBundle() {
    const engineVersionEl = document.getElementById('engineVersion');
    const engineVersion = engineVersionEl ? engineVersionEl.value : '2024';

    try {
        showMessage('setupMessage', 'Auto-uploading AppBundle...', 'info');
        const setupLog = document.getElementById('setupLog');
        if (setupLog) setupLog.classList.remove('hidden');
        addLog('Auto-uploading RevitCloudPublisher.zip from server...', '', 'setupLog');

        const response = await fetch('/api/design-automation/appbundle/auto-upload', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({ engineVersion })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('setupMessage', '✓ AppBundle uploaded automatically', 'success');
            addLog(`✓ ${data.message}`, 'success', 'setupLog');
        } else {
            showMessage('setupMessage', `AppBundle not found: ${data.error}`, 'error');
            addLog(`✗ ${data.error}`, 'error', 'setupLog');
        }
    } catch (error) {
        showMessage('setupMessage', `Auto-upload failed: ${error.message}`, 'error');
        addLog(`✗ Auto-upload failed: ${error.message}`, 'error', 'setupLog');
    }
}

async function uploadAppBundle() {
    const fileInput = document.getElementById('appBundleFile');
    const engineVersion = document.getElementById('engineVersion').value;

    if (!fileInput.files[0]) {
        showMessage('setupMessage', 'Please select a .zip file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('bundle', fileInput.files[0]);
    formData.append('engineVersion', engineVersion);

    try {
        showMessage('setupMessage', 'Uploading AppBundle...', 'info');
        document.getElementById('setupLog').classList.remove('hidden');
        addLog('Uploading AppBundle...', '', 'setupLog');

        const response = await fetch('/api/design-automation/appbundle/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('setupMessage', data.message, 'success');
            addLog(`✓ ${data.message}`, 'success', 'setupLog');
        } else {
            showMessage('setupMessage', `Error: ${data.error}`, 'error');
            addLog(`✗ ${data.error}`, 'error', 'setupLog');
        }
    } catch (error) {
        showMessage('setupMessage', `Upload failed: ${error.message}`, 'error');
        addLog(`✗ Upload failed: ${error.message}`, 'error', 'setupLog');
    }
}

async function createActivity() {
    const engineVersion = document.getElementById('engineVersion').value;

    try {
        showMessage('setupMessage', `Creating activity for Revit ${engineVersion}...`, 'info');
        document.getElementById('setupLog').classList.remove('hidden');
        addLog(`Creating activity for Revit ${engineVersion}...`, '', 'setupLog');

        const response = await fetch('/api/design-automation/activity/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engineVersion })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('setupMessage', data.message, 'success');
            addLog(`✓ Activity created: ${data.data.id}`, 'success', 'setupLog');
        } else {
            showMessage('setupMessage', `Error: ${data.error}`, 'error');
            addLog(`✗ ${data.error}`, 'error', 'setupLog');
        }
    } catch (error) {
        showMessage('setupMessage', `Request failed: ${error.message}`, 'error');
        addLog(`✗ Request failed: ${error.message}`, 'error', 'setupLog');
    }
}

/**
 * Check which Activities exist for current user (Revit 2024, 2025, 2026)
 */
async function checkActivities() {
    if (!sessionId) {
        showMessage('setupMessage', 'Please login first', 'error');
        return;
    }

    try {
        showMessage('setupMessage', 'Checking available Activities...', 'info');
        document.getElementById('setupLog').classList.remove('hidden');
        addLog('Checking Activities for Revit 2024, 2025, 2026...', '', 'setupLog');

        const response = await fetch(`/api/design-automation/activities/check?sessionId=${sessionId}`);
        const data = await response.json();

        if (response.ok) {
            const { activities, summary, recommendation, nickname } = data;
            
            addLog(`Nickname: ${nickname}`, '', 'setupLog');
            addLog('', '', 'setupLog');
            
            // Display status for each version
            ['2024', '2025', '2026'].forEach(version => {
                const status = activities[version];
                if (status.exists) {
                    addLog(`✓ Revit ${version}: Activity exists (${status.activityId})`, 'success', 'setupLog');
                } else {
                    addLog(`✗ Revit ${version}: Activity missing`, 'error', 'setupLog');
                }
            });
            
            addLog('', '', 'setupLog');
            addLog(`Summary: ${summary.existing}/${summary.total} Activities available`, '', 'setupLog');
            
            if (summary.missing > 0) {
                showMessage('setupMessage', `Missing Activities for Revit ${summary.missingVersions.join(', ')}`, 'warning');
                addLog(`⚠️  ${recommendation}`, 'warning', 'setupLog');
            } else {
                showMessage('setupMessage', '✓ All Revit versions (2024-2026) are supported', 'success');
            }
        } else {
            showMessage('setupMessage', `Error: ${data.error}`, 'error');
            addLog(`✗ ${data.error}`, 'error', 'setupLog');
        }
    } catch (error) {
        showMessage('setupMessage', `Request failed: ${error.message}`, 'error');
        addLog(`✗ Request failed: ${error.message}`, 'error', 'setupLog');
    }
}

/**
 * Create Activities for all Revit versions (2024, 2025, 2026)
 */
async function createAllActivities() {
    if (!sessionId) {
        showMessage('setupMessage', 'Please login first', 'error');
        return;
    }

    try {
        showMessage('setupMessage', 'Creating Activities for all Revit versions...', 'info');
        document.getElementById('setupLog').classList.remove('hidden');
        addLog('Creating Activities for Revit 2024, 2025, 2026...', '', 'setupLog');

        const response = await fetch('/api/design-automation/activities/create-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (response.ok) {
            const { results, summary } = data;
            
            // Display results for each version
            results.forEach(result => {
                if (result.success) {
                    addLog(`✓ Revit ${result.version}: ${result.message}`, 'success', 'setupLog');
                } else {
                    addLog(`✗ Revit ${result.version}: ${result.error}`, 'error', 'setupLog');
                }
            });
            
            addLog('', '', 'setupLog');
            addLog(`Summary: ${summary.created}/${summary.total} Activities created`, '', 'setupLog');
            
            if (summary.created === summary.total) {
                showMessage('setupMessage', '✓ All Activities created successfully!', 'success');
            } else if (summary.created > 0) {
                showMessage('setupMessage', `⚠️  Created ${summary.created} of ${summary.total} Activities`, 'warning');
            } else {
                showMessage('setupMessage', '✗ Failed to create Activities', 'error');
            }
        } else {
            showMessage('setupMessage', `Error: ${data.error}`, 'error');
            addLog(`✗ ${data.error}`, 'error', 'setupLog');
        }
    } catch (error) {
        showMessage('setupMessage', `Request failed: ${error.message}`, 'error');
        addLog(`✗ Request failed: ${error.message}`, 'error', 'setupLog');
    }
}

// Publish function
async function publishModel() {
    if (!sessionId) {
        showMessage('publishMessage', 'Please login first', 'error');
        return;
    }

    // Get all selected files - exclude weekday checkboxes used for scheduling
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]:checked:not(.weekday-checkbox)');
    const selectedFiles = Array.from(checkboxes).map(cb => {
        const item = cb.closest('.file-checkbox-item');
        return {
            projectGuid: item.dataset.projectGuid,
            modelGuid: item.dataset.modelGuid,
            fileName: item.dataset.fileName,
            itemId: item.dataset.itemId,
            region: item.dataset.region || 'US',
            revitVersion: item.dataset.revitVersion || '2026' // Auto-detected or default
        };
    });

    if (selectedFiles.length === 0) {
        showMessage('publishMessage', 'Please select at least one Revit file', 'error');
        return;
    }

    try {
        showMessage('publishMessage', `Publishing ${selectedFiles.length} model(s) directly to cloud...`, 'info');
        addLog(`Starting batch publish for ${selectedFiles.length} model(s)...`, 'info');
        
        // Show version detection summary
        const versionCounts = {};
        selectedFiles.forEach(f => {
            const v = f.revitVersion || '2026';
            versionCounts[v] = (versionCounts[v] || 0) + 1;
        });
        const versionSummary = Object.entries(versionCounts)
            .map(([v, count]) => `Revit ${v} (${count})`)
            .join(', ');
        addLog(`Versions detected: ${versionSummary}`, 'info');

        let successCount = 0;
        let failCount = 0;

        // Process files sequentially using PublishModel API
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const version = file.revitVersion || '2026';
            addLog(`\n[${i + 1}/${selectedFiles.length}] Publishing: ${file.fileName}`, 'info');
            addLog(`  Using Revit ${version} Activity`, 'info');

            const response = await fetch(`/api/data-management/publish/${encodeURIComponent(file.itemId)}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionId}`
                },
                body: JSON.stringify({
                    projectId: selectedProjectId,
                    projectGuid: file.projectGuid,
                    modelGuid: file.modelGuid,
                    fileName: file.fileName,
                    region: file.region,
                    revitVersion: file.revitVersion // Pass auto-detected version
                })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.workItemId) {
                    // Design Automation path (single-user models)
                    addLog(`  ✓ Design Automation WorkItem created`, 'success');
                    addLog(`  WorkItem ID: ${data.workItemId}`);
                    addLog(`  File will be saved to ACC with new version`);
                } else {
                    // PublishModel API path (workshared models)
                    addLog(`  ✓ Publish command initiated successfully`, 'success');
                    addLog(`  Command ID: ${data.commandId}`);
                    addLog(`  Status: ${data.status}`);
                }
                successCount++;
                
                // Determine file type based on response
                const isRCM = !!data.workItemId; // RCM files use Design Automation
                const isC4R = !!data.commandId;  // C4R files use PublishModel API
                
                // Save to publishing history
                saveToPublishingHistory(
                    file.fileName,
                    selectedProjectName || 'Unknown Project',
                    'success',
                    data.workItemId ? 'Publishing RCM file via Design Automation...' : 'Publishing C4R file...',
                    {
                        workItemId: data.workItemId,
                        commandId: data.commandId,
                        status: data.status,
                        itemId: file.itemId,
                        projectId: selectedProjectId,
                        fileType: 'versions:autodesk.bim360:C4RModel',
                        isRCM: isRCM,
                        isC4R: isC4R
                    }
                );
            } else {
                addLog(`  ✗ Error: ${data.error}`, 'error');
                failCount++;
                
                // Determine if this is an RCM service access issue
                let errorType = 'error';
                let errorMessage = `Publish failed: ${data.error}`;
                let helpfulTip = '';
                let isRCM = false;
                let isC4R = false;
                
                // Check for specific error patterns
                if (data.details) {
                    // 403 with code 'C4R' typically means RCM service not enabled
                    if (data.details.statusCode === 403 && data.details.errorCode === 'C4R') {
                        errorType = 'warning';
                        helpfulTip = '💡 This user may not have "Cloud Models for Revit" service enabled. Contact your Autodesk Account Admin to grant access.';
                        addLog(`  ⚠ ${helpfulTip}`, 'warning');
                        isRCM = true; // This error specifically indicates RCM file
                    }
                    // No unpublished changes
                    else if (data.error.includes('No unpublished changes')) {
                        errorType = 'warning';
                        helpfulTip = 'File is already at the latest version with no pending changes.';
                    }
                }
                
                // Save to publishing history with enhanced details
                saveToPublishingHistory(
                    file.fileName,
                    selectedProjectName || 'Unknown Project',
                    errorType,
                    errorMessage,
                    {
                        itemId: file.itemId,
                        projectId: selectedProjectId,
                        errorDetails: data.error,
                        errorCode: data.details?.errorCode,
                        statusCode: data.details?.statusCode,
                        helpfulTip: helpfulTip,
                        originalError: data.details?.originalError,
                        fileType: 'versions:autodesk.bim360:C4RModel',
                        isRCM: isRCM,
                        isC4R: isC4R
                    }
                );
            }

            // Small delay between requests
            if (i < selectedFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        const summaryMsg = `Batch publish complete: ${successCount} succeeded, ${failCount} failed`;
        showMessage('publishMessage', summaryMsg, failCount === 0 ? 'success' : 'info');
        addLog(`\n✓ ${summaryMsg}`, failCount === 0 ? 'success' : 'info');
        addLog('\nNote: Files are being published to the cloud. Refresh BIM 360/ACC to see new versions.', 'info');
        
        // Show toast notification
        showToast(
            failCount === 0 ? 'Publishing Complete!' : 'Publishing Finished',
            `${successCount} file(s) published successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
            failCount === 0 ? 'success' : 'info'
        );
        
    } catch (error) {
        showMessage('publishMessage', `Request failed: ${error.message}`, 'error');
        addLog(`Request failed: ${error.message}`, 'error');
    }
}

async function pollWorkItemStatus(workItemId, attempts = 0) {
    if (attempts > 60) {
        addLog('Polling timeout - check webhook results', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/design-automation/workitem/${workItemId}/status`);
        const data = await response.json();

        if (response.ok) {
            const status = data.data.status;
            addLog(`Status update: ${status}`);

            if (status === 'success' || status === 'failed' || status === 'cancelled') {
                addLog(`WorkItem completed with status: ${status}`, status === 'success' ? 'success' : 'error');
                if (data.data.reportUrl) {
                    addLog(`Report: ${data.data.reportUrl}`);
                }
                
                // If successful, initiate PublishModel for workshared models
                if (status === 'success') {
                    console.log('WorkItem success - checking for PublishModel trigger');
                    
                    const selectedModel = document.getElementById('rvtFileSelect');
                    console.log('rvtFileSelect element:', selectedModel);
                    
                    if (selectedModel && selectedModel.selectedOptions[0]) {
                        const option = selectedModel.selectedOptions[0];
                        const itemId = option.dataset.itemId;
                        const projectId = selectedProjectId; // Use global variable
                        
                        console.log('Selected option:', option);
                        console.log('ItemId:', itemId);
                        console.log('ProjectId:', projectId);
                        
                        if (itemId && projectId) {
                            addLog('Initiating model publish to BIM 360 Docs...');
                            publishModelToBim360(itemId, projectId);
                        } else {
                            addLog('ℹ Note: PublishModel requires itemId and projectId', 'info');
                            addLog(`  - ItemId: ${itemId || 'missing'}`, 'info');
                            addLog(`  - ProjectId: ${projectId || 'missing'}`, 'info');
                            addLog('ℹ Use "Browse & Select Model" workflow for automatic publishing', 'info');
                        }
                    } else {
                        // Manual GUID workflow - PublishModel not available
                        addLog('ℹ Model processed successfully', 'info');
                        addLog('ℹ For automatic BIM 360 Docs publishing, use "Browse & Select Model"', 'info');
                        console.log('No model selected in rvtFileSelect dropdown');
                    }
                }
                return;
            }

            // Continue polling
            setTimeout(() => pollWorkItemStatus(workItemId, attempts + 1), 5000);
        }
    } catch (error) {
        console.error('Polling error:', error);
        setTimeout(() => pollWorkItemStatus(workItemId, attempts + 1), 5000);
    }
}

async function publishModelToBim360(itemId, projectId) {
    try {
        addLog(`Publishing model (itemId: ${itemId})...`);
        
        const response = await fetch(`/api/data-management/publish/${encodeURIComponent(itemId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({ projectId })
        });

        const data = await response.json();

        if (response.ok) {
            addLog(`Publish command initiated (ID: ${data.commandId})`, 'success');
            addLog(`Initial status: ${data.status}`);
            addLog('Model will be available in BIM 360 Docs shortly');
        } else {
            // Not all models support PublishModel (only workshared C4R models)
            const errorMsg = data.error?.toString() || 'Unknown error';
            if (errorMsg.includes('not a workshared') || errorMsg.includes('C4R')) {
                addLog('Note: PublishModel only applies to workshared cloud models', 'info');
                addLog('Non-workshared models are already saved to cloud', 'info');
            } else {
                addLog(`Publish warning: ${errorMsg}`, 'warning');
            }
        }
    } catch (error) {
        addLog(`Publish request failed: ${error.message}`, 'warning');
        addLog('Model changes may still be saved to cloud', 'info');
    }
}

// Utility functions
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return; // Skip if element doesn't exist
    element.innerHTML = `<div class="alert ${type}">${message}</div>`;
    
    setTimeout(() => {
        if (element && element.innerHTML.includes(message)) {
            element.innerHTML = '';
        }
    }, 5000);
}

function showToast(title, message, type = 'info') {
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function addLog(message, type = '', logId = 'workItemLog') {
    const logElement = document.getElementById(logId);
    if (!logElement) return;
    
    logElement.classList.remove('hidden');
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
}

// Data Management functions
let originalHubsData = null;
let originalProjectsData = null;
let selectedHubId = null;
let selectedProjectId = null;
let selectedProjectName = null;

async function loadHubs() {
    const hubsList = document.getElementById('hubsList');
    
    if (!sessionId) {
        hubsList.innerHTML = `
            <div class="no-items" style="padding: 30px; line-height: 1.6;">
                <p style="margin-bottom: 15px; font-weight: bold;">Connect to Autodesk</p>
                <p style="margin-bottom: 15px; color: #666;">To access your hubs, projects and files, click "Login with Autodesk" button above.</p>
            </div>
        `;
        return;
    }

    try {
        hubsList.innerHTML = '<div class="no-items">Loading hubs...</div>';
        
        const response = await fetch('/api/data-management/hubs', {
            headers: { 'Authorization': `Bearer ${sessionId}` }
        });
        
        const data = await response.json();
        if (response.ok) {
            originalHubsData = data;
            displayHubs(data);
            // Content panel is already shown by updateAuthUI
        } else {
            hubsList.innerHTML = `
                <div class="no-items" style="padding: 30px; line-height: 1.6; color: #dc3545;">
                    <p style="margin-bottom: 15px; font-weight: bold;">Error loading hubs</p>
                    <p style="margin-bottom: 15px;">${data.error}</p>
                    <p style="color: #666;">Please try clicking "Login with Autodesk" button above to reconnect.</p>
                </div>
            `;
        }
    } catch (error) {
        hubsList.innerHTML = `
            <div class="no-items" style="padding: 30px; line-height: 1.6; color: #dc3545;">
                <p style="margin-bottom: 15px; font-weight: bold;">Failed to load hubs</p>
                <p style="margin-bottom: 15px;">${error.message}</p>
                <p style="color: #666;">Please try clicking "Login with Autodesk" button above to reconnect.</p>
            </div>
        `;
    }
}

function displayHubs(hubsData) {
    const hubsList = document.getElementById('hubsList');
    
    if (!hubsData || !hubsData.data || hubsData.data.length === 0) {
        hubsList.innerHTML = '<div class="no-items">No hubs found</div>';
        return;
    }

    // Additional client-side filter to ensure only BIM 360 Account hubs (ACC)
    const bim360Hubs = hubsData.data.filter(hub => {
        const extensionType = hub.attributes?.extension?.type;
        return extensionType === 'hubs:autodesk.bim360:Account';
    });

    if (bim360Hubs.length === 0) {
        hubsList.innerHTML = '<div class="no-items">No BIM 360 Account hubs found</div>';
        return;
    }

    let hubsHTML = '';
    bim360Hubs.forEach(hub => {
        const hubName = hub.attributes.name;
        const hubId = hub.id;
        const region = hub.attributes.region || 'US';
        
        hubsHTML += `
            <div class="hub-item" onclick="selectHub('${hubId}', '${hubName.replace(/'/g, "\\'")}', '${region}')">
                <div class="hub-name">${hubName}</div>
                <div class="hub-region">${region}</div>
            </div>
        `;
    });

    hubsList.innerHTML = hubsHTML;
}

function filterHubs() {
    if (!originalHubsData) return;

    const filterText = document.getElementById('hubFilter').value.toLowerCase();
    
    // First filter to only BIM 360 Account hubs, then apply text filter
    let hubsToFilter = originalHubsData.data.filter(hub => {
        const extensionType = hub.attributes?.extension?.type;
        return extensionType === 'hubs:autodesk.bim360:Account';
    });
    
    // If text filter is provided, apply it
    if (filterText.trim()) {
        hubsToFilter = hubsToFilter.filter(hub => 
            hub.attributes.name.toLowerCase().includes(filterText)
        );
    }

    // Create filtered data structure
    const filtered = {
        ...originalHubsData,
        data: hubsToFilter
    };

    displayHubs(filtered);
}

async function selectHub(hubId, hubName, region) {
    selectedHubId = hubId;
    window.selectedHubRegion = region || 'US';
    
    // Update UI
    document.querySelectorAll('.hub-item').forEach(item => item.classList.remove('selected'));
    event.target.closest('.hub-item').classList.add('selected');
    
    // Show projects header
    const projectsHeader = document.getElementById('projectsHeader');
    const selectedHubTitle = document.getElementById('selectedHubTitle');
    projectsHeader.style.display = 'block';
    selectedHubTitle.textContent = `Projects in ${hubName}`;
    
    // Hide files section until project is selected
    document.getElementById('filesSection').style.display = 'none';
    
    // Hide publishing action buttons until project is selected
    document.getElementById('publishingActions').style.display = 'none';
    
    // Load projects
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '<div class="no-items">Loading projects...</div>';
    
    try {
        const response = await fetch(`/api/data-management/hubs/${hubId}/projects`, {
            headers: { 'Authorization': `Bearer ${sessionId}` }
        });
        
        const data = await response.json();
        if (response.ok) {
            originalProjectsData = data;
            displayProjects(data);
            showMessage('publishMessage', `Found ${data.data.length} projects in ${hubName}`, 'success');
        } else {
            projectsList.innerHTML = '<div class="no-items">Error loading projects</div>';
        }
    } catch (error) {
        projectsList.innerHTML = '<div class="no-items">Failed to load projects</div>';
        showMessage('publishMessage', `Failed to load projects: ${error.message}`, 'error');
    }
}

function displayProjects(projectsData) {
    const projectsList = document.getElementById('projectsList');
    
    if (!projectsData || !projectsData.data || projectsData.data.length === 0) {
        projectsList.innerHTML = '<div class="no-items">No projects found</div>';
        return;
    }

    let projectsHTML = '';
    projectsData.data.forEach(project => {
        const projectName = project.attributes.name;
        const projectId = project.id;
        
        projectsHTML += `
            <div class="project-item" onclick="selectProject('${projectId}', '${projectName.replace(/'/g, "\\'")}')">
                ${projectName}
            </div>
        `;
    });

    projectsList.innerHTML = projectsHTML;
}

function filterProjects() {
    if (!originalProjectsData) return;

    const filterText = document.getElementById('projectFilter').value.toLowerCase();
    
    if (!filterText.trim()) {
        displayProjects(originalProjectsData);
        return;
    }

    const filtered = {
        data: originalProjectsData.data.filter(project => 
            project.attributes.name.toLowerCase().includes(filterText)
        )
    };

    displayProjects(filtered);
}

async function selectProject(projectId, projectName) {
    selectedProjectId = projectId;
    selectedProjectName = projectName;
    
    // Update UI
    document.querySelectorAll('.project-item').forEach(item => item.classList.remove('selected'));
    // Find and highlight the selected project
    const selectedItem = Array.from(document.querySelectorAll('.project-item')).find(
        item => item.textContent.trim() === projectName
    );
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    // Show files section
    document.getElementById('filesSection').style.display = 'flex';
    
    // Load Revit files - show loading modal
    showLoadingModal(`Loading Revit files from ${projectName}...`);
    
    try {
        // Get top folders first
        const topFoldersResponse = await fetch(
            `/api/data-management/projects/${projectId}/topFolders?hubId=${selectedHubId}`,
            { headers: { 'Authorization': `Bearer ${sessionId}` } }
        );
        
        const topFoldersData = await topFoldersResponse.json();
        if (topFoldersResponse.ok) {
            // For non-admin users, topFolders returns all highest-level folders they have access to
            // We need to search ALL of them, not just "Project Files"
            console.log(`Found ${topFoldersData.data.length} top-level folders:`, topFoldersData.data.map(f => f.attributes.name));
            
            if (topFoldersData.data.length === 0) {
                showLoadingModalError('No accessible folders found');
                return;
            }
            
            // Load files from all top folders
            await loadRevitFilesFromMultipleFolders(projectId, topFoldersData.data);
        }
    } catch (error) {
        showLoadingModalError(`Failed to load folders: ${error.message}`);
    }
}

let allRevitFiles = [];

async function loadRevitFilesFromMultipleFolders(projectId, folders) {
    try {
        // Search each top folder and combine results
        const allFiles = [];
        
        for (const folder of folders) {
            console.log(`Searching folder: ${folder.attributes.name || folder.attributes.displayName}`);
            
            const response = await fetch(
                `/api/data-management/projects/${projectId}/folders/${encodeURIComponent(folder.id)}/rvtFiles`,
                { headers: { 'Authorization': `Bearer ${sessionId}` } }
            );
            
            const data = await response.json();
            if (response.ok && data.files) {
                console.log(`  Found ${data.files.length} files in ${folder.attributes.name}`);
                allFiles.push(...data.files);
            }
        }
        
        console.log(`Total files found across all folders: ${allFiles.length}`);
        
        // Display combined results
        const filesList = document.getElementById('rvtFilesList');
        
        if (allFiles.length === 0) {
            filesList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No Revit cloud models found</div>';
            allRevitFiles = [];
            document.getElementById('publishingActions').style.display = 'none';
            hideLoadingModal();
            return;
        }
        
        // Store and display files
        displayRevitFiles(allFiles);
    } catch (error) {
        showLoadingModalError(`Failed to load files: ${error.message}`);
    }
}

function displayRevitFiles(files) {
    allRevitFiles = files.map((file, index) => ({
        ...file,
        index,
    }));
    
    renderFilesList();
    updateFileSelection();
    
    // Show publishing action buttons after files are loaded
    document.getElementById('publishingActions').style.display = 'block';
    
    hideLoadingModal();
}

async function loadRevitFiles(projectId, folderId) {
    // This function is deprecated, use loadRevitFilesFromMultipleFolders instead
    // Keeping for backward compatibility
    try {
        const response = await fetch(
            `/api/data-management/projects/${projectId}/folders/${encodeURIComponent(folderId)}/rvtFiles`,
            { headers: { 'Authorization': `Bearer ${sessionId}` } }
        );
        
        const data = await response.json();
        if (response.ok) {
            const filesList = document.getElementById('rvtFilesList');
            
            if (!data.files || data.files.length === 0) {
                filesList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No Revit cloud models found</div>';
                allRevitFiles = [];
                document.getElementById('publishingActions').style.display = 'none';
                hideLoadingModal();
                return;
            }
            
            allRevitFiles = data.files.map((file, index) => ({
                ...file,
                index,

            }));
            
            renderFilesList();
            updateFileSelection();
            
            // Show publishing action buttons after files are loaded
            document.getElementById('publishingActions').style.display = 'block';
            
            hideLoadingModal();
        } else {
            document.getElementById('publishingActions').style.display = 'none';
            showLoadingModalError(`Error loading Revit files: ${data.error}`);
        }
    } catch (error) {
        document.getElementById('publishingActions').style.display = 'none';
        showLoadingModalError(`Failed to load Revit files: ${error.message}`);
    }
}

let currentSortColumn = null;
let currentSortDirection = 'asc';

function sortFiles(column) {
    // Toggle direction if clicking same column
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    allRevitFiles.sort((a, b) => {
        let valueA, valueB;
        
        switch(column) {
            case 'name':
                valueA = a.name.toLowerCase();
                valueB = b.name.toLowerCase();
                break;
            case 'path':
                valueA = (a.folderPath || '').toLowerCase();
                valueB = (b.folderPath || '').toLowerCase();
                break;
            case 'date':
                valueA = new Date(a.publishedDate || a.lastModifiedTime || 0);
                valueB = new Date(b.publishedDate || b.lastModifiedTime || 0);
                break;
            case 'timeSince':
                valueA = new Date(a.publishedDate || a.lastModifiedTime || 0).getTime();
                valueB = new Date(b.publishedDate || b.lastModifiedTime || 0).getTime();
                break;
            case 'fileType':
                valueA = a.modelType === 'singleuser' ? 'RCM' : 'C4R';
                valueB = b.modelType === 'singleuser' ? 'RCM' : 'C4R';
                break;
        }
        
        if (valueA < valueB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    renderFilesList();
}

function renderFilesList() {
    const filesList = document.getElementById('rvtFilesList');
    filesList.innerHTML = '';
    
    // Create table
    const table = document.createElement('table');
    table.style.width = 'auto';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'auto';
    table.style.fontSize = '13px';
    
    // Sort indicators
    const getSortIndicator = (column) => {
        if (currentSortColumn !== column) return ' ↕';
        return currentSortDirection === 'asc' ? ' ▲' : ' ▼';
    };
    
    // Helper function to calculate time since publish
    const calculateTimeSince = (publishedDate) => {
        if (!publishedDate) return 'N/A';
        
        const publishedTime = new Date(publishedDate);
        const now = new Date();
        const diffMs = now - publishedTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) {
            return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
        } else {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
        }
    };
    
    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#f8f9fa';
    headerRow.style.position = 'sticky';
    headerRow.style.top = '0';
    headerRow.style.zIndex = '1';
    
    // Checkbox column
    const thCheckbox = document.createElement('th');
    thCheckbox.style.padding = '8px';
    thCheckbox.style.textAlign = 'left';
    thCheckbox.style.borderBottom = '2px solid #ddd';
    thCheckbox.style.borderRight = '1px solid #ddd';
    
    // Name column
    const thName = document.createElement('th');
    thName.style.padding = '8px';
    thName.style.textAlign = 'left';
    thName.style.borderBottom = '2px solid #ddd';
    thName.style.borderRight = '1px solid #ddd';
    thName.style.cursor = 'pointer';
    thName.style.userSelect = 'none';
    thName.style.maxWidth = '33vw';
    thName.style.whiteSpace = 'normal';
    thName.style.wordBreak = 'break-word';
    thName.innerHTML = `Name${getSortIndicator('name')}`;
    thName.onclick = () => sortFiles('name');
    
    // File Type column
    const thFileType = document.createElement('th');
    thFileType.style.padding = '8px';
    thFileType.style.textAlign = 'left';
    thFileType.style.borderBottom = '2px solid #ddd';
    thFileType.style.borderRight = '1px solid #ddd';
    thFileType.style.cursor = 'pointer';
    thFileType.style.userSelect = 'none';
    thFileType.style.whiteSpace = 'nowrap';
    thFileType.innerHTML = `File Type${getSortIndicator('fileType')}`;
    thFileType.onclick = () => sortFiles('fileType');
    
    // Folder Path column
    const thPath = document.createElement('th');
    thPath.style.padding = '8px';
    thPath.style.textAlign = 'left';
    thPath.style.borderBottom = '2px solid #ddd';
    thPath.style.borderRight = '1px solid #ddd';
    thPath.style.cursor = 'pointer';
    thPath.style.userSelect = 'none';
    thPath.style.whiteSpace = 'nowrap';
    thPath.innerHTML = `Folder Path${getSortIndicator('path')}`;
    thPath.onclick = () => sortFiles('path');
    
    // Publish Date column
    const thDate = document.createElement('th');
    thDate.style.padding = '8px';
    thDate.style.textAlign = 'left';
    thDate.style.borderBottom = '2px solid #ddd';
    thDate.style.borderRight = '1px solid #ddd';
    thDate.style.cursor = 'pointer';
    thDate.style.userSelect = 'none';
    thDate.style.whiteSpace = 'nowrap';
    thDate.innerHTML = `Publish Date${getSortIndicator('date')}`;
    thDate.onclick = () => sortFiles('date');
    
    // Time Since Publish column
    const thTimeSince = document.createElement('th');
    thTimeSince.style.padding = '8px';
    thTimeSince.style.textAlign = 'left';
    thTimeSince.style.borderBottom = '2px solid #ddd';
    thTimeSince.style.borderRight = '1px solid #ddd';
    thTimeSince.style.cursor = 'pointer';
    thTimeSince.style.userSelect = 'none';
    thTimeSince.style.whiteSpace = 'nowrap';
    thTimeSince.innerHTML = `Time Since Publish${getSortIndicator('timeSince')}`;
    thTimeSince.onclick = () => sortFiles('timeSince');
    
    // Publishing Time column
    const thPublishTime = document.createElement('th');
    thPublishTime.style.padding = '8px';
    thPublishTime.style.textAlign = 'left';
    thPublishTime.style.borderBottom = '2px solid #ddd';
    thPublishTime.style.whiteSpace = 'nowrap';
    thPublishTime.innerHTML = `Publishing Time`;
    
    headerRow.appendChild(thCheckbox);
    headerRow.appendChild(thName);
    headerRow.appendChild(thFileType);
    headerRow.appendChild(thPath);
    headerRow.appendChild(thDate);
    headerRow.appendChild(thTimeSince);
    headerRow.appendChild(thPublishTime);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    allRevitFiles.forEach((file) => {
        const tr = document.createElement('tr');
        tr.className = 'file-checkbox-item';
        tr.dataset.fileId = file.id;
        tr.dataset.projectGuid = file.projectGuid;
        tr.dataset.modelGuid = file.modelGuid;
        tr.dataset.itemId = file.id;
        tr.dataset.fileName = file.name;
        tr.dataset.index = file.index;
        tr.dataset.region = window.selectedHubRegion || 'US';
        
        // Auto-detect Revit version from file metadata or filename
        const detectedVersion = detectRevitVersion(file.name, file);
        tr.dataset.revitVersion = detectedVersion || '2026'; // Default to 2026 if not detected
        
        // Store the detected/default version for logging
        if (detectedVersion) {
            console.log(`File: ${file.name} → Revit ${detectedVersion}`);
        }
        
        tr.style.borderBottom = '1px solid #eee';
        tr.style.cursor = 'pointer';
        
        const checkboxId = `file-checkbox-${file.index}`;
        
        // Format publish date
        let publishDate = 'N/A';
        if (file.publishedDate || file.lastModifiedTime) {
            const date = new Date(file.publishedDate || file.lastModifiedTime);
            publishDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        // Calculate time since publish
        const publishDateForCalc = file.publishedDate || file.lastModifiedTime;
        const timeSincePublish = calculateTimeSince(publishDateForCalc);
        
        // Create cells
        const tdCheckbox = document.createElement('td');
        tdCheckbox.style.padding = '8px';
        tdCheckbox.style.borderRight = '1px solid #ddd';
        tdCheckbox.innerHTML = `<input type="checkbox" id="${checkboxId}" onchange="updateFileSelection()" onclick="event.stopPropagation()">`;
        
        const tdName = document.createElement('td');
        tdName.style.padding = '8px';
        tdName.style.borderRight = '1px solid #ddd';
        tdName.style.maxWidth = '33vw';
        tdName.style.whiteSpace = 'normal';
        tdName.style.wordBreak = 'break-word';
        tdName.textContent = `${file.name} (v${file.versionNumber})`;
        
        // File Type cell
        const tdFileType = document.createElement('td');
        tdFileType.style.padding = '8px';
        tdFileType.style.borderRight = '1px solid #ddd';
        tdFileType.style.fontSize = '12px';
        tdFileType.style.whiteSpace = 'nowrap';
        tdFileType.style.textAlign = 'center';
        
        // Determine file type based on modelType:
        // singleuser = RCM (Revit Cloud Model)
        // multiuser = C4R (Cloud Worksharing)
        const isRCM = file.modelType === 'singleuser';
        const fileTypeBadge = isRCM 
            ? '<span style="background: #6f42c1; color: white; padding: 3px 10px; border-radius: 12px; font-weight: 500; font-size: 11px;">RCM</span>'
            : '<span style="background: #17a2b8; color: white; padding: 3px 10px; border-radius: 12px; font-weight: 500; font-size: 11px;">C4R</span>';
        tdFileType.innerHTML = fileTypeBadge;
        
        const tdPath = document.createElement('td');
        tdPath.style.padding = '8px';
        tdPath.style.borderRight = '1px solid #ddd';
        tdPath.style.fontSize = '12px';
        tdPath.style.color = '#666';
        tdPath.style.whiteSpace = 'normal';
        tdPath.style.wordBreak = 'break-all';
        tdPath.style.maxWidth = '400px';
        tdPath.textContent = file.folderPath || 'N/A';
        tdPath.title = file.folderPath || 'N/A'; // Show full path on hover
        
        const tdDate = document.createElement('td');
        tdDate.style.padding = '8px';
        tdDate.style.borderRight = '1px solid #ddd';
        tdDate.style.fontSize = '12px';
        tdDate.style.color = '#666';
        tdDate.style.whiteSpace = 'nowrap';
        tdDate.textContent = publishDate;
        
        const tdTimeSince = document.createElement('td');
        tdTimeSince.className = 'time-since-cell';
        tdTimeSince.dataset.publishDate = publishDateForCalc || '';
        tdTimeSince.style.padding = '8px';
        tdTimeSince.style.borderRight = '1px solid #ddd';
        tdTimeSince.style.whiteSpace = 'nowrap';
        tdTimeSince.style.fontSize = '12px';
        tdTimeSince.style.color = '#666';
        tdTimeSince.textContent = timeSincePublish;
        
        const tdPublishTime = document.createElement('td');
        tdPublishTime.style.padding = '8px';
        tdPublishTime.style.whiteSpace = 'nowrap';
        
        // Generate hour options (00-23)
        const hourOptions = Array.from({length: 24}, (_, i) => {
            const h = i.toString().padStart(2, '0');
            return `<option value="${h}">${h}</option>`;
        }).join('');
        
        tdPublishTime.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;" onclick="event.stopPropagation()">
                <div style="display: flex; gap: 3px; flex-wrap: wrap;">
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Monday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="1" style="margin: 0; vertical-align: middle;"> M
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Tuesday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="2" style="margin: 0; vertical-align: middle;"> T
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Wednesday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="3" style="margin: 0; vertical-align: middle;"> W
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Thursday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="4" style="margin: 0; vertical-align: middle;"> T
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Friday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="5" style="margin: 0; vertical-align: middle;"> F
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Saturday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="6" style="margin: 0; vertical-align: middle;"> S
                    </label>
                    <label style="font-size: 11px; cursor: pointer; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; user-select: none;" title="Sunday">
                        <input type="checkbox" class="weekday-checkbox" data-file-id="${file.id}" data-day="0" style="margin: 0; vertical-align: middle;"> S
                    </label>
                </div>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <select class="publish-hour-input" data-file-id="${file.id}" style="padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; flex: 1;">
                        <option value="">Hour</option>
                        ${hourOptions}
                    </select>
                    <span style="font-weight: bold;">:</span>
                    <select class="publish-minute-input" data-file-id="${file.id}" style="padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; flex: 1;">
                        <option value="">Min</option>
                        <option value="00">00</option>
                        <option value="05">05</option>
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="20">20</option>
                        <option value="25">25</option>
                        <option value="30">30</option>
                        <option value="35">35</option>
                        <option value="40">40</option>
                        <option value="45">45</option>
                        <option value="50">50</option>
                        <option value="55">55</option>
                    </select>
                </div>
                <div style="font-size: 10px; color: #999;">Local time: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZoneName: 'short'})}</div>
            </div>
        `;
        
        tr.appendChild(tdCheckbox);
        tr.appendChild(tdName);
        tr.appendChild(tdFileType);
        tr.appendChild(tdPath);
        tr.appendChild(tdDate);
        tr.appendChild(tdTimeSince);
        tr.appendChild(tdPublishTime);
        
        // Click on row toggles checkbox
        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = tr.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
                updateFileSelection();
            }
        });
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    filesList.appendChild(table);
    
    // Set up auto-refresh of time since publish (every 60 seconds)
    if (timeSincePublishInterval) {
        clearInterval(timeSincePublishInterval);
    }
    timeSincePublishInterval = setInterval(updateTimeSinceCells, 60000);
    
    // Load saved schedules from Firestore (wait for DOM to be ready)
    setTimeout(() => {
        loadPublishingSchedules();
    }, 100);
}

async function onHubSelected() {
    // Legacy function - now using selectHub
}

async function onProjectSelected() {
    // Legacy function - now using selectProject
}

function updateFileSelection() {
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]:not(.weekday-checkbox)');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    document.getElementById('fileSelectionCount').textContent = `${checkedCount} file${checkedCount !== 1 ? 's' : ''} selected`;
    
    // Update visual styling for checked items
    checkboxes.forEach(checkbox => {
        const item = checkbox.closest('.file-checkbox-item');
        if (checkbox.checked) {
            item.classList.add('checked');
        } else {
            item.classList.remove('checked');
        }
    });
    
    // If exactly one file is selected, populate the GUIDs for backward compatibility
    if (checkedCount === 1) {
        const checkedItem = Array.from(checkboxes).find(cb => cb.checked).closest('.file-checkbox-item');
        const projectGuidEl = document.getElementById('projectGuid');
        const modelGuidEl = document.getElementById('modelGuid');
        if (projectGuidEl) projectGuidEl.value = checkedItem.dataset.projectGuid || '';
        if (modelGuidEl) modelGuidEl.value = checkedItem.dataset.modelGuid || '';
    } else if (checkedCount > 1) {
        const projectGuidEl = document.getElementById('projectGuid');
        const modelGuidEl = document.getElementById('modelGuid');
        if (projectGuidEl) projectGuidEl.value = 'Multiple files selected';
        if (modelGuidEl) modelGuidEl.value = 'Multiple files selected';
    }
}

function selectAllFiles() {
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]:not(.weekday-checkbox)');
    checkboxes.forEach(cb => cb.checked = true);
    updateFileSelection();
}

function deselectAllFiles() {
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]:not(.weekday-checkbox)');
    checkboxes.forEach(cb => cb.checked = false);
    updateFileSelection();
}

async function checkWorkItemsStatus() {
    if (!window.currentWorkItems || window.currentWorkItems.length === 0) {
        showMessage('publishMessage', 'No WorkItems to check. Publish some files first.', 'error');
        addLog('❌ No WorkItems tracked. Publish files first.', 'error');
        return;
    }

    try {
        addLog('\n🔍 Checking status of WorkItems...', 'info');
        addLog(`Sending request for ${window.currentWorkItems.length} WorkItems...`, 'info');
        console.log('WorkItems to check:', window.currentWorkItems);
        
        const response = await fetch('/api/design-automation/workitems/batch-status', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                workItems: window.currentWorkItems
            })
        });

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok && data.results) {
            addLog('\n📊 WorkItem Status Report:', 'info');
            
            let completed = 0;
            let pending = 0;
            let inProgress = 0;
            let failed = 0;

            data.results.forEach(item => {
                const statusIcon = item.status === 'success' ? '✓' : 
                                   item.status === 'failed' ? '✗' : 
                                   item.status === 'inprogress' ? '⏳' : 
                                   item.status === 'pending' ? '⏸' : 
                                   item.status === 'error' ? '❌' : '?';
                
                addLog(`  ${statusIcon} ${item.fileName}: ${item.status}`, 
                       item.status === 'success' ? 'success' : 
                       item.status === 'failed' || item.status === 'error' ? 'error' : 'info');
                
                if (item.error) {
                    addLog(`     Error: ${JSON.stringify(item.error)}`, 'error');
                }
                
                if (item.stats) {
                    addLog(`     Time: ${item.stats.timeQueued || 0}s queued, ${item.stats.timeDownloadingInputsTotalTime || 0}s downloading, ${item.stats.timeInstructionsTotalTime || 0}s processing`);
                }
                
                if (item.reportUrl) {
                    addLog(`     Report: ${item.reportUrl}`);
                }

                // Count statuses
                if (item.status === 'success') completed++;
                else if (item.status === 'pending') pending++;
                else if (item.status === 'inprogress') inProgress++;
                else if (item.status === 'failed' || item.status === 'error') failed++;
            });

            addLog(`\n📈 Summary: ${completed} completed, ${inProgress} in progress, ${pending} pending, ${failed} failed`, 'info');
            
            // Update button text
            const statusButton = document.getElementById('checkWorkItemsStatus');
            if (statusButton) {
                if (completed + failed === window.currentWorkItems.length) {
                    statusButton.textContent = '✓ All Complete';
                    statusButton.disabled = true;
                } else {
                    statusButton.textContent = `Refresh Status (${inProgress + pending} running)`;
                }
            }

            const successMsg = completed === window.currentWorkItems.length 
                ? `All ${completed} WorkItems completed successfully!`
                : `Status: ${completed}/${window.currentWorkItems.length} completed`;
            
            showMessage('publishMessage', successMsg, completed === window.currentWorkItems.length ? 'success' : 'info');
        } else {
            addLog(`❌ Error from server: ${JSON.stringify(data)}`, 'error');
            showMessage('publishMessage', `Error checking status: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('checkWorkItemsStatus error:', error);
        addLog(`❌ Request failed: ${error.message}`, 'error');
        showMessage('publishMessage', `Failed to check WorkItems status: ${error.message}`, 'error');
    }
}

// Publishing Schedule Management
function getPublishingSchedule(fileId) {
    const weekdayCheckboxes = document.querySelectorAll(`.weekday-checkbox[data-file-id="${fileId}"]`);
    const hourInput = document.querySelector(`.publish-hour-input[data-file-id="${fileId}"]`);
    const minuteInput = document.querySelector(`.publish-minute-input[data-file-id="${fileId}"]`);
    
    const selectedDays = Array.from(weekdayCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.dataset.day));
    
    const hour = hourInput ? hourInput.value : null;
    const minute = minuteInput ? minuteInput.value : null;
    
    if (selectedDays.length === 0 || !hour || !minute) {
        return null;
    }
    
    return {
        fileId: fileId,
        days: selectedDays, // 0=Sunday, 1=Monday, etc.
        time: `${hour}:${minute}`, // HH:MM format
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
}

function getAllPublishingSchedules() {
    const schedules = [];
    const hourInputs = document.querySelectorAll('.publish-hour-input');
    
    hourInputs.forEach(input => {
        const fileId = input.dataset.fileId;
        const schedule = getPublishingSchedule(fileId);
        if (schedule) {
            // Find the file name from the row
            const row = input.closest('tr');
            const fileName = row ? row.dataset.fileName : 'Unknown';
            schedule.fileName = fileName;
            schedules.push(schedule);
        }
    });
    
    return schedules;
}

function formatScheduleDisplay(schedule) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayString = schedule.days.map(d => dayNames[d]).join(', ');
    return `${dayString} at ${schedule.time} (${schedule.timezone})`;
}
// Save all publishing schedules to Firestore
async function savePublishingSchedules() {
    try {
        console.log('=== savePublishingSchedules called ===');
        console.log('Firebase available:', typeof firebase !== 'undefined');
        console.log('userId:', userId);
        
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not loaded, cannot save schedules');
            showMessage('publishMessage', 'Firebase not initialized. Please refresh the page.', 'error');
            return;
        }
        
        if (!userId) {
            console.error('No userId - user must be logged in');
            showMessage('publishMessage', 'You must be logged in to save schedules', 'error');
            return;
        }
        
        const schedules = getAllPublishingSchedules();
        console.log('Collected schedules:', schedules.length, schedules);
        
        // Enhance schedules with additional metadata needed for publishing
        const enhancedSchedules = schedules.map(schedule => {
            const row = document.querySelector(`tr[data-file-id="${schedule.fileId}"]`);
            if (!row) {
                console.warn(`Row not found for fileId: ${schedule.fileId}`);
                return schedule;
            }
            
            // Find the file data to get type information
            const fileData = allRevitFiles.find(f => f.id === schedule.fileId);
            
            const enhanced = {
                ...schedule,
                projectId: selectedProjectId, // Add projectId (e.g., b.xxx format)
                projectGuid: row.dataset.projectGuid,
                modelGuid: row.dataset.modelGuid,
                region: row.dataset.region || 'US',
                // Add file type information
                extensionType: fileData?.extensionType || '',
                modelType: fileData?.modelType || '',
                isCloudModel: fileData?.isCloudModel || false
            };
            
            console.log('Enhanced schedule:', enhanced);
            return enhanced;
        });
        
        console.log('Saving to Firestore, userId:', userId);
        console.log('Enhanced schedules:', enhancedSchedules);
        
        const db = firebase.firestore();
        await db.collection('users').doc(userId).set({
            publishingSchedules: enhancedSchedules,
            schedulesUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Saved ${schedules.length} schedules for user: ${userId}`);
        showMessage('publishMessage', `✓ Saved ${schedules.length} publishing schedule(s)`, 'success');
        console.log('Schedules saved:', enhancedSchedules);
        
        // Show toast notification
        showToast(
            'Schedules Saved!',
            `${schedules.length} publishing schedule(s) saved successfully`,
            'success'
        );
        
    } catch (error) {
        console.error('Error saving schedules:', error);
        showMessage('publishMessage', `Failed to save schedules: ${error.message}`, 'error');
        
        // Show toast notification
        showToast(
            'Save Failed',
            `Failed to save schedules: ${error.message}`,
            'error'
        );
    }
}

// Load publishing schedules from Firestore
async function loadPublishingSchedules() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not loaded, skipping schedule load');
            return;
        }
        
        if (!userId) {
            console.log('No userId found, skipping schedule load');
            return;
        }
        
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            console.log(`User document not found for userId: ${userId}`);
            return;
        }
        
        const userData = userDoc.data();
        const schedules = userData.publishingSchedules || [];
        
        console.log(`Loaded schedules from Firestore for user ${userId}:`, schedules);
        
        if (schedules.length === 0) {
            console.log('No schedules found in Firestore');
            return;
        }
        
        // Apply schedules to the UI
        let appliedCount = 0;
        schedules.forEach(schedule => {
            console.log(`Applying schedule for file: ${schedule.fileName} (fileId: ${schedule.fileId})`);
            
            // Collect all matching fileIds (exact match or by fileName)
            const matchingFileIds = [];
            
            // Try exact fileId first
            let testInput = document.querySelector(`.publish-hour-input[data-file-id="${schedule.fileId}"]`);
            if (testInput) {
                matchingFileIds.push(schedule.fileId);
                console.log(`  Found exact fileId match`);
            }
            
            // If not found by exact match, find ALL files by fileName (all versions)
            if (matchingFileIds.length === 0 && schedule.fileName) {
                console.log(`  Exact fileId not found, searching all versions of: ${schedule.fileName}`);
                
                const allRows = document.querySelectorAll('#rvtFilesList tbody tr');
                for (const row of allRows) {
                    const nameCell = row.querySelector('td:nth-child(2)');
                    const rowModelGuid = row.dataset.modelGuid;
                    
                    // Match by name AND modelGuid to avoid matching files with same name in different locations
                    if (nameCell && nameCell.textContent.startsWith(schedule.fileName + ' ') && 
                        rowModelGuid === schedule.modelGuid) {
                        const matchedFileId = row.dataset.fileId;
                        matchingFileIds.push(matchedFileId);
                        console.log(`  Found matching file version with fileId: ${matchedFileId}`);
                    }
                }
            }
            
            // Apply schedule to all matching files
            matchingFileIds.forEach(fileId => {
                const hourInput = document.querySelector(`.publish-hour-input[data-file-id="${fileId}"]`);
                const minuteInput = document.querySelector(`.publish-minute-input[data-file-id="${fileId}"]`);
                const checkboxes = document.querySelectorAll(`.weekday-checkbox[data-file-id="${fileId}"]`);
                
                if (hourInput && minuteInput && schedule.time) {
                    const [hour, minute] = schedule.time.split(':');
                    hourInput.value = hour;
                    minuteInput.value = minute;
                    console.log(`  Set time to ${hour}:${minute} for fileId: ${fileId}`);
                }
                
                if (checkboxes && schedule.days) {
                    checkboxes.forEach(cb => {
                        const day = parseInt(cb.dataset.day);
                        const shouldCheck = schedule.days.includes(day);
                        cb.checked = shouldCheck;
                    });
                    appliedCount++;
                }
            });
        });
        
    } catch (error) {
        console.error('Error loading schedules:', error);
    }
}

// Publishing History Functions
async function saveToPublishingHistory(fileName, projectName, status, message, details = {}) {
    try {
        console.log('Saving to publishing history:', { fileName, projectName, status, message, details });
        
        // Save to localStorage for immediate display
        const history = JSON.parse(localStorage.getItem('publishingHistory') || '[]');
        const entry = {
            timestamp: new Date().toISOString(),
            fileName: fileName,
            projectName: projectName,
            status: status, // 'success', 'error', 'info', 'warning'
            message: message,
            details: details
        };
        
        // Add to beginning of array (most recent first)
        history.unshift(entry);
        
        // Keep only last 100 entries to avoid localStorage overflow
        if (history.length > 100) {
            history.splice(100);
        }
        
        localStorage.setItem('publishingHistory', JSON.stringify(history));
        console.log('Successfully saved to localStorage. Total records:', history.length);
        
        // Also save to Firestore for persistence across logins
        if (typeof firebase !== 'undefined' && userId && typeof firebase.firestore === 'function') {
            try {
                const db = firebase.firestore();
                await db.collection('publishingLogs').add({
                    userId: userId,
                    fileName: fileName,
                    projectName: projectName,
                    fileType: details.fileType || 'Unknown',
                    scheduledTime: null, // Manual publish, no schedule
                    actualTime: entry.timestamp,
                    status: status,
                    message: message,
                    workItemId: details.workItemId || null,
                    commandId: details.commandId || null,
                    itemId: details.itemId || null,
                    projectId: details.projectId || null,
                    isRCM: details.isRCM || false,
                    isC4R: details.isC4R || false,
                    source: 'manual' // Mark as manual publish
                });
                console.log('Successfully saved to Firestore');
            } catch (firestoreError) {
                console.error('Error saving to Firestore:', firestoreError);
                // Don't fail if Firestore save fails - localStorage is enough for current session
            }
        }
    } catch (error) {
        console.error('Error saving to publishing history:', error);
    }
}

function showPublishingHistory() {
    const modal = document.getElementById('publishingHistoryModal');
    modal.style.display = 'flex';
    refreshPublishingHistory();
    
    // Start auto-refresh for pending entries (every 10 seconds to reduce flickering)
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
    }
    historyRefreshInterval = setInterval(() => {
        console.log('[Auto-refresh] Checking for updates...');
        refreshPublishingHistory();
    }, 10000); // Refresh every 10 seconds (reduced from 3s to prevent flickering)
}

function closePublishingHistory() {
    const modal = document.getElementById('publishingHistoryModal');
    modal.style.display = 'none';
    
    // Stop auto-refresh
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
        historyRefreshInterval = null;
    }
}

async function refreshPublishingHistory() {
    try {
        console.log('Refreshing publishing history...');
        
        const contentDiv = document.getElementById('publishingHistoryContent');
        const countSpan = document.getElementById('historyCount');
        
        // Show loading
        contentDiv.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Loading history...</div>';
        
        // Get manual publishes from localStorage
        const localHistoryJson = localStorage.getItem('publishingHistory');
        console.log('Raw localStorage data:', localHistoryJson);
        const localHistory = JSON.parse(localHistoryJson || '[]');
        console.log('Local history:', localHistory);
        
        // Get scheduled publishes from Firestore
        let firestoreHistory = [];
        
        // Use the global userId from APS OAuth session (not Firebase auth)
        if (typeof firebase !== 'undefined' && userId && typeof firebase.firestore === 'function') {
            try {
                console.log('Fetching Firestore history for user:', userId);
                
                const db = firebase.firestore();
                
                // Debug: Check ALL logs in database
                const allLogsSnapshot = await db.collection('publishingLogs').limit(10).get();
                console.log('Total publishingLogs in database (sample):', allLogsSnapshot.docs.length);
                if (allLogsSnapshot.docs.length > 0) {
                    console.log('Sample log userIds:', allLogsSnapshot.docs.map(d => ({
                        userId: d.data().userId,
                        fileName: d.data().fileName
                    })));
                }
                
                // Query without orderBy to avoid index requirement - sort client-side instead
                const logsSnapshot = await db.collection('publishingLogs')
                    .where('userId', '==', userId)
                    .limit(100)  // Increased limit since we'll sort client-side
                    .get();
                
                console.log('Firestore logs found:', logsSnapshot.docs.length);
                console.log('Firestore log sample:', logsSnapshot.docs.length > 0 ? logsSnapshot.docs[0].data() : 'none');
                
                firestoreHistory = logsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    
                    // Determine status and message
                    let displayStatus = data.status || 'info';
                    let displayMessage = data.message;
                    
                    // If no custom message, generate one
                    if (!displayMessage) {
                        if (data.status === 'success') {
                            const fileType = data.isRCM ? 'RCM' : (data.isC4R ? 'C4R' : '');
                            displayMessage = `${fileType} file published successfully at ${data.scheduledTime}`;
                        } else {
                            displayMessage = data.error || 'Scheduled publish failed';
                        }
                    }
                    
                    // Add helpful tip to details if available
                    const enhancedDetails = { ...data.details };
                    if (data.helpfulTip) {
                        enhancedDetails.helpfulTip = data.helpfulTip;
                    }
                    
                    // Check if this is an old stuck entry (more than 10 minutes old)
                    const entryAge = Date.now() - new Date(data.actualTime).getTime();
                    const tenMinutes = 10 * 60 * 1000;
                    
                    // If entry is old and still has 'info' status, mark it as timeout
                    if (displayStatus === 'info' && entryAge > tenMinutes) {
                        displayStatus = 'warning';
                        displayMessage = 'Scheduled publish timed out (no response from Design Automation)';
                    }
                    
                    return {
                        timestamp: data.actualTime,
                        fileName: data.fileName,
                        projectName: data.projectName || (data.source === 'manual' ? 'Manual Publish' : 'Scheduled Publish'),
                        status: displayStatus,
                        message: displayMessage,
                        details: {
                            scheduledTime: data.scheduledTime,
                            workItemId: data.workItemId,
                            workItemStatus: data.workItemStatus,
                            fileType: data.fileType,
                            isRCM: data.isRCM,
                            isC4R: data.isC4R,
                            commandId: data.commandId,
                            itemId: data.itemId,
                            projectId: data.projectId,
                            source: data.source || 'scheduled', // Use actual source from Firestore
                            age: entryAge > tenMinutes ? 'timeout' : 'active'
                        }
                    };
                });
                
                console.log('Firestore history:', firestoreHistory);
            } catch (error) {
                console.error('Error fetching Firestore history:', error);
            }
        } else {
            if (!userId) {
                console.log('No userId available, skipping Firestore history');
            } else if (typeof firebase === 'undefined') {
                console.log('Firebase not loaded, skipping Firestore history');
            }
        }
        
        // Combine and sort by timestamp (most recent first)
        const allHistory = [...localHistory, ...firestoreHistory].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        console.log('Local history count:', localHistory.length);
        console.log('Firestore history count:', firestoreHistory.length);
        console.log('Combined history length:', allHistory.length);
        console.log('Combined history:', allHistory);
        
        // Don't update count here, we'll do it at the end after checking for pending entries
        
        if (allHistory.length === 0) {
            contentDiv.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No publishing history found</div>';
            countSpan.textContent = '0 records';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        
        allHistory.forEach((entry, index) => {
            const date = new Date(entry.timestamp);
            const formattedDate = date.toLocaleString();
            
            // Check if entry is pending (only if status is explicitly 'pending' or 'info')
            // Don't auto-refresh old scheduled entries that are stuck
            const isPending = entry.status === 'pending' || 
                (entry.status === 'info' && entry.message?.includes('Publishing') && !entry.message?.includes('failed') && !entry.message?.includes('successfully'));
            
            let statusColor = '#6c757d';
            let statusIcon = 'ℹ';
            if (isPending) {
                statusColor = '#0696D7';
                statusIcon = '⏳';
            } else if (entry.status === 'success') {
                statusColor = '#28a745';
                statusIcon = '✓';
            } else if (entry.status === 'error') {
                statusColor = '#dc3545';
                statusIcon = '✗';
            } else if (entry.status === 'warning') {
                statusColor = '#ffc107';
                statusIcon = '⚠';
            }
            
            // Determine source badge
            const isScheduled = entry.details?.source === 'scheduled';
            console.log(`Entry ${index}: ${entry.fileName}, isScheduled=${isScheduled}, source=${entry.details?.source}`);
            const sourceBadge = isScheduled 
                ? '<span style="background: #0696D7; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">SCHEDULED</span>'
                : '<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">MANUAL</span>';
            
            // File type badge for both manual and scheduled publishes
            let fileTypeBadge = '';
            if (entry.details) {
                // Check explicit flags first
                let isRCM = entry.details.isRCM || entry.isRCM;
                let isC4R = entry.details.isC4R || entry.isC4R;
                
                // Fallback: detect from workItemId/commandId for old entries without flags
                if (!isRCM && !isC4R) {
                    if (entry.details.workItemId) {
                        isRCM = true;
                    } else if (entry.details.commandId) {
                        isC4R = true;
                    }
                }
                
                if (isRCM) {
                    fileTypeBadge = '<span style="background: #6f42c1; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">RCM</span>';
                } else if (isC4R) {
                    fileTypeBadge = '<span style="background: #17a2b8; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">C4R</span>';
                }
            }
            
            html += `
                <div style="background: white; border-left: 4px solid ${statusColor}; padding: 12px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold; color: #333; margin-bottom: 4px;">
                                <span style="color: ${statusColor}; margin-right: 8px; font-size: 16px;">${statusIcon}</span>
                                ${entry.fileName}
                                ${sourceBadge}
                                ${fileTypeBadge}
                            </div>
                            <div style="font-size: 12px; color: #666;">
                                ${entry.projectName || 'Unknown Project'}
                            </div>
                        </div>
                        <div style="font-size: 12px; color: #999; white-space: nowrap; margin-left: 15px;">
                            ${formattedDate}
                        </div>
                    </div>
                    <div style="color: #333; font-size: 14px;">
                        ${entry.message}
                    </div>
                    ${isPending ? `
                        <div style="margin-top: 8px; padding: 8px; background: #e7f3ff; border-left: 3px solid #0696D7; border-radius: 4px;">
                            <div style="font-size: 12px; color: #0077B6;">
                                ⏳ Processing... This entry will update automatically when complete.
                            </div>
                        </div>
                    ` : ''}
                    ${entry.details?.helpfulTip ? `
                        <div style="margin-top: 10px; padding: 10px; background: ${entry.status === 'warning' ? '#fff3cd' : '#f8d7da'}; border-left: 3px solid ${entry.status === 'warning' ? '#ffc107' : '#dc3545'}; border-radius: 4px;">
                            <div style="font-size: 13px; color: #856404; font-weight: 500;">
                                ${entry.details.helpfulTip}
                            </div>
                            ${entry.details.errorCode === 'C4R' && entry.details.statusCode === 403 ? `
                                <div style="margin-top: 8px; font-size: 12px; color: #856404;">
                                    <strong>Required:</strong> "Cloud Models for Revit" service<br>
                                    <strong>Affects:</strong> Single-user RCM files only (C4R/workshared files work normally)<br>
                                    <strong>Solution:</strong> Autodesk Account Admin must enable this service for the user
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    ${entry.details && Object.keys(entry.details).length > 0 ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                            <details style="font-size: 12px; color: #666;">
                                <summary style="cursor: pointer; user-select: none;">Technical Details</summary>
                                <pre style="margin-top: 8px; background: #f8f9fa; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 11px;">${JSON.stringify(entry.details, null, 2)}</pre>
                            </details>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        contentDiv.innerHTML = html;
        
        // Check for pending entries (only recent ones - within last 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const hasPendingEntries = allHistory.some(entry => {
            const entryTime = new Date(entry.timestamp).getTime();
            const isRecent = entryTime > fiveMinutesAgo;
            const isPending = entry.status === 'pending' || 
                (entry.status === 'info' && entry.message?.includes('Publishing') && !entry.message?.includes('failed') && !entry.message?.includes('successfully'));
            return isRecent && isPending;
        });
        
        console.log(`[Auto-refresh] Has pending entries: ${hasPendingEntries}`);
        
        // Update count span with refresh indicator if pending
        if (hasPendingEntries) {
            countSpan.textContent = `${allHistory.length} record${allHistory.length !== 1 ? 's' : ''} (${localHistory.length} manual, ${firestoreHistory.length} scheduled) - Auto-refreshing...`;
        } else {
            countSpan.textContent = `${allHistory.length} record${allHistory.length !== 1 ? 's' : ''} (${localHistory.length} manual, ${firestoreHistory.length} scheduled)`;
            // Stop auto-refresh if no pending entries
            if (historyRefreshInterval && !hasPendingEntries) {
                console.log('[Auto-refresh] No pending entries, stopping auto-refresh');
                clearInterval(historyRefreshInterval);
                historyRefreshInterval = null;
            }
        }
        
    } catch (error) {
        console.error('Error loading publishing history:', error);
        document.getElementById('publishingHistoryContent').innerHTML = 
            '<div style="text-align: center; color: #dc3545; padding: 20px;">Error loading history</div>';
    }
}

async function downloadHistoryReport() {
    try {
        console.log('Generating publishing history CSV report...');
        
        // Get manual publishes from localStorage
        const localHistory = JSON.parse(localStorage.getItem('publishingHistory') || '[]');
        
        // Get scheduled publishes from Firestore
        let firestoreHistory = [];
        
        if (typeof firebase !== 'undefined' && userId && typeof firebase.firestore === 'function') {
            try {
                const db = firebase.firestore();
                const logsSnapshot = await db.collection('publishingLogs')
                    .where('userId', '==', userId)
                    .limit(1000)
                    .get();
                
                firestoreHistory = logsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        timestamp: data.actualTime,
                        fileName: data.fileName,
                        projectName: data.projectName || (data.source === 'manual' ? 'Manual Publish' : 'Scheduled Publish'),
                        status: data.status || 'info',
                        message: data.message,
                        details: {
                            source: data.source || 'scheduled',
                            isRCM: data.isRCM,
                            isC4R: data.isC4R
                        }
                    };
                });
            } catch (error) {
                console.error('Error fetching Firestore history for CSV:', error);
            }
        }
        
        // Combine and sort by timestamp
        const allHistory = [...localHistory, ...firestoreHistory].sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        if (allHistory.length === 0) {
            showToast('No Data', 'No publishing history to export', 'warning');
            return;
        }
        
        // Create CSV content
        const headers = ['File Name', 'Publishing Method', 'File Type', 'Project Name', 'Date', 'Status', 'Message'];
        const csvRows = [headers.join(',')];
        
        allHistory.forEach(entry => {
            // Determine publishing method - manual publishes from localStorage won't have details.source
            const publishingMethod = (entry.details?.source === 'manual' || 
                                     (!entry.details?.source && entry.details?.commandId)) 
                                    ? 'Manual' : 'Scheduled';
            
            // File type detection - check both entry.details and top-level for localStorage entries
            let fileType = '';
            if (entry.details?.isRCM || entry.isRCM) {
                fileType = 'RCM';
            } else if (entry.details?.isC4R || entry.isC4R) {
                fileType = 'C4R';
            }
            
            // Fallback: detect from workItemId/commandId for old entries without flags
            if (!fileType && entry.details) {
                if (entry.details.workItemId) {
                    fileType = 'RCM';
                } else if (entry.details.commandId) {
                    fileType = 'C4R';
                }
            }
            
            const fileName = `"${(entry.fileName || '').replace(/"/g, '""')}"`;
            const projectName = `"${(entry.projectName || '').replace(/"/g, '""')}"`;
            const date = new Date(entry.timestamp).toLocaleString();
            const status = entry.status || '';
            const message = `"${(entry.message || '').replace(/"/g, '""')}"`;
            
            csvRows.push([
                fileName,
                publishingMethod,
                fileType,
                projectName,
                date,
                status,
                message
            ].join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `publishing-history-${timestamp}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`CSV report downloaded: ${filename} (${allHistory.length} records)`);
        showToast('Export Complete', `Downloaded ${allHistory.length} records to ${filename}`, 'success');
        
    } catch (error) {
        console.error('Error generating CSV report:', error);
        showToast('Export Failed', `Failed to generate report: ${error.message}`, 'error');
    }
}

async function clearPublishingHistory() {
    if (confirm('Are you sure you want to clear all publishing history? This will clear both manual and scheduled publish logs.')) {
        try {
            // Clear localStorage (manual publishes)
            localStorage.removeItem('publishingHistory');
            
            // Clear Firestore scheduled publishes
            if (typeof firebase !== 'undefined' && userId && typeof firebase.firestore === 'function') {
                const db = firebase.firestore();
                const logsSnapshot = await db.collection('publishingLogs')
                    .where('userId', '==', userId)
                    .get();
                
                const batch = db.batch();
                logsSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                console.log(`Deleted ${logsSnapshot.docs.length} scheduled publish logs from Firestore`);
            }
            
            // Refresh the display
            await refreshPublishingHistory();
            
            // Show success toast
            showToast('History Cleared', 'All publishing history has been cleared', 'success');
            
        } catch (error) {
            console.error('Error clearing history:', error);
            showToast('Clear Failed', `Failed to clear history: ${error.message}`, 'error');
        }
    }
}

// Click outside modal to close
window.onclick = function(event) {
    const historyModal = document.getElementById('publishingHistoryModal');
    if (event.target === historyModal) {
        closePublishingHistory();
    }
}