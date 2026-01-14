import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PathType, SelectedItem } from './types';
import { ImportTreeItem } from './tree/items';
import {
    ImportableFilesProvider,
    CurrentImportsProvider,
    KeywordsProvider,
    KeywordDetailsProvider,
    setHasPendingChanges
} from './tree/multi-view-providers';
import { parseExistingImports, analyzeFileContentForSuggestions } from './parsers';
import {
    isRobotFrameworkFile,
    filterProjectFiles,
    selectPathType,
    generateSettingsSection,
    updateSettingsSection
} from './file-operations';
import {
    lockTargetFile,
    getLockedTargetFile,
    isLocked,
    setOriginalTargetFile
} from './target-manager';

// Global references for multiple views
let importableFilesView: vscode.TreeView<ImportTreeItem> | undefined;
let currentImportsView: vscode.TreeView<ImportTreeItem> | undefined;
let keywordsView: vscode.TreeView<ImportTreeItem> | undefined;
let keywordDetailsView: vscode.TreeView<ImportTreeItem> | undefined;

let importableFilesProvider: ImportableFilesProvider | undefined;
let currentImportsProvider: CurrentImportsProvider | undefined;
let keywordsProvider: KeywordsProvider | undefined;
let keywordDetailsProvider: KeywordDetailsProvider | undefined;

let importSelectionResolver: ((confirmed: boolean) => void) | undefined;
let treeViewDisposables: vscode.Disposable[] = [];

/**
 * Get the importable files provider
 */
export function getImportableFilesProvider(): ImportableFilesProvider | undefined {
    return importableFilesProvider;
}

/**
 * Get the current imports provider
 */
export function getCurrentImportsProvider(): CurrentImportsProvider | undefined {
    return currentImportsProvider;
}

/**
 * Get the keywords provider
 */
export function getKeywordsProvider(): KeywordsProvider | undefined {
    return keywordsProvider;
}

/**
 * Get the keyword details provider
 */
export function getKeywordDetailsProvider(): KeywordDetailsProvider | undefined {
    return keywordDetailsProvider;
}

/**
 * Get the importable files view
 */
export function getImportableFilesView(): vscode.TreeView<ImportTreeItem> | undefined {
    return importableFilesView;
}

/**
 * Get the import selection resolver
 */
export function getImportSelectionResolver(): ((confirmed: boolean) => void) | undefined {
    return importSelectionResolver;
}

/**
 * Refresh the tree indicators
 */
export function refreshCurrentTreeIndicators(): void {
    if (importableFilesProvider) {
        importableFilesProvider.refreshTreeIndicators();
    }
}

/**
 * Initialize empty tree views on extension activation
 */
export function initializeTreeViews(): void {
    // Create empty providers
    keywordsProvider = new KeywordsProvider();
    keywordDetailsProvider = new KeywordDetailsProvider();

    // Create tree views that are always registered
    keywordsView = vscode.window.createTreeView('rfKeywords', {
        treeDataProvider: keywordsProvider
    });

    keywordDetailsView = vscode.window.createTreeView('rfKeywordDetails', {
        treeDataProvider: keywordDetailsProvider
    });
}

/**
 * Dispose all tree views
 */
export function disposeAllTreeViews(): void {
    for (const disposable of treeViewDisposables) {
        disposable.dispose();
    }
    treeViewDisposables = [];

    importableFilesView?.dispose();
    currentImportsView?.dispose();

    importableFilesView = undefined;
    currentImportsView = undefined;

    importableFilesProvider = undefined;
    currentImportsProvider = undefined;

    importSelectionResolver = undefined;
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

    setOriginalTargetFile(filePath);

    // Read file content and parse existing imports
    let fileContent: string;
    try {
        fileContent = fs.readFileSync(filePath, 'utf8');
    } catch {
        return;
    }

    const existingImports = parseExistingImports(fileContent);

    // Find importable files
    const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');
    const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

    const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
    const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
    const allImportableFiles = [...pyFiles, ...resourceFiles];

    if (allImportableFiles.length === 0) {
        return;
    }

    // Create providers
    importableFilesProvider = new ImportableFilesProvider(
        allImportableFiles,
        targetDir,
        workspaceRoot,
        filePath,
        existingImports
    );

    currentImportsProvider = new CurrentImportsProvider(existingImports);

    // Clear keywords when loading new file
    if (keywordsProvider) {
        keywordsProvider.clearKeywords();
    }
    if (keywordDetailsProvider) {
        keywordDetailsProvider.clearSelectedKeyword();
    }

    // Create tree views for importable files and current imports
    importableFilesView = vscode.window.createTreeView('rfImportableFiles', {
        treeDataProvider: importableFilesProvider,
        canSelectMany: true,
        manageCheckboxStateManually: true
    });

    currentImportsView = vscode.window.createTreeView('rfCurrentImports', {
        treeDataProvider: currentImportsProvider
    });

    // Handle checkbox changes for importable files
    const checkboxDisposable = importableFilesView.onDidChangeCheckboxState(e => {
        for (const [item, state] of e.items) {
            if (item.isFile) {
                importableFilesProvider?.setImportType(
                    item,
                    state === vscode.TreeItemCheckboxState.Checked ? item.availableImportTypes[0] : null
                );
            }
        }
    });
    treeViewDisposables.push(checkboxDisposable);

    // Refresh indicators when view becomes visible
    const visibilityDisposable = importableFilesView.onDidChangeVisibility(e => {
        if (e.visible) {
            refreshCurrentTreeIndicators();
        }
    });
    treeViewDisposables.push(visibilityDisposable);

    // Set up resolver for confirm/cancel buttons
    importSelectionResolver = async (confirmed: boolean) => {
        if (confirmed) {
            const selected = importableFilesProvider?.getSelectedItems() || [];

            // Ask for path type
            const selectedPathType = await selectPathType();
            if (selectedPathType === undefined) {
                return;
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

                // Reload the imports to reflect the changes
                const wasLocked = isLocked();
                const lockedFile = getLockedTargetFile();

                await loadImportsForFile(filePath);

                if (wasLocked && lockedFile) {
                    lockTargetFile(lockedFile);
                }

                setHasPendingChanges(false);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to update file: ${errorMessage}`);
            }
        } else {
            setHasPendingChanges(false);
        }
    };
}
