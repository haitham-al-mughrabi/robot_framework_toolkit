import * as vscode from 'vscode';
import { isRobotFrameworkFile } from './file-operations';
import {
    unlockTargetFile,
    isLocked,
    getLockedTargetFile
} from './target-manager';
import {
    initializeTreeView,
    loadImportsForFile,
    getCurrentTreeView,
    disposeCurrentTreeView,
    disposeWelcomeTreeView,
    refreshCurrentTreeIndicators
} from './import-manager';
import { registerCommands } from './commands';
import { initializeFileViewTracker } from './file-view-tracker';

export function activate(context: vscode.ExtensionContext) {
    // Initialize the tree view - check if active file is a robot file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isRobotFrameworkFile(activeEditor.document.uri.fsPath)) {
        loadImportsForFile(activeEditor.document.uri.fsPath);
    } else {
        initializeTreeView();
    }

    // Initialize the file view tracker
    initializeFileViewTracker(context);

    // Listen for active editor changes to update the tree view
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isRobotFrameworkFile(editor.document.uri.fsPath)) {
                const newFilePath = editor.document.uri.fsPath;

                // If locked and user returns to the target file, auto-unlock but preserve selections
                if (isLocked() && getLockedTargetFile() && newFilePath === getLockedTargetFile()) {
                    unlockTargetFile();

                    // Just update the editor focus to the target file without reloading the tree
                    // This maintains the pending selections in the tree view
                    refreshCurrentTreeIndicators();
                    return;
                }

                // If locked and user switches to a different robot file, keep the current locked view
                // (Don't change anything - maintain the locked target's imports)
                if (isLocked() && getLockedTargetFile() && newFilePath !== getLockedTargetFile()) {
                    // Refresh the tree to update the current file indicator
                    refreshCurrentTreeIndicators();
                    return;
                }

                // If not locked, handle normally
                if (!isLocked()) {
                    disposeCurrentTreeView();
                    disposeWelcomeTreeView();
                    loadImportsForFile(newFilePath);
                }
            } else if (!isLocked() && !getCurrentTreeView()) {
                // Show welcome view if no robot file is open and not locked
                disposeWelcomeTreeView();
                initializeTreeView();
            }
        })
    );

    // Register all commands
    registerCommands(context);
}

export function deactivate() {}
