import * as vscode from 'vscode';

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Robot Framework Toolkit</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, sans-serif);
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size, 13px);
            padding: 0;
            margin: 0;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }

        .container {
            padding: 10px;
        }

        /* Section Styling */
        .section {
            margin-bottom: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .section-header {
            background: var(--vscode-sideBarSectionHeader-background);
            padding: 8px 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
        }

        .section-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .section-content {
            padding: 12px;
            display: block;
        }

        .section-content.collapsed {
            display: none;
        }

        .toggle {
            font-size: 10px;
            transition: transform 0.2s;
        }

        /* Form Elements */
        .form-group {
            margin-bottom: 12px;
        }

        .form-group:last-child {
            margin-bottom: 0;
        }

        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
        }

        input[type="text"],
        input[type="search"],
        select {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-size: 12px;
            font-family: var(--vscode-font-family);
        }

        input:focus,
        select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }

        /* Buttons */
        button {
            padding: 6px 12px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-group {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }

        .btn-group button {
            flex: 1;
        }

        .btn-icon {
            padding: 4px 8px;
            font-size: 11px;
        }

        /* Target File Section */
        .target-info {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background: var(--vscode-input-background);
            border-radius: 3px;
            margin-bottom: 10px;
        }

        .target-path {
            flex: 1;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            color: var(--vscode-input-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lock-indicator {
            font-size: 14px;
        }

        .lock-indicator.locked {
            color: #f48771;
        }

        .lock-indicator.unlocked {
            color: var(--vscode-descriptionForeground);
        }

        /* File Browser */
        .file-browser {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 4px;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border-radius: 3px;
            margin-bottom: 4px;
        }

        .file-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .file-item input[type="checkbox"] {
            margin: 0;
        }

        .file-icon {
            font-size: 14px;
        }

        .file-name {
            flex: 1;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .file-item select {
            width: auto;
            min-width: 120px;
            font-size: 11px;
            padding: 4px 6px;
        }

        /* Folder Styling */
        .folder-item {
            margin-bottom: 4px;
        }

        .folder-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            cursor: pointer;
            border-radius: 3px;
            user-select: none;
        }

        .folder-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .toggle-icon {
            font-size: 10px;
            width: 12px;
            display: inline-block;
        }

        .folder-icon {
            font-size: 14px;
        }

        .folder-content {
            padding-left: 20px;
            margin-top: 4px;
        }

        .folder-content.collapsed {
            display: none;
        }

        /* Tabs */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 12px;
        }

        .tab {
            padding: 8px 16px;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            flex: 1;
            text-align: center;
            border-bottom: 2px solid transparent;
            font-size: 12px;
        }

        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-focusBorder);
            font-weight: 600;
        }

        .tab:hover:not(.active) {
            color: var(--vscode-foreground);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Import List */
        .import-list {
            max-height: 300px;
            overflow-y: auto;
        }

        .import-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            border-radius: 3px;
            margin-bottom: 4px;
            background: var(--vscode-input-background);
        }

        .import-badge {
            padding: 2px 6px;
            border-radius: 2px;
            font-size: 10px;
            font-weight: 600;
        }

        .import-badge.library {
            background: rgba(100, 149, 237, 0.3);
            color: #6495ed;
        }

        .import-badge.resource {
            background: rgba(144, 238, 144, 0.3);
            color: #90ee90;
        }

        .import-badge.variables {
            background: rgba(255, 165, 0, 0.3);
            color: #ffa500;
        }

        .import-path {
            flex: 1;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Keywords */
        .keyword-card {
            padding: 10px;
            border-radius: 3px;
            margin-bottom: 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            cursor: pointer;
        }

        .keyword-card:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .keyword-card.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
        }

        .keyword-name {
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 13px;
        }

        .keyword-args {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
            margin-bottom: 4px;
        }

        .keyword-doc-preview {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .keyword-details {
            padding: 12px;
        }

        .keyword-detail-section {
            margin-bottom: 12px;
        }

        .keyword-detail-label {
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .keyword-detail-value {
            font-size: 12px;
            white-space: pre-wrap;
        }

        /* Status Indicator */
        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 11px;
            background: var(--vscode-input-background);
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 13px;
        }

        /* Utility Classes */
        .text-muted {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .mt-2 {
            margin-top: 8px;
        }

        .mb-2 {
            margin-bottom: 8px;
        }

        .hidden {
            display: none !important;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-hoverBackground);
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Section 1: Target File -->
        <div class="section">
            <div class="section-header" onclick="toggleSection(this)">
                <span>🎯 Target File</span>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content" id="targetFileSection">
                <div id="targetFileContent" class="empty-state">
                    <div class="empty-state-icon">📄</div>
                    <div class="empty-state-text">No Robot Framework file selected</div>
                </div>
            </div>
        </div>

        <!-- Section 2: File Selection & Import Configuration -->
        <div class="section">
            <div class="section-header" onclick="toggleSection(this)">
                <span>📂 File Selection</span>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content" id="fileSelectionSection">
                <div class="form-group">
                    <input type="search" id="searchInput" placeholder="Search files..." />
                </div>

                <div class="btn-group mb-2">
                    <button id="expandAllBtn" class="secondary">Expand All</button>
                    <button id="collapseAllBtn" class="secondary">Collapse All</button>
                </div>

                <div class="tabs">
                    <button class="tab active" data-filter="all">All</button>
                    <button class="tab" data-filter="python">Python</button>
                    <button class="tab" data-filter="resource">Resource</button>
                    <button class="tab" data-filter="robot">Robot</button>
                </div>

                <div class="file-browser" id="fileBrowser">
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <div class="empty-state-text">Loading files...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 3: Current Imports -->
        <div class="section">
            <div class="section-header" onclick="toggleSection(this)">
                <span>📥 Current Imports</span>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content" id="currentImportsSection">
                <div id="importsList" class="import-list">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-text">No imports found</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 4: Keywords Viewer -->
        <div class="section">
            <div class="section-header" onclick="toggleSection(this)">
                <span>⚡ Keywords</span>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content" id="keywordsSection">
                <div class="tabs">
                    <button class="tab active" data-tab="list">Keywords List</button>
                    <button class="tab" data-tab="details">Details</button>
                </div>

                <div id="keywordsListTab" class="tab-content active">
                    <div class="empty-state">
                        <div class="empty-state-icon">⚡</div>
                        <div class="empty-state-text">No keywords extracted</div>
                    </div>
                </div>

                <div id="keywordDetailsTab" class="tab-content">
                    <div class="empty-state">
                        <div class="empty-state-icon">ℹ️</div>
                        <div class="empty-state-text">Select a keyword to view details</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 5: Actions -->
        <div class="section">
            <div class="section-header" onclick="toggleSection(this)">
                <span>✅ Actions</span>
                <span class="toggle">▼</span>
            </div>
            <div class="section-content" id="actionsSection">
                <div class="status-indicator" id="statusIndicator">
                    <span>No changes</span>
                </div>

                <div class="btn-group">
                    <button id="confirmBtn" disabled>Confirm Imports</button>
                    <button id="cancelBtn" class="secondary" disabled>Cancel</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // State
        let state = {
            targetFile: null,
            isLocked: false,
            allFiles: [],
            selectedFiles: {},
            existingImports: [],
            extractedKeywords: [],
            selectedKeyword: null,
            keywordSource: null,
            searchTerm: '',
            fileTypeFilter: 'all',
            pendingChanges: false
        };

        // Section Toggle
        function toggleSection(header) {
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.toggle');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
        }

        // File Type Tab Switching - using event delegation
        document.querySelector('#fileSelectionSection .tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab')) {
                const filter = e.target.dataset.filter;
                state.fileTypeFilter = filter;

                const tabs = document.querySelectorAll('#fileSelectionSection .tab');
                tabs.forEach(tab => tab.classList.remove('active'));
                e.target.classList.add('active');

                vscode.postMessage({ type: 'setFileTypeFilter', filter });
                renderFileBrowser();
            }
        });

        // Keyword Tab Switching - using event delegation
        document.querySelector('#keywordsSection .tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab')) {
                const tabName = e.target.dataset.tab;

                const tabs = document.querySelectorAll('#keywordsSection .tab');
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                document.getElementById('keywordsListTab').classList.toggle('active', tabName === 'list');
                document.getElementById('keywordDetailsTab').classList.toggle('active', tabName === 'details');
            }
        });

        // Search Input Handler
        document.getElementById('searchInput').addEventListener('input', (e) => {
            state.searchTerm = e.target.value.toLowerCase();
            vscode.postMessage({ type: 'setSearchFilter', filter: state.searchTerm });
            renderFileBrowser();
        });

        // Actions Button Handlers
        document.getElementById('confirmBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'confirmImports' });
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'cancelImports' });
        });

        // Expand/Collapse All Handlers
        document.getElementById('expandAllBtn').addEventListener('click', () => {
            const allFolderContents = document.querySelectorAll('.folder-content');
            const allToggleIcons = document.querySelectorAll('.toggle-icon');
            const allFolderIcons = document.querySelectorAll('.folder-icon');

            allFolderContents.forEach(content => content.classList.remove('collapsed'));
            allToggleIcons.forEach(icon => icon.textContent = '▼');
            allFolderIcons.forEach(icon => icon.textContent = '📂');
        });

        document.getElementById('collapseAllBtn').addEventListener('click', () => {
            const allFolderContents = document.querySelectorAll('.folder-content');
            const allToggleIcons = document.querySelectorAll('.toggle-icon');
            const allFolderIcons = document.querySelectorAll('.folder-icon');

            allFolderContents.forEach(content => content.classList.add('collapsed'));
            allToggleIcons.forEach(icon => icon.textContent = '▶');
            allFolderIcons.forEach(icon => icon.textContent = '📁');
        });

        // Render Functions using DOM methods to avoid XSS
        function createEmpty(icon, text) {
            const div = document.createElement('div');
            div.className = 'empty-state';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'empty-state-icon';
            iconDiv.textContent = icon;

            const textDiv = document.createElement('div');
            textDiv.className = 'empty-state-text';
            textContent = text;

            div.appendChild(iconDiv);
            div.appendChild(textDiv);
            return div;
        }

        function renderTargetFile() {
            const container = document.getElementById('targetFileContent');
            container.textContent = ''; // Clear

            if (!state.targetFile) {
                container.appendChild(createEmpty('📄', 'No Robot Framework file selected'));
                return;
            }

            const targetInfo = document.createElement('div');
            targetInfo.className = 'target-info';

            const lockSpan = document.createElement('span');
            lockSpan.className = 'lock-indicator ' + (state.isLocked ? 'locked' : 'unlocked');
            lockSpan.textContent = state.isLocked ? '🔒' : '🔓';

            const pathDiv = document.createElement('div');
            pathDiv.className = 'target-path';
            pathDiv.title = state.targetFile;
            pathDiv.textContent = state.targetFile;

            targetInfo.appendChild(lockSpan);
            targetInfo.appendChild(pathDiv);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'btn-group';

            const lockBtn = document.createElement('button');
            lockBtn.textContent = state.isLocked ? 'Unlock Target' : 'Lock Target';
            lockBtn.onclick = () => {
                vscode.postMessage({ type: state.isLocked ? 'unlockTarget' : 'lockTarget' });
            };

            const goBtn = document.createElement('button');
            goBtn.textContent = 'Go to File';
            goBtn.onclick = () => {
                vscode.postMessage({ type: 'goToTarget' });
            };

            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = 'Refresh';
            refreshBtn.onclick = () => {
                vscode.postMessage({ type: 'refreshImports' });
            };

            btnGroup.appendChild(lockBtn);
            btnGroup.appendChild(goBtn);
            btnGroup.appendChild(refreshBtn);

            container.appendChild(targetInfo);
            container.appendChild(btnGroup);
        }

        // Build tree structure from flat file list
        function buildFileTree(files) {
            const tree = {};

            files.forEach(filePath => {
                const parts = filePath.split('/');
                let current = tree;

                parts.forEach((part, index) => {
                    if (index === parts.length - 1) {
                        // It's a file
                        if (!current._files) {
                            current._files = [];
                        }
                        current._files.push(filePath);
                    } else {
                        // It's a folder
                        if (!current[part]) {
                            current[part] = {};
                        }
                        current = current[part];
                    }
                });
            });

            return tree;
        }

        function renderFileBrowser() {
            const container = document.getElementById('fileBrowser');
            container.textContent = ''; // Clear

            if (!state.allFiles || state.allFiles.length === 0) {
                container.appendChild(createEmpty('📁', 'No importable files found'));
                return;
            }

            // Filter files
            const filteredFiles = state.allFiles.filter(file => {
                if (state.fileTypeFilter !== 'all') {
                    if (state.fileTypeFilter === 'python' && !file.endsWith('.py')) return false;
                    if (state.fileTypeFilter === 'resource' && !file.endsWith('.resource')) return false;
                    if (state.fileTypeFilter === 'robot' && !file.endsWith('.robot')) return false;
                }

                if (state.searchTerm) {
                    return file.toLowerCase().includes(state.searchTerm);
                }

                return true;
            });

            if (filteredFiles.length === 0) {
                container.appendChild(createEmpty('🔍', 'No files match your filters'));
                return;
            }

            // Build and render tree
            const fileTree = buildFileTree(filteredFiles);
            renderTreeNode(container, fileTree, '');
        }

        function renderTreeNode(container, node, path) {
            // Sort folders and files
            const folders = Object.keys(node).filter(key => key !== '_files').sort();
            const files = node._files || [];

            // Render folders first
            folders.forEach(folderName => {
                const folderPath = path ? path + '/' + folderName : folderName;
                const folderItem = createFolderItem(folderName, node[folderName], folderPath);
                container.appendChild(folderItem);
            });

            // Render files
            files.forEach(file => {
                const fileItem = createFileItem(file);
                container.appendChild(fileItem);
            });
        }

        function createFolderItem(folderName, children, folderPath) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item';

            const header = document.createElement('div');
            header.className = 'folder-header';

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'toggle-icon';
            toggleIcon.textContent = '▶'; // Collapsed by default

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-icon';
            folderIcon.textContent = '📁'; // Closed by default

            const nameSpan = document.createElement('span');
            nameSpan.textContent = folderName;

            header.appendChild(toggleIcon);
            header.appendChild(folderIcon);
            header.appendChild(nameSpan);

            const content = document.createElement('div');
            content.className = 'folder-content collapsed'; // Collapsed by default

            // Render children
            renderTreeNode(content, children, folderPath);

            header.onclick = () => {
                content.classList.toggle('collapsed');
                toggleIcon.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
                folderIcon.textContent = content.classList.contains('collapsed') ? '📁' : '📂';
            };

            folderDiv.appendChild(header);
            folderDiv.appendChild(content);

            return folderDiv;
        }

        function createFileItem(file) {
            const div = document.createElement('div');
            div.className = 'file-item';

            const fileName = file.split('/').pop();
            const icon = file.endsWith('.py') ? '🐍' : file.endsWith('.resource') ? '📚' : '🤖';
            const fileInfo = state.selectedFiles[file] || { checked: false, importType: null };

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = fileInfo.checked;
            checkbox.onchange = () => {
                // When checking, keep current import type or auto-select default for file type
                // When unchecking, clear the import type
                let importType = fileInfo.importType;
                if (checkbox.checked && !importType) {
                    // Auto-select default import type based on file extension
                    if (file.endsWith('.py')) {
                        importType = 'Library';
                    } else if (file.endsWith('.resource') || file.endsWith('.robot')) {
                        importType = 'Resource';
                    } else {
                        importType = null; // No default for other types
                    }
                } else if (!checkbox.checked) {
                    importType = null; // Clear import type when unchecking
                }

                vscode.postMessage({
                    type: 'selectFile',
                    filePath: file,
                    checked: checkbox.checked,
                    importType: importType
                });
            };

            const iconSpan = document.createElement('span');
            iconSpan.className = 'file-icon';
            iconSpan.textContent = icon;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-name';
            nameSpan.title = file;
            nameSpan.textContent = fileName;

            // Determine available import types based on file extension
            let availableTypes = [];
            if (file.endsWith('.py')) {
                availableTypes = ['', 'Library', 'Variables'];
            } else if (file.endsWith('.resource') || file.endsWith('.robot')) {
                availableTypes = ['', 'Resource', 'Variables'];
            } else {
                availableTypes = ['', 'Library', 'Resource', 'Variables'];
            }

            const select = document.createElement('select');
            availableTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type || '-- Select Type --';
                if (type === fileInfo.importType) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            select.onchange = () => {
                vscode.postMessage({
                    type: 'setImportType',
                    filePath: file,
                    importType: select.value
                });
            };

            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn-icon';
            viewBtn.textContent = '👁️';
            viewBtn.onclick = () => {
                vscode.postMessage({ type: 'viewFile', filePath: file });
            };

            const keywordBtn = document.createElement('button');
            keywordBtn.className = 'btn-icon';
            keywordBtn.textContent = '⚡';
            keywordBtn.onclick = () => {
                vscode.postMessage({ type: 'extractKeywords', filePath: file });
            };

            div.appendChild(checkbox);
            div.appendChild(iconSpan);
            div.appendChild(nameSpan);
            div.appendChild(select);
            div.appendChild(viewBtn);
            div.appendChild(keywordBtn);

            return div;
        }

        function renderCurrentImports() {
            const container = document.getElementById('importsList');
            container.textContent = '';

            if (!state.existingImports || state.existingImports.length === 0) {
                container.appendChild(createEmpty('📋', 'No imports found'));
                return;
            }

            state.existingImports.forEach(imp => {
                const item = createImportItem(imp);
                container.appendChild(item);
            });
        }

        function createImportItem(imp) {
            const div = document.createElement('div');
            div.className = 'import-item';

            const badge = document.createElement('span');
            badge.className = 'import-badge ' + imp.type.toLowerCase();
            badge.textContent = imp.type;

            const path = document.createElement('span');
            path.className = 'import-path';
            path.title = imp.path;
            path.textContent = imp.path;

            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn-icon';
            viewBtn.textContent = '👁️';
            viewBtn.onclick = () => {
                vscode.postMessage({ type: 'viewFile', filePath: imp.path });
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon';
            deleteBtn.textContent = '🗑️';
            deleteBtn.onclick = () => {
                if (confirm('Delete import: ' + imp.path + '?')) {
                    vscode.postMessage({ type: 'deleteImport', importPath: imp.path });
                }
            };

            const keywordBtn = document.createElement('button');
            keywordBtn.className = 'btn-icon';
            keywordBtn.textContent = '⚡';
            keywordBtn.onclick = () => {
                vscode.postMessage({ type: 'extractKeywords', filePath: imp.path });
            };

            div.appendChild(badge);
            div.appendChild(path);
            div.appendChild(viewBtn);
            div.appendChild(deleteBtn);
            div.appendChild(keywordBtn);

            return div;
        }

        function renderKeywordsList() {
            const container = document.getElementById('keywordsListTab');
            container.textContent = '';

            if (!state.extractedKeywords || state.extractedKeywords.length === 0) {
                container.appendChild(createEmpty('⚡', 'No keywords extracted'));
                return;
            }

            if (state.keywordSource) {
                const sourceName = state.keywordSource.split('/').pop();
                const sourceDiv = document.createElement('div');
                sourceDiv.className = 'text-muted mb-2';
                sourceDiv.textContent = 'From: ' + sourceName;
                container.appendChild(sourceDiv);
            }

            state.extractedKeywords.forEach(keyword => {
                const card = createKeywordCard(keyword);
                container.appendChild(card);
            });
        }

        function createKeywordCard(keyword) {
            const div = document.createElement('div');
            div.className = 'keyword-card';
            if (state.selectedKeyword && state.selectedKeyword.name === keyword.name) {
                div.classList.add('selected');
            }

            const nameDiv = document.createElement('div');
            nameDiv.className = 'keyword-name';
            nameDiv.textContent = keyword.name;

            const argsDiv = document.createElement('div');
            argsDiv.className = 'keyword-args';
            argsDiv.textContent = keyword.args ? keyword.args.join(', ') : 'No arguments';

            const docDiv = document.createElement('div');
            docDiv.className = 'keyword-doc-preview';
            docDiv.textContent = keyword.doc || 'No documentation';

            const insertBtn = document.createElement('button');
            insertBtn.className = 'btn-icon mt-2';
            insertBtn.textContent = 'Insert';
            insertBtn.onclick = (e) => {
                e.stopPropagation();
                vscode.postMessage({ type: 'insertKeyword', keyword });
            };

            div.onclick = () => {
                state.selectedKeyword = keyword;
                vscode.postMessage({ type: 'selectKeyword', keyword });
                renderKeywordsList();
                renderKeywordDetails();
                document.querySelector('#keywordsSection .tab[data-tab="details"]').click();
            };

            div.appendChild(nameDiv);
            div.appendChild(argsDiv);
            div.appendChild(docDiv);
            div.appendChild(insertBtn);

            return div;
        }

        function renderKeywordDetails() {
            const container = document.getElementById('keywordDetailsTab');
            container.textContent = '';

            if (!state.selectedKeyword) {
                container.appendChild(createEmpty('ℹ️', 'Select a keyword to view details'));
                return;
            }

            const kw = state.selectedKeyword;
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'keyword-details';

            const sections = [
                { label: 'Name', value: kw.name },
                { label: 'Arguments', value: kw.args ? kw.args.join(', ') : 'None' },
                { label: 'Documentation', value: kw.doc || 'No documentation available' }
            ];

            sections.forEach(sec => {
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'keyword-detail-section';

                const label = document.createElement('div');
                label.className = 'keyword-detail-label';
                label.textContent = sec.label;

                const value = document.createElement('div');
                value.className = 'keyword-detail-value';
                value.textContent = sec.value;

                sectionDiv.appendChild(label);
                sectionDiv.appendChild(value);
                detailsDiv.appendChild(sectionDiv);
            });

            const insertBtn = document.createElement('button');
            insertBtn.textContent = 'Insert Keyword';
            insertBtn.onclick = () => {
                vscode.postMessage({ type: 'insertKeyword', keyword: kw });
            };

            detailsDiv.appendChild(insertBtn);
            container.appendChild(detailsDiv);
        }

        function renderActions() {
            const statusElem = document.getElementById('statusIndicator');
            const confirmBtn = document.getElementById('confirmBtn');
            const cancelBtn = document.getElementById('cancelBtn');

            const selectedCount = Object.values(state.selectedFiles).filter(f => f.checked && f.importType).length;

            statusElem.textContent = '';
            const statusSpan = document.createElement('span');

            if (state.pendingChanges && selectedCount > 0) {
                statusSpan.textContent = selectedCount + ' file(s) selected for import';
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
            } else {
                statusSpan.textContent = 'No changes';
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
            }

            statusElem.appendChild(statusSpan);
        }

        function renderAll() {
            renderTargetFile();
            renderFileBrowser();
            renderCurrentImports();
            renderKeywordsList();
            renderKeywordDetails();
            renderActions();
        }

        // Message Handling
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'stateUpdate':
                    state = { ...state, ...message.state };
                    renderAll();
                    break;
                case 'fileListUpdate':
                    state.allFiles = message.files;
                    renderFileBrowser();
                    break;
            }
        });

        // Request initial state on load
        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'getInitialState' });
        });
    </script>
</body>
</html>`;
}
