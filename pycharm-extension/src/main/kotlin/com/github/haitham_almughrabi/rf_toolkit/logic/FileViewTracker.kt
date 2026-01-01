package com.github.haitham_almughrabi.rf_toolkit.logic

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Paths

/**
 * Tracks currently viewed files in the editor to show indicators in the import tree.
 * Handles multiple editors including split views.
 */
object FileViewTracker {
    
    private val currentlyViewedFiles = mutableSetOf<String>()
    private var updateCallback: (() -> Unit)? = null
    
    /**
     * Initialize the file view tracker for a project
     */
    fun initialize(project: Project, onUpdate: () -> Unit) {
        updateCallback = onUpdate
        
        // Initial update with currently open files
        updateCurrentlyViewedFiles(project)
        
        // Listen for editor changes
        project.messageBus.connect().subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    updateCurrentlyViewedFiles(project)
                }
                
                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    updateCurrentlyViewedFiles(project)
                }
                
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    updateCurrentlyViewedFiles(event.manager.project)
                }
            }
        )
    }
    
    /**
     * Update the set of currently viewed files
     */
    private fun updateCurrentlyViewedFiles(project: Project) {
        currentlyViewedFiles.clear()
        
        val fileEditorManager = FileEditorManager.getInstance(project)
        
        // Get all open files (includes split views)
        val openFiles = fileEditorManager.openFiles
        for (file in openFiles) {
            // Normalize path for consistent tracking
            val normalizedPath = Paths.get(file.path).normalize().toString()
            currentlyViewedFiles.add(normalizedPath)
        }
        
        // Notify listeners that the view state has changed
        updateCallback?.invoke()
    }
    
    /**
     * Check if a file path is currently being viewed
     */
    fun isFileCurrentlyViewed(filePath: String): Boolean {
        val normalizedPath = Paths.get(filePath).normalize().toString()
        return currentlyViewedFiles.contains(normalizedPath)
    }
    
    /**
     * Get all currently viewed files
     */
    fun getCurrentlyViewedFiles(): Set<String> {
        return currentlyViewedFiles.toSet()
    }
    
    /**
     * Manually add a file to the currently viewed tracking
     */
    fun addCurrentlyViewedFile(filePath: String) {
        val normalizedPath = Paths.get(filePath).normalize().toString()
        currentlyViewedFiles.add(normalizedPath)
        updateCallback?.invoke()
    }
    
    /**
     * Manually remove a file from the currently viewed tracking
     */
    fun removeCurrentlyViewedFile(filePath: String) {
        val normalizedPath = Paths.get(filePath).normalize().toString()
        currentlyViewedFiles.remove(normalizedPath)
        updateCallback?.invoke()
    }
}
