import * as vscode from 'vscode';
import { isRobotFrameworkFile } from './file-operations';
import {
    unlockTargetFile,
    isLocked,
    getLockedTargetFile
} from './target-manager';
import {
    loadImportsForFile,
    disposeAllTreeViews,
    refreshCurrentTreeIndicators,
    initializeTreeViews
} from './multi-view-manager';
import { registerCommands } from './commands';
import { initializeFileViewTracker } from './file-view-tracker';

export function activate(context: vscode.ExtensionContext) {
    // Initialize the file view tracker
    initializeFileViewTracker(context);

    // Initialize the tree views (registers keywords and keyword details views)
    initializeTreeViews();

    // Load imports if active file is a robot file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isRobotFrameworkFile(activeEditor.document.uri.fsPath)) {
        loadImportsForFile(activeEditor.document.uri.fsPath);
    }

    // Listen for active editor changes to update the tree views
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isRobotFrameworkFile(editor.document.uri.fsPath)) {
                const newFilePath = editor.document.uri.fsPath;

                // If locked and user returns to the target file, auto-unlock but preserve selections
                if (isLocked() && getLockedTargetFile() && newFilePath === getLockedTargetFile()) {
                    unlockTargetFile();
                    refreshCurrentTreeIndicators();
                    return;
                }

                // If locked and user switches to a different robot file, keep the current locked view
                if (isLocked() && getLockedTargetFile() && newFilePath !== getLockedTargetFile()) {
                    refreshCurrentTreeIndicators();
                    return;
                }

                // If not locked, handle normally
                if (!isLocked()) {
                    disposeAllTreeViews();
                    loadImportsForFile(newFilePath);
                }
            }
        })
    );

    // Register all commands
    registerCommands(context);
}

export function deactivate() {}
