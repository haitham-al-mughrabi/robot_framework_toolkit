import * as vscode from 'vscode';
import { isRobotFrameworkFile } from './file-operations';

// Target file locking mechanism
let lockedTargetFile: string | undefined;
let isTargetLocked: boolean = false;

// Original target file (the file that opened the import tree - NEVER changes unless explicitly set)
let originalTargetFile: string | undefined;

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
}

/**
 * Unlock the target file
 */
export function unlockTargetFile(): void {
    lockedTargetFile = undefined;
    isTargetLocked = false;
    vscode.commands.executeCommand('setContext', 'rfTargetLocked', false);
}

/**
 * Check if target is currently locked
 */
export function isLocked(): boolean {
    return isTargetLocked;
}

/**
 * Get the original target file path (the file that opened the import tree)
 */
export function getOriginalTargetFile(): string | undefined {
    return originalTargetFile;
}

/**
 * Get the locked target file path
 */
export function getLockedTargetFile(): string | undefined {
    return lockedTargetFile;
}
