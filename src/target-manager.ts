import * as vscode from 'vscode';
import * as path from 'path';
import { isRobotFrameworkFile } from './file-operations';
import { ImportTreeItem } from './tree/items';

// Target file locking mechanism
let lockedTargetFile: string | undefined;
let isTargetLocked: boolean = false;

// Global reference to tree view for title updates
let currentTreeViewRef: vscode.TreeView<ImportTreeItem> | undefined;

/**
 * Set the tree view reference for title updates
 */
export function setTreeViewRef(treeView: vscode.TreeView<ImportTreeItem> | undefined): void {
    currentTreeViewRef = treeView;
}

/**
 * Get the current target file (locked or active)
 */
export function getTargetFile(): string | undefined {
    if (isTargetLocked && lockedTargetFile) {
        return lockedTargetFile;
    }
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
