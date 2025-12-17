# Robot Framework Toolkit

A powerful VSCode extension that adds context menu options to quickly create Robot Framework files with predefined templates and manage imports efficiently.

## ✨ Features

Right-click on any folder in the Explorer to see the following options:

### 📄 File Creation
- **Create Robot Framework Test File** (`.robot`)
  - Creates a file with `*** Settings ***` and `*** Test Cases ***` sections

- **Create Robot Framework Resource File** (`.resource`)
  - Creates a file with `*** Settings ***` and `*** Keywords ***` sections

- **Create Robot Framework Variables File** (`.resource`)
  - Creates a file with `*** Settings ***` and `*** Variables ***` sections

- **Create Robot Framework Locators File** (`.py`)
  - Creates an empty Python file for locators

### 🔧 Import Management
- **Edit Robot Framework Imports** (on `.robot` and `.resource` files)
  - Browse all importable files in a unified view (no more separate Python/Resource sections)
  - Select files to import as Libraries, Resources, or Variables
  - Preserve and pre-select existing imports
  - Choose between relative paths or workspace paths
  - Collapsible folder structure for easy navigation
  - Search functionality to quickly find desired files
  - Context-aware suggestions based on file content
  - Visual progress indicators during scanning

## 🚀 Quick Start

### Installation
1. Install from VSCode Extensions Marketplace or build from source
2. Open a Robot Framework project in VSCode

### Creating New Files
1. Open a folder/workspace in VSCode
2. In the Explorer, right-click on any folder
3. Select one of the "Create Robot Framework..." options
4. Enter a filename (without extension)
5. The file will be created and opened automatically

### Managing File Imports
1. Right-click on an existing `.robot` or `.resource` file in VSCode Explorer
2. Select "Edit Robot Framework Imports"
3. Browse the tree view to select files to import
4. Click on files to choose whether to import as Library, Resource, or Variables
5. Use the navigation buttons in the header to manage your selections:
   - Search: Filter files by name or type
   - Clear Search: Show all files again (only visible when search is active)
   - Expand All/Collapse All: Control tree view expansion
   - View File: Right-click to open any file for inspection
   - Confirm Imports: Apply selected imports to the target file (only visible when changes are pending)
   - Cancel: Close without making changes (only visible when changes are pending)
6. Click "Confirm Imports" to update the file or "Cancel" to abort

## 🎯 Advanced Features

### Dedicated Sidebar View
- The extension now has its own dedicated view in the activity bar with the title "Robot Framework Toolkit"
- Always visible and accessible with enhanced icons and navigation options
- Shows "All Importable Files" and "Current Imports" sections

### Target File Locking
- **Automatic Locking**: When you click "View File" on any importable file, the current target file (the one you're editing imports for) is automatically locked
- **Preserve Context**: While browsing and viewing other files, the import management remains focused on your target file
- **Go to Target Button**: A "Go to Target File" button appears in the navigation bar when a target is locked, allowing you to quickly return to your original file
- **Automatic Unlocking**: The system automatically unlocks when you return to your locked target file or switch to a different robot file

### Import Organization
- **Current Imports Section**: Shows existing imports in the file with appropriate icons (Library, Resource, Variables)
- **All Importable Files Section**: Displays all available files for import in a collapsible folder structure
- **Import Type Selection**: Click on files to choose whether to import as Library, Resource, or Variables
- **Checkboxes**: Visual indication of selected imports with checkboxes to toggle selection

### Smart UI Features
- **Smart Button Visibility**: Buttons appear contextually based on current state
  - *Confirm/Clear* buttons only show when you have pending import selections
  - *Clear Search* button only shows when an active search is in progress
- **Search Functionality**: Quickly filter and find desired files using the search feature
- **Expand All/Collapse All**: Expand or collapse all tree nodes at once
- **Refresh Button**: Refresh both import lists to reflect any changes in the workspace or file
- **Import Management**: Right-click on current imports to manage them:
  - *View File*: Open and view the imported file directly
  - *Delete Import*: Remove an import from the target file (with confirmation)
  - *View Keywords*: Show keywords from the imported file and insert them into your current file
- **View File**: Right-click on any file to view its content directly

## 📋 Requirements

- VSCode 1.74.0 or higher

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT - see the [LICENSE](LICENSE) file for details.