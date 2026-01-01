package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File

/**
 * Manages target file locking mechanism for import editing.
 * Allows locking the import panel to a specific file while navigating to others.
 */
object TargetFileManager {
    
    private var lockedTargetFile: String? = null
    private var isTargetLocked: Boolean = false
    private var originalTargetFile: String? = null
    private var titleUpdateCallback: ((String?) -> Unit)? = null
    
    /**
     * Set the callback for updating the tree view title
     */
    fun setTitleUpdateCallback(callback: (String?) -> Unit) {
        titleUpdateCallback = callback
    }
    
    /**
     * Set the original target file (the file that opened the import tree)
     */
    fun setOriginalTargetFile(filePath: String?) {
        originalTargetFile = filePath
    }
    
    /**
     * Get the current target file (locked > original > active editor)
     */
    fun getTargetFile(project: Project): String? {
        // First priority: locked target
        if (isTargetLocked && lockedTargetFile != null) {
            return lockedTargetFile
        }
        
        // Second priority: original target
        if (originalTargetFile != null) {
            return originalTargetFile
        }
        
        // Third priority: active editor if it's a robot file (fallback only)
        val activeEditor = FileEditorManager.getInstance(project).selectedTextEditor
        val activeFile = activeEditor?.virtualFile
        if (activeFile != null && isRobotFrameworkFile(activeFile.path)) {
            return activeFile.path
        }
        
        return null
    }
    
    /**
     * Lock the current target file
     */
    fun lockTargetFile(filePath: String) {
        lockedTargetFile = filePath
        isTargetLocked = true
        updateTreeViewTitle()
    }
    
    /**
     * Unlock the target file
     */
    fun unlockTargetFile() {
        lockedTargetFile = null
        isTargetLocked = false
        updateTreeViewTitle()
    }
    
    /**
     * Check if target is currently locked
     */
    fun isLocked(): Boolean {
        return isTargetLocked
    }
    
    /**
     * Get the original target file path
     */
    fun getOriginalTargetFile(): String? {
        return originalTargetFile
    }
    
    /**
     * Get the locked target file path
     */
    fun getLockedTargetFile(): String? {
        return lockedTargetFile
    }
    
    /**
     * Navigate to the target file in the editor
     */
    fun goToTargetFile(project: Project) {
        val targetPath = getTargetFile(project) ?: return
        
        val virtualFile = LocalFileSystem.getInstance().findFileByPath(targetPath)
        if (virtualFile != null) {
            FileEditorManager.getInstance(project).openFile(virtualFile, true)
        }
    }
    
    /**
     * Update tree view title to show target file
     */
    private fun updateTreeViewTitle() {
        if (lockedTargetFile != null) {
            val fileName = File(lockedTargetFile!!).name
            titleUpdateCallback?.invoke(fileName)
        } else {
            titleUpdateCallback?.invoke(null)
        }
    }
    
    /**
     * Check if a file is a Robot Framework file
     */
    private fun isRobotFrameworkFile(filePath: String): Boolean {
        return filePath.endsWith(".robot", ignoreCase = true) ||
               filePath.endsWith(".resource", ignoreCase = true)
    }
}
