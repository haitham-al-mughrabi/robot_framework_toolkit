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

// Tree item for import selection
class ImportTreeItem extends vscode.TreeItem {
    children: ImportTreeItem[] = [];
    isFile: boolean = false;
    filePath: string = '';
    relativePath: string = '';
    absolutePath: string = '';
    fileExtension: string = '';
    selectedImportType: ImportType | null = null; // null = not selected
    availableImportTypes: ImportType[] = [];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        options?: {
            isFile?: boolean;
            filePath?: string;
            relativePath?: string;
            absolutePath?: string;
            fileExtension?: string;
            selectedImportType?: ImportType | null;
            availableImportTypes?: ImportType[];
            isSuggested?: boolean;
        }
    ) {
        super(label, collapsibleState);
        if (options) {
            this.isFile = options.isFile || false;
            this.filePath = options.filePath || '';
            this.relativePath = options.relativePath || '';
            this.absolutePath = options.absolutePath || '';
            this.fileExtension = options.fileExtension || '';
            this.selectedImportType = options.selectedImportType ?? null;
            this.availableImportTypes = options.availableImportTypes || [];
            this.isSuggested = options.isSuggested ?? false;
        }

        this.updateAppearance();
    }

    isSuggested: boolean = false;

    updateAppearance() {
        if (this.isFile) {
            // Set context value for context menu identification
            this.contextValue = 'file';

            // Show checkbox based on whether an import type is selected
            this.checkboxState = this.selectedImportType
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;

            // Set icon based on file type
            if (this.fileExtension === '.py') {
                this.iconPath = new vscode.ThemeIcon('file-code');
            } else if (this.fileExtension === '.robot') {
                this.iconPath = new vscode.ThemeIcon('file-binary');
            } else if (this.fileExtension === '.resource') {
                this.iconPath = new vscode.ThemeIcon('file-submodule');
            } else {
                this.iconPath = new vscode.ThemeIcon('file');
            }

            // Show selected import type or available options
            if (this.selectedImportType) {
                this.description = this.isSuggested
                    ? `→ ${this.selectedImportType} $(star-full)`
                    : `→ ${this.selectedImportType}`;
            } else {
                const baseDescription = `(${this.availableImportTypes.join(' | ')})`;
                this.description = this.isSuggested
                    ? `${baseDescription} $(star-full)`
                    : baseDescription;
            }

            // Make clickable to change import type
            this.command = {
                command: 'rfFilesCreator.selectImportType',
                title: 'Select Import Type',
                arguments: [this]
            };
        } else {
            this.contextValue = 'folder';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

// Tree data provider for import selection
class ImportTreeDataProvider implements vscode.TreeDataProvider<ImportTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private rootItems: ImportTreeItem[] = [];
    private allFileItems: ImportTreeItem[] = [];
    private filteredRootItems: ImportTreeItem[] = []; // Store filtered results
    private searchFilter: string = ''; // Store current search term

    constructor(
        private allFiles: vscode.Uri[],
        private targetDir: string,
        private workspaceRoot: string,
        private existingImports: ExistingImport[] = [],
        private suggestedFiles: vscode.Uri[] = []
    ) {
        this.buildTree();
    }

    private buildTree() {
        this.rootItems = [];
        this.allFileItems = [];

        // Helper to get paths
        const getRelativePath = (filePath: string) => path.relative(this.targetDir, filePath).replace(/\\/g, '/');
        const getAbsolutePath = (filePath: string) => path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');

        // Find existing import type for a file
        const findExistingImportType = (importPath: string): ImportType | null => {
            for (const imp of this.existingImports) {
                const normalizedExisting = imp.path.replace(/\\/g, '/');
                const normalizedNew = importPath.replace(/\\/g, '/');
                if (normalizedExisting === normalizedNew ||
                    normalizedExisting.endsWith(normalizedNew) ||
                    normalizedNew.endsWith(normalizedExisting)) {
                    return imp.type;
                }
            }
            return null;
        };

        // Check if a file is suggested
        const isFileSuggested = (fileUri: vscode.Uri): boolean => {
            return this.suggestedFiles.some(suggestedFile =>
                suggestedFile.fsPath === fileUri.fsPath
            );
        };

        // Build tree for a set of files
        const buildSection = (
            files: vscode.Uri[],
            availableImportTypes: ImportType[],
            sectionLabel: string,
            fileExtension: string
        ): ImportTreeItem | null => {
            if (files.length === 0) return null;

            // Create folder structure
            const folderMap = new Map<string, ImportTreeItem>();
            const sectionItem = new ImportTreeItem(
                sectionLabel,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            sectionItem.iconPath = new vscode.ThemeIcon('folder-library');

            for (const file of files) {
                const absPath = getAbsolutePath(file.fsPath);
                const relativePath = getRelativePath(file.fsPath);
                const parts = absPath.split('/');
                const fileName = parts.pop()!;

                // Build folder hierarchy
                let currentParent = sectionItem;
                let currentPath = '';

                for (const folderName of parts) {
                    currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

                    if (!folderMap.has(currentPath)) {
                        const folderItem = new ImportTreeItem(
                            folderName,
                            vscode.TreeItemCollapsibleState.Collapsed
                        );
                        folderMap.set(currentPath, folderItem);
                        currentParent.children.push(folderItem);
                    }
                    currentParent = folderMap.get(currentPath)!;
                }

                // Find if this file has an existing import
                const existingType = findExistingImportType(relativePath) || findExistingImportType(absPath);

                // Check if this file is suggested
                const suggested = isFileSuggested(file);

                // Add single file item with selectable import type
                const fileItem = new ImportTreeItem(
                    fileName,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        isFile: true,
                        filePath: file.fsPath,
                        relativePath,
                        absolutePath: absPath,
                        fileExtension,
                        selectedImportType: existingType,
                        availableImportTypes,
                        isSuggested: suggested
                    }
                );
                currentParent.children.push(fileItem);
                this.allFileItems.push(fileItem);
            }

            return sectionItem;
        };

        // Create Current Imports section first (if there are existing imports)
        const currentImportsSection = this.createCurrentImportsSection();
        if (currentImportsSection) this.rootItems.push(currentImportsSection);

        // Use all files for the unified tree
        const allFilesSection = this.createUnifiedFileTree(this.allFiles);

        if (allFilesSection) this.rootItems.push(allFilesSection);
    }

    /**
     * Create a section showing current imports from the file
     */
    private createCurrentImportsSection(): ImportTreeItem | null {
        if (this.existingImports.length === 0) return null;

        const sectionItem = new ImportTreeItem(
            `Current Imports (${this.existingImports.length})`,
            vscode.TreeItemCollapsibleState.Expanded
        );
        sectionItem.iconPath = new vscode.ThemeIcon('list-selection');
        sectionItem.contextValue = 'currentImportsSection';

        for (const imp of this.existingImports) {
            const importItem = new ImportTreeItem(
                imp.path,
                vscode.TreeItemCollapsibleState.None,
                {
                    isFile: false // Not a selectable file, just display
                }
            );
            importItem.description = imp.type;
            importItem.contextValue = 'currentImport';

            // Set icon based on import type
            if (imp.type === 'Library') {
                importItem.iconPath = new vscode.ThemeIcon('library');
            } else if (imp.type === 'Resource') {
                importItem.iconPath = new vscode.ThemeIcon('file-submodule');
            } else if (imp.type === 'Variables') {
                importItem.iconPath = new vscode.ThemeIcon('symbol-variable');
            }

            sectionItem.children.push(importItem);
        }

        return sectionItem;
    }

    /**
     * Create a unified file tree with all file types combined
     */
    private createUnifiedFileTree(files: vscode.Uri[]): ImportTreeItem | null {
        if (files.length === 0) return null;

        // Helper to get paths
        const getRelativePath = (filePath: string) => path.relative(this.targetDir, filePath).replace(/\\/g, '/');
        const getAbsolutePath = (filePath: string) => path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');

        // Find existing import type for a file
        const findExistingImportType = (importPath: string): ImportType | null => {
            for (const imp of this.existingImports) {
                const normalizedExisting = imp.path.replace(/\\/g, '/');
                const normalizedNew = importPath.replace(/\\/g, '/');
                if (normalizedExisting === normalizedNew ||
                    normalizedExisting.endsWith(normalizedNew) ||
                    normalizedNew.endsWith(normalizedExisting)) {
                    return imp.type;
                }
            }
            return null;
        };

        // Check if a file is suggested
        const isFileSuggested = (fileUri: vscode.Uri): boolean => {
            return this.suggestedFiles.some(suggestedFile =>
                suggestedFile.fsPath === fileUri.fsPath
            );
        };

        // Determine appropriate import types based on file extension
        const getAvailableImportTypes = (fileUri: vscode.Uri): ImportType[] => {
            const ext = path.extname(fileUri.fsPath).toLowerCase();
            if (ext === '.py') {
                return ['Library', 'Variables']; // Python files are typically libraries or variables
            } else if (ext === '.resource' || ext === '.robot') {
                return ['Resource', 'Variables']; // Resource/Robot files are typically resources or variables
            } else {
                // For other files, provide all options but default to Resource or Variables
                return ['Library', 'Resource', 'Variables'];
            }
        };

        // Create folder structure
        const folderMap = new Map<string, ImportTreeItem>();
        const sectionItem = new ImportTreeItem(
            'All Importable Files',
            vscode.TreeItemCollapsibleState.Collapsed
        );
        sectionItem.iconPath = new vscode.ThemeIcon('folder-library');

        for (const file of files) {
            const absPath = getAbsolutePath(file.fsPath);
            const relativePath = getRelativePath(file.fsPath);
            const parts = absPath.split('/');
            const fileName = parts.pop()!;

            // Build folder hierarchy
            let currentParent = sectionItem;
            let currentPath = '';

            for (const folderName of parts) {
                currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

                if (!folderMap.has(currentPath)) {
                    const folderItem = new ImportTreeItem(
                        folderName,
                        vscode.TreeItemCollapsibleState.Collapsed
                    );
                    folderMap.set(currentPath, folderItem);
                    currentParent.children.push(folderItem);
                }
                currentParent = folderMap.get(currentPath)!;
            }

            // Find if this file has an existing import
            const existingType = findExistingImportType(relativePath) || findExistingImportType(absPath);

            // Check if this file is suggested
            const suggested = isFileSuggested(file);

            // Determine available import types based on file extension
            const availableImportTypes = getAvailableImportTypes(file);

            // Add single file item with appropriate import type options
            const fileItem = new ImportTreeItem(
                fileName,
                vscode.TreeItemCollapsibleState.None,
                {
                    isFile: true,
                    filePath: file.fsPath,
                    relativePath,
                    absolutePath: absPath,
                    fileExtension: path.extname(file.fsPath),
                    selectedImportType: existingType,
                    availableImportTypes,
                    isSuggested: suggested
                }
            );
            currentParent.children.push(fileItem);
            this.allFileItems.push(fileItem);
        }

        return sectionItem;
    }

    getTreeItem(element: ImportTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImportTreeItem): ImportTreeItem[] {
        if (!element) {
            // Return filtered results if search is active, otherwise return all
            return this.searchFilter ? this.filteredRootItems : this.rootItems;
        }
        // If search is active, return all children since they should be visible if parent matches
        if (this.searchFilter) {
            // When searching, we need to show all children of matching parent
            return element.children;
        }
        return element.children;
    }

    /**
     * Set search filter and refresh the tree view
     */
    setSearchFilter(filter: string) {
        this.searchFilter = filter.toLowerCase();
        if (this.searchFilter) {
            this.applyFilter();
        } else {
            // Reset to original tree when search is cleared
            this.filteredRootItems = [];
        }
        this.refresh();
    }

    /**
     * Apply filter to the tree
     */
    private applyFilter() {
        this.filteredRootItems = [];

        // Process each root section
        for (const rootItem of this.rootItems) {
            const filteredItem = this.filterTreeItem(rootItem);
            if (filteredItem) {
                this.filteredRootItems.push(filteredItem);
            }
        }
    }

    /**
     * Recursively filter a tree item and its children
     */
    private filterTreeItem(item: ImportTreeItem): ImportTreeItem | null {
        // If it's a file item, check if it matches the search
        if (item.isFile) {
            const matches = item.label.toLowerCase().includes(this.searchFilter) ||
                           (item.description && typeof item.description === 'string' &&
                            item.description.toLowerCase().includes(this.searchFilter));
            return matches ? item : null;
        } else {
            // For folder items, check if any children match
            const filteredChildren: ImportTreeItem[] = [];
            for (const child of item.children) {
                const filteredChild = this.filterTreeItem(child);
                if (filteredChild) {
                    filteredChildren.push(filteredChild);
                }
            }

            // If folder has matching children, return a copy with filtered children
            if (filteredChildren.length > 0) {
                const newItem = new ImportTreeItem(item.label, vscode.TreeItemCollapsibleState.Expanded);
                newItem.children = filteredChildren;
                newItem.isFile = false;
                newItem.iconPath = item.iconPath;
                return newItem;
            }
            return null;
        }
    }

    getParent(_element: ImportTreeItem): vscode.ProviderResult<ImportTreeItem> {
        return null;
    }

    refresh(item?: ImportTreeItem): void {
        this._onDidChangeTreeData.fire(item);
    }

    getRootItems(): ImportTreeItem[] {
        return this.searchFilter ? this.filteredRootItems : this.rootItems;
    }

    getSelectedItems(): ImportTreeItem[] {
        return this.allFileItems.filter(item => item.selectedImportType !== null);
    }

    setImportType(item: ImportTreeItem, importType: ImportType | null): void {
        item.selectedImportType = importType;
        item.updateAppearance();
        this.refresh(item);
    }

    toggleSelection(item: ImportTreeItem, checked: boolean): void {
        if (checked && !item.selectedImportType) {
            // When checking, default to first available import type
            item.selectedImportType = item.availableImportTypes[0] || null;
        } else if (!checked) {
            // When unchecking, clear the import type
            item.selectedImportType = null;
        }
        item.updateAppearance();
        this.refresh(item);
    }

}

/**
 * Recursively expand all tree items
 */
async function expandAllItems(treeView: vscode.TreeView<ImportTreeItem>, items: ImportTreeItem[]): Promise<void> {
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            await treeView.reveal(item, { expand: true, select: false, focus: false });
            await expandAllItems(treeView, item.children);
        }
    }
}

/**
 * Welcome tree data provider shown when no import selection is active
 */
class WelcomeTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.TreeItem[] {
        const welcomeItem = new vscode.TreeItem('Right-click a folder to create RF files');
        welcomeItem.iconPath = new vscode.ThemeIcon('info');

        const createItem = new vscode.TreeItem('Or right-click .robot/.resource to edit imports');
        createItem.iconPath = new vscode.ThemeIcon('edit');

        return [welcomeItem, createItem];
    }
}

// Welcome tree view provider
let welcomeTreeView: vscode.TreeView<vscode.TreeItem> | undefined;

// Target file locking mechanism
let lockedTargetFile: string | undefined;
let isTargetLocked: boolean = false;

/**
 * Initialize the tree view with welcome content
 */
function initializeTreeView(): void {
    const welcomeProvider = new WelcomeTreeDataProvider();
    welcomeTreeView = vscode.window.createTreeView('rfImportSelector', {
        treeDataProvider: welcomeProvider
    });
}

/**
 * Check if a file is a Robot Framework file
 */
function isRobotFrameworkFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.robot' || ext === '.resource';
}

/**
 * Get the current target file (locked or active)
 */
function getTargetFile(): string | undefined {
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
function lockTargetFile(filePath: string): void {
    lockedTargetFile = filePath;
    isTargetLocked = true;
    vscode.commands.executeCommand('setContext', 'rfTargetLocked', true);
    updateTreeViewTitle();
}

/**
 * Unlock the target file
 */
function unlockTargetFile(): void {
    lockedTargetFile = undefined;
    isTargetLocked = false;
    vscode.commands.executeCommand('setContext', 'rfTargetLocked', false);
    updateTreeViewTitle();
}

/**
 * Update tree view title to show target file
 */
function updateTreeViewTitle(): void {
    if (currentTreeView && lockedTargetFile) {
        currentTreeView.title = `Import Selector (${path.basename(lockedTargetFile)})`;
    } else if (currentTreeView) {
        currentTreeView.title = 'Import Selector';
    }
}

/**
 * Load imports for a specific Robot Framework file
 */
async function loadImportsForFile(filePath: string): Promise<void> {
    if (!isRobotFrameworkFile(filePath)) {
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const targetDir = path.dirname(filePath);

    // Dispose the welcome tree view if it exists
    if (welcomeTreeView) {
        welcomeTreeView.dispose();
        welcomeTreeView = undefined;
    }

    // Read file content and parse existing imports
    let fileContent: string;
    try {
        fileContent = fs.readFileSync(filePath, 'utf8');
    } catch {
        initializeTreeView();
        return;
    }

    const existingImports = parseExistingImports(fileContent);

    // Find importable files
    const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');
    const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

    // Filter to allowed project folders
    const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
    const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
    const allImportableFiles = [...pyFiles, ...resourceFiles];

    if (allImportableFiles.length === 0) {
        initializeTreeView();
        return;
    }

    // Analyze file content for import suggestions
    const suggestedFiles = analyzeFileContentForSuggestions(fileContent, allPyFiles, allResourceFiles);

    // Create tree data provider
    currentTreeProvider = new ImportTreeDataProvider(
        allImportableFiles,
        targetDir,
        workspaceRoot,
        existingImports,
        suggestedFiles
    );

    // Show the tree view by setting context
    vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', true);

    // Create tree view
    currentTreeView = vscode.window.createTreeView('rfImportSelector', {
        treeDataProvider: currentTreeProvider,
        canSelectMany: true,
        manageCheckboxStateManually: true
    });

    // Handle checkbox changes
    currentTreeView.onDidChangeCheckboxState(e => {
        for (const [item, state] of e.items) {
            if (item.isFile) {
                currentTreeProvider?.toggleSelection(
                    item,
                    state === vscode.TreeItemCheckboxState.Checked
                );
            }
        }
    });

    // Set up resolver for confirm/cancel buttons
    importSelectionResolver = async (confirmed: boolean) => {
        if (confirmed) {
            const selected = currentTreeProvider?.getSelectedItems() || [];

            // Ask for path type
            const selectedPathType = await selectPathType();
            if (selectedPathType === undefined) {
                return; // User cancelled
            }

            // Convert to SelectedItem format
            const result: SelectedItem[] = selected.map(item => ({
                isFile: true,
                filePath: item.filePath,
                relativePath: item.relativePath,
                absolutePath: item.absolutePath,
                importType: item.selectedImportType || undefined
            }));

            // Generate new settings section
            const newSettingsSection = generateSettingsSection(result, selectedPathType);

            // Update file content
            const currentContent = fs.readFileSync(filePath, 'utf8');
            const updatedContent = updateSettingsSection(currentContent, newSettingsSection);

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
        // Don't cleanup - keep the tree view open for further editing
    };
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize the tree view - check if active file is a robot file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isRobotFrameworkFile(activeEditor.document.uri.fsPath)) {
        loadImportsForFile(activeEditor.document.uri.fsPath);
    } else {
        initializeTreeView();
    }

    // Listen for active editor changes to update the tree view
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isRobotFrameworkFile(editor.document.uri.fsPath)) {
                const newFilePath = editor.document.uri.fsPath;

                // If locked and user returns to the locked file, auto-unlock
                if (isTargetLocked && lockedTargetFile === newFilePath) {
                    unlockTargetFile();
                    return;
                }

                // If locked and user opens a different robot file, unlock and switch to new file
                if (isTargetLocked && lockedTargetFile !== newFilePath) {
                    unlockTargetFile();
                    // Dispose current tree view and load new file
                    if (currentTreeView) {
                        currentTreeView.dispose();
                        currentTreeView = undefined;
                        currentTreeProvider = undefined;
                    }
                    loadImportsForFile(newFilePath);
                    return;
                }

                // Not locked - normal behavior
                if (!isTargetLocked) {
                    if (currentTreeView) {
                        currentTreeView.dispose();
                        currentTreeView = undefined;
                        currentTreeProvider = undefined;
                    }
                    if (welcomeTreeView) {
                        welcomeTreeView.dispose();
                        welcomeTreeView = undefined;
                    }
                    loadImportsForFile(newFilePath);
                }
            } else if (!isTargetLocked && !currentTreeView) {
                // Show welcome view if no robot file is open and not locked
                if (welcomeTreeView) {
                    welcomeTreeView.dispose();
                    welcomeTreeView = undefined;
                }
                initializeTreeView();
            }
        })
    );

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

    // Register command: Confirm Imports (for tree view title bar)
    const confirmImports = vscode.commands.registerCommand(
        'rfFilesCreator.confirmImports',
        () => {
            if (importSelectionResolver) {
                importSelectionResolver(true);
            }
        }
    );

    // Register command: Cancel Imports (for tree view title bar)
    const cancelImports = vscode.commands.registerCommand(
        'rfFilesCreator.cancelImports',
        () => {
            if (importSelectionResolver) {
                importSelectionResolver(false);
            }
        }
    );

    // Register command: Select Import Type (when clicking on a file)
    const selectImportType = vscode.commands.registerCommand(
        'rfFilesCreator.selectImportType',
        async (item: ImportTreeItem) => {
            if (!item.isFile || !currentTreeProvider) return;

            // Show quick pick with available import types + option to deselect
            const options: vscode.QuickPickItem[] = item.availableImportTypes.map(type => ({
                label: type,
                description: item.selectedImportType === type ? '(current)' : ''
            }));

            // Add option to remove/deselect
            if (item.selectedImportType) {
                options.push({
                    label: '$(close) Remove Import',
                    description: 'Deselect this file'
                });
            }

            const selected = await vscode.window.showQuickPick(options, {
                title: `Select import type for ${item.label}`,
                placeHolder: 'Choose how to import this file'
            });

            if (selected) {
                if (selected.label === '$(close) Remove Import') {
                    currentTreeProvider.setImportType(item, null);
                } else {
                    currentTreeProvider.setImportType(item, selected.label as ImportType);
                }
            }
        }
    );

    // Register command: Preview Imports
    const previewImports = vscode.commands.registerCommand(
        'rfFilesCreator.previewImports',
        () => {
            if (currentTreeProvider) {
                const selectedItems = currentTreeProvider.getSelectedItems();
                if (selectedItems.length === 0) {
                    vscode.window.showInformationMessage('No imports selected to preview.');
                    return;
                }

                // Generate preview content for selected imports
                const previewContent = generatePreviewContent(selectedItems);

                // Show the preview in an information message
                vscode.window.showInformationMessage(`Preview:\n${previewContent}`, 'OK');
            }
        }
    );

    // Register command: Search Imports
    const searchImports = vscode.commands.registerCommand(
        'rfFilesCreator.searchImports',
        async () => {
            if (currentTreeProvider) {
                const searchTerm = await vscode.window.showInputBox({
                    prompt: 'Enter search term to filter imports',
                    placeHolder: 'Search files, folders, or import types...',
                    validateInput: (value) => {
                        // No validation needed
                        return null;
                    }
                });

                if (searchTerm !== undefined) { // Allow empty string to clear search
                    currentTreeProvider.setSearchFilter(searchTerm);
                }
            }
        }
    );

    // Register command: Clear Search (revert search results)
    const clearSearch = vscode.commands.registerCommand(
        'rfFilesCreator.clearSearch',
        () => {
            if (currentTreeProvider) {
                currentTreeProvider.setSearchFilter('');
            }
        }
    );

    // Register command: Expand All tree nodes
    const expandAll = vscode.commands.registerCommand(
        'rfFilesCreator.expandAll',
        async () => {
            if (currentTreeView && currentTreeProvider) {
                const rootItems = currentTreeProvider.getRootItems();
                await expandAllItems(currentTreeView, rootItems);
            }
        }
    );

    // Register command: Collapse All tree nodes
    const collapseAll = vscode.commands.registerCommand(
        'rfFilesCreator.collapseAll',
        async () => {
            // Use VSCode's built-in collapse all command for the tree view
            await vscode.commands.executeCommand('workbench.actions.treeView.rfImportSelector.collapseAll');
        }
    );

    // Register command: View File (open in editor) - auto-locks target
    const viewFile = vscode.commands.registerCommand(
        'rfFilesCreator.viewFile',
        async (item: ImportTreeItem) => {
            if (item && item.isFile && item.filePath) {
                // Auto-lock the current target file before viewing another file
                if (!isTargetLocked) {
                    const targetFile = getTargetFile();
                    if (targetFile) {
                        lockTargetFile(targetFile);
                    }
                }

                try {
                    const document = await vscode.workspace.openTextDocument(item.filePath);
                    await vscode.window.showTextDocument(document, { preview: true });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to open file: ${msg}`);
                }
            }
        }
    );

    // Register command: Go to Target File (navigate back to the locked target)
    const goToTarget = vscode.commands.registerCommand(
        'rfFilesCreator.goToTarget',
        async () => {
            const targetFile = getTargetFile();
            if (targetFile) {
                try {
                    const document = await vscode.workspace.openTextDocument(targetFile);
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to open target file: ${msg}`);
                }
            } else {
                vscode.window.showWarningMessage('No target file is set.');
            }
        }
    );

    context.subscriptions.push(
        createTestFile,
        createResourceFile,
        createVariablesFile,
        createLocatorsFile,
        editImports,
        confirmImports,
        cancelImports,
        selectImportType,
        previewImports,
        searchImports,
        clearSearch,
        expandAll,
        collapseAll,
        viewFile,
        goToTarget
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
 * Analyze file content to suggest relevant imports
 */
function analyzeFileContentForSuggestions(fileContent: string, allPyFiles: vscode.Uri[], allResourceFiles: vscode.Uri[]): vscode.Uri[] {
    const suggestions: vscode.Uri[] = [];
    const lines = fileContent.split('\n');

    // Common Robot Framework keywords that might indicate needed imports
    const commonLibraries = [
        { pattern: /selenium|webdriver|browser/i, name: 'SeleniumLibrary' },
        { pattern: /request|http|api/i, name: 'RequestsLibrary' },
        { pattern: /operating system|file|directory|path/i, name: 'OperatingSystem' },
        { pattern: /string|replace|split|join/i, name: 'String' },
        { pattern: /collection|list|dict|set/i, name: 'Collections' },
        { pattern: /xml/i, name: 'XMLLibrary' },
        { pattern: /screenshot|wait|element|click|input/i, name: 'SeleniumLibrary' }
    ];

    // Look for patterns in the content that suggest needed libraries
    for (const line of lines) {
        const lowerLine = line.toLowerCase();

        for (const lib of commonLibraries) {
            if (lib.pattern.test(lowerLine)) {
                // Find matching Python library files
                const matchingFiles = allPyFiles.filter(file => {
                    const fileName = path.basename(file.fsPath).toLowerCase();
                    return fileName.includes(lib.name.toLowerCase()) ||
                           fileName.includes(lib.name.toLowerCase().replace(/library/i, '').replace(/lib/i, ''));
                });

                suggestions.push(...matchingFiles);
            }
        }
    }

    // Also check for keywords that might be in resource files
    const resourceKeywords = [
        { pattern: /keyword|function|task|step/i, name: '.resource' }
    ];

    for (const line of lines) {
        for (const resPattern of resourceKeywords) {
            if (resPattern.pattern.test(line)) {
                // Add any resource files that match common naming patterns
                const matchingResources = allResourceFiles.filter(file => {
                    const fileName = path.basename(file.fsPath).toLowerCase();
                    return fileName.includes(resPattern.name.toLowerCase()) ||
                           fileName.includes('common') ||
                           fileName.includes('keywords') ||
                           fileName.includes('utils');
                });

                suggestions.push(...matchingResources);
            }
        }
    }

    // Remove duplicates
    return [...new Set(suggestions)];
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

type SelectionResult = SelectedItem[] | null; // null indicates cancellation

// Global reference to dispose tree view when done
let currentTreeView: vscode.TreeView<ImportTreeItem> | undefined;
let currentTreeProvider: ImportTreeDataProvider | undefined;
let importSelectionResolver: ((confirmed: boolean) => void) | undefined;

// Store pathType globally for generating settings
let currentPathType: PathType = 'relative';

/**
 * Show file selection using TreeView in sidebar
 */
async function showFileSelectionTreeView(
    allFiles: vscode.Uri[], // Combined array of all importable files
    _unusedParam: vscode.Uri[], // Kept for compatibility but not used in unified view
    targetDir: string,
    workspaceRoot: string,
    pathType: PathType,
    existingImports: ExistingImport[] = [],
    suggestedFiles: vscode.Uri[] = []
): Promise<SelectionResult> {
    currentPathType = pathType;

    return new Promise((resolve) => {
        // Dispose the welcome tree view if it exists
        if (welcomeTreeView) {
            welcomeTreeView.dispose();
            welcomeTreeView = undefined;
        }

        // Create tree data provider with all files combined
        currentTreeProvider = new ImportTreeDataProvider(
            allFiles, // Use the combined files directly
            targetDir,
            workspaceRoot,
            existingImports,
            suggestedFiles
        );

        // Show the tree view by setting context
        vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', true);

        // Create tree view
        currentTreeView = vscode.window.createTreeView('rfImportSelector', {
            treeDataProvider: currentTreeProvider,
            canSelectMany: true,
            manageCheckboxStateManually: true
        });

        // Handle checkbox changes (toggle selection)
        currentTreeView.onDidChangeCheckboxState(e => {
            for (const [item, state] of e.items) {
                if (item.isFile) {
                    currentTreeProvider?.toggleSelection(
                        item,
                        state === vscode.TreeItemCheckboxState.Checked
                    );
                }
            }
        });

        // Show the tree view
        vscode.commands.executeCommand('rfImportSelector.focus');

        // Helper function to cleanup tree view and restore welcome view
        const cleanupTreeView = () => {
            vscode.commands.executeCommand('setContext', 'rfImportSelectorVisible', false);
            currentTreeView?.dispose();
            currentTreeView = undefined;
            currentTreeProvider = undefined;
            importSelectionResolver = undefined;
            // Restore the welcome tree view
            initializeTreeView();
        };

        // Set up resolver for confirm/cancel buttons
        importSelectionResolver = (confirmed: boolean) => {
            if (confirmed) {
                const selected = currentTreeProvider?.getSelectedItems() || [];

                // Convert to SelectedItem format
                const result = selected.map(item => ({
                    isFile: true,
                    filePath: item.filePath,
                    relativePath: item.relativePath,
                    absolutePath: item.absolutePath,
                    importType: item.selectedImportType || undefined
                }));

                // Hide the tree view
                cleanupTreeView();

                resolve(result);
            } else {
                // User canceled - hide the tree view but don't update anything
                cleanupTreeView();

                resolve(null); // Indicate cancellation
            }
        };
    });
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

    // Show progress while scanning files
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning importable files...",
        cancellable: false
    }, async (progress) => {
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

        progress.report({ increment: 20, message: "Finding Python files..." });

        // Find importable files (filtered to project folders)
        const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

        progress.report({ increment: 20, message: "Finding Resource files..." });

        const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        progress.report({ increment: 10, message: "Finding additional importable files..." });

        // Optionally, include more file types that might be importable
        const allOtherFiles = await vscode.workspace.findFiles('**/*.{txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        // Filter to allowed project folders
        const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
        const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
        const otherFiles = filterProjectFiles(allOtherFiles, workspaceRoot); // For additional file types

        if (pyFiles.length === 0 && resourceFiles.length === 0 && otherFiles.length === 0) {
            vscode.window.showWarningMessage('No importable files found in project folders (Libraries, Tests, Utilities, Resources, POM).');
            return;
        }

        progress.report({ increment: 20, message: "Analyzing content for import suggestions..." });

        // Analyze file content for import suggestions
        const suggestedFiles = analyzeFileContentForSuggestions(fileContent, allPyFiles, allResourceFiles);

        progress.report({ increment: 20, message: "Preparing import selection..." });

        // Ask for path type
        const selectedPathType = await selectPathType();
        if (selectedPathType === undefined) {
            return; // User cancelled
        }

        // Combine all file types for selection
        const allImportableFiles = [...pyFiles, ...resourceFiles, ...otherFiles];

        // Show file selection with pre-selected existing imports and suggested files highlighted
        const selectionResult = await showFileSelectionTreeView(
            allImportableFiles,
            [], // Second parameter not used in unified view, but kept for function signature compatibility
            targetDir,
            workspaceRoot,
            selectedPathType,
            existingImports,
            suggestedFiles // Pass suggested files to highlight them
        );

        // If user canceled, do nothing and exit early
        if (selectionResult === null) {
            return; // User canceled, don't update the file
        }

        // Generate new settings section
        const newSettingsSection = generateSettingsSection(selectionResult, selectedPathType);

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
    });
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

    // Show progress while scanning files
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning importable files...",
        cancellable: false
    }, async (progress) => {
        // Find importable files (filtered to project folders)
        const allPyFiles = await vscode.workspace.findFiles('**/*.py', '{**/node_modules/**,**/venv/**,**/.venv/**,**/__pycache__/**}');

        progress.report({ increment: 40, message: "Finding Resource files..." });

        const allResourceFiles = await vscode.workspace.findFiles('**/*.{resource,robot}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        progress.report({ increment: 10, message: "Finding additional importable files..." });

        // Optionally, include more file types that might be importable
        const allOtherFiles = await vscode.workspace.findFiles('**/*.{txt,csv,json,yaml,yml}', '{**/node_modules/**,**/venv/**,**/.venv/**}');

        // Filter to allowed project folders
        const pyFiles = filterProjectFiles(allPyFiles, workspaceRoot);
        const resourceFiles = filterProjectFiles(allResourceFiles, workspaceRoot);
        const otherFiles = filterProjectFiles(allOtherFiles, workspaceRoot); // For additional file types

        const combinedFiles = [...pyFiles, ...resourceFiles, ...otherFiles];

        let selectedImports: SelectedItem[] = [];
        let selectedPathType: PathType = 'relative';

        if (combinedFiles.length > 0) {
            // Ask for path type
            const pathTypeResult = await selectPathType();
            if (pathTypeResult === undefined) {
                // User cancelled, create file without imports
                const template = `*** Settings ***\n\n\n${mainSection}\n`;
                await writeFile(filePath, template, fileType, fullFileName);
                return;
            }
            selectedPathType = pathTypeResult;

            progress.report({ increment: 20, message: "Preparing import selection..." });

            // Show file selection (passing empty array for suggested files since we don't have content to analyze yet)
            // Use the pre-combined files that include all types
            const selectionResult = await showFileSelectionTreeView(combinedFiles, [], targetDir, workspaceRoot, selectedPathType, [], []);

            // If user canceled, exit early (no file will be created)
            if (selectionResult === null) {
                return; // User canceled
            }

            selectedImports = selectionResult;
        }

        // Generate file content
        const settingsSection = generateSettingsSection(selectedImports, selectedPathType);
        const template = `${settingsSection}\n\n${mainSection}\n`;
        await writeFile(filePath, template, fileType, fullFileName);
    });
}

/**
 * Generate preview content for selected imports
 */
function generatePreviewContent(selectedItems: ImportTreeItem[]): string {
    const libraries: string[] = [];
    const resources: string[] = [];
    const variables: string[] = [];

    for (const item of selectedItems) {
        if (!item.isFile) continue;

        const filePath = item.relativePath || item.absolutePath || item.filePath;

        switch (item.selectedImportType) {
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

    let preview = '*** Settings ***\n';

    if (libraries.length > 0) {
        preview += '\n# Libraries:\n';
        for (const lib of libraries) {
            preview += `Library    ${lib}\n`;
        }
    }

    if (resources.length > 0) {
        preview += '\n# Resources:\n';
        for (const res of resources) {
            preview += `Resource    ${res}\n`;
        }
    }

    if (variables.length > 0) {
        preview += '\n# Variables:\n';
        for (const vars of variables) {
            preview += `Variables    ${vars}\n`;
        }
    }

    return preview;
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
