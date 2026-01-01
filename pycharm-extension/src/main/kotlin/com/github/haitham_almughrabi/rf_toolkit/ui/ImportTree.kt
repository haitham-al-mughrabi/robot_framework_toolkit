package com.github.haitham_almughrabi.rf_toolkit.ui

import com.github.haitham_almughrabi.rf_toolkit.logic.ImportType
import com.intellij.icons.AllIcons
import com.intellij.ui.CheckboxTree
import com.intellij.ui.CheckedTreeNode
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.ui.JBUI
import javax.swing.Icon
import javax.swing.JTree
import javax.swing.tree.DefaultTreeModel

class ImportTree : CheckboxTree(
    object : CheckboxTreeCellRenderer(true) {
        override fun customizeRenderer(
            tree: JTree?,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ) {
            if (value is ImportNode) {
                val renderer = textRenderer
                renderer.icon = value.icon
                renderer.append(value.label)
                
                // Show selected import type or available options
                if (value.isFile) {
                    val description = buildString {
                        if (value.selectedImportType != null) {
                            append("  → ${value.selectedImportType}")
                        } else if (value.availableImportTypes.isNotEmpty()) {
                            append("  (${value.availableImportTypes.joinToString(" | ")})")
                        }
                        
                        // Add suggested indicator
                        if (value.isSuggested) {
                            append(" ⭐")
                        }
                        
                        // Add currently viewed indicator
                        if (value.isCurrentlyViewed) {
                            append(" ●")
                        }
                    }
                    
                    if (description.isNotEmpty()) {
                        renderer.append(description, SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    }
                } else if (value.description.isNotEmpty()) {
                    renderer.append("  ")
                    renderer.append(value.description, SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
            } else if (value is CheckedTreeNode) {
                val renderer = textRenderer
                renderer.icon = AllIcons.Nodes.Folder
                renderer.append(value.userObject?.toString() ?: "", SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
            }
        }
    },
    CheckedTreeNode()
) {
    fun updateTree(root: CheckedTreeNode) {
        (model as DefaultTreeModel).setRoot(root)
    }
}

class ImportNode(
    val label: String,
    val description: String = "",
    val filePath: String? = null,
    val isFile: Boolean = false,
    val availableImportTypes: List<ImportType> = emptyList(),
    var selectedImportType: ImportType? = null,
    var isSuggested: Boolean = false,
    var isCurrentlyViewed: Boolean = false,
    val icon: Icon? = null
) : CheckedTreeNode(label)

