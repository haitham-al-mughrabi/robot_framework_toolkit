package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.search.FileTypeIndex
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.search.FilenameIndex
import com.jetbrains.python.PythonFileType

object ProjectScanner {

    fun findImportableFiles(project: Project): List<VirtualFile> {
        val scope = GlobalSearchScope.projectScope(project)
        val pyFiles = FileTypeIndex.getFiles(PythonFileType.INSTANCE, scope)
        
        // Robot files might not have a dedicated FileType if the plugin is missing, 
        // so we can use FilenameIndex for .robot and .resource
        val robotFiles = FilenameIndex.getAllFilesByExt(project, "robot", scope)
        val resourceFiles = FilenameIndex.getAllFilesByExt(project, "resource", scope)
        
        return (pyFiles + robotFiles + resourceFiles).distinctBy { it.path }
    }
}
