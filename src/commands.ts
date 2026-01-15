import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ImportType, SelectedKeywordInfo } from './types';
import { ImportTreeItem, KeywordTreeItem } from './tree/items';
import { setHasPendingChanges } from './tree/providers';
import { extractKeywordsFromFile } from './parsers';
import {
    isRobotFrameworkFile,
    removeImportFromContent,
    createRobotFile
} from './file-operations';
import {
    getTargetFile,
    lockTargetFile,
    getLockedTargetFile,
    isLocked,
    getOriginalTargetFile
} from './target-manager';
import {
    getImportableFilesView,
    getImportableFilesProvider,
    getKeywordsProvider,
    getKeywordDetailsProvider,
    getCurrentImportsProvider,
    getImportSelectionResolver,
    loadImportsForFile
} from './multi-view-manager';
import { expandAllItems } from './tree/multi-view-providers';
import { addCurrentlyViewedFile } from './file-view-tracker';
import { SettingsPanel } from './settings-panel';

/**
 * Register all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
    // Register command: Create Robot Framework Test File
    const createTestFile = vscode.commands.registerCommand(
        'rfFilesCreator.createTestFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'test', '.robot', '*** Settings ***\n\n\n*** Test Cases ***\n');
        }
    );

    // Register command: Create Robot Framework Resource File
    const createResourceFile = vscode.commands.registerCommand(
        'rfFilesCreator.createResourceFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'resource', '.resource', '*** Settings ***\n\n\n*** Keywords ***\n');
        }
    );

    // Register command: Create Robot Framework Variables File
    const createVariablesFile = vscode.commands.registerCommand(
        'rfFilesCreator.createVariablesFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'variables', '.resource', '*** Settings ***\n\n\n*** Variables ***\n');
        }
    );

    // Register command: Create Robot Framework Locators File
    const createLocatorsFile = vscode.commands.registerCommand(
        'rfFilesCreator.createLocatorsFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'locators', '.py', '');
        }
    );

    // Register command: Edit Robot Framework Imports
    const editImports = vscode.commands.registerCommand(
        'rfFilesCreator.editImports',
        async (uri: vscode.Uri) => {
            // Load the imports for the selected file
            await loadImportsForFile(uri.fsPath);
            vscode.window.showInformationMessage('Import selection loaded. Use the toolbar buttons to manage imports.');
        }
    );

    // Register command: Confirm Imports (for tree view title bar)
    const confirmImports = vscode.commands.registerCommand(
        'rfFilesCreator.confirmImports',
        () => {
            const resolver = getImportSelectionResolver();
            if (resolver) {
                resolver(true);
            }
        }
    );

    // Register command: Cancel Imports (for tree view title bar)
    const cancelImports = vscode.commands.registerCommand(
        'rfFilesCreator.cancelImports',
        () => {
            const resolver = getImportSelectionResolver();
            if (resolver) {
                resolver(false);
            }
        }
    );

    // Register command: Select Import Type (when clicking on a file)
    const selectImportType = vscode.commands.registerCommand(
        'rfFilesCreator.selectImportType',
        async (item: ImportTreeItem) => {
            const importableFilesProvider = getImportableFilesProvider();
            if (!item.isFile || !importableFilesProvider) return;

            // Show quick pick with available import types + option to deselect
            const options: vscode.QuickPickItem[] = item.availableImportTypes.map(type => ({
                label: type,
                description: item.selectedImportType === type ? '(current)' : ''
            }));

            // Add option to remove/deselect
            if (item.selectedImportType) {
                options.push({
                    label: '$(close) Remove Import',
                    description: 'Deselect this file'
                });
            }

            const selected = await vscode.window.showQuickPick(options, {
                title: `Select import type for ${item.label}`,
                placeHolder: 'Choose how to import this file'
            });

            if (selected) {
                if (selected.label === '$(close) Remove Import') {
                    importableFilesProvider.setImportType(item, null);
                } else {
                    importableFilesProvider.setImportType(item, selected.label as ImportType);
                }
            }
        }
    );

    // Register command: Search Imports
    const searchImports = vscode.commands.registerCommand(
        'rfFilesCreator.searchImports',
        async () => {
            const importableFilesProvider = getImportableFilesProvider();
            const importableFilesView = getImportableFilesView();

            if (importableFilesProvider) {
                const searchTerm = await vscode.window.showInputBox({
                    prompt: 'Enter search term to filter imports',
                    placeHolder: 'Search files, folders, or import types...',
                    validateInput: (_value) => {
                        return null;
                    }
                });

                if (searchTerm !== undefined) {
                    importableFilesProvider.setSearchFilter(searchTerm);

                    // Automatically expand all items when search results are shown
                    if (searchTerm && importableFilesView) {
                        // Wait for the tree to fully refresh before expanding
                        setTimeout(async () => {
                            const rootItems = importableFilesProvider.getRootItems();
                            await expandAllItems(importableFilesView, rootItems);
                        }, 300);
                    }
                }
            }
        }
    );

    // Register command: Clear Search (revert search results)
    const clearSearch = vscode.commands.registerCommand(
        'rfFilesCreator.clearSearch',
        () => {
            const importableFilesProvider = getImportableFilesProvider();
            if (importableFilesProvider) {
                importableFilesProvider.setSearchFilter('');
            }
        }
    );

    // Register command: Expand All tree nodes
    const expandAll = vscode.commands.registerCommand(
        'rfFilesCreator.expandAll',
        async () => {
            const importableFilesView = getImportableFilesView();
            const importableFilesProvider = getImportableFilesProvider();
            if (importableFilesView && importableFilesProvider) {
                const rootItems = importableFilesProvider.getRootItems();
                await expandAllItems(importableFilesView, rootItems);
            }
        }
    );

    // Register command: Collapse All tree nodes
    const collapseAll = vscode.commands.registerCommand(
        'rfFilesCreator.collapseAll',
        async () => {
            await vscode.commands.executeCommand('workbench.actions.treeView.rfImportableFiles.collapseAll');
        }
    );

    // Register command: View File (open in editor) - auto-locks target
    const viewFile = vscode.commands.registerCommand(
        'rfFilesCreator.viewFile',
        async (item: ImportTreeItem) => {
            if (item && item.isFile && item.filePath) {
                // Auto-lock the current target file before viewing another file
                if (!isLocked()) {
                    const targetFile = getTargetFile();
                    if (targetFile) {
                        lockTargetFile(targetFile);
                    }
                }

                try {
                    const document = await vscode.workspace.openTextDocument(item.filePath);
                    await vscode.window.showTextDocument(document, { preview: true });
                    // Explicitly add to currently viewed files since onDidChangeActiveTextEditor may not fire immediately
                    addCurrentlyViewedFile(item.filePath);

                    // Always ensure the target file is locked when viewing an importable file
                    // Use the original target file (not the currently active one) to maintain the correct context
                    const originalTargetFile = getOriginalTargetFile();
                    if (originalTargetFile) {
                        lockTargetFile(originalTargetFile);
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to open file: ${msg}`);
                }
            }
        }
    );

    // Register command: Go to Target File (navigate back to the locked target)
    const goToTarget = vscode.commands.registerCommand(
        'rfFilesCreator.goToTarget',
        async () => {
            const targetFile = getTargetFile();
            if (targetFile) {
                try {
                    const document = await vscode.workspace.openTextDocument(targetFile);
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to open target file: ${msg}`);
                }
            } else {
                vscode.window.showWarningMessage('No target file is set.');
            }
        }
    );

    // Register command: Refresh Imports
    const refreshImports = vscode.commands.registerCommand(
        'rfFilesCreator.refreshImports',
        async () => {
            const currentTargetFile = getTargetFile();
            if (currentTargetFile) {
                // Reload imports for the current target file
                await loadImportsForFile(currentTargetFile);

                // If it was locked, maintain the lock
                if (isLocked()) {
                    const lockedFile = getLockedTargetFile();
                    if (lockedFile) {
                        lockTargetFile(lockedFile);
                    }
                }

                vscode.window.showInformationMessage('Imports refreshed successfully.');
            } else {
                vscode.window.showWarningMessage('No target file to refresh.');
            }
        }
    );

    // Register command: Delete Import
    const deleteImport = vscode.commands.registerCommand(
        'rfFilesCreator.deleteImport',
        async (item: ImportTreeItem) => {
            if (item && item.contextValue === 'currentImport') {
                const targetFile = getTargetFile();
                if (!targetFile) {
                    vscode.window.showErrorMessage('No target file selected.');
                    return;
                }

                // Show confirmation dialog
                const confirm = await vscode.window.showWarningMessage(
                    `Remove import "${item.label}" from the file?`,
                    { modal: true },
                    'Yes', 'No'
                );

                if (confirm === 'Yes') {
                    try {
                        // Read current file content
                        const currentContent = fs.readFileSync(targetFile, 'utf8');

                        // Remove the import from the content
                        const updatedContent = removeImportFromContent(currentContent, item.label as string, item.description as string);

                        // Write back to file
                        fs.writeFileSync(targetFile, updatedContent, 'utf8');

                        // Refresh the document if it's open
                        const document = await vscode.workspace.openTextDocument(targetFile);
                        await vscode.window.showTextDocument(document);

                        // Reload the imports to reflect the change
                        const wasLocked = isLocked();
                        const lockedFile = getLockedTargetFile();

                        await loadImportsForFile(targetFile);

                        // Restore lock if it existed
                        if (wasLocked && lockedFile) {
                            lockTargetFile(lockedFile);
                        }

                        vscode.window.showInformationMessage(`Removed import: ${item.label}`);
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to remove import: ${msg}`);
                    }
                }
            }
        }
    );

    // Register command: View Current Import
    const viewCurrentImport = vscode.commands.registerCommand(
        'rfFilesCreator.viewCurrentImport',
        async (item: ImportTreeItem) => {
            if (item && item.contextValue === 'currentImport') {
                // Auto-lock the current target file before viewing another file (if not already locked)
                if (!isLocked()) {
                    const targetFile = getTargetFile();
                    if (targetFile) {
                        lockTargetFile(targetFile);
                    }
                }

                // Find the actual file path by searching in the workspace
                const importPath = item.label as string;
                let filePath: string | undefined;

                // Try to find the file in the workspace
                const allFiles = await vscode.workspace.findFiles('**/*.{py,robot,resource,txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

                for (const file of allFiles) {
                    const fileName = path.basename(file.fsPath);
                    if (fileName === importPath) {
                        filePath = file.fsPath;
                        break;
                    }
                    // Only match if importPath is a path component (not substring)
                    // Normalize both paths for comparison
                    const normalizedFilePath = path.normalize(file.fsPath).replace(/\\/g, '/');
                    const normalizedImportPath = path.normalize(importPath).replace(/\\/g, '/');
                    if (normalizedFilePath.endsWith(normalizedImportPath)) {
                        const idx = normalizedFilePath.lastIndexOf(normalizedImportPath);
                        if (idx >= 0) {
                            const beforeMatch = normalizedFilePath.substring(0, idx);
                            if (beforeMatch === '' || beforeMatch.endsWith('/')) {
                                filePath = file.fsPath;
                                break;
                            }
                        }
                    }
                }

                if (!filePath) {
                    // If we can't find the file exactly, try to construct a path relative to the workspace
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        const workspaceRoot = workspaceFolders[0].uri.fsPath;
                        const normalizedImportPath = importPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
                        const potentialPath = path.resolve(path.join(workspaceRoot, normalizedImportPath));

                        // Security: Ensure resolved path is within workspace (prevent path traversal)
                        const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
                        if (potentialPath.startsWith(normalizedWorkspaceRoot) && fs.existsSync(potentialPath)) {
                            filePath = potentialPath;
                        }
                    }
                }

                if (filePath) {
                    try {
                        const document = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(document, { preview: true });
                        // Explicitly add to currently viewed files since onDidChangeActiveTextEditor may not fire immediately
                        addCurrentlyViewedFile(filePath);

                        // Always ensure the target file is locked when viewing an imported file
                        // Use the original target file (not the currently active one) to maintain the correct context
                        const originalTargetFile = getOriginalTargetFile();
                        if (originalTargetFile) {
                            lockTargetFile(originalTargetFile);
                        }
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to open file: ${msg}`);
                    }
                } else {
                    vscode.window.showWarningMessage(`Could not locate file: ${importPath}`);
                }
            }
        }
    );

    // Register command: View Keywords
    const viewKeywords = vscode.commands.registerCommand(
        'rfFilesCreator.viewKeywords',
        async (item: ImportTreeItem) => {
            if (item && (item.contextValue === 'currentImport' || item.contextValue === 'file')) {
                let filePath: string | undefined;

                // Determine file path based on the item type
                if (item.contextValue === 'file' && item.filePath) {
                    // For importable files from the tree, use the stored file path
                    filePath = item.filePath;
                } else if (item.contextValue === 'currentImport') {
                    // For current imports, try to locate the file in workspace
                    const importPath = item.label as string;

                    // Try to find the file in the workspace
                    const allFiles = await vscode.workspace.findFiles('**/*.{py,robot,resource,txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

                    for (const file of allFiles) {
                        const fileName = path.basename(file.fsPath);
                        if (fileName === importPath) {
                            filePath = file.fsPath;
                            break;
                        }
                        // Only match if importPath is a path component (not substring)
                        const normalizedFilePath = path.normalize(file.fsPath).replace(/\\/g, '/');
                        const normalizedImportPath = path.normalize(importPath).replace(/\\/g, '/');
                        if (normalizedFilePath.endsWith(normalizedImportPath)) {
                            const idx = normalizedFilePath.lastIndexOf(normalizedImportPath);
                            if (idx >= 0) {
                                const beforeMatch = normalizedFilePath.substring(0, idx);
                                if (beforeMatch === '' || beforeMatch.endsWith('/')) {
                                    filePath = file.fsPath;
                                    break;
                                }
                            }
                        }
                    }

                    if (!filePath) {
                        // If we can't find the file exactly, try to construct a path relative to the workspace
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const workspaceRoot = workspaceFolders[0].uri.fsPath;
                            const normalizedImportPath = importPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
                            const potentialPath = path.resolve(path.join(workspaceRoot, normalizedImportPath));

                            // Security: Ensure resolved path is within workspace (prevent path traversal)
                            const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
                            if (potentialPath.startsWith(normalizedWorkspaceRoot) && fs.existsSync(potentialPath)) {
                                filePath = potentialPath;
                            }
                        }
                    }
                }

                if (filePath) {
                    // Extract keywords from the file
                    const keywords = extractKeywordsFromFile(filePath);

                    if (keywords.length > 0) {
                        // Show keywords in the keywords view
                        const keywordsProvider = getKeywordsProvider();
                        if (keywordsProvider) {
                            keywordsProvider.setKeywords(keywords, filePath);
                            vscode.window.showInformationMessage(`Showing ${keywords.length} keywords from ${path.basename(filePath)}`);
                        } else {
                            vscode.window.showWarningMessage('Keywords view not available');
                        }
                    } else {
                        vscode.window.showInformationMessage(`No keywords found in ${path.basename(filePath)}`);
                    }
                } else {
                    const importPath = item.label as string;
                    vscode.window.showWarningMessage(`Could not locate file: ${importPath}`);
                }
            }
        }
    );

    // Register command: Insert Keyword From Tree
    const insertKeywordFromTree = vscode.commands.registerCommand(
        'rfFilesCreator.insertKeywordFromTree',
        async (keywordName: string) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active editor to insert keyword.');
                return;
            }

            // Insert the keyword at the current cursor position
            const position = activeEditor.selection.active;
            await activeEditor.edit(editBuilder => {
                editBuilder.insert(position, keywordName);
            });

            vscode.window.showInformationMessage(`Inserted keyword: ${keywordName}`);
        }
    );

    // Register command: Insert Keyword
    const insertKeyword = vscode.commands.registerCommand(
        'rfFilesCreator.insertKeyword',
        async (keywordItem: KeywordTreeItem) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active editor to insert keyword.');
                return;
            }

            // Get the keyword name and format it for insertion
            const keywordText = keywordItem.keywordName;

            // Insert at current cursor position
            const position = activeEditor.selection.active;
            await activeEditor.edit(editBuilder => {
                editBuilder.insert(position, keywordText);
            });

            // Show success message
            vscode.window.showInformationMessage(`Inserted keyword: ${keywordText}`);
        }
    );

    // Register command: Select Keyword For Info Display
    const selectKeywordForInfo = vscode.commands.registerCommand(
        'rfFilesCreator.selectKeywordForInfo',
        async (keywordInfo: SelectedKeywordInfo) => {
            const keywordDetailsProvider = getKeywordDetailsProvider();
            if (keywordDetailsProvider) {
                keywordDetailsProvider.setSelectedKeyword(keywordInfo);
            }
        }
    );

    // Register command: Insert Keyword From Info Section
    const insertKeywordFromInfo = vscode.commands.registerCommand(
        'rfFilesCreator.insertKeywordFromInfo',
        async (keywordName: string) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active editor to insert keyword.');
                return;
            }

            // Insert the keyword at the current cursor position
            const position = activeEditor.selection.active;
            await activeEditor.edit(editBuilder => {
                editBuilder.insert(position, keywordName);
            });

            vscode.window.showInformationMessage(`Inserted keyword: ${keywordName}`);
        }
    );

    // Register command: View Keyword Documentation
    const viewKeywordDoc = vscode.commands.registerCommand(
        'rfFilesCreator.viewKeywordDoc',
        async (keywordName: string, docText: string) => {
            // Show documentation in an information message
            const doc = docText || 'No documentation available';
            vscode.window.showInformationMessage(`${keywordName}:\n\n${doc}`);
        }
    );

    // Register command: Open Settings
    const openSettings = vscode.commands.registerCommand(
        'rfFilesCreator.openSettings',
        () => {
            SettingsPanel.createOrShow(context.extensionUri);
        }
    );

    // Register command: Change File Type
    const changeFileType = vscode.commands.registerCommand(
        'rfFilesCreator.changeFileType',
        async (uri: vscode.Uri) => {
            if (!uri) {
                vscode.window.showErrorMessage('No file selected.');
                return;
            }

            const filePath = uri.fsPath;
            const fileName = path.basename(filePath);
            const currentExtension = path.extname(filePath);

            // Check if it's a Robot Framework file
            if (!['.robot', '.resource', '.py'].includes(currentExtension)) {
                vscode.window.showErrorMessage('This command only works with Robot Framework files (.robot, .resource, .py)');
                return;
            }

            // Determine current file type by reading content
            let currentType = 'Unknown';
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                if (content.includes('*** Test Cases ***')) {
                    currentType = 'Test';
                } else if (content.includes('*** Keywords ***')) {
                    currentType = 'Resource';
                } else if (content.includes('*** Variables ***') && !content.includes('*** Keywords ***')) {
                    currentType = 'Variables';
                } else if (currentExtension === '.py') {
                    currentType = 'Locators';
                }
            } catch (error) {
                vscode.window.showErrorMessage('Failed to read file.');
                return;
            }

            // Show file type selection with loop to allow going back
            let selected: { label: string; description: string; value: string } | undefined;
            let confirmed = false;

            while (!confirmed) {
                // Show file type selection
                const fileTypes = [
                    { label: 'Test File', description: '.robot file with Test Cases section', value: 'test' },
                    { label: 'Resource File', description: '.resource file with Keywords section', value: 'resource' },
                    { label: 'Variables File', description: '.resource file with Variables section', value: 'variables' },
                    { label: 'Locators File', description: '.py file for locators', value: 'locators' }
                ];

                selected = await vscode.window.showQuickPick(fileTypes, {
                    title: `Change File Type (Current: ${currentType})`,
                    placeHolder: 'Select new file type'
                });

                if (!selected) {
                    return;
                }

                // Show confirmation dialog
                const confirmation = await vscode.window.showWarningMessage(
                    `Are you sure you want to change "${fileName}" to a ${selected.label}?\n\n⚠️ WARNING: All existing content will be deleted and replaced with a template.`,
                    { modal: true },
                    'Yes, Change Type',
                    'Back'
                );

                if (confirmation === 'Yes, Change Type') {
                    confirmed = true;
                } else if (confirmation === 'Back') {
                    // Loop back to file type selection
                    continue;
                } else {
                    // User clicked X or ESC
                    return;
                }
            }

            // At this point, selected is guaranteed to be defined
            if (!selected) {
                return;
            }

            try {
                // Determine new extension and content
                let newExtension: string;
                let newContent: string;

                switch (selected.value) {
                    case 'test':
                        newExtension = '.robot';
                        newContent = '*** Settings ***\n\n\n*** Test Cases ***\n';
                        break;
                    case 'resource':
                        newExtension = '.resource';
                        newContent = '*** Settings ***\n\n\n*** Keywords ***\n';
                        break;
                    case 'variables':
                        newExtension = '.resource';
                        newContent = '*** Settings ***\n\n\n*** Variables ***\n';
                        break;
                    case 'locators':
                        newExtension = '.py';
                        newContent = '';
                        break;
                    default:
                        vscode.window.showErrorMessage('Invalid file type selected.');
                        return;
                }

                const baseName = path.basename(filePath, currentExtension);
                const dirName = path.dirname(filePath);
                const newFilePath = path.join(dirName, baseName + newExtension);

                // Close the document BEFORE making file system changes
                const oldDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
                if (oldDoc) {
                    // Show the document first
                    await vscode.window.showTextDocument(oldDoc);
                    // Close it without saving
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    // Wait a bit for VS Code to release the file handle
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // If extension changed, rename the file
                if (currentExtension !== newExtension) {
                    // Check if target file already exists
                    if (fs.existsSync(newFilePath) && newFilePath !== filePath) {
                        vscode.window.showErrorMessage(`A file named "${baseName}${newExtension}" already exists in this directory.`);
                        return;
                    }

                    // Write new content to the file
                    fs.writeFileSync(filePath, newContent, 'utf8');

                    // Rename the file
                    fs.renameSync(filePath, newFilePath);

                    // Open the new file
                    const newDoc = await vscode.workspace.openTextDocument(newFilePath);
                    await vscode.window.showTextDocument(newDoc);

                    vscode.window.showInformationMessage(`File type changed to ${selected.label} and renamed to "${baseName}${newExtension}"`);
                } else {
                    // Same extension, just replace content
                    fs.writeFileSync(filePath, newContent, 'utf8');

                    // Reload the document
                    const document = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(document);

                    vscode.window.showInformationMessage(`File type changed to ${selected.label}`);
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to change file type: ${msg}`);
            }
        }
    );

    context.subscriptions.push(
        createTestFile,
        createResourceFile,
        createVariablesFile,
        createLocatorsFile,
        editImports,
        confirmImports,
        cancelImports,
        selectImportType,
        searchImports,
        clearSearch,
        expandAll,
        collapseAll,
        viewFile,
        goToTarget,
        refreshImports,
        deleteImport,
        viewCurrentImport,
        viewKeywords,
        insertKeywordFromTree,
        insertKeyword,
        selectKeywordForInfo,
        insertKeywordFromInfo,
        viewKeywordDoc,
        openSettings,
        changeFileType
    );
}
