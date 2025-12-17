import * as vscode from 'vscode';
import * as path from 'path';
import { ImportType, ExistingImport, ExtractedKeyword } from '../types';
import { ImportTreeItem, KeywordTreeItem } from './items';

// Global state for pending changes - exported for use by other modules
export let hasPendingChanges: boolean = false;

export function setHasPendingChanges(value: boolean) {
    hasPendingChanges = value;
    vscode.commands.executeCommand('setContext', 'rfHasPendingChanges', value);
}

// Tree data provider for import selection
export class ImportTreeDataProvider implements vscode.TreeDataProvider<ImportTreeItem> {
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
        private targetFile: string,  // Added target file path
        private existingImports: ExistingImport[] = [],
        private suggestedFiles: vscode.Uri[] = []
    ) {
        this.buildTree();

        // Initialize context for search and pending changes
        vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', false);
        vscode.commands.executeCommand('setContext', 'rfHasPendingChanges', false);
    }

    private buildTree() {
        this.rootItems = [];
        this.allFileItems = [];

        // Use all files for the unified tree (main section first)
        const allFilesSection = this.createUnifiedFileTree(this.allFiles);
        if (allFilesSection) this.rootItems.push(allFilesSection);

        // Create Current Imports section below (if there are existing imports)
        const currentImportsSection = this.createCurrentImportsSection();
        if (currentImportsSection) this.rootItems.push(currentImportsSection);
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
            // Skip the target file itself to prevent importing the file into itself
            if (file.fsPath === this.targetFile) {
                continue;
            }

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
            // Set search active context
            vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', true);
        } else {
            // Reset to original tree when search is cleared
            this.filteredRootItems = [];
            // Clear search active context
            vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', false);
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

        // Set the pending changes flag
        setHasPendingChanges(true);
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

        // Set the pending changes flag
        setHasPendingChanges(true);
    }
}

/**
 * Welcome tree data provider shown when no import selection is active
 */
export class WelcomeTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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

// Tree data provider for keyword selection
export class KeywordTreeDataProvider implements vscode.TreeDataProvider<KeywordTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<KeywordTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    keywordItems: KeywordTreeItem[] = [];

    constructor(private keywords: ExtractedKeyword[], private parentFilePath: string) {
        this.buildTree();
    }

    private buildTree() {
        this.keywordItems = [];
        for (const kw of this.keywords) {
            const item = new KeywordTreeItem(kw.name, kw.args, kw.doc, this.parentFilePath);
            this.keywordItems.push(item);
        }
    }

    getTreeItem(element: KeywordTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: KeywordTreeItem): KeywordTreeItem[] {
        if (!element) {
            return this.keywordItems;
        }
        return [];
    }

    getParent(_element: KeywordTreeItem): vscode.ProviderResult<KeywordTreeItem> {
        return null;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

/**
 * Recursively expand all tree items
 */
export async function expandAllItems(treeView: vscode.TreeView<ImportTreeItem>, items: ImportTreeItem[]): Promise<void> {
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            await treeView.reveal(item, { expand: true, select: false, focus: false });
            await expandAllItems(treeView, item.children);
        }
    }
}
