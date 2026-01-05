import * as vscode from 'vscode';
import { isRobotFrameworkFile } from './file-operations';
import { isLocked } from './target-manager';
import { registerCommands } from './commands';
import { initializeFileViewTracker } from './file-view-tracker';
import { ImportWebviewProvider } from './webview/ImportWebviewProvider';

let webviewProvider: ImportWebviewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Register webview provider
    webviewProvider = new ImportWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ImportWebviewProvider.viewType,
            webviewProvider
        )
    );

    // Initialize the file view tracker
    initializeFileViewTracker(context);

    // Listen for active editor changes to update the webview
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isRobotFrameworkFile(editor.document.uri.fsPath)) {
                const newFilePath = editor.document.uri.fsPath;

                // If locked, don't update the target file
                if (!isLocked() && webviewProvider) {
                    webviewProvider.updateTargetFile(newFilePath);
                }
            } else if (!isLocked() && webviewProvider) {
                // Clear target file if non-robot file is active
                webviewProvider.updateTargetFile(null);
            }
        })
    );

    // Initialize webview with current file if it's a robot file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isRobotFrameworkFile(activeEditor.document.uri.fsPath) && webviewProvider) {
        webviewProvider.updateTargetFile(activeEditor.document.uri.fsPath);
    }

    // Register all commands
    registerCommands(context);
}

export function deactivate() {}
