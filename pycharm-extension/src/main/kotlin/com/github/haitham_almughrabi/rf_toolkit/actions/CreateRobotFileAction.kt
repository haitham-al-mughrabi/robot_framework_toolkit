package com.github.haitham_almughrabi.rf_toolkit.actions

import com.intellij.ide.actions.CreateFileFromTemplateAction
import com.intellij.ide.actions.CreateFileFromTemplateDialog
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDirectory
import com.intellij.icons.AllIcons

class CreateRobotFileAction : CreateFileFromTemplateAction(
    "Robot Framework File",
    "Create a new Robot Framework file",
    AllIcons.General.Modified
), DumbAware {

    override fun buildDialog(project: Project, directory: PsiDirectory, builder: CreateFileFromTemplateDialog.Builder) {
        builder
            .setTitle("New Robot Framework File")
            .addKind("Test Case (.robot)", AllIcons.Nodes.TestGroup, "Robot Test Case")
            .addKind("Resource (.resource)", AllIcons.Nodes.ResourceBundle, "Robot Resource")
            .addKind("Variables (.resource)", AllIcons.Nodes.Variable, "Robot Variables")
            .addKind("Locators (.py)", AllIcons.Nodes.Class, "Robot Locators")
    }

    override fun getActionName(directory: PsiDirectory?, newName: String, templateName: String?): String {
        return "Create Robot Framework File $newName"
    }
}
