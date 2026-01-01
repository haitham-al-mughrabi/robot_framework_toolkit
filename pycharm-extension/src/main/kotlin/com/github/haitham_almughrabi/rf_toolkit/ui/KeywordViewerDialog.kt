package com.github.haitham_almughrabi.rf_toolkit.ui

import com.github.haitham_almughrabi.rf_toolkit.logic.ExtractedKeyword
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBLabel
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.*
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/**
 * Enhanced dialog for viewing and inserting keywords from a selected file
 */
class KeywordViewerDialog(
    private val project: Project,
    private val keywords: List<ExtractedKeyword>,
    private val fileName: String,
    private val editor: Editor?
) : DialogWrapper(project) {

    private var filteredKeywords = keywords
    private val keywordListModel = DefaultListModel<String>()
    private val keywordList = JBList(keywordListModel)
    private val detailsArea = JTextArea()
    private val searchField = SearchTextField()

    init {
        title = "Keywords from $fileName (${keywords.size} keywords)"
        init()
        updateKeywordList()
        
        // Set up search field listener
        searchField.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent?) = filterKeywords()
            override fun removeUpdate(e: DocumentEvent?) = filterKeywords()
            override fun changedUpdate(e: DocumentEvent?) = filterKeywords()
        })

        // Set up list selection listener
        keywordList.addListSelectionListener {
            if (!it.valueIsAdjusting) {
                val selectedIndex = keywordList.selectedIndex
                if (selectedIndex >= 0 && selectedIndex < filteredKeywords.size) {
                    showKeywordDetails(filteredKeywords[selectedIndex])
                }
            }
        }

        // Select first keyword by default
        if (filteredKeywords.isNotEmpty()) {
            keywordList.selectedIndex = 0
        }
    }

    /**
     * Filter keywords based on search text
     */
    private fun filterKeywords() {
        val searchText = searchField.text.lowercase()
        filteredKeywords = if (searchText.isEmpty()) {
            keywords
        } else {
            keywords.filter { it.name.lowercase().contains(searchText) }
        }
        updateKeywordList()
        title = "Keywords from $fileName (${filteredKeywords.size} of ${keywords.size} keywords)"

        // Select first keyword if available
        if (filteredKeywords.isNotEmpty()) {
            keywordList.selectedIndex = 0
        }
    }

    /**
     * Update the keyword list with current filtered keywords
     */
    private fun updateKeywordList() {
        keywordListModel.clear()
        filteredKeywords.forEach { keyword ->
            val displayText = if (keyword.args.isNotEmpty()) {
                "${keyword.name} (${keyword.args.size} args)"
            } else {
                keyword.name
            }
            keywordListModel.addElement(displayText)
        }
    }
    
    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout(10, 10))
        panel.preferredSize = Dimension(700, 500)

        // Left side: keyword list with search
        val listPanel = JPanel(BorderLayout())
        listPanel.border = BorderFactory.createTitledBorder("Keywords")

        // Search panel
        val searchPanel = JPanel(BorderLayout())
        searchPanel.add(JBLabel("Search: "), BorderLayout.WEST)
        searchPanel.add(searchField, BorderLayout.CENTER)
        listPanel.add(searchPanel, BorderLayout.NORTH)

        listPanel.add(JBScrollPane(keywordList), BorderLayout.CENTER)

        // Right side: keyword details
        val detailsPanel = JPanel(BorderLayout())
        detailsPanel.border = BorderFactory.createTitledBorder("Keyword Information")
        detailsArea.isEditable = false
        detailsArea.lineWrap = true
        detailsArea.wrapStyleWord = true
        detailsArea.font = detailsArea.font.deriveFont(12f)
        detailsPanel.add(JBScrollPane(detailsArea), BorderLayout.CENTER)

        // Split pane
        val splitPane = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, listPanel, detailsPanel)
        splitPane.dividerLocation = 300
        panel.add(splitPane, BorderLayout.CENTER)

        return panel
    }
    
    override fun createActions(): Array<Action> {
        val insertWithArgsAction = object : DialogWrapperAction("Insert with Arguments") {
            override fun doAction(e: java.awt.event.ActionEvent?) {
                insertSelectedKeyword(withArgs = true)
                close(OK_EXIT_CODE)
            }
        }

        val insertOnlyNameAction = object : DialogWrapperAction("Insert Name Only") {
            override fun doAction(e: java.awt.event.ActionEvent?) {
                insertSelectedKeyword(withArgs = false)
                close(OK_EXIT_CODE)
            }
        }

        return arrayOf(insertWithArgsAction, insertOnlyNameAction, cancelAction)
    }
    
    private fun showKeywordDetails(keyword: ExtractedKeyword) {
        val details = buildString {
            append("═══════════════════════════════════════\n")
            append("KEYWORD: ${keyword.name}\n")
            append("═══════════════════════════════════════\n\n")

            if (keyword.args.isNotEmpty()) {
                append("ARGUMENTS (${keyword.args.size}):\n")
                append("───────────────────────────────────────\n")
                keyword.args.forEachIndexed { index, arg ->
                    append("  ${index + 1}. $arg\n")
                }
                append("\n")
            } else {
                append("ARGUMENTS: None\n\n")
            }

            append("DOCUMENTATION:\n")
            append("───────────────────────────────────────\n")
            if (keyword.doc.isNotEmpty()) {
                append(keyword.doc)
            } else {
                append("No documentation available for this keyword.")
            }
            append("\n\n")

            // Add usage example
            if (keyword.args.isNotEmpty()) {
                append("USAGE EXAMPLE:\n")
                append("───────────────────────────────────────\n")
                append("${keyword.name}    ${keyword.args.joinToString("    ") { "[${it}]" }}\n")
            }
        }

        detailsArea.text = details
    }

    private fun insertSelectedKeyword(withArgs: Boolean = true) {
        val selectedIndex = keywordList.selectedIndex
        if (selectedIndex < 0 || selectedIndex >= filteredKeywords.size || editor == null) {
            return
        }

        val keyword = filteredKeywords[selectedIndex]
        val textToInsert = if (withArgs && keyword.args.isNotEmpty()) {
            // Insert with argument placeholders
            "${keyword.name}    ${keyword.args.joinToString("    ") { "[${it}]" }}"
        } else {
            // Insert only the keyword name
            keyword.name
        }

        WriteCommandAction.runWriteCommandAction(project) {
            val document = editor.document
            val offset = editor.caretModel.offset
            document.insertString(offset, textToInsert)
            editor.caretModel.moveToOffset(offset + textToInsert.length)
        }
    }
}
