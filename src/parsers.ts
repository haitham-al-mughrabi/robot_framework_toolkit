import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExistingImport, ExtractedKeyword } from './types';

/**
 * Parse existing imports from a Robot Framework file
 */
export function parseExistingImports(fileContent: string): ExistingImport[] {
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
export function analyzeFileContentForSuggestions(fileContent: string, allPyFiles: vscode.Uri[], allResourceFiles: vscode.Uri[]): vscode.Uri[] {
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
 * Extract keywords from a Robot Framework resource or Python library file
 */
export function extractKeywordsFromFile(filePath: string): ExtractedKeyword[] {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf8');

    if (ext === '.robot' || ext === '.resource') {
        return extractKeywordsFromRobotFile(content);
    } else if (ext === '.py') {
        return extractKeywordsFromPythonFile(content);
    } else {
        // For other files, try robot format as fallback
        return extractKeywordsFromRobotFile(content);
    }
}

/**
 * Extract keywords from a Robot Framework file
 */
export function extractKeywordsFromRobotFile(content: string): ExtractedKeyword[] {
    const keywords: ExtractedKeyword[] = [];
    const lines = content.split('\n');

    let inKeywordsSection = false;
    let currentKeyword: ExtractedKeyword | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check for section headers
        if (trimmedLine.match(/^\*\*\*\s*Keywords\s*\*\*\*/i)) {
            inKeywordsSection = true;
            continue;
        } else if (trimmedLine.match(/^\*\*\*\s*(Settings|Test Cases|Variables|Tasks|Comments)\s*\*\*\*/i)) {
            inKeywordsSection = false;
            // If we were collecting a keyword, save it before exiting section
            if (currentKeyword) {
                keywords.push(currentKeyword);
                currentKeyword = null;
            }
            continue;
        }

        if (inKeywordsSection && trimmedLine && !trimmedLine.startsWith('#')) {
            // Robot Framework keywords have names in the first column, and settings like [Arguments], [Documentation] in subsequent columns
            // We need to be more careful about the format
            const parts = line.split(/\s{2,}|\t+/).filter(p => p.trim() !== '');

            if (parts.length > 0) {
                const firstPart = parts[0].trim();

                // Check if this is a keyword name (not a setting like [Arguments] or [Documentation])
                if (firstPart &&
                    !firstPart.startsWith('[') &&
                    !firstPart.match(/^\[.*\]$/i) && // Not a setting in square brackets
                    !firstPart.toLowerCase().includes('documentation') &&
                    !firstPart.toLowerCase().includes('arguments') &&
                    !firstPart.toLowerCase().includes('teardown') &&
                    !firstPart.toLowerCase().includes('timeout') &&
                    !firstPart.toLowerCase().includes('setup') &&
                    !firstPart.toLowerCase().includes('template') &&
                    !firstPart.toLowerCase().includes('tags')) {

                    // If we were building a previous keyword, save it
                    if (currentKeyword) {
                        keywords.push(currentKeyword);
                    }

                    // Start new keyword
                    currentKeyword = {
                        name: firstPart,
                        args: [],
                        doc: ''
                    };
                }
                // If we have an active keyword and this is a setting line
                else if (currentKeyword && parts[0].trim().toLowerCase() === '[arguments]' && parts.length > 1) {
                    // Extract arguments from the same line
                    for (let j = 1; j < parts.length; j++) {
                        const arg = parts[j].trim();
                        if (arg && arg.startsWith('${') && arg.endsWith('}')) {
                            currentKeyword.args.push(arg);
                        }
                    }
                }
                else if (currentKeyword && parts[0].trim().toLowerCase() === '[documentation]' && parts.length > 1) {
                    // Extract documentation from the same line
                    const docParts = parts.slice(1);
                    currentKeyword.doc = docParts.join(' ').trim();
                }
            }

            // Handle continuation lines (indented content under a keyword)
            if (currentKeyword &&
                (line.startsWith('  ') || line.startsWith('    ') || line.startsWith('\t')) &&
                trimmedLine) {

                const contParts = line.split(/\s{2,}|\t+/).filter(p => p.trim() !== '');
                if (contParts.length > 0) {
                    const firstContPart = contParts[0].trim().toLowerCase();

                    // If it's a continuation of documentation
                    if (firstContPart === '[documentation]' && contParts.length > 1) {
                        currentKeyword.doc = contParts.slice(1).join(' ').trim();
                    }
                    // If it's an argument continuation line
                    else if (firstContPart === '[arguments]' && contParts.length > 1) {
                        for (let j = 1; j < contParts.length; j++) {
                            const arg = contParts[j].trim();
                            if (arg && arg.startsWith('${') && arg.endsWith('}')) {
                                currentKeyword.args.push(arg);
                            }
                        }
                    }
                }
            }
        }
    }

    // Add the last keyword if exists
    if (currentKeyword) {
        keywords.push(currentKeyword);
    }

    return keywords;
}

/**
 * Extract keywords from a Python library file (methods from classes)
 */
export function extractKeywordsFromPythonFile(content: string): ExtractedKeyword[] {
    const keywords: ExtractedKeyword[] = [];

    // More robust regex to find method definitions in Python
    const methodRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*:/g;

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const methodName = match[1];
        const paramsStr = match[2];

        // Extract parameters (more robust parsing)
        let args: string[] = [];
        if (paramsStr.trim() && paramsStr.trim() !== 'self') {
            // Split parameters by comma, but be careful with nested structures
            const rawParams = paramsStr.split(',').map(p => p.trim());
            args = rawParams
                .filter(p => p && p !== 'self' && !p.includes('=') && !p.includes('*')) // Exclude self, defaults, and *args/**kwargs
                .map(p => {
                    // Extract just the parameter name, removing type hints like param: str -> param
                    return p.split(':')[0].trim();
                })
                .filter(p => p.startsWith('${') || p.startsWith('_') === false); // Keep valid RF-style args or regular Python args

            // Convert Python-style args to RF-style if needed
            args = args.map(arg => arg.startsWith('${') ? arg : `\${${arg}}`);
        }

        // Try to find docstring for the method
        let doc = '';
        const methodCode = content.substring(match.index);
        const methodLines = methodCode.split('\n');

        // Look for docstring in the next few lines after method definition
        for (let i = 1; i < Math.min(methodLines.length, 10); i++) { // Check up to 10 lines
            const line = methodLines[i].trim();

            // Check for triple quote docstring
            if (line.startsWith('"""') || line.startsWith("'''")) {
                // Extract content from triple quoted string
                const remaining = methodLines.slice(i).join('\n');
                const tripleMatch = remaining.match(/["']{3}([\s\S]*?)["']{3}|['"]{3}([\s\S]*?)['"]{3}/);
                if (tripleMatch) {
                    doc = tripleMatch[1] || tripleMatch[2] || '';
                    // Clean up the docstring
                    doc = doc.replace(/\n/g, ' ').trim();
                }
                break;
            }
            // Check for single line docstring
            else if (line.match(/^["'].*["']$/)) {
                const singleMatch = line.match(/["'](.*)["']/);
                if (singleMatch) {
                    doc = singleMatch[1];
                }
                break;
            }
        }

        // Filter out private methods (starting with underscore) and special methods
        if (!methodName.startsWith('_') && !methodName.startsWith('__')) {
            keywords.push({
                name: methodName,
                args: args,
                doc: doc || 'No description'
            });
        }
    }

    return keywords;
}
