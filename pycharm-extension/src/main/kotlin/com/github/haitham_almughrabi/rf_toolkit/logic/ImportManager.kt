package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.IOException

object ImportManager {

    fun updateImports(project: Project, targetFile: VirtualFile, selectedImports: List<ExistingImport>) {
        WriteCommandAction.runWriteCommandAction(project) {
            try {
                val currentContent = VfsUtil.loadText(targetFile)
                val newSettingsSection = generateSettingsSection(selectedImports)
                val updatedContent = updateSettingsSection(currentContent, newSettingsSection)
                
                VfsUtil.saveText(targetFile, updatedContent)
            } catch (e: IOException) {
                // Log error
            }
        }
    }

    private fun generateSettingsSection(imports: List<ExistingImport>): String {
        val sb = StringBuilder("*** Settings ***\n")
        imports.sortedBy { it.type }.forEach { imp ->
            sb.append("${imp.type}    ${imp.path}\n")
        }
        return sb.toString()
    }

    private fun updateSettingsSection(content: String, newSection: String): String {
        val lines = content.lines()
        val result = mutableListOf<String>()
        var inSettings = false
        var settingsAdded = false

        lines.forEach { line ->
            val trimmed = line.trim()
            if (trimmed.startsWith("*** Settings ***", ignoreCase = true)) {
                inSettings = true
                result.add(newSection.trimEnd())
                settingsAdded = true
                return@forEach
            }

            if (trimmed.startsWith("***") && inSettings) {
                inSettings = false
                result.add("")
            }

            if (!inSettings) {
                result.add(line)
            }
        }

        if (!settingsAdded) {
            return newSection + "\n\n" + content
        }

        return result.joinToString("\n")
    }
}
