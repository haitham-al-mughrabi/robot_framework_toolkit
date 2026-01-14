import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ImportType, SelectedKeywordInfo } from './types';
import { ImportTreeItem, KeywordTreeItem } from './tree/items';
import { expandAllItems, setHasPendingChanges } from './tree/providers';
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
    getCurrentTreeView,
    getCurrentTreeProvider,
    getImportSelectionResolver,
    loadImportsForFile,
    generatePreviewContent,
    editRobotFileImports,
    createRobotFileWithImports
} from './import-manager';
import { addCurrentlyViewedFile } from './file-view-tracker';

/**
 * Register all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
    // Register command: Create Robot Framework Test File
    const createTestFile = vscode.commands.registerCommand(
        'rfFilesCreator.createTestFile',
        async (uri: vscode.Uri) => {
            await createRobotFileWithImports(uri, 'test', '.robot', '*** Test Cases ***');
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
            await editRobotFileImports(uri);
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
            const currentTreeProvider = getCurrentTreeProvider();
            if (!item.isFile || !currentTreeProvider) return;

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
                    currentTreeProvider.setImportType(item, null);
                } else {
                    currentTreeProvider.setImportType(item, selected.label as ImportType);
                }
            }
        }
    );

    // Register command: Preview Imports
    const previewImports = vscode.commands.registerCommand(
        'rfFilesCreator.previewImports',
        () => {
            const currentTreeProvider = getCurrentTreeProvider();
            if (currentTreeProvider) {
                const selectedItems = currentTreeProvider.getSelectedItems();
                if (selectedItems.length === 0) {
                    vscode.window.showInformationMessage('No imports selected to preview.');
                    return;
                }

                // Generate preview content for selected imports
                const previewContent = generatePreviewContent(selectedItems);

                // Show the preview in an information message
                vscode.window.showInformationMessage(`Preview:\n${previewContent}`, 'OK');
            }
        }
    );

    // Register command: Search Imports
    const searchImports = vscode.commands.registerCommand(
        'rfFilesCreator.searchImports',
        async () => {
            const currentTreeProvider = getCurrentTreeProvider();
            if (currentTreeProvider) {
                const searchTerm = await vscode.window.showInputBox({
                    prompt: 'Enter search term to filter imports',
                    placeHolder: 'Search files, folders, or import types...',
                    validateInput: (_value) => {
                        // No validation needed
                        return null;
                    }
                });

                if (searchTerm !== undefined) { // Allow empty string to clear search
                    currentTreeProvider.setSearchFilter(searchTerm);
                }
            }
        }
    );

    // Register command: Clear Search (revert search results)
    const clearSearch = vscode.commands.registerCommand(
        'rfFilesCreator.clearSearch',
        () => {
            const currentTreeProvider = getCurrentTreeProvider();
            if (currentTreeProvider) {
                currentTreeProvider.setSearchFilter('');
            }
        }
    );

    // Register command: Expand All tree nodes
    const expandAll = vscode.commands.registerCommand(
        'rfFilesCreator.expandAll',
        async () => {
            const currentTreeView = getCurrentTreeView();
            const currentTreeProvider = getCurrentTreeProvider();
            if (currentTreeView && currentTreeProvider) {
                const rootItems = currentTreeProvider.getRootItems();
                await expandAllItems(currentTreeView, rootItems);
            }
        }
    );

    // Register command: Collapse All tree nodes
    const collapseAll = vscode.commands.registerCommand(
        'rfFilesCreator.collapseAll',
        async () => {
            // Use VSCode's built-in collapse all command for the tree view
            await vscode.commands.executeCommand('workbench.actions.treeView.rfImportSelector.collapseAll');
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
                        // Show keywords in the tree view
                        const currentTreeProvider = getCurrentTreeProvider();
                        if (currentTreeProvider) {
                            currentTreeProvider.setKeywords(keywords, filePath);
                            vscode.window.showInformationMessage(`Showing ${keywords.length} keywords from ${path.basename(filePath)}`);
                        } else {
                            vscode.window.showWarningMessage('Import selector not available');
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
            const currentTreeProvider = getCurrentTreeProvider();
            if (currentTreeProvider) {
                currentTreeProvider.setSelectedKeyword(keywordInfo);
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

    context.subscriptions.push(
        createTestFile,
        createResourceFile,
        createVariablesFile,
        createLocatorsFile,
        editImports,
        confirmImports,
        cancelImports,
        selectImportType,
        previewImports,
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
        viewKeywordDoc
    );
}
