// Path type options
export type PathType = 'relative' | 'absolute';
export type ImportType = 'Library' | 'Resource' | 'Variables';

// Existing import parsed from file
export interface ExistingImport {
    type: ImportType;
    path: string;
}

// Selected item for import generation
export interface SelectedItem {
    isFile: boolean;
    filePath: string;
    relativePath: string;
    absolutePath: string;
    importType?: ImportType;
}

export type SelectionResult = SelectedItem[] | null; // null indicates cancellation

// Keyword extracted from files
export interface ExtractedKeyword {
    name: string;
    args: string[];
    doc: string;
}
