import * as vscode from 'vscode';
import { getHtmlForWebview } from './htmlGenerator';
import { ExistingImport, ExtractedKeyword, ImportType, SelectedItem, PathType } from '../types';
import { parseExistingImports, extractKeywordsFromFile } from '../parsers';
import {
    generateSettingsSection,
    updateSettingsSection
} from '../file-operations';
import {
    lockTargetFile,
    unlockTargetFile,
    isLocked,
    getLockedTargetFile
} from '../target-manager';

interface SelectedFileInfo {
    importType: ImportType | null;
    checked: boolean;
}

interface WebviewState {
    targetFile: string | null;
    isLocked: boolean;
    allImportableFiles: vscode.Uri[];
    selectedFiles: Map<string, SelectedFileInfo>;
    existingImports: ExistingImport[];
    extractedKeywords: ExtractedKeyword[];
    selectedKeyword: ExtractedKeyword | null;
    keywordSource: string | null;
    searchFilter: string;
    fileTypeFilter: 'all' | 'python' | 'resource' | 'robot';
    pendingChanges: boolean;
}

export class ImportWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rfImportSelector';
    private _view?: vscode.WebviewView;
    private state: WebviewState;
    private workspaceRoot: string;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.state = this.initializeState();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message);
        });

        // Send initial state when webview becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.sendStateToWebview();
            }
        });
    }

    private initializeState(): WebviewState {
        return {
            targetFile: null,
            isLocked: false,
            allImportableFiles: [],
            selectedFiles: new Map(),
            existingImports: [],
            extractedKeywords: [],
            selectedKeyword: null,
            keywordSource: null,
            searchFilter: '',
            fileTypeFilter: 'all',
            pendingChanges: false
        };
    }

    private async handleMessage(message: any) {
        switch (message.type) {
            case 'getInitialState':
                await this.loadTargetFile();
                this.sendStateToWebview();
                break;

            case 'setTargetFile':
                await this.setTargetFile(message.filePath);
                break;

            case 'lockTarget':
                this.lockTarget();
                break;

            case 'unlockTarget':
                this.unlockTarget();
                break;

            case 'goToTarget':
                await this.goToTargetFile();
                break;

            case 'refreshImports':
                await this.refreshImports();
                break;

            case 'selectFile':
                this.selectFile(message.filePath, message.checked, message.importType);
                break;

            case 'setImportType':
                this.setImportType(message.filePath, message.importType);
                break;

            case 'setSearchFilter':
                this.setSearchFilter(message.filter);
                break;

            case 'setFileTypeFilter':
                this.setFileTypeFilter(message.filter);
                break;

            case 'viewFile':
                await this.viewFile(this.toAbsolutePath(message.filePath));
                break;

            case 'extractKeywords':
                await this.extractKeywords(this.toAbsolutePath(message.filePath));
                break;

            case 'selectKeyword':
                this.selectKeyword(message.keyword);
                break;

            case 'insertKeyword':
                await this.insertKeyword(message.keyword);
                break;

            case 'deleteImport':
                await this.deleteImport(message.importPath);
                break;

            case 'confirmImports':
                await this.confirmImports();
                break;

            case 'cancelImports':
                this.cancelImports();
                break;

            default:
                console.warn(`Unknown message type: ${message.type}`);
        }
    }

    private async loadTargetFile() {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const filePath = activeEditor.document.uri.fsPath;
            if (this.isRobotFrameworkFile(filePath)) {
                await this.setTargetFile(filePath);
            }
        }
    }

    private async setTargetFile(filePath: string) {
        this.state.targetFile = filePath;
        await this.scanWorkspaceFiles();
        await this.loadExistingImports();
        this.sendStateToWebview();
    }

    private async scanWorkspaceFiles() {
        const files = await vscode.workspace.findFiles(
            '**/*.{py,robot,resource}',
            '{**/node_modules/**,**/.venv/**,**/venv/**}'
        );

        // Filter out __init__ files and convert to workspace-relative paths
        const filteredFiles = files
            .filter(file => {
                const fileName = file.fsPath.split('/').pop() || '';
                return !fileName.startsWith('__init__');
            })
            .map(file => {
                // Convert to workspace-relative path
                if (this.workspaceRoot) {
                    const relativePath = file.fsPath.replace(this.workspaceRoot + '/', '');
                    return relativePath;
                }
                return file.fsPath;
            });

        this.state.allImportableFiles = filteredFiles.map(path =>
            vscode.Uri.file(this.workspaceRoot ? this.workspaceRoot + '/' + path : path)
        );
        this.sendFileListToWebview();
    }

    private async loadExistingImports() {
        if (!this.state.targetFile) {
            this.state.existingImports = [];
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(this.state.targetFile);
            const content = document.getText();
            this.state.existingImports = parseExistingImports(content);
        } catch (error) {
            console.error('Error loading existing imports:', error);
            this.state.existingImports = [];
        }
    }

    private lockTarget() {
        if (this.state.targetFile) {
            lockTargetFile(this.state.targetFile);
            this.state.isLocked = true;
            this.sendStateToWebview();
        }
    }

    private unlockTarget() {
        unlockTargetFile();
        this.state.isLocked = false;
        this.sendStateToWebview();
    }

    private async goToTargetFile() {
        if (this.state.targetFile) {
            const document = await vscode.workspace.openTextDocument(this.state.targetFile);
            await vscode.window.showTextDocument(document);
        }
    }

    private async refreshImports() {
        await this.scanWorkspaceFiles();
        await this.loadExistingImports();
        this.sendStateToWebview();
    }

    private selectFile(filePath: string, checked: boolean, importType: ImportType | null) {
        this.state.selectedFiles.set(filePath, { checked, importType });
        this.state.pendingChanges = this.hasPendingChanges();
        this.sendStateToWebview();
    }

    private setImportType(filePath: string, importType: ImportType) {
        const fileInfo = this.state.selectedFiles.get(filePath);
        if (fileInfo) {
            fileInfo.importType = importType;
            this.state.pendingChanges = this.hasPendingChanges();
            this.sendStateToWebview();
        }
    }

    private setSearchFilter(filter: string) {
        this.state.searchFilter = filter;
        this.sendStateToWebview();
    }

    private setFileTypeFilter(filter: 'all' | 'python' | 'resource' | 'robot') {
        this.state.fileTypeFilter = filter;
        this.sendStateToWebview();
    }

    private async viewFile(filePath: string) {
        try {
            // Automatically lock target file when viewing another file
            if (this.state.targetFile && !isLocked()) {
                lockTargetFile(this.state.targetFile);
                this.state.isLocked = true;
                this.sendStateToWebview();
            }

            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }

    private async extractKeywords(filePath: string) {
        try {
            const keywords = await extractKeywordsFromFile(filePath);
            this.state.extractedKeywords = keywords;
            this.state.keywordSource = filePath;
            this.state.selectedKeyword = null;
            this.sendStateToWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to extract keywords from: ${filePath}`);
            console.error(error);
        }
    }

    private selectKeyword(keyword: ExtractedKeyword) {
        this.state.selectedKeyword = keyword;
        this.sendStateToWebview();
    }

    private async insertKeyword(keyword: ExtractedKeyword) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const keywordCall = keyword.args.length > 0
            ? `${keyword.name}    ${keyword.args.map((arg: string) => `\${${arg}}`).join('    ')}`
            : keyword.name;

        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, keywordCall);
        });

        vscode.window.showInformationMessage(`Inserted keyword: ${keyword.name}`);
    }

    private async deleteImport(importPath: string) {
        if (!this.state.targetFile) {
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(this.state.targetFile);
            const content = document.getText();

            // Remove the import line
            const lines = content.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                return !(
                    trimmed.includes(importPath) &&
                    (trimmed.startsWith('Library') ||
                     trimmed.startsWith('Resource') ||
                     trimmed.startsWith('Variables'))
                );
            });

            const newContent = filteredLines.join('\n');

            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                newContent
            );

            await vscode.workspace.applyEdit(edit);
            await document.save();

            await this.loadExistingImports();
            this.sendStateToWebview();

            vscode.window.showInformationMessage(`Deleted import: ${importPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete import: ${importPath}`);
            console.error(error);
        }
    }

    private async confirmImports() {
        if (!this.state.targetFile) {
            vscode.window.showWarningMessage('No target file selected');
            return;
        }

        try {
            const pathModule = await import('path');
            const targetDir = pathModule.dirname(this.state.targetFile);
            const allImports: SelectedItem[] = [];

            // First, add existing imports to preserve them
            for (const existingImport of this.state.existingImports) {
                const absolutePath = this.toAbsolutePath(existingImport.path);
                const relativePath = pathModule.relative(targetDir, absolutePath);

                allImports.push({
                    isFile: true,
                    filePath: absolutePath,
                    relativePath: relativePath,
                    absolutePath: absolutePath,
                    importType: existingImport.type
                });
            }

            // Then, add newly selected imports
            for (const [filePath, info] of this.state.selectedFiles) {
                if (info.checked && info.importType) {
                    const absolutePath = this.toAbsolutePath(filePath);
                    const relativePath = pathModule.relative(targetDir, absolutePath);

                    // Check if this import already exists to avoid duplicates
                    const isDuplicate = allImports.some(imp =>
                        imp.absolutePath === absolutePath || imp.relativePath === relativePath
                    );

                    if (!isDuplicate) {
                        allImports.push({
                            isFile: true,
                            filePath: absolutePath,
                            relativePath: relativePath,
                            absolutePath: absolutePath,
                            importType: info.importType
                        });
                    }
                }
            }

            if (allImports.length === 0) {
                vscode.window.showWarningMessage('No imports to save');
                return;
            }

            const document = await vscode.workspace.openTextDocument(this.state.targetFile);
            const content = document.getText();

            const settingsSection = generateSettingsSection(allImports, 'relative');

            const newContent = updateSettingsSection(content, settingsSection);

            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                newContent
            );

            await vscode.workspace.applyEdit(edit);
            await document.save();

            this.state.selectedFiles.clear();
            this.state.pendingChanges = false;
            await this.loadExistingImports();
            this.sendStateToWebview();

            vscode.window.showInformationMessage(`Successfully updated imports`);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to confirm imports');
            console.error(error);
        }
    }

    private cancelImports() {
        this.state.selectedFiles.clear();
        this.state.pendingChanges = false;
        this.sendStateToWebview();
    }

    private hasPendingChanges(): boolean {
        for (const [_, info] of this.state.selectedFiles) {
            if (info.checked && info.importType) {
                return true;
            }
        }
        return false;
    }

    private isRobotFrameworkFile(filePath: string): boolean {
        return filePath.endsWith('.robot') || filePath.endsWith('.resource');
    }

    private toAbsolutePath(relativePath: string): string {
        // If already absolute, return as-is
        if (relativePath.startsWith('/')) {
            return relativePath;
        }
        // Convert workspace-relative to absolute
        return this.workspaceRoot ? this.workspaceRoot + '/' + relativePath : relativePath;
    }

    private sendStateToWebview() {
        if (!this._view) {
            return;
        }

        // Convert Map to plain object for JSON serialization
        const selectedFilesObj: Record<string, SelectedFileInfo> = {};
        for (const [key, value] of this.state.selectedFiles) {
            selectedFilesObj[key] = value;
        }

        // Convert to workspace-relative paths for display
        const relativePaths = this.state.allImportableFiles.map(uri => {
            if (this.workspaceRoot) {
                return uri.fsPath.replace(this.workspaceRoot + '/', '');
            }
            return uri.fsPath;
        });

        this._view.webview.postMessage({
            type: 'stateUpdate',
            state: {
                ...this.state,
                selectedFiles: selectedFilesObj,
                allImportableFiles: relativePaths
            }
        });
    }

    private sendFileListToWebview() {
        if (!this._view) {
            return;
        }

        // Convert to workspace-relative paths for display
        const relativePaths = this.state.allImportableFiles.map(uri => {
            if (this.workspaceRoot) {
                return uri.fsPath.replace(this.workspaceRoot + '/', '');
            }
            return uri.fsPath;
        });

        this._view.webview.postMessage({
            type: 'fileListUpdate',
            files: relativePaths
        });
    }

    // Public method to update target file from external sources (e.g., active editor change)
    public async updateTargetFile(filePath: string | null) {
        if (!isLocked()) {
            if (filePath && this.isRobotFrameworkFile(filePath)) {
                await this.setTargetFile(filePath);
            } else {
                this.state.targetFile = null;
                this.state.allImportableFiles = [];
                this.state.existingImports = [];
                this.sendStateToWebview();
            }
        }
    }

    // Public method to check if webview is visible
    public isVisible(): boolean {
        return this._view?.visible || false;
    }
}
