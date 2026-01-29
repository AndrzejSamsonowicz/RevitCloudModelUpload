let sessionId = null;

// Check for session on page load
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('session');

    if (sessionId) {
        checkSession();
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
    const authStatus = document.getElementById('authStatus');

    if (authenticated) {
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        authStatus.textContent = 'Connected';
        authStatus.className = 'status connected';
    } else {
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        authStatus.textContent = 'Not Connected';
        authStatus.className = 'status disconnected';
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

    const region = document.getElementById('region').value;
    const projectGuid = document.getElementById('projectGuid').value.trim();
    const modelGuid = document.getElementById('modelGuid').value.trim();
    const revitVersion = document.getElementById('revitVersion').value;

    if (!projectGuid || !modelGuid) {
        showMessage('publishMessage', 'Please enter Project GUID and Model GUID', 'error');
        return;
    }

    try {
        showMessage('publishMessage', 'Creating WorkItem...', 'info');
        addLog('Initiating cloud model publish...');

        const response = await fetch('/api/design-automation/workitem/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                region,
                projectGuid,
                modelGuid,
                revitVersion
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('publishMessage', data.message, 'success');
            addLog(`WorkItem created: ${data.data.workItemId}`, 'success');
            addLog(`Status: ${data.data.status}`);
            
            // Poll for status
            pollWorkItemStatus(data.data.workItemId);
        } else {
            showMessage('publishMessage', `Error: ${data.error}`, 'error');
            addLog(`Error: ${data.error}`, 'error');
        }
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
    element.innerHTML = `<div class="alert ${type}">${message}</div>`;
    
    setTimeout(() => {
        if (element.innerHTML.includes(message)) {
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
        showMessage('publishMessage', 'Please log in first', 'error');
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
            showMessage('publishMessage', `Found ${data.data.length} hubs`, 'success');
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

    let hubsHTML = '';
    hubsData.data.forEach(hub => {
        const hubName = hub.attributes.name;
        const hubId = hub.id;
        const region = hub.attributes.region || 'Unknown';
        
        hubsHTML += `
            <div class="hub-item" onclick="selectHub('${hubId}', '${hubName.replace(/'/g, "\\'")}')">
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
    
    if (!filterText.trim()) {
        displayHubs(originalHubsData);
        return;
    }

    const filtered = {
        data: originalHubsData.data.filter(hub => 
            hub.attributes.name.toLowerCase().includes(filterText)
        )
    };

    displayHubs(filtered);
}

async function selectHub(hubId, hubName) {
    selectedHubId = hubId;
    
    // Update UI
    document.querySelectorAll('.hub-item').forEach(item => item.classList.remove('selected'));
    event.target.closest('.hub-item').classList.add('selected');
    
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
    event.target.classList.add('selected');
    
    // Extract project GUID from project ID (remove 'b.' prefix if present)
    const projectGuid = projectId.startsWith('b.') ? projectId.substring(2) : projectId;
    document.getElementById('projectGuid').value = projectGuid;
    
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

async function loadRevitFiles(projectId, folderId) {
    try {
        const response = await fetch(
            `/api/data-management/projects/${projectId}/folders/${encodeURIComponent(folderId)}/rvtFiles`,
            { headers: { 'Authorization': `Bearer ${sessionId}` } }
        );
        
        const data = await response.json();
        if (response.ok) {
            const fileSelect = document.getElementById('rvtFileSelect');
            fileSelect.innerHTML = '<option value="">Select a Revit Cloud Model...</option>';
            
            data.files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.id;
                option.textContent = `${file.name} (v${file.versionNumber})`;
                option.dataset.fileId = file.id;
                option.dataset.projectGuid = file.projectGuid;
                option.dataset.modelGuid = file.modelGuid;
                option.dataset.itemId = file.id; // Store itemId for PublishModel
                fileSelect.appendChild(option);
            });
            
            // Add change event to populate model GUID
            fileSelect.onchange = function() {
                const selectedOption = this.options[this.selectedIndex];
                if (selectedOption.value) {
                    // Use the actual GUIDs from the Data Management API response
                    document.getElementById('projectGuid').value = selectedOption.dataset.projectGuid || '';
                    document.getElementById('modelGuid').value = selectedOption.dataset.modelGuid || '';
                }
            };
            
            showMessage('publishMessage', `Found ${data.total} Revit cloud model(s)`, 'success');
        } else {
            showMessage('publishMessage', `Error loading Revit files: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to load Revit files: ${error.message}`, 'error');
    }
}

async function onHubSelected() {
    // Legacy function - now using selectHub
}

async function onProjectSelected() {
    // Legacy function - now using selectProject
}
