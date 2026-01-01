package com.github.haitham_almughrabi.rf_toolkit.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.wm.ToolWindowManager

class EditRobotImportsAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        if (!file.name.endsWith(".robot") && !file.name.endsWith(".resource")) return

        // Open the file in editor first (this will trigger the automatic file detection)
        FileEditorManager.getInstance(project).openFile(file, true)

        // Show the tool window
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Robot Framework Toolkit") ?: return
        toolWindow.show()
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible = file != null &&
            (file.name.endsWith(".robot") || file.name.endsWith(".resource"))
    }
}
