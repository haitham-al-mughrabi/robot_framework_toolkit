package com.github.haitham_almughrabi.rf_toolkit.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class ToolkitToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val toolkitPanel = ToolkitPanel(project)
        val content = ContentFactory.getInstance().createContent(toolkitPanel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}
