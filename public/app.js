let sessionId = null;

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

// Credentials Management
function loadCredentials() {
    const clientId = localStorage.getItem('APS_CLIENT_ID');
    const clientSecret = localStorage.getItem('APS_CLIENT_SECRET');
    return { clientId, clientSecret };
}

function showCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    const { clientId, clientSecret } = loadCredentials();
    
    if (clientId) document.getElementById('clientIdInput').value = clientId;
    if (clientSecret) document.getElementById('clientSecretInput').value = clientSecret;
    
    modal.style.display = 'block';
}

function closeCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    modal.style.display = 'none';
    document.getElementById('credentialsMessage').textContent = '';
}

function saveCredentials() {
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
    
    localStorage.setItem('APS_CLIENT_ID', clientId);
    localStorage.setItem('APS_CLIENT_SECRET', clientSecret);
    
    messageDiv.textContent = 'Credentials saved successfully!';
    messageDiv.style.display = 'block';
    messageDiv.style.backgroundColor = '#e8f5e9';
    messageDiv.style.color = '#2e7d32';
    
    setTimeout(() => {
        closeCredentialsModal();
    }, 1500);
}

function openApsGuide() {
    window.open('https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/', '_blank');
}

// Check for session on page load
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');

    if (sessionId) {
        checkSession().then(() => {
            // Auto-upload AppBundle after successful authentication
            autoUploadAppBundle();
        });
        // Clean URL
        window.history.replaceState({}, document.title, '/');
    }

    if (params.get('success') === 'true') {
        showMessage('authMessage', 'Successfully authenticated!', 'success');
    }

    if (params.get('error')) {
        showMessage('authMessage', 'Authentication failed. Please try again.', 'error');
    }
});

// Authentication functions
function login() {
    window.location.href = '/oauth/login';
}

async function logout() {
    if (!sessionId) return;

    try {
        await fetch(`/oauth/logout/${sessionId}`, { method: 'POST' });
        sessionId = null;
        updateAuthUI(false);
        showMessage('authMessage', 'Logged out successfully', 'info');
    } catch (error) {
        showMessage('authMessage', `Logout failed: ${error.message}`, 'error');
    }
}

async function checkSession() {
    if (!sessionId) return;

    try {
        const response = await fetch(`/oauth/session/${sessionId}`);
        if (response.ok) {
            const data = await response.json();
            updateAuthUI(data.authenticated);
            if (data.authenticated) {
                // Auto-load hubs after authentication
                await loadHubs();
            }
        } else {
            sessionId = null;
            updateAuthUI(false);
        }
    } catch (error) {
        console.error('Session check failed:', error);
        updateAuthUI(false);
    }
}

function updateAuthUI(authenticated) {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const loginDiv = document.getElementById('login');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');

    if (authenticated) {
        loginBtn.classList.add('hidden');
        settingsBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        loginDiv.style.display = 'flex';
        contentDiv.style.display = 'block';
        errorDiv.style.display = 'none';
    } else {
        loginBtn.classList.remove('hidden');
        settingsBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        loginDiv.style.display = 'flex';
        contentDiv.style.display = 'none';
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
            headers: { 'Content-Type': 'application/json' },
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

// Publish function
async function publishModel() {
    if (!sessionId) {
        showMessage('publishMessage', 'Please login first', 'error');
        return;
    }

    // Get all selected files
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]:checked');
    const selectedFiles = Array.from(checkboxes).map(cb => {
        const item = cb.closest('.file-checkbox-item');
        return {
            projectGuid: item.dataset.projectGuid,
            modelGuid: item.dataset.modelGuid,
            fileName: item.dataset.fileName,
            itemId: item.dataset.itemId
        };
    });

    if (selectedFiles.length === 0) {
        showMessage('publishMessage', 'Please select at least one Revit file', 'error');
        return;
    }

    try {
        showMessage('publishMessage', `Publishing ${selectedFiles.length} model(s) directly to cloud...`, 'info');
        addLog(`Starting batch publish for ${selectedFiles.length} model(s)...`, 'info');

        let successCount = 0;
        let failCount = 0;

        // Process files sequentially using PublishModel API
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            addLog(`\n[${i + 1}/${selectedFiles.length}] Publishing: ${file.fileName}`, 'info');

            const response = await fetch(`/api/data-management/publish/${encodeURIComponent(file.itemId)}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionId}`
                },
                body: JSON.stringify({
                    projectId: selectedProjectId
                })
            });

            const data = await response.json();

            if (response.ok) {
                addLog(`  ✓ Publish command initiated successfully`, 'success');
                addLog(`  Command ID: ${data.commandId}`);
                addLog(`  Status: ${data.status}`);
                successCount++;
            } else {
                addLog(`  ✗ Error: ${data.error}`, 'error');
                failCount++;
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

async function loadHubs() {
    if (!sessionId) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = 'Please log in first';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/data-management/hubs', {
            headers: { 'Authorization': `Bearer ${sessionId}` }
        });
        
        const data = await response.json();
        if (response.ok) {
            originalHubsData = data;
            displayHubs(data);
            // Show content panel
            document.getElementById('content').style.display = 'block';
            document.getElementById('login').style.display = 'flex';
        } else {
            showMessage('publishMessage', `Error loading hubs: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to load hubs: ${error.message}`, 'error');
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
    
    // Load Revit files
    showMessage('publishMessage', `Loading Revit files from ${projectName}...`, 'info');
    
    try {
        // Get top folders first
        const topFoldersResponse = await fetch(
            `/api/data-management/projects/${projectId}/topFolders?hubId=${selectedHubId}`,
            { headers: { 'Authorization': `Bearer ${sessionId}` } }
        );
        
        const topFoldersData = await topFoldersResponse.json();
        if (topFoldersResponse.ok) {
            // Find "Project Files" folder
            const projectFilesFolder = topFoldersData.data.find(folder => 
                folder.attributes.name === 'Project Files' || 
                folder.attributes.name.includes('Files')
            );
            
            if (projectFilesFolder) {
                await loadRevitFiles(projectId, projectFilesFolder.id);
            } else {
                showMessage('publishMessage', 'Project Files folder not found', 'error');
            }
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to load folders: ${error.message}`, 'error');
    }
}

let allRevitFiles = [];

async function loadRevitFiles(projectId, folderId) {
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
                return;
            }
            
            allRevitFiles = data.files.map((file, index) => ({
                ...file,
                index,

            }));
            
            renderFilesList();
            updateFileSelection();
            showMessage('publishMessage', `Found ${data.total} Revit cloud model(s).`, 'success');
        } else {
            showMessage('publishMessage', `Error loading Revit files: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to load Revit files: ${error.message}`, 'error');
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
    thTimeSince.style.whiteSpace = 'nowrap';
    thTimeSince.innerHTML = `Time Since Publish`;
    
    // Publishing Time column
    const thPublishTime = document.createElement('th');
    thPublishTime.style.padding = '8px';
    thPublishTime.style.textAlign = 'left';
    thPublishTime.style.borderBottom = '2px solid #ddd';
    thPublishTime.style.whiteSpace = 'nowrap';
    thPublishTime.innerHTML = `Publishing Time`;
    
    headerRow.appendChild(thCheckbox);
    headerRow.appendChild(thName);
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
                        <option value="15">15</option>
                        <option value="30">30</option>
                        <option value="45">45</option>
                    </select>
                </div>
                <div style="font-size: 10px; color: #999;">Local time: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZoneName: 'short'})}</div>
            </div>
        `;
        
        tr.appendChild(tdCheckbox);
        tr.appendChild(tdName);
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
    
    // Load saved schedules from Firestore
    loadPublishingSchedules();
}

async function onHubSelected() {
    // Legacy function - now using selectHub
}

async function onProjectSelected() {
    // Legacy function - now using selectProject
}

function updateFileSelection() {
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]');
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
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    updateFileSelection();
}

function deselectAllFiles() {
    const checkboxes = document.querySelectorAll('#rvtFilesList input[type="checkbox"]');
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
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not loaded, cannot save schedules');
            showMessage('publishMessage', 'Firebase not initialized. Please refresh the page.', 'error');
            return;
        }
        
        if (!sessionId) {
            showMessage('publishMessage', 'You must be logged in to save schedules', 'error');
            return;
        }
        
        const schedules = getAllPublishingSchedules();
        
        // Enhance schedules with additional metadata needed for publishing
        const enhancedSchedules = schedules.map(schedule => {
            const row = document.querySelector(`tr[data-file-id="${schedule.fileId}"]`);
            if (!row) return schedule;
            
            return {
                ...schedule,
                projectGuid: row.dataset.projectGuid,
                modelGuid: row.dataset.modelGuid,
                region: row.dataset.region || 'US'
            };
        });
        
        const db = firebase.firestore();
        await db.collection('users').doc(sessionId).set({
            publishingSchedules: enhancedSchedules,
            schedulesUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        showMessage('publishMessage', `✓ Saved ${schedules.length} publishing schedule(s)`, 'success');
        console.log('Schedules saved:', enhancedSchedules);
        
    } catch (error) {
        console.error('Error saving schedules:', error);
        showMessage('publishMessage', `Failed to save schedules: ${error.message}`, 'error');
    }
}

// Load publishing schedules from Firestore
async function loadPublishingSchedules() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase not loaded, skipping schedule load');
            return;
        }
        
        if (!sessionId) {
            console.log('No session found, skipping schedule load');
            return;
        }
        
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(sessionId).get();
        
        if (!userDoc.exists) {
            console.log('User document not found');
            return;
        }
        
        const userData = userDoc.data();
        const schedules = userData.publishingSchedules || [];
        
        console.log('Loaded schedules from Firestore:', schedules);
        
        // Apply schedules to the UI
        schedules.forEach(schedule => {
            const hourInput = document.querySelector(`.publish-hour-input[data-file-id="${schedule.fileId}"]`);
            const minuteInput = document.querySelector(`.publish-minute-input[data-file-id="${schedule.fileId}"]`);
            const checkboxes = document.querySelectorAll(`.weekday-checkbox[data-file-id="${schedule.fileId}"]`);
            
            if (hourInput && minuteInput && schedule.time) {
                const [hour, minute] = schedule.time.split(':');
                hourInput.value = hour;
                minuteInput.value = minute;
            }
            
            if (checkboxes && schedule.days) {
                checkboxes.forEach(cb => {
                    cb.checked = schedule.days.includes(parseInt(cb.dataset.day));
                });
            }
        });
        
        if (schedules.length > 0) {
            showMessage('publishMessage', `✓ Loaded ${schedules.length} publishing schedule(s)`, 'info');
        }
        
    } catch (error) {
        console.error('Error loading schedules:', error);
        showMessage('publishMessage', `Failed to load schedules: ${error.message}`, 'error');
    }
}