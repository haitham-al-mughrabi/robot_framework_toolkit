import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Path type options
type PathType = 'relative' | 'absolute';
type ImportType = 'Library' | 'Resource' | 'Variables';

// Allowed project folders (exclude venv, node_modules, etc.)
const ALLOWED_FOLDERS = ['Libraries', 'Tests', 'Utilities', 'Resources', 'POM', 'Library', 'Test', 'Utility', 'Resource'];

// Existing import parsed from file
interface ExistingImport {
    type: ImportType;
    path: string;
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

    // Register command: Edit Robot Framework Imports
    const editImports = vscode.commands.registerCommand(
        'rfFilesCreator.editImports',
        async (uri: vscode.Uri) => {
            await editRobotFileImports(uri);
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

/**
 * Check if file is in allowed project folders
 */
function isInAllowedFolder(filePath: string, workspaceRoot: string): boolean {
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
function filterProjectFiles(files: vscode.Uri[], workspaceRoot: string): vscode.Uri[] {
    return files.filter(file => isInAllowedFolder(file.fsPath, workspaceRoot));
}

/**
 * Parse existing imports from a Robot Framework file
 */
function parseExistingImports(fileContent: string): ExistingImport[] {
    const imports: ExistingImport[] = [];
    const lines = fileContent.split('\n');

    let inSettings = false;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check for Settings section
        if (trimmedLine.match(/^\*\*\*\s*Settings\s*\*\*\*/i)) {
            inSettings = true;
            continue;
        }

        // Check for other sections (exit Settings)
        if (trimmedLine.match(/^\*\*\*\s*(Test Cases|Keywords|Variables|Tasks|Comments)\s*\*\*\*/i)) {
            inSettings = false;
            continue;
        }

        if (inSettings && trimmedLine) {
            // Parse Library imports
            const libraryMatch = trimmedLine.match(/^Library\s+(\S+)/i);
            if (libraryMatch) {
                imports.push({ type: 'Library', path: libraryMatch[1] });
            }

            // Parse Resource imports
            const resourceMatch = trimmedLine.match(/^Resource\s+(\S+)/i);
            if (resourceMatch) {
                imports.push({ type: 'Resource', path: resourceMatch[1] });
            }

            // Parse Variables imports
            const variablesMatch = trimmedLine.match(/^Variables\s+(\S+)/i);
            if (variablesMatch) {
                imports.push({ type: 'Variables', path: variablesMatch[1] });
            }
        }
    }

    return imports;
}

/**
 * Update the Settings section in a Robot Framework file
 */
function updateSettingsSection(fileContent: string, newSettingsSection: string): string {
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
async function selectPathType(): Promise<PathType | undefined> {
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
function generateSettingsSection(selectedImports: SelectedItem[], pathType: PathType): string {
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

interface SelectedItem {
    isFile: boolean;
    filePath: string;
    relativePath: string;
    absolutePath: string;
    importType?: ImportType;
}

/**
 * Show file selection using QuickPick with tree-like indentation
 */
async function showFileSelectionQuickPick(
    pyFiles: vscode.Uri[],
    resourceFiles: vscode.Uri[],
    targetDir: string,
    workspaceRoot: string,
    pathType: PathType,
    existingImports: ExistingImport[] = []
): Promise<SelectedItem[]> {
    interface SelectableItem extends vscode.QuickPickItem {
        isFile: boolean;
        filePath: string;
        relativePath: string;
        absolutePath: string;
        importType?: ImportType;
        depth: number;
        folderPath: string;
    }

    const items: SelectableItem[] = [];
    const preSelectedItems: SelectableItem[] = [];

    // Helper to get paths
    const getRelativePath = (filePath: string) => path.relative(targetDir, filePath).replace(/\\/g, '/');
    const getAbsolutePath = (filePath: string) => path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

    // Check if import is already selected
    const isImportSelected = (importPath: string, importType: ImportType): boolean => {
        return existingImports.some(imp => {
            // Normalize paths for comparison
            const normalizedExisting = imp.path.replace(/\\/g, '/');
            const normalizedNew = importPath.replace(/\\/g, '/');
            return imp.type === importType && (
                normalizedExisting === normalizedNew ||
                normalizedExisting.endsWith(normalizedNew) ||
                normalizedNew.endsWith(normalizedExisting)
            );
        });
    };

    // Build folder structure for files
    const buildFolderStructure = (
        files: vscode.Uri[],
        importTypes: ImportType[],
        sectionLabel: string
    ) => {
        if (files.length === 0) return;

        // Add section header
        items.push({
            label: `$(folder-library) ${sectionLabel}`,
            kind: vscode.QuickPickItemKind.Separator,
            isFile: false,
            filePath: '',
            relativePath: '',
            absolutePath: '',
            depth: 0,
            folderPath: ''
        });

        // Group files by folder
        const folderFiles = new Map<string, vscode.Uri[]>();
        for (const file of files) {
            const absPath = getAbsolutePath(file.fsPath);
            const folderPath = path.dirname(absPath);
            if (!folderFiles.has(folderPath)) {
                folderFiles.set(folderPath, []);
            }
            folderFiles.get(folderPath)!.push(file);
        }

        // Sort folders
        const sortedFolders = Array.from(folderFiles.keys()).sort();

        for (const folder of sortedFolders) {
            const folderDepth = folder ? folder.split('/').length : 0;
            const indent = '    '.repeat(folderDepth);

            // Add folder item (as separator)
            if (folder) {
                items.push({
                    label: `${indent}$(folder) ${folder}`,
                    kind: vscode.QuickPickItemKind.Separator,
                    isFile: false,
                    filePath: '',
                    relativePath: '',
                    absolutePath: '',
                    depth: folderDepth,
                    folderPath: folder
                });
            }

            // Add files in this folder
            const filesInFolder = folderFiles.get(folder)!;
            filesInFolder.sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)));

            for (const file of filesInFolder) {
                const fileName = path.basename(file.fsPath);
                const relativePath = getRelativePath(file.fsPath);
                const absolutePath = getAbsolutePath(file.fsPath);
                const fileIndent = '    '.repeat(folderDepth + 1);
                const displayPath = pathType === 'relative' ? relativePath : absolutePath;

                for (const importType of importTypes) {
                    const icon = importType === 'Library' ? '$(library)' : importType === 'Resource' ? '$(file-code)' : '$(symbol-variable)';
                    const item: SelectableItem = {
                        label: `${fileIndent}${icon} ${fileName}`,
                        description: `[${importType}]`,
                        detail: displayPath,
                        isFile: true,
                        filePath: file.fsPath,
                        relativePath,
                        absolutePath,
                        importType,
                        depth: folderDepth + 1,
                        folderPath: folder
                    };
                    items.push(item);

                    // Check if this import already exists
                    if (isImportSelected(relativePath, importType) || isImportSelected(absolutePath, importType)) {
                        preSelectedItems.push(item);
                    }
                }
            }
        }
    };

    // Build structure for both file types
    buildFolderStructure(pyFiles, ['Library', 'Variables'], 'Python Files (.py)');
    buildFolderStructure(resourceFiles, ['Resource', 'Variables'], 'Resource Files (.resource)');

    // Show QuickPick
    const quickPick = vscode.window.createQuickPick<SelectableItem>();
    quickPick.items = items;
    quickPick.canSelectMany = true;
    quickPick.title = existingImports.length > 0 ? 'Edit imports (pre-selected are current imports)' : 'Select files to import';
    quickPick.placeholder = 'Check files to import (Enter to confirm, Esc to skip)';

    // Pre-select existing imports
    quickPick.selectedItems = preSelectedItems;

    const result = await new Promise<SelectableItem[]>((resolve) => {
        quickPick.onDidAccept(() => {
            resolve([...quickPick.selectedItems]);
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            resolve([]);
            quickPick.dispose();
        });
        quickPick.show();
    });

    // Convert to SelectedItem format
    return result.filter(item => item.isFile).map(item => ({
        isFile: true,
        filePath: item.filePath,
        relativePath: item.relativePath,
        absolutePath: item.absolutePath,
        importType: item.importType
    }));
}

/**
 * Edit imports in an existing Robot Framework file
 */
async function editRobotFileImports(uri: vscode.Uri): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = uri.fsPath;
    const targetDir = path.dirname(filePath);

    // Read the file content
    let fileContent: string;
    try {
        fileContent = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read file: ${filePath}`);
        return;
    }

    // Parse existing imports
    const existingImports = parseExistingImports(fileContent);

    // Find importable files (filtered to project folders)
    const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');
    const allResourceFiles = await vscode.workspace.findFiles('**/*.resource', '{**/node_modules/**,**/venv/**,**/.venv/**}');

    // Filter to allowed project folders
    const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
    const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);

    if (pyFiles.length === 0 && resourceFiles.length === 0) {
        vscode.window.showWarningMessage('No importable files found in project folders (Libraries, Tests, Utilities, Resources, POM).');
        return;
    }

    // Ask for path type
    const selectedPathType = await selectPathType();
    if (selectedPathType === undefined) {
        return; // User cancelled
    }

    // Show file selection with pre-selected existing imports
    const selectedImports = await showFileSelectionQuickPick(
        pyFiles,
        resourceFiles,
        targetDir,
        workspaceRoot,
        selectedPathType,
        existingImports
    );

    // Generate new settings section
    const newSettingsSection = generateSettingsSection(selectedImports, selectedPathType);

    // Update file content
    const updatedContent = updateSettingsSection(fileContent, newSettingsSection);

    // Write back to file
    try {
        fs.writeFileSync(filePath, updatedContent, 'utf8');

        // Refresh the document if it's open
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`Updated imports in ${path.basename(filePath)}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to update file: ${errorMessage}`);
    }
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
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const targetDir = uri ? uri.fsPath : workspaceRoot;

    // Prompt user for filename
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

    // Find importable files (filtered to project folders)
    const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');
    const allResourceFiles = await vscode.workspace.findFiles('**/*.resource', '{**/node_modules/**,**/venv/**,**/.venv/**}');

    // Filter to allowed project folders
    const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
    const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);

    let selectedImports: SelectedItem[] = [];
    let selectedPathType: PathType = 'relative';

    if (pyFiles.length > 0 || resourceFiles.length > 0) {
        // Ask for path type
        const pathTypeResult = await selectPathType();
        if (pathTypeResult === undefined) {
            // User cancelled, create file without imports
            const template = `*** Settings ***\n\n\n${mainSection}\n`;
            await writeFile(filePath, template, fileType, fullFileName);
            return;
        }
        selectedPathType = pathTypeResult;

        // Show file selection
        selectedImports = await showFileSelectionQuickPick(pyFiles, resourceFiles, targetDir, workspaceRoot, selectedPathType);
    }

    // Generate file content
    const settingsSection = generateSettingsSection(selectedImports, selectedPathType);
    const template = `${settingsSection}\n\n${mainSection}\n`;
    await writeFile(filePath, template, fileType, fullFileName);
}

/**
 * Helper to write file and show it
 */
async function writeFile(filePath: string, content: string, fileType: string, fileName: string) {
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
async function createRobotFile(
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

export function deactivate() {}
