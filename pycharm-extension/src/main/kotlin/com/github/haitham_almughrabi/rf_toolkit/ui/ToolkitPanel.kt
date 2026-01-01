package com.github.haitham_almughrabi.rf_toolkit.ui

import com.github.haitham_almughrabi.rf_toolkit.logic.*
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.icons.AllIcons
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.CheckboxTreeListener
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.io.File
import javax.swing.*
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.tree.TreePath

class ToolkitPanel(private val project: Project) : SimpleToolWindowPanel(true, true) {

    private val importTree = ImportTree()
    private val statusLabel = JBLabel("Ready")
    private val searchField = SearchTextField()
    private var allFiles: List<com.intellij.openapi.vfs.VirtualFile> = emptyList()
    private var existingImports: List<ExistingImport> = emptyList()
    private var suggestedFiles: Set<String> = emptySet()
    private var currentTargetFile: String? = null
    private var hasPendingChanges: Boolean = false
    private var originalSelections: Map<String, Pair<Boolean, ImportType?>> = emptyMap()
    private var titleLabel: JBLabel? = null

    // Button references for context-aware UI
    private var lockButton: JButton? = null
    private var unlockButton: JButton? = null
    private var cancelButton: JButton? = null
    private var confirmButton: JButton? = null
    private var clearSearchButton: JButton? = null
    
    init {
        val rootPanel = JPanel(BorderLayout())
        rootPanel.border = JBUI.Borders.empty(5)

        // Title bar
        val titlePanel = JPanel(BorderLayout())
        titlePanel.border = JBUI.Borders.empty(5, 0)
        titleLabel = JBLabel("Import Libraries & Resources")
        titleLabel!!.font = titleLabel!!.font.deriveFont(14f)
        titlePanel.add(titleLabel!!, BorderLayout.WEST)
        rootPanel.add(titlePanel, BorderLayout.NORTH)

        // Toolbar - organized in two rows to ensure all buttons are visible
        val toolbarContainer = JPanel(BorderLayout())

        // First row: File operations
        val toolbar1 = JPanel(FlowLayout(FlowLayout.LEFT, 5, 2))

        val refreshButton = JButton("Refresh")
        refreshButton.addActionListener { refreshTree() }
        toolbar1.add(refreshButton)

        val goToTargetButton = JButton("Go to Target")
        goToTargetButton.addActionListener {
            TargetFileManager.goToTargetFile(project)
        }
        toolbar1.add(goToTargetButton)

        lockButton = JButton("Lock Target")
        lockButton!!.addActionListener {
            val targetFile = TargetFileManager.getTargetFile(project)
            if (targetFile != null) {
                TargetFileManager.lockTargetFile(targetFile)
                updateTitle()
                updateButtonStates()
                statusLabel.text = "Target file locked"
            }
        }
        toolbar1.add(lockButton!!)

        unlockButton = JButton("Unlock")
        unlockButton!!.addActionListener {
            TargetFileManager.unlockTargetFile()
            updateTitle()
            updateButtonStates()
            statusLabel.text = "Target file unlocked"
        }
        toolbar1.add(unlockButton!!)
        unlockButton!!.isVisible = false  // Initially hidden

        val expandAllButton = JButton("Expand All")
        expandAllButton.addActionListener { expandAll() }
        toolbar1.add(expandAllButton)

        val collapseAllButton = JButton("Collapse All")
        collapseAllButton.addActionListener { collapseAll() }
        toolbar1.add(collapseAllButton)

        // Second row: Import operations
        val toolbar2 = JPanel(FlowLayout(FlowLayout.LEFT, 5, 2))

        val previewButton = JButton("Preview")
        previewButton.addActionListener { previewImports() }
        toolbar2.add(previewButton)

        confirmButton = JButton("Apply Imports")
        confirmButton!!.addActionListener { applyImports() }
        toolbar2.add(confirmButton!!)

        cancelButton = JButton("Cancel")
        cancelButton!!.addActionListener { cancelImports() }
        toolbar2.add(cancelButton!!)
        cancelButton!!.isVisible = false  // Initially hidden

        // Combine toolbars
        val toolbarsPanel = JPanel(BorderLayout())
        toolbarsPanel.add(toolbar1, BorderLayout.NORTH)
        toolbarsPanel.add(toolbar2, BorderLayout.CENTER)
        toolbarContainer.add(toolbarsPanel, BorderLayout.CENTER)

        // Search field with clear button
        val searchPanel = JPanel(BorderLayout())
        searchPanel.border = JBUI.Borders.empty(5, 0)
        searchField.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent?) = filterTree()
            override fun removeUpdate(e: DocumentEvent?) = filterTree()
            override fun changedUpdate(e: DocumentEvent?) = filterTree()
        })

        clearSearchButton = JButton("Clear")
        clearSearchButton!!.addActionListener {
            searchField.text = ""
            filterTree()
            updateButtonStates()
        }
        clearSearchButton!!.isVisible = false  // Initially hidden

        val searchInputPanel = JPanel(BorderLayout())
        searchInputPanel.add(JBLabel("Search: "), BorderLayout.WEST)
        searchInputPanel.add(searchField, BorderLayout.CENTER)
        searchInputPanel.add(clearSearchButton!!, BorderLayout.EAST)
        searchPanel.add(searchInputPanel, BorderLayout.CENTER)

        toolbarContainer.add(searchPanel, BorderLayout.SOUTH)
        rootPanel.add(toolbarContainer, BorderLayout.NORTH)
        
        // Import Tree
        val treePanel = JPanel(BorderLayout())
        treePanel.add(ScrollPaneFactory.createScrollPane(importTree), BorderLayout.CENTER)
        rootPanel.add(treePanel, BorderLayout.CENTER)
        
        // Footer
        val footer = JBPanel<JBPanel<*>>(BorderLayout())
        footer.add(statusLabel, BorderLayout.WEST)
        rootPanel.add(footer, BorderLayout.SOUTH)
        
        setContent(rootPanel)
        
        setupTreeContextMenu()
        setupTreeClickHandler()

        // Initialize file view tracker
        FileViewTracker.initialize(project) {
            updateViewedFileIndicators()
        }

        // Set up title update callback for TargetFileManager
        TargetFileManager.setTitleUpdateCallback { fileName ->
            updateTitle(fileName)
        }

        // Set up file editor listener for automatic import loading
        setupFileEditorListener()

        // Initial load for current file
        refreshTree()
    }
    
    /**
     * Set up automatic file editor listener to detect when user switches between files
     */
    private fun setupFileEditorListener() {
        project.messageBus.connect().subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
                    val newFile = event.newFile
                    if (newFile != null && isRobotFrameworkFile(newFile.path)) {
                        val newFilePath = newFile.path

                        // If locked and user returns to the target file, auto-unlock
                        if (TargetFileManager.isLocked() &&
                            TargetFileManager.getLockedTargetFile() != null &&
                            newFilePath == TargetFileManager.getLockedTargetFile()) {

                            TargetFileManager.unlockTargetFile()
                            updateTitle()
                            updateButtonStates()

                            // Just update the indicators without reloading the tree
                            // This maintains the pending selections in the tree view
                            updateViewedFileIndicators()
                            statusLabel.text = "Returned to target file - unlocked"
                            return
                        }

                        // If locked and user switches to a different robot file, keep the current locked view
                        if (TargetFileManager.isLocked() &&
                            TargetFileManager.getLockedTargetFile() != null &&
                            newFilePath != TargetFileManager.getLockedTargetFile()) {

                            // Just refresh indicators to show which file is currently viewed
                            updateViewedFileIndicators()
                            statusLabel.text = "Viewing: ${newFile.name} (locked to ${File(TargetFileManager.getLockedTargetFile()!!).name})"
                            return
                        }

                        // If not locked, automatically reload imports for the new file
                        if (!TargetFileManager.isLocked()) {
                            currentTargetFile = newFilePath
                            TargetFileManager.setOriginalTargetFile(newFilePath)
                            refreshTree()
                            statusLabel.text = "Loaded imports for ${newFile.name}"
                        }
                    }
                }
            }
        )
    }

    /**
     * Check if a file is a Robot Framework file
     */
    private fun isRobotFrameworkFile(filePath: String): Boolean {
        return filePath.endsWith(".robot", ignoreCase = true) ||
               filePath.endsWith(".resource", ignoreCase = true)
    }

    private fun setupTreeClickHandler() {
        // Override the node check behavior to show import type dialog
        importTree.addCheckboxTreeListener(object : CheckboxTreeListener {
            override fun nodeStateChanged(node: CheckedTreeNode) {
                if (node is ImportNode && node.isFile) {
                    // Save original state before modification
                    if (node.filePath != null && !originalSelections.containsKey(node.filePath)) {
                        originalSelections = originalSelections + (node.filePath to Pair(node.isChecked, node.selectedImportType))
                    }

                    // If the node is being checked and has multiple import types, show dialog
                    if (node.isChecked && node.selectedImportType == null && node.availableImportTypes.isNotEmpty()) {
                        showImportTypeSelectionDialog(node)
                    }

                    hasPendingChanges = true
                    updateButtonStates()
                }
            }
        })
    }
    
    private fun showImportTypeSelectionDialog(node: ImportNode) {
        if (node.availableImportTypes.size == 1) {
            // Only one option, auto-select it
            node.selectedImportType = node.availableImportTypes[0]
            node.isChecked = true
            importTree.repaint()
            updateButtonStates()
            return
        }

        val options = node.availableImportTypes.map { it.name }.toTypedArray()
        val selected = JOptionPane.showInputDialog(
            this,
            "Select import type for ${node.label}:",
            "Import Type",
            JOptionPane.QUESTION_MESSAGE,
            null,
            options,
            node.selectedImportType?.name ?: options[0]
        )

        if (selected != null) {
            node.selectedImportType = ImportType.valueOf(selected as String)
            node.isChecked = true
            importTree.repaint()
            updateButtonStates()
        } else {
            // User cancelled, uncheck the node
            node.isChecked = false
            importTree.repaint()
            updateButtonStates()
        }
    }
    
    private fun setupTreeContextMenu() {
        val menu = JPopupMenu()

        val viewFileItem = JMenuItem("View File")
        viewFileItem.addActionListener {
            val node = importTree.lastSelectedPathComponent as? ImportNode
            if (node?.isFile == true && node.filePath != null) {
                // Auto-lock the current target file before viewing another file
                if (!TargetFileManager.isLocked()) {
                    val targetFile = TargetFileManager.getTargetFile(project)
                    if (targetFile != null) {
                        TargetFileManager.lockTargetFile(targetFile)
                        updateTitle()
                        updateButtonStates()
                    }
                }

                val virtualFile = LocalFileSystem.getInstance().findFileByPath(node.filePath)
                if (virtualFile != null) {
                    FileEditorManager.getInstance(project).openFile(virtualFile, true)
                    statusLabel.text = "Opened: ${virtualFile.name}"
                } else {
                    statusLabel.text = "Error: File not found at ${node.filePath}"
                    JOptionPane.showMessageDialog(
                        this,
                        "File not found: ${node.filePath}",
                        "Error",
                        JOptionPane.ERROR_MESSAGE
                    )
                }
            } else {
                statusLabel.text = "Error: Please select a file node"
                JOptionPane.showMessageDialog(
                    this,
                    "Please right-click on a file (not a folder) to view it.",
                    "Invalid Selection",
                    JOptionPane.WARNING_MESSAGE
                )
            }
        }
        menu.add(viewFileItem)

        val viewKeywordsItem = JMenuItem("View Keywords")
        viewKeywordsItem.addActionListener {
            val node = importTree.lastSelectedPathComponent as? ImportNode
            if (node?.isFile == true && node.filePath != null) {
                try {
                    showKeywordsDialog(node.filePath)
                } catch (e: Exception) {
                    statusLabel.text = "Error viewing keywords: ${e.message}"
                    JOptionPane.showMessageDialog(
                        this,
                        "Error viewing keywords: ${e.message}",
                        "Error",
                        JOptionPane.ERROR_MESSAGE
                    )
                }
            } else {
                statusLabel.text = "Error: Please select a file node"
                JOptionPane.showMessageDialog(
                    this,
                    "Please right-click on a file (not a folder) to view keywords.",
                    "Invalid Selection",
                    JOptionPane.WARNING_MESSAGE
                )
            }
        }
        menu.add(viewKeywordsItem)
        
        val deleteImportItem = JMenuItem("Delete Import")
        deleteImportItem.addActionListener {
            val node = importTree.lastSelectedPathComponent as? ImportNode
            if (node != null && existingImports.any { it.path == node.label }) {
                deleteImport(node)
            }
        }
        menu.add(deleteImportItem)
        
        importTree.componentPopupMenu = menu
    }
    
    private fun showKeywordsDialog(filePath: String) {
        val file = File(filePath)
        if (!file.exists()) {
            statusLabel.text = "File not found: ${file.name}"
            return
        }

        val content = file.readText()
        val keywords = when {
            file.name.endsWith(".py", ignoreCase = true) -> {
                ToolkitParser.extractKeywordsFromPython(content)
            }
            file.name.endsWith(".robot", ignoreCase = true) ||
            file.name.endsWith(".resource", ignoreCase = true) -> {
                ToolkitParser.extractKeywordsFromRobot(content)
            }
            else -> {
                statusLabel.text = "Unsupported file type: ${file.name}"
                emptyList()
            }
        }

        if (keywords.isEmpty()) {
            JOptionPane.showMessageDialog(
                this,
                "No keywords found in ${file.name}",
                "View Keywords",
                JOptionPane.INFORMATION_MESSAGE
            )
            return
        }

        val editor = FileEditorManager.getInstance(project).selectedTextEditor
        val dialog = KeywordViewerDialog(project, keywords, file.name, editor)
        dialog.show()
    }
    
    private fun expandAll() {
        for (i in 0 until importTree.rowCount) {
            importTree.expandRow(i)
        }
    }
    
    private fun collapseAll() {
        for (i in importTree.rowCount - 1 downTo 0) {
            importTree.collapseRow(i)
        }
    }
    
    private fun refreshTree() {
        statusLabel.text = "Scanning..."
        allFiles = ProjectScanner.findImportableFiles(project)

        // Get current target file
        val editor = FileEditorManager.getInstance(project).selectedTextEditor
        val activeFilePath = editor?.virtualFile?.path

        // If currentTargetFile is not set yet, set it to the active file (initial load)
        if (currentTargetFile == null && activeFilePath != null && isRobotFrameworkFile(activeFilePath)) {
            currentTargetFile = activeFilePath
            TargetFileManager.setOriginalTargetFile(activeFilePath)
        }

        // Use the current target file if set, otherwise fall back to active editor
        currentTargetFile = currentTargetFile ?: activeFilePath

        // Parse existing imports from the target file (not necessarily the active editor)
        existingImports = if (currentTargetFile != null) {
            val targetFile = File(currentTargetFile!!)
            if (targetFile.exists()) {
                val content = targetFile.readText()
                ToolkitParser.parseExistingImports(content)
            } else {
                emptyList()
            }
        } else if (editor != null) {
            ToolkitParser.parseExistingImports(editor.document.text)
        } else {
            emptyList()
        }

        // Get import suggestions based on target file content
        if (currentTargetFile != null) {
            val targetFile = File(currentTargetFile!!)
            if (targetFile.exists()) {
                val content = targetFile.readText()
                val pyFiles = allFiles.filter { it.name.endsWith(".py") }
                val resourceFiles = allFiles.filter {
                    it.name.endsWith(".robot") || it.name.endsWith(".resource")
                }
                suggestedFiles = ImportSuggester.suggestImports(
                    content,
                    pyFiles,
                    resourceFiles
                )
            }
        } else if (editor != null) {
            val pyFiles = allFiles.filter { it.name.endsWith(".py") }
            val resourceFiles = allFiles.filter {
                it.name.endsWith(".robot") || it.name.endsWith(".resource")
            }
            suggestedFiles = ImportSuggester.suggestImports(
                editor.document.text,
                pyFiles,
                resourceFiles
            )
        }

        filterTree()
    }
    
    private fun filterTree() {
        val query = searchField.text.lowercase()
        val root = CheckedTreeNode("Root")
        val projectBaseDir = project.baseDir

        // Update clear search button visibility
        updateButtonStates()

        // Current Imports Section
        if (existingImports.isNotEmpty()) {
            val existingRoot = CheckedTreeNode("Current Imports (${existingImports.size})")
            existingImports.forEach { imp ->
                if (imp.path.lowercase().contains(query)) {
                    val importType = when (imp.type.lowercase()) {
                        "library" -> ImportType.Library
                        "resource" -> ImportType.Resource
                        "variables" -> ImportType.Variables
                        else -> ImportType.Library
                    }

                    val node = ImportNode(
                        label = imp.path,
                        description = "",
                        filePath = null,
                        isFile = true,
                        availableImportTypes = listOf(importType),
                        selectedImportType = importType,
                        icon = if (imp.type.equals("Library", ignoreCase = true)) AllIcons.Nodes.Class else AllIcons.FileTypes.Text
                    )
                    node.isChecked = true
                    existingRoot.add(node)
                }
            }
            if (existingRoot.childCount > 0) root.add(existingRoot)
        }

        // Suggested Files Section (if any)
        val suggestedFilesList = allFiles.filter { file ->
            suggestedFiles.contains(file.path) && file.name.lowercase().contains(query)
        }

        if (suggestedFilesList.isNotEmpty()) {
            val suggestedRoot = CheckedTreeNode("Suggested Files ⭐ (${suggestedFilesList.size})")
            suggestedFilesList.forEach { file ->
                val availableTypes = getAvailableImportTypes(file)
                val node = createFileNode(file, projectBaseDir, availableTypes)
                suggestedRoot.add(node)
            }
            root.add(suggestedRoot)
        }

        // All Available Files Section with directory tree structure
        val filteredFiles = allFiles.filter { file ->
            file.name.lowercase().contains(query) &&
            file.path != currentTargetFile  // Don't show current file
        }

        if (filteredFiles.isNotEmpty()) {
            val allFilesRoot = CheckedTreeNode("All Importable Files (${filteredFiles.size})")
            buildDirectoryTree(filteredFiles, allFilesRoot, projectBaseDir)
            root.add(allFilesRoot)
        }

        importTree.updateTree(root)
        updateViewedFileIndicators()
        statusLabel.text = "Found ${allFiles.size} importable files"
    }

    /**
     * Build a directory tree structure for files
     */
    private fun buildDirectoryTree(
        files: List<com.intellij.openapi.vfs.VirtualFile>,
        parentNode: CheckedTreeNode,
        projectBaseDir: com.intellij.openapi.vfs.VirtualFile?
    ) {
        // Map to track folder nodes
        val folderMap = mutableMapOf<String, CheckedTreeNode>()

        for (file in files) {
            val relativePath = if (projectBaseDir != null) {
                VfsUtilCore.getRelativePath(file, projectBaseDir, '/') ?: file.name
            } else {
                file.name
            }

            val parts = relativePath.split('/')
            val fileName = parts.last()
            val folderParts = parts.dropLast(1)

            // Build folder hierarchy
            var currentParent = parentNode
            var currentPath = ""

            for (folderName in folderParts) {
                currentPath = if (currentPath.isEmpty()) folderName else "$currentPath/$folderName"

                if (!folderMap.containsKey(currentPath)) {
                    val folderNode = CheckedTreeNode(folderName)
                    folderMap[currentPath] = folderNode
                    currentParent.add(folderNode)
                }
                currentParent = folderMap[currentPath]!!
            }

            // Add file node
            val availableTypes = getAvailableImportTypes(file)
            val fileNode = createFileNode(file, projectBaseDir, availableTypes)
            currentParent.add(fileNode)
        }

        // Sort folders and files alphabetically
        sortTreeNode(parentNode)
    }

    /**
     * Sort tree node children: folders first, then files, both alphabetically
     */
    private fun sortTreeNode(node: CheckedTreeNode) {
        if (node.childCount == 0) return

        val children = mutableListOf<CheckedTreeNode>()
        for (i in 0 until node.childCount) {
            children.add(node.getChildAt(i) as CheckedTreeNode)
        }

        // Separate folders from files
        val folders = children.filter { it !is ImportNode }
        val files = children.filter { it is ImportNode }

        // Sort both alphabetically
        val sortedFolders = folders.sortedBy { it.userObject.toString().lowercase() }
        val sortedFiles = files.sortedBy { (it as ImportNode).label.lowercase() }

        // Clear and re-add in sorted order
        node.removeAllChildren()
        sortedFolders.forEach { node.add(it) }
        sortedFiles.forEach { node.add(it) }

        // Recursively sort children in folders
        for (folder in sortedFolders) {
            sortTreeNode(folder)
        }
    }

    /**
     * Get available import types based on file extension
     */
    private fun getAvailableImportTypes(file: com.intellij.openapi.vfs.VirtualFile): List<ImportType> {
        return when {
            file.name.endsWith(".py") -> listOf(ImportType.Library, ImportType.Variables)
            file.name.endsWith(".robot") -> listOf(ImportType.Resource, ImportType.Variables)
            file.name.endsWith(".resource") -> listOf(ImportType.Resource, ImportType.Variables)
            else -> listOf(ImportType.Library, ImportType.Resource, ImportType.Variables)
        }
    }
    
    private fun createFileNode(
        file: com.intellij.openapi.vfs.VirtualFile,
        projectBaseDir: com.intellij.openapi.vfs.VirtualFile?,
        availableTypes: List<ImportType>
    ): ImportNode {
        val relativePath = if (projectBaseDir != null) {
            VfsUtilCore.getRelativePath(file, projectBaseDir, '/') ?: file.name
        } else {
            file.name
        }
        
        // Check if already imported
        val alreadyImported = existingImports.any { 
            it.path.endsWith(relativePath) || relativePath.endsWith(it.path)
        }
        
        val icon = if (file.name.endsWith(".py")) AllIcons.Nodes.Class else AllIcons.FileTypes.Text
        
        val node = ImportNode(
            label = file.name,
            description = "",
            filePath = file.path,
            isFile = true,
            availableImportTypes = availableTypes,
            selectedImportType = if (alreadyImported) availableTypes[0] else null,
            isSuggested = suggestedFiles.contains(file.path),
            isCurrentlyViewed = FileViewTracker.isFileCurrentlyViewed(file.path),
            icon = icon
        )
        
        node.isChecked = alreadyImported
        return node
    }
    
    private fun updateViewedFileIndicators() {
        // Update all nodes to reflect current view state
        val root = importTree.model.root as? CheckedTreeNode ?: return
        updateNodeViewState(root)
        importTree.repaint()
    }
    
    private fun updateNodeViewState(node: CheckedTreeNode) {
        if (node is ImportNode && node.filePath != null) {
            node.isCurrentlyViewed = FileViewTracker.isFileCurrentlyViewed(node.filePath)
        }
        
        for (i in 0 until node.childCount) {
            updateNodeViewState(node.getChildAt(i) as CheckedTreeNode)
        }
    }
    
    private fun deleteImport(node: ImportNode) {
        val targetFilePath = TargetFileManager.getTargetFile(project) ?: currentTargetFile ?: return
        val virtualFile = LocalFileSystem.getInstance().findFileByPath(targetFilePath) ?: return

        val confirm = JOptionPane.showConfirmDialog(
            this,
            "Remove import '${node.label}'?",
            "Confirm Delete",
            JOptionPane.YES_NO_OPTION
        )

        if (confirm == JOptionPane.YES_OPTION) {
            WriteCommandAction.runWriteCommandAction(project) {
                // Read current file content
                val targetFile = File(targetFilePath)
                val text = targetFile.readText()
                val lines = text.lines().toMutableList()
                val updatedLines = lines.filter { line ->
                    val trimmed = line.trim()
                    !trimmed.contains(Regex("(Library|Resource|Variables)\\s+${Regex.escape(node.label)}"))
                }

                // Write back to file
                targetFile.writeText(updatedLines.joinToString("\n"))

                // Refresh the document in editor if it's open
                val editor = FileEditorManager.getInstance(project).selectedTextEditor
                if (editor?.virtualFile?.path == targetFilePath) {
                    editor.document.setText(updatedLines.joinToString("\n"))
                }
            }
            refreshTree()
        }
    }
    
    private fun applyImports() {
        // Use the target file (locked or current) instead of just the active editor
        val targetFilePath = TargetFileManager.getTargetFile(project) ?: currentTargetFile ?: run {
            statusLabel.text = "No target file"
            return
        }

        val virtualFile = LocalFileSystem.getInstance().findFileByPath(targetFilePath) ?: run {
            statusLabel.text = "Target file not found"
            return
        }
        
        val selectedNodes = mutableListOf<ImportNode>()
        val root = importTree.model.root as CheckedTreeNode
        
        fun collectChecked(node: CheckedTreeNode) {
            if (node is ImportNode && node.isChecked && node.isFile && node.selectedImportType != null) {
                selectedNodes.add(node)
            }
            for (i in 0 until node.childCount) {
                collectChecked(node.getChildAt(i) as CheckedTreeNode)
            }
        }
        
        collectChecked(root)
        
        val projectBaseDir = project.baseDir
        val imports = selectedNodes.mapNotNull { node ->
            val selectedType = node.selectedImportType
            if (node.filePath == null || selectedType == null) return@mapNotNull null
            
            val nodeFile = LocalFileSystem.getInstance().findFileByPath(node.filePath)
            val path = if (projectBaseDir != null && nodeFile != null) {
                VfsUtilCore.getRelativePath(nodeFile, projectBaseDir, '/') ?: node.label
            } else {
                node.label
            }
            
            ExistingImport(selectedType.name, path)
        }
        
        ImportManager.updateImports(project, virtualFile, imports)
        hasPendingChanges = false
        originalSelections = emptyMap()
        refreshTree()
        updateButtonStates()
        statusLabel.text = "Applied ${imports.size} imports"
    }

    /**
     * Update the title to show the locked target file
     */
    private fun updateTitle(fileName: String? = null) {
        titleLabel?.text = if (fileName != null) {
            "Import Libraries & Resources ($fileName)"
        } else {
            "Import Libraries & Resources"
        }
    }

    /**
     * Cancel pending import changes and restore original selections
     */
    private fun cancelImports() {
        val root = importTree.model.root as? CheckedTreeNode ?: return

        // Restore original selections
        fun restoreSelections(node: CheckedTreeNode) {
            if (node is ImportNode && node.filePath != null) {
                val original = originalSelections[node.filePath]
                if (original != null) {
                    node.isChecked = original.first
                    node.selectedImportType = original.second
                }
            }
            for (i in 0 until node.childCount) {
                restoreSelections(node.getChildAt(i) as CheckedTreeNode)
            }
        }

        restoreSelections(root)
        hasPendingChanges = false
        originalSelections = emptyMap()
        importTree.repaint()
        updateButtonStates()
        statusLabel.text = "Changes cancelled"
    }

    /**
     * Preview the imports that will be applied
     */
    private fun previewImports() {
        val selectedNodes = mutableListOf<ImportNode>()
        val root = importTree.model.root as CheckedTreeNode

        fun collectChecked(node: CheckedTreeNode) {
            if (node is ImportNode && node.isChecked && node.isFile && node.selectedImportType != null) {
                selectedNodes.add(node)
            }
            for (i in 0 until node.childCount) {
                collectChecked(node.getChildAt(i) as CheckedTreeNode)
            }
        }

        collectChecked(root)

        if (selectedNodes.isEmpty()) {
            JOptionPane.showMessageDialog(
                this,
                "No imports selected to preview.",
                "Preview Imports",
                JOptionPane.INFORMATION_MESSAGE
            )
            return
        }

        val projectBaseDir = project.baseDir
        val previewText = buildString {
            append("*** Settings ***\n")
            selectedNodes.forEach { node ->
                val selectedType = node.selectedImportType ?: return@forEach
                val nodeFile = LocalFileSystem.getInstance().findFileByPath(node.filePath ?: return@forEach)
                val path = if (projectBaseDir != null && nodeFile != null) {
                    VfsUtilCore.getRelativePath(nodeFile, projectBaseDir, '/') ?: node.label
                } else {
                    node.label
                }
                append("${selectedType.name}    $path\n")
            }
        }

        val textArea = JTextArea(previewText)
        textArea.isEditable = false
        textArea.rows = 15
        textArea.columns = 50

        JOptionPane.showMessageDialog(
            this,
            JScrollPane(textArea),
            "Import Preview (${selectedNodes.size} imports)",
            JOptionPane.INFORMATION_MESSAGE
        )
    }

    /**
     * Update button visibility based on current state
     */
    private fun updateButtonStates() {
        // Show/hide lock/unlock buttons based on locked state
        val isLocked = TargetFileManager.isLocked()
        lockButton?.isVisible = !isLocked
        unlockButton?.isVisible = isLocked

        // Show/hide cancel button based on pending changes
        cancelButton?.isVisible = hasPendingChanges

        // Show/hide clear search button based on search text
        val hasSearchText = searchField.text.isNotEmpty()
        clearSearchButton?.isVisible = hasSearchText

        // Force toolbar to repaint to reflect visibility changes
        lockButton?.parent?.revalidate()
        lockButton?.parent?.repaint()
    }
}
