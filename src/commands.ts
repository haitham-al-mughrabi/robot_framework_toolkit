import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ImportType } from './types';
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
    isLocked
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
            await createRobotFileWithImports(uri, 'resource', '.resource', '*** Keywords ***');
        }
    );

    // Register command: Create Robot Framework Variables File
    const createVariablesFile = vscode.commands.registerCommand(
        'rfFilesCreator.createVariablesFile',
        async (uri: vscode.Uri) => {
            await createRobotFileWithImports(uri, 'variables', '.resource', '*** Variables ***');
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
                // Find the actual file path by searching in the workspace
                const importPath = item.label as string;
                let filePath: string | undefined;

                // Try to find the file in the workspace
                const allFiles = await vscode.workspace.findFiles('**/*.{py,robot,resource,txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

                for (const file of allFiles) {
                    const fileName = path.basename(file.fsPath);
                    if (fileName === importPath || file.fsPath.includes(importPath)) {
                        filePath = file.fsPath;
                        break;
                    }
                }

                if (!filePath) {
                    // If we can't find the file exactly, try to construct a path relative to the workspace
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const workspaceRoot = workspaceFolders[0].uri.fsPath;
                        const potentialPath = path.join(workspaceRoot, importPath);

                        // Check if the potential path exists
                        if (fs.existsSync(potentialPath)) {
                            filePath = potentialPath;
                        } else {
                            // Try with different combinations
                            const normalizedImportPath = importPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
                            const otherPotentialPath = path.join(workspaceRoot, normalizedImportPath);
                            if (fs.existsSync(otherPotentialPath)) {
                                filePath = otherPotentialPath;
                            }
                        }
                    }
                }

                if (filePath) {
                    try {
                        const document = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(document, { preview: true });

                        // Auto-lock the target if not already locked
                        const targetFile = getTargetFile();
                        if (targetFile && !isLocked()) {
                            lockTargetFile(targetFile);
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
                        if (fileName === importPath || file.fsPath.includes(importPath)) {
                            filePath = file.fsPath;
                            break;
                        }
                    }

                    if (!filePath) {
                        // If we can't find the file exactly, try to construct a path relative to the workspace
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders) {
                            const workspaceRoot = workspaceFolders[0].uri.fsPath;
                            const potentialPath = path.join(workspaceRoot, importPath);

                            if (fs.existsSync(potentialPath)) {
                                filePath = potentialPath;
                            } else {
                                const normalizedImportPath = importPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
                                const otherPotentialPath = path.join(workspaceRoot, normalizedImportPath);
                                if (fs.existsSync(otherPotentialPath)) {
                                    filePath = otherPotentialPath;
                                }
                            }
                        }
                    }
                }

                if (filePath) {
                    // Extract keywords from the file
                    const keywords = extractKeywordsFromFile(filePath);

                    if (keywords.length > 0) {
                        // Show keywords in a quick pick for selection
                        const keywordOptions = keywords.map(kw => ({
                            label: kw.name,
                            description: kw.args.length > 0 ? `[${kw.args.join(', ')}]` : '',
                            detail: kw.doc || 'No description',
                            keyword: kw
                        }));

                        const selected = await vscode.window.showQuickPick(keywordOptions, {
                            placeHolder: `Select a keyword from ${path.basename(filePath)}`
                        });

                        if (selected) {
                            // Insert the selected keyword into the active editor
                            const activeEditor = vscode.window.activeTextEditor;
                            if (activeEditor) {
                                const position = activeEditor.selection.active;
                                await activeEditor.edit(editBuilder => {
                                    editBuilder.insert(position, selected.label);
                                });
                                vscode.window.showInformationMessage(`Inserted keyword: ${selected.label}`);
                            }
                        } else {
                            vscode.window.showInformationMessage(`Found ${keywords.length} keywords in ${path.basename(filePath)}`);
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
        insertKeyword
    );
}
