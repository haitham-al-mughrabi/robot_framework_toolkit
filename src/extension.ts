import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Path type options
type PathType = 'relative' | 'absolute';

// Import types for the QuickPick
interface ImportableFile extends vscode.QuickPickItem {
    relativePath: string;
    absolutePath: string;
    importType: 'Library' | 'Resource' | 'Variables';
    isHeader?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
    // Register command: Create Robot Framework Test File
    const createTestFile = vscode.commands.registerCommand(
        'rfFilesCreator.createTestFile',
        async (uri: vscode.Uri) => {
            await createRobotFileWithImports(uri, 'test', '.robot', '*** Test Cases ***');
        }
    );

    // Register command: Create Robot Framework Resource File
    const createResourceFile = vscode.commands.registerCommand(
        'rfFilesCreator.createResourceFile',
        async (uri: vscode.Uri) => {
            await createRobotFileWithImports(uri, 'resource', '.resource', '*** Keywords ***');
        }
    );

    // Register command: Create Robot Framework Variables File
    const createVariablesFile = vscode.commands.registerCommand(
        'rfFilesCreator.createVariablesFile',
        async (uri: vscode.Uri) => {
            await createRobotFileWithImports(uri, 'variables', '.resource', '*** Variables ***');
        }
    );

    // Register command: Create Robot Framework Locators File
    const createLocatorsFile = vscode.commands.registerCommand(
        'rfFilesCreator.createLocatorsFile',
        async (uri: vscode.Uri) => {
            await createRobotFile(uri, 'locators', '.py', '');
        }
    );

    context.subscriptions.push(
        createTestFile,
        createResourceFile,
        createVariablesFile,
        createLocatorsFile
    );
}

/**
 * Prompt user to select path type (relative or absolute)
 */
async function selectPathType(): Promise<PathType | undefined> {
    const options: vscode.QuickPickItem[] = [
        {
            label: '$(file-symlink-directory) Relative Path',
            description: 'e.g., ../../Library/locators.py',
            detail: 'Path relative to the new file location'
        },
        {
            label: '$(root-folder) Absolute Path (from workspace)',
            description: 'e.g., Library/locators.py',
            detail: 'Path from workspace root folder'
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
 * Group files by their folder structure
 */
function groupFilesByFolder(
    files: vscode.Uri[],
    targetDir: string,
    workspaceRoot: string,
    importTypes: ('Library' | 'Resource' | 'Variables')[]
): ImportableFile[] {
    const result: ImportableFile[] = [];

    // Group files by their parent folder (relative to workspace)
    const folderMap = new Map<string, vscode.Uri[]>();

    for (const file of files) {
        const absolutePath = getAbsolutePath(workspaceRoot, file.fsPath);
        const folderPath = path.dirname(absolutePath);

        if (!folderMap.has(folderPath)) {
            folderMap.set(folderPath, []);
        }
        folderMap.get(folderPath)!.push(file);
    }

    // Sort folders alphabetically
    const sortedFolders = Array.from(folderMap.keys()).sort();

    for (const folder of sortedFolders) {
        const folderFiles = folderMap.get(folder)!;

        // Add folder header (separator)
        result.push({
            label: `$(folder) ${folder || '(root)'}`,
            kind: vscode.QuickPickItemKind.Separator,
            relativePath: '',
            absolutePath: '',
            importType: 'Library',
            isHeader: true
        });

        // Sort files within folder
        folderFiles.sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)));

        // Add each file with its import type options
        for (const file of folderFiles) {
            const relativePath = getRelativePath(targetDir, file.fsPath);
            const absolutePath = getAbsolutePath(workspaceRoot, file.fsPath);
            const fileName = path.basename(file.fsPath);

            for (const importType of importTypes) {
                let icon = '$(library)';
                if (importType === 'Resource') {
                    icon = '$(file-code)';
                } else if (importType === 'Variables') {
                    icon = '$(symbol-variable)';
                }

                result.push({
                    label: `    ${icon} ${fileName}`,
                    description: `[${importType}]`,
                    detail: absolutePath,
                    relativePath: relativePath,
                    absolutePath: absolutePath,
                    importType: importType,
                    picked: false
                });
            }
        }
    }

    return result;
}

/**
 * Scan workspace for importable files (.py and .resource)
 */
async function scanWorkspaceForImportableFiles(
    targetFilePath: string,
    workspaceRoot: string
): Promise<ImportableFile[]> {
    // Find all .py files (for Library and Variables)
    const pyFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**');

    // Find all .resource files (for Resource and Variables)
    const resourceFiles = await vscode.workspace.findFiles('**/*.resource', '**/node_modules/**');

    const targetDir = path.dirname(targetFilePath);

    // Group .py files (can be Library or Variables)
    const pyItems = groupFilesByFolder(pyFiles, targetDir, workspaceRoot, ['Library', 'Variables']);

    // Group .resource files (can be Resource or Variables)
    const resourceItems = groupFilesByFolder(resourceFiles, targetDir, workspaceRoot, ['Resource', 'Variables']);

    // Combine and return
    const allItems: ImportableFile[] = [];

    if (pyItems.length > 0) {
        allItems.push({
            label: '$(library) Python Files (.py)',
            kind: vscode.QuickPickItemKind.Separator,
            relativePath: '',
            absolutePath: '',
            importType: 'Library',
            isHeader: true
        });
        allItems.push(...pyItems);
    }

    if (resourceItems.length > 0) {
        allItems.push({
            label: '$(file-code) Resource Files (.resource)',
            kind: vscode.QuickPickItemKind.Separator,
            relativePath: '',
            absolutePath: '',
            importType: 'Resource',
            isHeader: true
        });
        allItems.push(...resourceItems);
    }

    return allItems;
}

/**
 * Get relative path from target directory to file
 */
function getRelativePath(fromDir: string, toFile: string): string {
    const relativePath = path.relative(fromDir, toFile);
    // Use forward slashes for Robot Framework compatibility
    return relativePath.replace(/\\/g, '/');
}

/**
 * Get absolute path from workspace root to file
 */
function getAbsolutePath(workspaceRoot: string, toFile: string): string {
    const absolutePath = path.relative(workspaceRoot, toFile);
    // Use forward slashes for Robot Framework compatibility
    return absolutePath.replace(/\\/g, '/');
}

/**
 * Generate Settings section content based on selected imports
 */
function generateSettingsSection(selectedImports: ImportableFile[], pathType: PathType): string {
    const libraries: string[] = [];
    const resources: string[] = [];
    const variables: string[] = [];

    for (const item of selectedImports) {
        if (item.isHeader) continue; // Skip headers

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

    // Add Libraries
    for (const lib of libraries) {
        settings += `Library    ${lib}\n`;
    }

    // Add Resources
    for (const res of resources) {
        settings += `Resource    ${res}\n`;
    }

    // Add Variables
    for (const vars of variables) {
        settings += `Variables    ${vars}\n`;
    }

    return settings;
}

/**
 * Create Robot Framework file with import selection dialog
 */
async function createRobotFileWithImports(
    uri: vscode.Uri | undefined,
    fileType: string,
    extension: string,
    mainSection: string
): Promise<void> {
    // Determine the target directory and workspace root
    let targetDir: string;
    let workspaceRoot: string;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
        return;
    }
    workspaceRoot = workspaceFolders[0].uri.fsPath;

    if (uri) {
        targetDir = uri.fsPath;
    } else {
        targetDir = workspaceRoot;
    }

    // Prompt user for filename first
    const fileName = await vscode.window.showInputBox({
        prompt: `Enter the name for the new Robot Framework ${fileType} file`,
        placeHolder: `my_${fileType}`,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'File name cannot be empty';
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                return 'File name can only contain letters, numbers, underscores, and hyphens';
            }
            return null;
        }
    });

    if (!fileName) {
        return; // User cancelled
    }

    const fullFileName = fileName + extension;
    const filePath = path.join(targetDir, fullFileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `File "${fullFileName}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    // Scan for importable files
    const importableFiles = await scanWorkspaceForImportableFiles(filePath, workspaceRoot);

    let selectedImports: ImportableFile[] = [];
    let pathType: PathType = 'relative';

    // Filter out separator items for counting
    const selectableFiles = importableFiles.filter(item => item.kind !== vscode.QuickPickItemKind.Separator);

    if (selectableFiles.length > 0) {
        // First, ask user for path type preference
        const selectedPathType = await selectPathType();

        if (selectedPathType === undefined) {
            // User cancelled, create file without imports
            const template = `*** Settings ***\n\n\n${mainSection}\n`;
            try {
                fs.writeFileSync(filePath, template, 'utf8');
                const document = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage(`Created Robot Framework ${fileType} file: ${fullFileName}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
            }
            return;
        }

        pathType = selectedPathType;

        // Update detail to show the selected path type
        const updatedItems = importableFiles.map(item => {
            if (item.kind === vscode.QuickPickItemKind.Separator) {
                return item;
            }
            return {
                ...item,
                detail: pathType === 'relative' ? item.relativePath : item.absolutePath
            };
        });

        // Show multi-select QuickPick for imports
        const quickPick = vscode.window.createQuickPick<ImportableFile>();
        quickPick.items = updatedItems;
        quickPick.canSelectMany = true;
        quickPick.title = `Select files to import in ${fullFileName}`;
        quickPick.placeholder = 'Check/uncheck files to import (press Enter when done, Esc to skip)';

        const result = await new Promise<ImportableFile[] | undefined>((resolve) => {
            quickPick.onDidAccept(() => {
                resolve([...quickPick.selectedItems]);
                quickPick.hide();
            });
            quickPick.onDidHide(() => {
                resolve(quickPick.selectedItems.length > 0 ? [...quickPick.selectedItems] : []);
                quickPick.dispose();
            });
            quickPick.show();
        });

        if (result) {
            selectedImports = result;
        }
    }

    // Generate file content
    const settingsSection = generateSettingsSection(selectedImports, pathType);
    const template = `${settingsSection}\n\n${mainSection}\n`;

    try {
        // Create the file with template content
        fs.writeFileSync(filePath, template, 'utf8');

        // Open the newly created file
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`Created Robot Framework ${fileType} file: ${fullFileName}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
    }
}

/**
 * Create simple Robot Framework file without import selection (for .py files)
 */
async function createRobotFile(
    uri: vscode.Uri | undefined,
    fileType: string,
    extension: string,
    template: string
): Promise<void> {
    let targetDir: string;

    if (uri) {
        targetDir = uri.fsPath;
    } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            targetDir = workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
            return;
        }
    }

    const fileName = await vscode.window.showInputBox({
        prompt: `Enter the name for the new Robot Framework ${fileType} file`,
        placeHolder: `my_${fileType}`,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'File name cannot be empty';
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                return 'File name can only contain letters, numbers, underscores, and hyphens';
            }
            return null;
        }
    });

    if (!fileName) {
        return;
    }

    const fullFileName = fileName + extension;
    const filePath = path.join(targetDir, fullFileName);

    if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `File "${fullFileName}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        fs.writeFileSync(filePath, template, 'utf8');
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`Created Robot Framework ${fileType} file: ${fullFileName}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
    }
}

export function deactivate() {}
