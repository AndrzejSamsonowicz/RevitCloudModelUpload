let sessionId = null;

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

    if (authenticated) {
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
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
    const engineVersion = document.getElementById('engineVersion').value;

    try {
        showMessage('setupMessage', 'Auto-uploading AppBundle...', 'info');
        document.getElementById('setupLog').classList.remove('hidden');
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

// Store command IDs for status checking
let publishCommandIds = [];

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
        publishCommandIds = []; // Reset command IDs

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
                publishCommandIds.push({
                    commandId: data.commandId,
                    fileName: file.fileName
                });
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
        if (publishCommandIds.length > 0) {
            addLog('\nℹ Click "Check Command Status" below to verify publish completion.', 'info');
        }
        addLog('Note: Files are being published to the cloud. Refresh BIM 360/ACC to see new versions.', 'info');
        
    } catch (error) {
        showMessage('publishMessage', `Request failed: ${error.message}`, 'error');
        addLog(`Request failed: ${error.message}`, 'error');
    }
}

async function checkCommandStatus() {
    if (!publishCommandIds || publishCommandIds.length === 0) {
        showMessage('publishMessage', 'No recent publish commands to check. Publish files first.', 'error');
        return;
    }

    if (!selectedProjectId) {
        showMessage('publishMessage', 'No project selected', 'error');
        return;
    }

    try {
        showMessage('publishMessage', `Checking status of ${publishCommandIds.length} command(s)...`, 'info');
        addLog(`\n=== Checking Command Status ===`, 'info');

        for (let i = 0; i < publishCommandIds.length; i++) {
            const cmd = publishCommandIds[i];
            addLog(`\n[${i + 1}/${publishCommandIds.length}] ${cmd.fileName}`, 'info');
            addLog(`  Command ID: ${cmd.commandId}`);

            const response = await fetch(
                `/api/data-management/commands/${cmd.commandId}?projectId=${encodeURIComponent(selectedProjectId)}`,
                { headers: { 'Authorization': `Bearer ${sessionId}` } }
            );

            const data = await response.json();
            console.log('Command status response:', response.status, data);

            if (response.ok) {
                const status = data.command.attributes.status;
                const extension = data.command.attributes.extension;
                
                if (status === 'complete') {
                    addLog(`  ✓ Status: ${status}`, 'success');
                } else if (status === 'failed') {
                    addLog(`  ✗ Status: ${status}`, 'error');
                    if (extension?.error) {
                        addLog(`  Error: ${extension.error}`, 'error');
                    }
                } else {
                    addLog(`  ⏳ Status: ${status}`, 'info');
                }

                if (extension?.message) {
                    addLog(`  Message: ${extension.message}`);
                }
            } else {
                const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data);
                addLog(`  ✗ Failed to check status: ${errorMsg}`, 'error');
            }

            // Small delay between requests
            if (i < publishCommandIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        addLog(`\n=== Status Check Complete ===`, 'info');
        showMessage('publishMessage', 'Command status check complete. See log for details.', 'success');
    } catch (error) {
        showMessage('publishMessage', `Status check failed: ${error.message}`, 'error');
        addLog(`Status check failed: ${error.message}`, 'error');
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
    // Find and highlight the selected project
    const selectedItem = Array.from(document.querySelectorAll('.project-item')).find(
        item => item.textContent.trim() === projectName
    );
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
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
                publishStatus: 'unknown'
            }));
            
            renderFilesList();
            updateFileSelection();
            showMessage('publishMessage', `Found ${data.total} Revit cloud model(s). Click "Check Publish Status" to see which need publishing.`, 'success');
        } else {
            showMessage('publishMessage', `Error loading Revit files: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to load Revit files: ${error.message}`, 'error');
    }
}

function renderFilesList() {
    const filesList = document.getElementById('rvtFilesList');
    filesList.innerHTML = '';
    
    allRevitFiles.forEach((file) => {
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'file-checkbox-item';
        checkboxItem.dataset.fileId = file.id;
        checkboxItem.dataset.projectGuid = file.projectGuid;
        checkboxItem.dataset.modelGuid = file.modelGuid;
        checkboxItem.dataset.itemId = file.id;
        checkboxItem.dataset.fileName = file.name;
        checkboxItem.dataset.publishStatus = file.publishStatus || 'unknown';
        checkboxItem.dataset.index = file.index;
        
        const checkboxId = `file-checkbox-${file.index}`;
        
        let statusBadge = '';
        const modelTypeInfo = file.modelType ? ` (${file.modelType})` : '';
        
        if (file.publishStatus === 'published') {
            statusBadge = `<span class="publish-status-badge status-published" title="Published${modelTypeInfo}">✓ Published</span>`;
        } else if (file.publishStatus === 'needs_publishing') {
            statusBadge = `<span class="publish-status-badge status-needs-publishing" title="Needs Publishing${modelTypeInfo}">⚠ Needs Publishing</span>`;
        } else if (file.publishStatus === 'not_published_yet') {
            statusBadge = `<span class="publish-status-badge status-needs-publishing" title="Not published yet - Only files published after Feb 7, 2025 are supported${modelTypeInfo}">⚠ Not Published</span>`;
        } else if (file.publishStatus === 'not_cloud_model') {
            statusBadge = '<span class="publish-status-badge status-not-c4r" title="This is not a Revit Cloud Model">✗ Not Cloud Model</span>';
        } else if (file.publishStatus === 'checking') {
            statusBadge = '<span class="publish-status-badge status-checking">🔄 Checking...</span>';
        } else {
            statusBadge = `<span class="publish-status-badge status-unknown" title="${modelTypeInfo}">? Unknown</span>`;
        }
        
        checkboxItem.innerHTML = `
            <input type="checkbox" id="${checkboxId}" onchange="updateFileSelection()">
            <label for="${checkboxId}" style="flex: 1;">${file.name} (v${file.versionNumber})</label>
            ${statusBadge}
        `;
        
        // Click on the item (not checkbox or badge) toggles checkbox
        checkboxItem.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('publish-status-badge')) {
                const checkbox = checkboxItem.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
                updateFileSelection();
            }
        });
        
        filesList.appendChild(checkboxItem);
    });
    
    filterFilesByStatus();
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
        document.getElementById('projectGuid').value = checkedItem.dataset.projectGuid || '';
        document.getElementById('modelGuid').value = checkedItem.dataset.modelGuid || '';
    } else if (checkedCount > 1) {
        document.getElementById('projectGuid').value = 'Multiple files selected';
        document.getElementById('modelGuid').value = 'Multiple files selected';
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

async function checkPublishStatus() {
    if (!sessionId) {
        showMessage('publishMessage', 'Please login first', 'error');
        return;
    }

    if (!selectedProjectId || allRevitFiles.length === 0) {
        showMessage('publishMessage', 'Please select a project and load files first', 'error');
        return;
    }

    try {
        showMessage('publishMessage', 'Checking publish status for all files...', 'info');
        
        // Update UI to show "checking" status
        allRevitFiles.forEach(file => {
            file.publishStatus = 'checking';
        });
        renderFilesList();

        const projectGuidClean = selectedProjectId.startsWith('b.') ? selectedProjectId : `b.${selectedProjectId}`;
        
        const response = await fetch('/api/data-management/batch-publish-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
            },
            body: JSON.stringify({
                projectId: projectGuidClean,
                files: allRevitFiles.map(f => ({
                    itemId: f.id,
                    fileName: f.name,
                    isCloudModel: f.isCloudModel,
                    modelType: f.modelType
                }))
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`Server returned ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();

        if (response.ok && data.success) {
            // Update file statuses
            data.results.forEach(result => {
                const file = allRevitFiles.find(f => f.id === result.itemId);
                if (file) {
                    file.publishStatus = result.status;
                    file.modelType = result.modelType;
                    file.publishStatusDetails = result.publishStatus;
                }
            });

            renderFilesList();
            
            const needsPublishing = data.results.filter(r => r.status === 'needs_publishing' || r.status === 'not_published_yet').length;
            const published = data.results.filter(r => r.status === 'published').length;
            const notCloudModel = data.results.filter(r => r.status === 'not_cloud_model').length;
            const unknown = data.results.filter(r => r.status === 'unknown').length;
            
            let message = `Status check complete: ${published} published, ${needsPublishing} need publishing`;
            if (notCloudModel > 0) {
                message += `, ${notCloudModel} not cloud models`;
            }
            if (unknown > 0) {
                message += `, ${unknown} unknown`;
            }
            
            showMessage('publishMessage', message, 'success');
        } else {
            showMessage('publishMessage', `Error checking status: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        showMessage('publishMessage', `Failed to check publish status: ${error.message}`, 'error');
        // Reset to unknown status
        allRevitFiles.forEach(file => {
            file.publishStatus = 'unknown';
        });
        renderFilesList();
    }
}

function filterFilesByStatus() {
    const selectedFilter = document.querySelector('input[name="fileFilter"]:checked')?.value || 'all';
    const items = document.querySelectorAll('.file-checkbox-item');
    
    items.forEach(item => {
        const status = item.dataset.publishStatus;
        
        if (selectedFilter === 'all') {
            item.classList.remove('hidden');
        } else if (selectedFilter === 'published' && status === 'published') {
            item.classList.remove('hidden');
        } else if (selectedFilter === 'unpublished') {
            // Show all unpublished files (needs_publishing, not_published_yet, unknown, checking)
            const unpublishedStatuses = ['needs_publishing', 'not_published_yet', 'unknown', 'checking'];
            if (unpublishedStatuses.includes(status)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        } else {
            item.classList.add('hidden');
        }
    });
    
    updateFileSelection();
}

/**
 * Check status of current WorkItems
 */
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
