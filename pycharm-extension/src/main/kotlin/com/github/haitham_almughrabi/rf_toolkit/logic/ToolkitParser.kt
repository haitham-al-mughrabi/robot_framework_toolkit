package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.vfs.VirtualFile
import java.util.regex.Pattern

object ToolkitParser {

    fun parseExistingImports(content: String): List<ExistingImport> {
        val imports = mutableListOf<ExistingImport>()
        var inSettings = false

        content.lines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty()) return@forEach

            if (trimmed.startsWith("*** Settings ***", ignoreCase = true)) {
                inSettings = true
                return@forEach
            }

            if (trimmed.startsWith("***") && inSettings) {
                inSettings = false
            }

            if (inSettings) {
                val libraryMatch = Regex("^Library\\s+(\\S+)", RegexOption.IGNORE_CASE).find(trimmed)
                if (libraryMatch != null) {
                    imports.add(ExistingImport("Library", libraryMatch.groupValues[1]))
                }

                val resourceMatch = Regex("^Resource\\s+(\\S+)", RegexOption.IGNORE_CASE).find(trimmed)
                if (resourceMatch != null) {
                    imports.add(ExistingImport("Resource", resourceMatch.groupValues[1]))
                }

                val variablesMatch = Regex("^Variables\\s+(\\S+)", RegexOption.IGNORE_CASE).find(trimmed)
                if (variablesMatch != null) {
                    imports.add(ExistingImport("Variables", variablesMatch.groupValues[1]))
                }
            }
        }
        return imports
    }

    fun extractKeywordsFromRobot(content: String): List<ExtractedKeyword> {
        val keywords = mutableListOf<ExtractedKeyword>()
        var inKeywords = false
        var currentKeyword: ExtractedKeyword? = null

        content.lines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.startsWith("*** Keywords ***", ignoreCase = true)) {
                inKeywords = true
                return@forEach
            } else if (trimmed.startsWith("***") && inKeywords) {
                inKeywords = false
                currentKeyword?.let { keywords.add(it) }
                currentKeyword = null
            }

            if (!inKeywords || trimmed.isEmpty() || trimmed.startsWith("#")) return@forEach

            val hasLeadingSpace = line.startsWith(" ") || line.startsWith("\t")

            if (!hasLeadingSpace) {
                currentKeyword?.let { keywords.add(it) }
                val name = trimmed.split(Regex("\\s{2,}|\\t"))[0].trim()
                currentKeyword = ExtractedKeyword(name)
            } else if (currentKeyword != null) {
                val lineParts = trimmed.split(Regex("\\s{2,}|\\t")).filter { it.isNotEmpty() }
                if (lineParts.isNotEmpty()) {
                    val instruction = lineParts[0].lowercase()
                    if (instruction == "[arguments]") {
                        val args = lineParts.drop(1).map { it.trim() }
                        currentKeyword = currentKeyword!!.copy(args = currentKeyword!!.args + args)
                    } else if (instruction == "[documentation]") {
                        val doc = lineParts.drop(1).joinToString(" ").trim()
                        currentKeyword = currentKeyword!!.copy(doc = doc)
                    }
                }
            }
        }
        currentKeyword?.let { keywords.add(it) }
        return keywords
    }

    fun extractKeywordsFromPython(content: String): List<ExtractedKeyword> {
        val keywords = mutableListOf<ExtractedKeyword>()
        val lines = content.lines()
        
        for (i in lines.indices) {
            val line = lines[i].trim()
            
            // Match method definition
            val methodMatch = Regex("""def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*:""").find(line)
            if (methodMatch != null) {
                val methodName = methodMatch.groupValues[1]
                val params = methodMatch.groupValues[2]
                
                // Skip private methods
                if (methodName.startsWith("_")) continue
                
                // Check for @keyword decorator with custom name
                var keywordName: String? = null
                if (i > 0) {
                    val prevLine = lines[i - 1].trim()
                    if (prevLine.startsWith("@keyword")) {
                        // Extract custom name from @keyword("Custom Name")
                        val decoratorMatch = Regex("""@keyword\s*\(\s*["']([^"']+)["']\s*\)""").find(prevLine)
                        if (decoratorMatch != null) {
                            keywordName = decoratorMatch.groupValues[1]
                        }
                    }
                }
                
                // If no custom name, convert snake_case to Title Case
                if (keywordName == null) {
                    keywordName = methodName.split("_")
                        .joinToString(" ") { it.replaceFirstChar { char -> char.uppercase() } }
                }
                
                // Parse arguments
                val args = params.split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() && it != "self" && !it.startsWith("*") }
                    .map { if (it.contains("=") && !it.contains("=")) it.split("=")[0].trim() else it }
                    .map { "\${$it}" }
                
                // Extract docstring if present
                var doc = ""
                if (i + 1 < lines.size) {
                    val nextLine = lines[i + 1].trim()
                    if (nextLine.startsWith("\"\"\"") || nextLine.startsWith("'''")) {
                        val docLines = mutableListOf<String>()
                        var j = i + 1
                        var foundEnd = false
                        
                        while (j < lines.size && !foundEnd) {
                            val docLine = lines[j].trim()
                            if (j == i + 1) {
                                // First line
                                if (docLine.endsWith("\"\"\"") || docLine.endsWith("'''")) {
                                    // Single line docstring
                                    doc = docLine.removeSurrounding("\"\"\"").removeSurrounding("'''").trim()
                                    foundEnd = true
                                } else {
                                    docLines.add(docLine.removePrefix("\"\"\"").removePrefix("'''"))
                                }
                            } else {
                                if (docLine.endsWith("\"\"\"") || docLine.endsWith("'''")) {
                                    docLines.add(docLine.removeSuffix("\"\"\"").removeSuffix("'''"))
                                    foundEnd = true
                                } else {
                                    docLines.add(docLine)
                                }
                            }
                            j++
                        }
                        
                        if (doc.isEmpty() && docLines.isNotEmpty()) {
                            doc = docLines.joinToString(" ").trim()
                        }
                    }
                }
                
                keywords.add(ExtractedKeyword(keywordName, args, doc))
            }
        }
        return keywords
    }
}
