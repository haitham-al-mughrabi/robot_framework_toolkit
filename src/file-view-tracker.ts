import * as vscode from 'vscode';
import { ImportTreeItem } from './tree/items';
import { getCurrentTreeProvider } from './import-manager';

// Keep track of currently visible files
let currentlyViewedFiles: Set<string> = new Set<string>();

/**
 * Initialize the file view tracker
 */
export function initializeFileViewTracker(context: vscode.ExtensionContext): void {
    // Listen for active editor changes to track which files are being viewed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateCurrentlyViewedFiles(editor);
        })
    );

    // Initialize with currently open editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document && activeEditor.document.uri && activeEditor.document.uri.fsPath) {
        currentlyViewedFiles.add(activeEditor.document.uri.fsPath);
    }

    // Also listen to document opening/closing to handle edge cases
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            // Note: We only add if this document becomes the active editor
            // This is handled by the onDidChangeActiveTextEditor event
        })
    );
}

/**
 * Update the tracking when the active editor changes
 */
function updateCurrentlyViewedFiles(editor: vscode.TextEditor | undefined): void {
    // Clear all currently viewed files
    currentlyViewedFiles.clear();

    // Add the currently active editor if it exists
    if (editor && editor.document && editor.document.uri && editor.document.uri.fsPath) {
        currentlyViewedFiles.add(editor.document.uri.fsPath);
    }

    // Update tree view to reflect current state
    updateTreeViewIndicators();
}

/**
 * Check if a file path is currently being viewed
 */
export function isFileCurrentlyViewed(filePath: string): boolean {
    return currentlyViewedFiles.has(filePath);
}

/**
 * Get all currently viewed files
 */
export function getCurrentlyViewedFiles(): Set<string> {
    return new Set(currentlyViewedFiles);
}

/**
 * Update the tree view to show which files are currently being viewed
 */
export function updateTreeViewIndicators(): void {
    const treeProvider = getCurrentTreeProvider();
    if (treeProvider) {
        // Refresh the tree to update the UI indicators
        treeProvider.refreshTreeIndicators();
    }
}

/**
 * Manually add a file to the currently viewed tracking
 * This is useful when programmatically opening files
 */
export function addCurrentlyViewedFile(filePath: string): void {
    currentlyViewedFiles.add(filePath);
    updateTreeViewIndicators();
}

/**
 * Manually remove a file from the currently viewed tracking
 */
export function removeCurrentlyViewedFile(filePath: string): void {
    currentlyViewedFiles.delete(filePath);
    updateTreeViewIndicators();
}