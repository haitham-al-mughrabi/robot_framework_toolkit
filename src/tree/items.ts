import * as vscode from 'vscode';
import { ImportType } from '../types';

// Tree item for import selection
export class ImportTreeItem extends vscode.TreeItem {
    children: ImportTreeItem[] = [];
    isFile: boolean = false;
    filePath: string = '';
    relativePath: string = '';
    absolutePath: string = '';
    fileExtension: string = '';
    selectedImportType: ImportType | null = null; // null = not selected
    availableImportTypes: ImportType[] = [];
    isSuggested: boolean = false;

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

// Tree item for keyword selection
export class KeywordTreeItem extends vscode.TreeItem {
    constructor(
        public readonly keywordName: string,
        public readonly keywordArgs: string[],
        public readonly keywordDoc: string,
        public readonly parentFilePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(keywordName, collapsibleState);

        this.description = this.formatArgs();
        this.tooltip = this.keywordDoc || 'No description available';
        this.iconPath = new vscode.ThemeIcon('symbol-method');

        // Set up command to insert keyword when clicked
        this.command = {
            command: 'rfFilesCreator.insertKeyword',
            title: 'Insert Keyword',
            arguments: [this]
        };

        this.contextValue = 'keyword';
    }

    private formatArgs(): string {
        if (this.keywordArgs.length === 0) {
            return '';
        }
        return `[${this.keywordArgs.join(' | ')}]`;
    }
}
