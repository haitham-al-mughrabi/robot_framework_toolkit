import * as vscode from 'vscode';
import * as path from 'path';
import { isRobotFrameworkFile } from './file-operations';
import { ImportTreeItem } from './tree/items';

// Target file locking mechanism
let lockedTargetFile: string | undefined;
let isTargetLocked: boolean = false;

// Original target file (the file that opened the import tree - NEVER changes unless explicitly set)
let originalTargetFile: string | undefined;

// Global reference to tree view for title updates
let currentTreeViewRef: vscode.TreeView<ImportTreeItem> | undefined;

/**
 * Set the tree view reference for title updates
 */
export function setTreeViewRef(treeView: vscode.TreeView<ImportTreeItem> | undefined): void {
    currentTreeViewRef = treeView;
}

/**
 * Set the original target file (the file that opened the import tree)
 * This is set once and only changes when a new file opens the tree
 */
export function setOriginalTargetFile(filePath: string | undefined): void {
    originalTargetFile = filePath;
}

/**
 * Get the current target file (locked > original)
 * Returns the file that should be returned to when Go to Target is clicked
 */
export function getTargetFile(): string | undefined {
    // First priority: locked target
    if (isTargetLocked && lockedTargetFile) {
        return lockedTargetFile;
    }
    // Second priority: original target (the file that opened the tree)
    if (originalTargetFile) {
        return originalTargetFile;
    }
    // Third priority: active editor if it's a robot file (fallback only)
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isRobotFrameworkFile(activeEditor.document.uri.fsPath)) {
        return activeEditor.document.uri.fsPath;
    }
    return undefined;
}

/**
 * Lock the current target file
 */
export function lockTargetFile(filePath: string): void {
    lockedTargetFile = filePath;
    isTargetLocked = true;
    vscode.commands.executeCommand('setContext', 'rfTargetLocked', true);
    updateTreeViewTitle();
}

/**
 * Unlock the target file
 */
export function unlockTargetFile(): void {
    lockedTargetFile = undefined;
    isTargetLocked = false;
    vscode.commands.executeCommand('setContext', 'rfTargetLocked', false);
    updateTreeViewTitle();
}

/**
 * Update tree view title to show target file
 */
export function updateTreeViewTitle(): void {
    if (currentTreeViewRef && lockedTargetFile) {
        currentTreeViewRef.title = `Import Selector (${path.basename(lockedTargetFile)})`;
    } else if (currentTreeViewRef) {
        currentTreeViewRef.title = 'Import Selector';
    }
}

/**
 * Check if target is currently locked
 */
export function isLocked(): boolean {
    return isTargetLocked;
}

/**
 * Get the locked target file path
 */
export function getLockedTargetFile(): string | undefined {
    return lockedTargetFile;
}
