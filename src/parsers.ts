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
 * Check if a line looks like a valid Robot Framework keyword name
 */
function isValidKeywordName(name: string): boolean {
    // Must not be empty
    if (!name || name.trim() === '') return false;

    const trimmed = name.trim();

    // Must not start with special characters that indicate non-keywords
    if (trimmed.startsWith('[') || trimmed.startsWith('$') || trimmed.startsWith('@') ||
        trimmed.startsWith('%') || trimmed.startsWith('&') || trimmed.startsWith('...')) {
        return false;
    }

    // Must not be just dots (continuation)
    if (trimmed === '...' || trimmed.match(/^\.+$/)) return false;

    // Must not look like a variable assignment or reference
    if (trimmed.match(/^\$\{.*\}/) || trimmed.match(/^@\{.*\}/) || trimmed.match(/^&\{.*\}/)) {
        return false;
    }

    // Must not be a setting keyword
    const lowerTrimmed = trimmed.toLowerCase();
    const settingsKeywords = [
        '[documentation]', '[arguments]', '[return]', '[tags]', '[timeout]',
        '[setup]', '[teardown]', '[template]', 'documentation', 'arguments',
        'return', 'tags', 'timeout', 'setup', 'teardown', 'template'
    ];
    if (settingsKeywords.some(kw => lowerTrimmed === kw || lowerTrimmed.startsWith(kw + ' '))) {
        return false;
    }

    // Must not be common RF built-in keywords that start a line (these are actions, not definitions)
    const builtInKeywords = [
        'log', 'set variable', 'return from keyword', 'run keyword', 'should be',
        'should contain', 'should not', 'wait until', 'click', 'input', 'get',
        'call method', 'for', 'if', 'else', 'end', 'try', 'except', 'finally'
    ];
    if (builtInKeywords.some(kw => lowerTrimmed.startsWith(kw))) {
        return false;
    }

    // Keyword names typically start with a letter and can contain letters, numbers, spaces, underscores
    // They should look like readable names, not code
    if (!trimmed.match(/^[A-Za-z]/)) return false;

    return true;
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

        if (!inKeywordsSection) continue;

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;

        // IMPORTANT: Keyword names in RF must start at column 0 (no leading whitespace)
        // Lines with leading whitespace are keyword body content, not new keyword definitions
        const hasLeadingWhitespace = line.match(/^[\s\t]/);

        if (!hasLeadingWhitespace) {
            // This line starts at column 0 - potential keyword name
            const potentialKeywordName = trimmedLine.split(/\s{2,}|\t/)[0].trim();

            if (isValidKeywordName(potentialKeywordName)) {
                // Save previous keyword if exists
                if (currentKeyword) {
                    keywords.push(currentKeyword);
                }

                // Start new keyword
                currentKeyword = {
                    name: potentialKeywordName,
                    args: [],
                    doc: ''
                };
            }
        } else if (currentKeyword) {
            // This is an indented line - part of current keyword's body
            // Check for [Arguments] and [Documentation] settings
            const parts = line.split(/\s{2,}|\t+/).filter(p => p.trim() !== '');

            if (parts.length > 0) {
                const firstPart = parts[0].trim().toLowerCase();

                if (firstPart === '[arguments]') {
                    // Extract arguments
                    for (let j = 1; j < parts.length; j++) {
                        const arg = parts[j].trim();
                        if (arg && (arg.startsWith('${') || arg.startsWith('@{') || arg.startsWith('&{'))) {
                            // Extract just the variable name
                            currentKeyword.args.push(arg);
                        }
                    }
                } else if (firstPart === '[documentation]') {
                    // Extract documentation
                    if (parts.length > 1) {
                        currentKeyword.doc = parts.slice(1).join(' ').trim();
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
 * Convert snake_case method name to Robot Framework Title Case format
 * Example: this_is_an_example -> This Is An Example
 */
function snakeCaseToTitleCase(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Extract the @keyword decorator name if present
 * Returns the custom name from @keyword("Custom Name") or null if not found
 */
function extractKeywordDecoratorName(content: string, methodIndex: number): string | null {
    // Look backwards from the method definition to find @keyword decorator
    const beforeMethod = content.substring(0, methodIndex);
    const lines = beforeMethod.split('\n');

    // Check the last several lines before the method for @keyword decorator (increased from 5 to 15)
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
        const line = lines[i].trim();

        // Check for @keyword decorator with custom name: @keyword("Name") or @keyword('Name')
        const keywordWithNameMatch = line.match(/@keyword\s*\(\s*["'](.+?)["']\s*\)/i);
        if (keywordWithNameMatch) {
            return keywordWithNameMatch[1];
        }

        // Check for @keyword decorator with name= parameter: @keyword(name="Name")
        const keywordWithNameParamMatch = line.match(/@keyword\s*\(\s*name\s*=\s*["'](.+?)["']/i);
        if (keywordWithNameParamMatch) {
            return keywordWithNameParamMatch[1];
        }

        // Check for bare @keyword decorator (no custom name)
        if (line.match(/^@keyword\s*$/i) || line.match(/^@keyword\s*\(\s*\)\s*$/i)) {
            return null; // Has decorator but no custom name, will use converted method name
        }

        // If we hit another decorator or non-decorator line, stop looking
        if (line.startsWith('@') && !line.toLowerCase().startsWith('@keyword')) {
            break;
        }
        if (line && !line.startsWith('@') && !line.startsWith('#') && line !== '') {
            // If we hit actual code (not empty line, comment, or decorator), stop
            if (!line.match(/^\s*$/)) {
                break;
            }
        }
    }

    return null;
}

/**
 * Extract keywords from a Python library file (methods from classes)
 * Handles both regular methods and @keyword decorated methods
 */
export function extractKeywordsFromPythonFile(content: string): ExtractedKeyword[] {
    const keywords: ExtractedKeyword[] = [];

    // More robust regex to find method definitions in Python
    const methodRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*:/g;

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const methodName = match[1];
        const paramsStr = match[2];
        const methodIndex = match.index;

        // Filter out private methods (starting with underscore) and special methods
        if (methodName.startsWith('_') || methodName.startsWith('__')) {
            continue;
        }

        // Extract parameters (more robust parsing)
        let args: string[] = [];
        if (paramsStr.trim() && paramsStr.trim() !== 'self') {
            // Split parameters by comma, but be careful with nested structures
            const rawParams = paramsStr.split(',').map(p => p.trim());
            args = rawParams
                .filter(p => p && p !== 'self' && !p.includes('*')) // Exclude self and *args/**kwargs
                .map(p => {
                    // Remove default values (everything after =)
                    const paramWithoutDefault = p.split('=')[0].trim();
                    // Extract just the parameter name, removing type hints like param: str -> param
                    return paramWithoutDefault.split(':')[0].trim();
                })
                .filter(p => p && !p.startsWith('_')); // Keep non-empty params that don't start with underscore

            // Convert Python-style args to RF-style if needed
            args = args.map(arg => arg.startsWith('${') ? arg : `\${${arg}}`);
        }

        // Try to find docstring for the method
        let doc = '';
        const methodCode = content.substring(methodIndex);
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

        // Determine the keyword name:
        // 1. If @keyword("Custom Name") exists, use "Custom Name"
        // 2. Otherwise, convert snake_case to Title Case (e.g., this_is_example -> This Is Example)
        const decoratorName = extractKeywordDecoratorName(content, methodIndex);
        let keywordName: string;

        if (decoratorName) {
            // Use the custom name from @keyword decorator
            keywordName = decoratorName;
        } else {
            // Convert snake_case method name to Title Case
            keywordName = snakeCaseToTitleCase(methodName);
        }

        keywords.push({
            name: keywordName,
            args: args,
            doc: doc || 'No description'
        });
    }

    return keywords;
}
