package com.github.haitham_almughrabi.rf_toolkit.logic

data class ExtractedKeyword(
    val name: String,
    val args: List<String> = emptyList(),
    val doc: String = ""
)

data class ExistingImport(
    val type: String, // Library, Resource, Variables
    val path: String
)

enum class ImportType {
    Library, Resource, Variables
}

/**
 * Represents a file in the import tree with all its metadata
 */
data class FileItem(
    val filePath: String,
    val relativePath: String,
    val absolutePath: String,
    val fileExtension: String,
    val availableImportTypes: List<ImportType>,
    var selectedImportType: ImportType? = null,
    var isSuggested: Boolean = false,
    var isCurrentlyViewed: Boolean = false
)

