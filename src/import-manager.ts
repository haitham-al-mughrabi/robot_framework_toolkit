import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PathType, SelectedItem, SelectionResult } from './types';
import { ImportTreeItem } from './tree/items';
import { ImportTreeDataProvider, WelcomeTreeDataProvider, setHasPendingChanges } from './tree/providers';
import { parseExistingImports, analyzeFileContentForSuggestions } from './parsers';
import {
    isRobotFrameworkFile,
    filterProjectFiles,
    selectPathType,
    generateSettingsSection,
    updateSettingsSection,
    writeFile
} from './file-operations';
import {
    lockTargetFile,
    getLockedTargetFile,
    isLocked,
    setTreeViewRef,
    setOriginalTargetFile
} from './target-manager';

// Global references
let currentTreeView: vscode.TreeView<ImportTreeItem> | undefined;
let currentTreeProvider: ImportTreeDataProvider | undefined;
let importSelectionResolver: ((confirmed: boolean) => void) | undefined;
let welcomeTreeView: vscode.TreeView<vscode.TreeItem> | undefined;

// Store pathType globally for generating settings
let currentPathType: PathType = 'relative';

/**
 * Get the current tree view
 */
export function getCurrentTreeView(): vscode.TreeView<ImportTreeItem> | undefined {
    return currentTreeView;
}

/**
 * Get the current tree provider
 */
export function getCurrentTreeProvider(): ImportTreeDataProvider | undefined {
    return currentTreeProvider;
}

/**
 * Get the import selection resolver
 */
export function getImportSelectionResolver(): ((confirmed: boolean) => void) | undefined {
    return importSelectionResolver;
}

/**
 * Set the import selection resolver
 */
export function setImportSelectionResolver(resolver: ((confirmed: boolean) => void) | undefined): void {
    importSelectionResolver = resolver;
}

/**
 * Initialize the tree view with welcome content
 */
export function initializeTreeView(): void {
    const welcomeProvider = new WelcomeTreeDataProvider();
    welcomeTreeView = vscode.window.createTreeView('rfImportSelector', {
        treeDataProvider: welcomeProvider
    });
}

/**
 * Dispose the welcome tree view
 */
export function disposeWelcomeTreeView(): void {
    if (welcomeTreeView) {
        welcomeTreeView.dispose();
        welcomeTreeView = undefined;
    }
}

/**
 * Dispose the current tree view
 */
export function disposeCurrentTreeView(): void {
    if (currentTreeView) {
        currentTreeView.dispose();
        currentTreeView = undefined;
        currentTreeProvider = undefined;
    }
}

/**
 * Load imports for a specific Robot Framework file
 */
export async function loadImportsForFile(filePath: string): Promise<void> {
    if (!isRobotFrameworkFile(filePath)) {
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const targetDir = path.dirname(filePath);

    // Set the original target file so Go to Target and Refresh work
    setOriginalTargetFile(filePath);

    // Dispose the welcome tree view if it exists
    disposeWelcomeTreeView();

    // Read file content and parse existing imports
    let fileContent: string;
    try {
        fileContent = fs.readFileSync(filePath, 'utf8');
    } catch {
        initializeTreeView();
        return;
    }

    const existingImports = parseExistingImports(fileContent);

    // Find importable files
    const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');
    const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

    // Filter to allowed project folders
    const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
    const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
    const allImportableFiles = [...pyFiles, ...resourceFiles];

    if (allImportableFiles.length === 0) {
        initializeTreeView();
        return;
    }

    // Analyze file content for import suggestions
    const suggestedFiles = analyzeFileContentForSuggestions(fileContent, allPyFiles, allResourceFiles);

    // Create tree data provider
    currentTreeProvider = new ImportTreeDataProvider(
        allImportableFiles,
        targetDir,
        workspaceRoot,
        filePath,  // Pass the target file path
        existingImports,
        suggestedFiles
    );

    // Show the tree view by setting context
    vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', true);

    // Create tree view
    currentTreeView = vscode.window.createTreeView('rfImportSelector', {
        treeDataProvider: currentTreeProvider,
        canSelectMany: true,
        manageCheckboxStateManually: true
    });

    // Update the target manager's tree view reference
    setTreeViewRef(currentTreeView);

    // Handle checkbox changes
    currentTreeView.onDidChangeCheckboxState(e => {
        for (const [item, state] of e.items) {
            if (item.isFile) {
                currentTreeProvider?.toggleSelection(
                    item,
                    state === vscode.TreeItemCheckboxState.Checked
                );
            }
        }
    });

    // Set up resolver for confirm/cancel buttons
    importSelectionResolver = async (confirmed: boolean) => {
        if (confirmed) {
            const selected = currentTreeProvider?.getSelectedItems() || [];

            // Ask for path type
            const selectedPathType = await selectPathType();
            if (selectedPathType === undefined) {
                return; // User cancelled
            }

            // Convert to SelectedItem format
            const result: SelectedItem[] = selected.map(item => ({
                isFile: true,
                filePath: item.filePath,
                relativePath: item.relativePath,
                absolutePath: item.absolutePath,
                importType: item.selectedImportType || undefined
            }));

            // Generate new settings section
            const newSettingsSection = generateSettingsSection(result, selectedPathType);

            // Update file content
            const currentContent = fs.readFileSync(filePath, 'utf8');
            const updatedContent = updateSettingsSection(currentContent, newSettingsSection);

            // Write back to file
            try {
                fs.writeFileSync(filePath, updatedContent, 'utf8');

                // Refresh the document if it's open
                const document = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(document);

                vscode.window.showInformationMessage(`Updated imports in ${path.basename(filePath)}`);

                // Reload the tree with updated imports
                // But preserve the current locking state
                const wasLocked = isLocked();
                const lockedFile = getLockedTargetFile();

                // Reload the imports to reflect the changes
                await loadImportsForFile(filePath);

                // If it was locked, lock it again
                if (wasLocked && lockedFile) {
                    lockTargetFile(lockedFile);
                }

                // Reset pending changes flag after successful update
                setHasPendingChanges(false);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to update file: ${errorMessage}`);
            }
        } else {
            // User canceled - reset pending changes flag
            setHasPendingChanges(false);
        }
        // Don't cleanup - keep the tree view open for further editing
    };
}

/**
 * Generate preview content for selected imports
 */
export function generatePreviewContent(selectedItems: ImportTreeItem[]): string {
    const libraries: string[] = [];
    const resources: string[] = [];
    const variables: string[] = [];

    for (const item of selectedItems) {
        if (!item.isFile) continue;

        const filePath = item.relativePath || item.absolutePath || item.filePath;

        switch (item.selectedImportType) {
            case 'Library':
                libraries.push(filePath);
                break;
            case 'Resource':
                resources.push(filePath);
                break;
            case 'Variables':
                variables.push(filePath);
                break;
        }
    }

    let preview = '*** Settings ***\n';

    if (libraries.length > 0) {
        preview += '\n# Libraries:\n';
        for (const lib of libraries) {
            preview += `Library    ${lib}\n`;
        }
    }

    if (resources.length > 0) {
        preview += '\n# Resources:\n';
        for (const res of resources) {
            preview += `Resource    ${res}\n`;
        }
    }

    if (variables.length > 0) {
        preview += '\n# Variables:\n';
        for (const vars of variables) {
            preview += `Variables    ${vars}\n`;
        }
    }

    return preview;
}

/**
 * Show file selection using TreeView in sidebar
 */
export async function showFileSelectionTreeView(
    allFiles: vscode.Uri[], // Combined array of all importable files
    _unusedParam: vscode.Uri[], // Kept for compatibility but not used in unified view
    targetDir: string,
    workspaceRoot: string,
    pathType: PathType,
    targetFile: string,  // Added target file path
    existingImports: { type: 'Library' | 'Resource' | 'Variables'; path: string }[] = [],
    suggestedFiles: vscode.Uri[] = []
): Promise<SelectionResult> {
    currentPathType = pathType;

    return new Promise((resolve) => {
        // Dispose the welcome tree view if it exists
        disposeWelcomeTreeView();

        // Create tree data provider with all files combined
        currentTreeProvider = new ImportTreeDataProvider(
            allFiles, // Use the combined files directly
            targetDir,
            workspaceRoot,
            targetFile,  // Pass the target file path
            existingImports,
            suggestedFiles
        );

        // Show the tree view by setting context
        vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', true);

        // Create tree view
        currentTreeView = vscode.window.createTreeView('rfImportSelector', {
            treeDataProvider: currentTreeProvider,
            canSelectMany: true,
            manageCheckboxStateManually: true
        });

        // Update the target manager's tree view reference
        setTreeViewRef(currentTreeView);

        // Handle checkbox changes (toggle selection)
        currentTreeView.onDidChangeCheckboxState(e => {
            for (const [item, state] of e.items) {
                if (item.isFile) {
                    currentTreeProvider?.toggleSelection(
                        item,
                        state === vscode.TreeItemCheckboxState.Checked
                    );
                }
            }
        });

        // Show the tree view
        vscode.commands.executeCommand('rfImportSelector.focus');

        // Helper function to cleanup tree view and restore welcome view
        const cleanupTreeView = () => {
            vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', false);
            vscode.commands.executeCommand('setContext', 'rfHasPendingChanges', false);
            vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', false);
            currentTreeView?.dispose();
            currentTreeView = undefined;
            currentTreeProvider = undefined;
            importSelectionResolver = undefined;
            // Restore the welcome tree view
            initializeTreeView();
        };

        // Set up resolver for confirm/cancel buttons
        importSelectionResolver = (confirmed: boolean) => {
            if (confirmed) {
                const selected = currentTreeProvider?.getSelectedItems() || [];

                // Convert to SelectedItem format
                const result = selected.map(item => ({
                    isFile: true,
                    filePath: item.filePath,
                    relativePath: item.relativePath,
                    absolutePath: item.absolutePath,
                    importType: item.selectedImportType || undefined
                }));

                // Hide the tree view
                cleanupTreeView();

                resolve(result);
            } else {
                // User canceled - hide the tree view but don't update anything
                cleanupTreeView();

                resolve(null); // Indicate cancellation
            }
        };
    });
}

/**
 * Edit imports in an existing Robot Framework file
 */
export async function editRobotFileImports(uri: vscode.Uri): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = uri.fsPath;
    const targetDir = path.dirname(filePath);

    // Show progress while scanning files
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning importable files...",
        cancellable: false
    }, async (progress) => {
        // Read the file content
        let fileContent: string;
        try {
            fileContent = fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read file: ${filePath}`);
            return;
        }

        // Parse existing imports
        const existingImports = parseExistingImports(fileContent);

        progress.report({ increment: 20, message: "Finding Python files..." });

        // Find importable files (filtered to project folders)
        const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

        progress.report({ increment: 20, message: "Finding Resource files..." });

        const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        progress.report({ increment: 10, message: "Finding additional importable files..." });

        // Optionally, include more file types that might be importable
        const allOtherFiles = await vscode.workspace.findFiles('**/*.{txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        // Filter to allowed project folders
        const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
        const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
        const otherFiles = filterProjectFiles(allOtherFiles, workspaceRoot); // For additional file types

        if (pyFiles.length === 0 && resourceFiles.length === 0 && otherFiles.length === 0) {
            vscode.window.showWarningMessage('No importable files found in project folders (Libraries, Tests, Utilities, Resources, POM).');
            return;
        }

        progress.report({ increment: 20, message: "Analyzing content for import suggestions..." });

        // Analyze file content for import suggestions
        const suggestedFiles = analyzeFileContentForSuggestions(fileContent, allPyFiles, allResourceFiles);

        progress.report({ increment: 20, message: "Preparing import selection..." });

        // Ask for path type
        const selectedPathType = await selectPathType();
        if (selectedPathType === undefined) {
            return; // User cancelled
        }

        // Combine all file types for selection
        const allImportableFiles = [...pyFiles, ...resourceFiles, ...otherFiles];

        // Show file selection with pre-selected existing imports and suggested files highlighted
        const selectionResult = await showFileSelectionTreeView(
            allImportableFiles,
            [], // Second parameter not used in unified view, but kept for function signature compatibility
            targetDir,
            workspaceRoot,
            selectedPathType,
            filePath,  // Pass the target file path
            existingImports,
            suggestedFiles // Pass suggested files to highlight them
        );

        // If user canceled, do nothing and exit early
        if (selectionResult === null) {
            return; // User canceled, don't update the file
        }

        // Generate new settings section
        const newSettingsSection = generateSettingsSection(selectionResult, selectedPathType);

        // Update file content
        const updatedContent = updateSettingsSection(fileContent, newSettingsSection);

        // Write back to file
        try {
            fs.writeFileSync(filePath, updatedContent, 'utf8');

            // Refresh the document if it's open
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);

            vscode.window.showInformationMessage(`Updated imports in ${path.basename(filePath)}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to update file: ${errorMessage}`);
        }
    });
}

/**
 * Create Robot Framework file with import selection dialog
 */
export async function createRobotFileWithImports(
    uri: vscode.Uri | undefined,
    fileType: string,
    extension: string,
    mainSection: string
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const targetDir = uri ? uri.fsPath : workspaceRoot;

    // Prompt user for filename
    const fileName = await vscode.window.showInputBox({
        prompt: `Enter the name for the new Robot Framework ${fileType} file`,
        placeHolder: `my_${fileType}`,
        validateInput: (value) => {
            if (!value?.trim()) return 'File name cannot be empty';
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                return 'Only letters, numbers, underscore, hyphen allowed';
            }
            return null;
        }
    });

    if (!fileName) return;

    const fullFileName = fileName + extension;
    const filePath = path.join(targetDir, fullFileName);

    if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `"${fullFileName}" exists. Overwrite?`, 'Yes', 'No'
        );
        if (overwrite !== 'Yes') return;
    }

    // Show progress while scanning files
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning importable files...",
        cancellable: false
    }, async (progress) => {
        // Find importable files (filtered to project folders)
        const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

        progress.report({ increment: 40, message: "Finding Resource files..." });

        const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        progress.report({ increment: 10, message: "Finding additional importable files..." });

        // Optionally, include more file types that might be importable
        const allOtherFiles = await vscode.workspace.findFiles('**/*.{txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        // Filter to allowed project folders
        const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
        const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
        const otherFiles = filterProjectFiles(allOtherFiles, workspaceRoot); // For additional file types

        const combinedFiles = [...pyFiles, ...resourceFiles, ...otherFiles];

        let selectedImports: SelectedItem[] = [];
        let selectedPathType: PathType = 'relative';

        if (combinedFiles.length > 0) {
            // Ask for path type
            const pathTypeResult = await selectPathType();
            if (pathTypeResult === undefined) {
                // User cancelled, create file without imports
                const template = `*** Settings ***\n\n\n${mainSection}\n`;
                await writeFile(filePath, template, fileType, fullFileName);
                return;
            }
            selectedPathType = pathTypeResult;

            progress.report({ increment: 20, message: "Preparing import selection..." });

            // Show file selection (passing empty array for suggested files since we don't have content to analyze yet)
            // Use the pre-combined files that include all types
            const selectionResult = await showFileSelectionTreeView(combinedFiles, [], targetDir, workspaceRoot, selectedPathType, filePath, [], []);

            // If user canceled, exit early (no file will be created)
            if (selectionResult === null) {
                return; // User canceled
            }

            selectedImports = selectionResult;
        }

        // Generate file content
        const settingsSection = generateSettingsSection(selectedImports, selectedPathType);
        const template = `${settingsSection}\n\n${mainSection}\n`;
        await writeFile(filePath, template, fileType, fullFileName);
    });
}
