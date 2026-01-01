package com.github.haitham_almughrabi.rf_toolkit.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.IOException

abstract class CreateRobotFileActionBase(
    private val fileTypeLabel: String,
    private val extension: String,
    private val defaultTemplate: String
) : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val view = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        
        val targetDir = if (view.isDirectory) view else view.parent ?: return

        val fileName = Messages.showInputDialog(
            project,
            "Enter the name for the new Robot Framework $fileTypeLabel file",
            "Create $fileTypeLabel File",
            Messages.getQuestionIcon(),
            "my_$fileTypeLabel",
            null
        )

        if (fileName.isNullOrBlank()) return

        val fullFileName = if (fileName.endsWith(extension)) fileName else fileName + extension
        
        ApplicationManager.getApplication().runWriteAction {
            try {
                val existingFile = targetDir.findChild(fullFileName)
                if (existingFile != null) {
                    val overwrite = Messages.showYesNoDialog(
                        project,
                        "\"$fullFileName\" already exists. Overwrite?",
                        "File Exists",
                        Messages.getWarningIcon()
                    )
                    if (overwrite != Messages.YES) return@runWriteAction
                    existingFile.delete(this)
                }

                val newFile = targetDir.createChildData(this, fullFileName)
                VfsUtil.saveText(newFile, defaultTemplate)
                
                // Open the file in editor
                FileEditorManager.getInstance(project).openFile(newFile, true)
                
                Messages.showInfoMessage(project, "Created $fileTypeLabel file: $fullFileName", "Success")
            } catch (ioe: IOException) {
                Messages.showErrorDialog(project, "Failed to create file: ${ioe.message}", "Error")
            }
        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible = file != null && (file.isDirectory || file.parent != null)
    }
}
