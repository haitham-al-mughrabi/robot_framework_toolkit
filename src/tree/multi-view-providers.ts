import * as vscode from 'vscode';
import * as path from 'path';
import { ImportType, ExistingImport, ExtractedKeyword, SelectedKeywordInfo } from '../types';
import { ImportTreeItem } from './items';
import { isFileCurrentlyViewed } from '../file-view-tracker';

// Global state for pending changes
export let hasPendingChanges: boolean = false;

export function setHasPendingChanges(value: boolean) {
    hasPendingChanges = value;
    vscode.commands.executeCommand('setContext', 'rfHasPendingChanges', value);
}

/**
 * Provider for Importable Files view
 */
export class ImportableFilesProvider implements vscode.TreeDataProvider<ImportTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private rootItems: ImportTreeItem[] = [];
    private allFileItems: ImportTreeItem[] = [];
    private filteredRootItems: ImportTreeItem[] = [];
    private searchFilter: string = '';

    constructor(
        private allFiles: vscode.Uri[],
        private targetDir: string,
        private workspaceRoot: string,
        private targetFile: string,
        private existingImports: ExistingImport[] = []
    ) {
        this.buildTree();
        vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', false);
    }

    private buildTree() {
        this.rootItems = [];
        this.allFileItems = [];

        const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
        const fileTree = this.createFileTree(this.allFiles, activeFilePath);
        if (fileTree) {
            this.rootItems.push(...fileTree.children);
        }
    }

    private createFileTree(files: vscode.Uri[], activeFilePath?: string): ImportTreeItem | null {
        if (files.length === 0) return null;

        const getRelativePath = (filePath: string) => path.relative(this.targetDir, filePath).replace(/\\/g, '/');
        const getAbsolutePath = (filePath: string) => path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');

        const findExistingImportType = (importPath: string): ImportType | null => {
            for (const imp of this.existingImports) {
                const normalizedExisting = imp.path.replace(/\\/g, '/');
                const normalizedNew = importPath.replace(/\\/g, '/');

                if (normalizedExisting === normalizedNew) {
                    return imp.type;
                }

                if (normalizedExisting.endsWith('/' + normalizedNew) || normalizedExisting.endsWith(normalizedNew)) {
                    const idx = normalizedExisting.lastIndexOf(normalizedNew);
                    if (idx >= 0) {
                        const beforeMatch = normalizedExisting.substring(0, idx);
                        if (beforeMatch === '' || beforeMatch.endsWith('/')) {
                            return imp.type;
                        }
                    }
                }

                if (normalizedNew.endsWith('/' + normalizedExisting) || normalizedNew.endsWith(normalizedExisting)) {
                    const idx = normalizedNew.lastIndexOf(normalizedExisting);
                    if (idx >= 0) {
                        const beforeMatch = normalizedNew.substring(0, idx);
                        if (beforeMatch === '' || beforeMatch.endsWith('/')) {
                            return imp.type;
                        }
                    }
                }
            }
            return null;
        };

        const getAvailableImportTypes = (fileUri: vscode.Uri): ImportType[] => {
            const ext = path.extname(fileUri.fsPath).toLowerCase();
            if (ext === '.py') {
                return ['Library', 'Variables'];
            } else if (ext === '.resource' || ext === '.robot') {
                return ['Resource', 'Variables'];
            } else {
                return ['Library', 'Resource', 'Variables'];
            }
        };

        const folderMap = new Map<string, ImportTreeItem>();
        const rootItem = new ImportTreeItem('Root', vscode.TreeItemCollapsibleState.Expanded);

        for (const file of files) {
            if (file.fsPath === this.targetFile) {
                continue;
            }

            const absPath = getAbsolutePath(file.fsPath);
            const relativePath = getRelativePath(file.fsPath);
            const parts = absPath.split('/');
            const fileName = parts.pop();
            if (!fileName) continue;

            let currentParent = rootItem;
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

            const existingType = findExistingImportType(relativePath) || findExistingImportType(absPath);
            const availableImportTypes = getAvailableImportTypes(file);
            const isCurrentlyViewed = isFileCurrentlyViewed(file.fsPath);

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
                    isSuggested: false,
                    isCurrentlyViewed: isCurrentlyViewed || false
                }
            );
            currentParent.children.push(fileItem);
            this.allFileItems.push(fileItem);
        }

        this.sortTreeAlphabetically(rootItem);
        return rootItem;
    }

    private sortTreeAlphabetically(item: ImportTreeItem): void {
        if (item.children.length === 0) return;

        const folders = item.children.filter(child => !child.isFile);
        const files = item.children.filter(child => child.isFile);

        folders.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        files.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

        item.children = [...folders, ...files];

        for (const folder of folders) {
            this.sortTreeAlphabetically(folder);
        }
    }

    getTreeItem(element: ImportTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImportTreeItem): ImportTreeItem[] {
        if (!element) {
            return this.searchFilter ? this.filteredRootItems : this.rootItems;
        }
        return element.children;
    }

    setSearchFilter(filter: string) {
        this.searchFilter = filter.toLowerCase();
        if (this.searchFilter) {
            this.applyFilter();
            vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', true);
        } else {
            this.filteredRootItems = [];
            vscode.commands.executeCommand('setContext', 'rfHasActiveSearch', false);
        }
        this.refresh();
    }

    private applyFilter() {
        this.filteredRootItems = [];
        for (const rootItem of this.rootItems) {
            const filteredItem = this.filterTreeItem(rootItem);
            if (filteredItem) {
                this.filteredRootItems.push(filteredItem);
            }
        }
    }

    private filterTreeItem(item: ImportTreeItem): ImportTreeItem | null {
        if (item.isFile) {
            const matches = item.label.toLowerCase().includes(this.searchFilter) ||
                           (item.description && typeof item.description === 'string' &&
                            item.description.toLowerCase().includes(this.searchFilter));
            return matches ? item : null;
        } else {
            const filteredChildren: ImportTreeItem[] = [];
            for (const child of item.children) {
                const filteredChild = this.filterTreeItem(child);
                if (filteredChild) {
                    filteredChildren.push(filteredChild);
                }
            }

            if (filteredChildren.length > 0) {
                const newItem = new ImportTreeItem(item.label, vscode.TreeItemCollapsibleState.Expanded);
                newItem.children = filteredChildren;
                newItem.isFile = false;
                newItem.iconPath = item.iconPath;
                newItem.contextValue = item.contextValue;
                return newItem;
            }
            return null;
        }
    }

    refresh(item?: ImportTreeItem): void {
        this._onDidChangeTreeData.fire(item);
    }

    refreshTreeIndicators(): void {
        for (const fileItem of this.allFileItems) {
            const wasViewed = fileItem.isCurrentlyViewed;
            const isCurrentlyViewed = fileItem.filePath ? isFileCurrentlyViewed(fileItem.filePath) : false;
            fileItem.isCurrentlyViewed = isCurrentlyViewed;

            if (wasViewed !== fileItem.isCurrentlyViewed) {
                fileItem.updateAppearance();
                this.refresh(fileItem);
            }
        }
    }

    getRootItems(): ImportTreeItem[] {
        return this.searchFilter ? this.filteredRootItems : this.rootItems;
    }

    getSelectedItems(): ImportTreeItem[] {
        return this.allFileItems.filter(item => item.selectedImportType !== null);
    }

    setImportType(item: ImportTreeItem, importType: ImportType | null): void {
        if (importType !== null && !item.availableImportTypes.includes(importType)) {
            console.warn(`Invalid import type "${importType}" for file "${item.label}".`);
            return;
        }

        item.selectedImportType = importType;
        item.updateAppearance();
        this.refresh(item);

        setHasPendingChanges(true);
    }
}

/**
 * Provider for Current Imports view
 */
export class CurrentImportsProvider implements vscode.TreeDataProvider<ImportTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private imports: ImportTreeItem[] = [];

    constructor(private existingImports: ExistingImport[] = []) {
        this.buildTree();
    }

    private buildTree() {
        this.imports = [];
        for (const imp of this.existingImports) {
            const importItem = new ImportTreeItem(
                imp.path,
                vscode.TreeItemCollapsibleState.None,
                { isFile: false }
            );
            importItem.description = imp.type;
            importItem.contextValue = 'currentImport';

            if (imp.type === 'Library') {
                importItem.iconPath = new vscode.ThemeIcon('library');
            } else if (imp.type === 'Resource') {
                importItem.iconPath = new vscode.ThemeIcon('file-submodule');
            } else if (imp.type === 'Variables') {
                importItem.iconPath = new vscode.ThemeIcon('symbol-variable');
            }

            this.imports.push(importItem);
        }
    }

    getTreeItem(element: ImportTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImportTreeItem): ImportTreeItem[] {
        if (!element) {
            return this.imports;
        }
        return [];
    }

    refresh(): void {
        this.buildTree();
        this._onDidChangeTreeData.fire();
    }

    updateImports(existingImports: ExistingImport[]) {
        this.existingImports = existingImports;
        this.refresh();
    }
}

/**
 * Provider for Keywords Explorer view
 */
export class KeywordsProvider implements vscode.TreeDataProvider<ImportTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private keywordItems: ImportTreeItem[] = [];
    private keywords: ExtractedKeyword[] = [];
    private keywordsSourceFile: string = '';

    getTreeItem(element: ImportTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImportTreeItem): ImportTreeItem[] {
        if (!element) {
            return this.keywordItems;
        }
        return element.children;
    }

    setKeywords(keywords: ExtractedKeyword[], sourceFile: string): void {
        this.keywords = keywords;
        this.keywordsSourceFile = sourceFile;
        this.buildTree();
        this._onDidChangeTreeData.fire();
    }

    clearKeywords(): void {
        this.keywords = [];
        this.keywordsSourceFile = '';
        this.keywordItems = [];
        this._onDidChangeTreeData.fire();
    }

    private buildTree() {
        this.keywordItems = [];
        if (this.keywords.length === 0) return;

        for (const keyword of this.keywords) {
            const keywordItem = new ImportTreeItem(
                keyword.name,
                keyword.args.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                { isFile: false }
            );

            keywordItem.description = keyword.doc ? keyword.doc.substring(0, 80) : '';
            keywordItem.tooltip = keyword.doc || 'No description';
            keywordItem.iconPath = new vscode.ThemeIcon('symbol-method');
            keywordItem.contextValue = 'keyword';

            keywordItem.command = {
                command: 'rfFilesCreator.selectKeywordForInfo',
                title: 'View Keyword Info',
                arguments: [{
                    keyword: keyword,
                    sourceFile: this.keywordsSourceFile,
                    libraryName: path.basename(this.keywordsSourceFile)
                }]
            };

            if (keyword.args.length > 0) {
                for (const arg of keyword.args) {
                    const argItem = new ImportTreeItem(
                        arg,
                        vscode.TreeItemCollapsibleState.None,
                        { isFile: false }
                    );
                    argItem.iconPath = new vscode.ThemeIcon('symbol-parameter');
                    argItem.description = '';
                    argItem.contextValue = 'argument';
                    keywordItem.children.push(argItem);
                }
            }

            this.keywordItems.push(keywordItem);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

/**
 * Provider for Keyword Details view
 */
export class KeywordDetailsProvider implements vscode.TreeDataProvider<ImportTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private detailItems: ImportTreeItem[] = [];
    private selectedKeywordInfo: SelectedKeywordInfo | null = null;

    getTreeItem(element: ImportTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImportTreeItem): ImportTreeItem[] {
        if (!element) {
            return this.detailItems;
        }
        return [];
    }

    setSelectedKeyword(keywordInfo: SelectedKeywordInfo): void {
        this.selectedKeywordInfo = keywordInfo;
        this.buildTree();
        this._onDidChangeTreeData.fire();
    }

    clearSelectedKeyword(): void {
        this.selectedKeywordInfo = null;
        this.detailItems = [];
        this._onDidChangeTreeData.fire();
    }

    private buildTree() {
        this.detailItems = [];
        if (!this.selectedKeywordInfo) return;

        const { keyword, sourceFile, libraryName } = this.selectedKeywordInfo;

        // Documentation item
        const docItem = new ImportTreeItem(
            `Documentation`,
            vscode.TreeItemCollapsibleState.None,
            { isFile: false }
        );
        docItem.description = keyword.doc || 'No description';
        docItem.tooltip = keyword.doc || 'No documentation available';
        docItem.iconPath = new vscode.ThemeIcon('comment');
        docItem.contextValue = 'keywordInfo';
        this.detailItems.push(docItem);

        // Arguments item
        if (keyword.args.length > 0) {
            const argsItem = new ImportTreeItem(
                `Arguments`,
                vscode.TreeItemCollapsibleState.None,
                { isFile: false }
            );
            argsItem.description = `[${keyword.args.join(', ')}]`;
            argsItem.iconPath = new vscode.ThemeIcon('symbol-parameter');
            argsItem.contextValue = 'keywordInfo';
            this.detailItems.push(argsItem);
        }

        // Source item
        const sourceItem = new ImportTreeItem(
            `Source`,
            vscode.TreeItemCollapsibleState.None,
            { isFile: false }
        );
        sourceItem.description = libraryName;
        sourceItem.tooltip = `File: ${sourceFile}`;
        sourceItem.iconPath = new vscode.ThemeIcon('file-code');
        sourceItem.contextValue = 'keywordInfo';
        this.detailItems.push(sourceItem);

        // Insert button
        const insertItem = new ImportTreeItem(
            `Insert Keyword`,
            vscode.TreeItemCollapsibleState.None,
            { isFile: false }
        );
        insertItem.iconPath = new vscode.ThemeIcon('arrow-right');
        insertItem.command = {
            command: 'rfFilesCreator.insertKeywordFromInfo',
            title: 'Insert Keyword',
            arguments: [keyword.name]
        };
        insertItem.contextValue = 'keywordInfo';
        this.detailItems.push(insertItem);

        // View Doc button
        const viewDocItem = new ImportTreeItem(
            `View Documentation`,
            vscode.TreeItemCollapsibleState.None,
            { isFile: false }
        );
        viewDocItem.iconPath = new vscode.ThemeIcon('open-preview');
        viewDocItem.command = {
            command: 'rfFilesCreator.viewKeywordDoc',
            title: 'View Documentation',
            arguments: [keyword.name, keyword.doc]
        };
        viewDocItem.contextValue = 'keywordInfo';
        this.detailItems.push(viewDocItem);
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
