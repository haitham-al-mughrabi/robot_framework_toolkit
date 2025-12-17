import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PathType, SelectedItem } from './types';
import { ALLOWED_FOLDERS } from './constants';

/**
 * Check if a file is a Robot Framework file
 */
export function isRobotFrameworkFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.robot' || ext === '.resource';
}

/**
 * Check if file is in allowed project folders
 */
export function isInAllowedFolder(filePath: string, workspaceRoot: string): boolean {
    const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    const firstFolder = relativePath.split('/')[0];

    // Check if starts with allowed folder (case-insensitive)
    return ALLOWED_FOLDERS.some(folder =>
        firstFolder.toLowerCase() === folder.toLowerCase()
    );
}

/**
 * Filter files to only include those in allowed project folders
 */
export function filterProjectFiles(files: vscode.Uri[], workspaceRoot: string): vscode.Uri[] {
    return files.filter(file => isInAllowedFolder(file.fsPath, workspaceRoot));
}

/**
 * Remove a specific import from the file content
 */
export function removeImportFromContent(fileContent: string, importPath: string, importType: string): string {
    const lines = fileContent.split('\n');
    const result: string[] = [];

    let inSettings = false;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check for Settings section
        if (trimmedLine.match(/^\*\*\*\s*Settings\s*\*\*\*/i)) {
            inSettings = true;
            result.push(line);
            continue;
        }

        // Check for other sections (exit Settings)
        if (trimmedLine.match(/^\*\*\*\s*(Test Cases|Keywords|Variables|Tasks|Comments)\s*\*\*\*/i)) {
            inSettings = false;
            result.push(line);
            continue;
        }

        if (inSettings && trimmedLine) {
            // Check if this line is the import we want to remove
            const isLibraryImport = importType === 'Library' && trimmedLine.match(/^Library\s+/i);
            const isResourceImport = importType === 'Resource' && trimmedLine.match(/^Resource\s+/i);
            const isVariablesImport = importType === 'Variables' && trimmedLine.match(/^Variables\s+/i);

            if ((isLibraryImport || isResourceImport || isVariablesImport) &&
                trimmedLine.includes(importPath)) {
                // Skip this line (remove the import)
                continue;
            }
        }

        result.push(line);
    }

    return result.join('\n');
}

/**
 * Update the Settings section in a Robot Framework file
 */
export function updateSettingsSection(fileContent: string, newSettingsSection: string): string {
    const lines = fileContent.split('\n');
    const result: string[] = [];

    let inSettings = false;
    let settingsAdded = false;
    let foundSettings = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check for Settings section
        if (trimmedLine.match(/^\*\*\*\s*Settings\s*\*\*\*/i)) {
            inSettings = true;
            foundSettings = true;
            // Add new settings section
            result.push(newSettingsSection.trimEnd());
            settingsAdded = true;
            continue;
        }

        // Check for other sections (exit Settings)
        if (trimmedLine.match(/^\*\*\*\s*(Test Cases|Keywords|Variables|Tasks|Comments)\s*\*\*\*/i)) {
            if (inSettings) {
                inSettings = false;
                // Add blank line before next section if needed
                if (result.length > 0 && result[result.length - 1] !== '') {
                    result.push('');
                }
            }
            result.push(line);
            continue;
        }

        // Skip lines in Settings section (they're being replaced)
        if (inSettings) {
            continue;
        }

        result.push(line);
    }

    // If no Settings section was found, add it at the beginning
    if (!foundSettings) {
        return newSettingsSection + '\n\n' + fileContent;
    }

    return result.join('\n');
}

/**
 * Prompt user to select path type (relative or absolute)
 */
export async function selectPathType(): Promise<PathType | undefined> {
    const options: vscode.QuickPickItem[] = [
        {
            label: '$(link) Relative Path',
            description: '../folder/file.py',
            detail: 'Path relative to the file location'
        },
        {
            label: '$(home) Workspace Path',
            description: 'folder/file.py',
            detail: 'Path from workspace root'
        }
    ];

    const selected = await vscode.window.showQuickPick(options, {
        title: 'Select Import Path Style',
        placeHolder: 'How should import paths be formatted?'
    });

    if (!selected) {
        return undefined;
    }

    return selected.label.includes('Relative') ? 'relative' : 'absolute';
}

/**
 * Generate Settings section content based on selected imports
 */
export function generateSettingsSection(selectedImports: SelectedItem[], pathType: PathType): string {
    const libraries: string[] = [];
    const resources: string[] = [];
    const variables: string[] = [];

    for (const item of selectedImports) {
        if (!item.isFile) continue;

        const filePath = pathType === 'relative' ? item.relativePath : item.absolutePath;

        switch (item.importType) {
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

    let settings = '*** Settings ***\n';

    for (const lib of libraries) {
        settings += `Library    ${lib}\n`;
    }

    for (const res of resources) {
        settings += `Resource    ${res}\n`;
    }

    for (const vars of variables) {
        settings += `Variables    ${vars}\n`;
    }

    return settings;
}

/**
 * Helper to write file and show it
 */
export async function writeFile(filePath: string, content: string, fileType: string, fileName: string) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`Created ${fileType} file: ${fileName}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to create file: ${msg}`);
    }
}

/**
 * Create simple file without imports (for .py locators)
 */
export async function createRobotFile(
    uri: vscode.Uri | undefined,
    fileType: string,
    extension: string,
    template: string
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const targetDir = uri ? uri.fsPath : workspaceFolders[0].uri.fsPath;

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

    await writeFile(filePath, template, fileType, fullFileName);
}
