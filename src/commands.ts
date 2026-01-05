import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createRobotFile } from './file-operations';

/**
 * Register all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
    // Register command: Create Robot Framework Test File
    const createTestFile = vscode.commands.registerCommand(
        'rfFilesCreator.createTestFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'test', '.robot', '*** Test Cases ***');
        }
    );

    // Register command: Create Robot Framework Resource File
    const createResourceFile = vscode.commands.registerCommand(
        'rfFilesCreator.createResourceFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'resource', '.resource', '*** Keywords ***');
        }
    );

    // Register command: Create Robot Framework Variables File
    const createVariablesFile = vscode.commands.registerCommand(
        'rfFilesCreator.createVariablesFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'variables', '.resource', '*** Variables ***');
        }
    );

    // Register command: Create Robot Framework Locators File
    const createLocatorsFile = vscode.commands.registerCommand(
        'rfFilesCreator.createLocatorsFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'locators', '.py', '');
        }
    );

    // Register command: Edit Robot Framework Imports (opens the webview)
    const editImports = vscode.commands.registerCommand(
        'rfFilesCreator.editImports',
        async (uri: vscode.Uri) => {
            // Open the file in the editor - the webview will automatically update
            const document = await vscode.workspace.openTextDocument(uri.fsPath);
            await vscode.window.showTextDocument(document);

            // Focus on the webview panel
            await vscode.commands.executeCommand('rfImportSelector.focus');
        }
    );

    context.subscriptions.push(
        createTestFile,
        createResourceFile,
        createVariablesFile,
        createLocatorsFile,
        editImports
    );
}
