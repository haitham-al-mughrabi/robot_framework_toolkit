package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.vfs.VirtualFile
import java.io.File

/**
 * Analyzes file content to suggest relevant imports based on keyword usage.
 */
object ImportSuggester {
    
    /**
     * Analyze file content and suggest imports based on keyword usage
     */
    fun suggestImports(
        fileContent: String,
        allPyFiles: List<VirtualFile>,
        allResourceFiles: List<VirtualFile>
    ): Set<String> {
        val suggestedFiles = mutableSetOf<String>()
        
        // Extract potential keyword calls from the file
        val potentialKeywords = extractPotentialKeywords(fileContent)
        
        if (potentialKeywords.isEmpty()) {
            return suggestedFiles
        }
        
        // Check Python files for matching keywords
        for (pyFile in allPyFiles) {
            try {
                val content = String(pyFile.contentsToByteArray())
                val keywords = ToolkitParser.extractKeywordsFromPython(content)
                
                if (keywords.any { keyword -> 
                    potentialKeywords.contains(keyword.name.lowercase())
                }) {
                    suggestedFiles.add(pyFile.path)
                }
            } catch (e: Exception) {
                // Skip files that can't be read
            }
        }
        
        // Check Resource files for matching keywords
        for (resourceFile in allResourceFiles) {
            try {
                val content = String(resourceFile.contentsToByteArray())
                val keywords = ToolkitParser.extractKeywordsFromRobot(content)
                
                if (keywords.any { keyword -> 
                    potentialKeywords.contains(keyword.name.lowercase())
                }) {
                    suggestedFiles.add(resourceFile.path)
                }
            } catch (e: Exception) {
                // Skip files that can't be read
            }
        }
        
        return suggestedFiles
    }
    
    /**
     * Extract potential keyword calls from Robot Framework file content
     */
    private fun extractPotentialKeywords(content: String): Set<String> {
        val keywords = mutableSetOf<String>()
        var inTestCases = false
        var inKeywords = false
        
        content.lines().forEach { line ->
            val trimmed = line.trim()
            
            // Track sections
            if (trimmed.startsWith("*** Test Cases ***", ignoreCase = true)) {
                inTestCases = true
                inKeywords = false
                return@forEach
            } else if (trimmed.startsWith("*** Keywords ***", ignoreCase = true)) {
                inKeywords = true
                inTestCases = false
                return@forEach
            } else if (trimmed.startsWith("***")) {
                inTestCases = false
                inKeywords = false
                return@forEach
            }
            
            // Only analyze test cases and keywords sections
            if (!inTestCases && !inKeywords) {
                return@forEach
            }
            
            // Skip empty lines, comments, and section headers
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                return@forEach
            }
            
            // Skip lines that are test/keyword names (no leading whitespace)
            val hasLeadingSpace = line.startsWith(" ") || line.startsWith("\t")
            if (!hasLeadingSpace) {
                return@forEach
            }
            
            // Extract the first word/phrase (potential keyword call)
            val parts = trimmed.split(Regex("\\s{2,}|\\t")).filter { it.isNotEmpty() }
            if (parts.isNotEmpty()) {
                val firstPart = parts[0].trim()
                
                // Skip Robot Framework built-in settings
                if (!firstPart.startsWith("[") && !firstPart.startsWith("...")) {
                    // Normalize to lowercase for matching
                    keywords.add(firstPart.lowercase())
                }
            }
        }
        
        return keywords
    }
}
