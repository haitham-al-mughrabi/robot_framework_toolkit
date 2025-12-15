# Robot Framework Files Creator

A VSCode extension that adds context menu options to quickly create Robot Framework files with predefined templates and manage imports.

## Features

Right-click on any folder in the Explorer to see the following options:

1. **Create Robot Framework Test File** (`.robot`)
   - Creates a file with `*** Settings ***` and `*** Test Cases ***` sections

2. **Create Robot Framework Resource File** (`.resource`)
   - Creates a file with `*** Settings ***` and `*** Keywords ***` sections

3. **Create Robot Framework Variables File** (`.resource`)
   - Creates a file with `*** Settings ***` and `*** Variables ***` sections

4. **Create Robot Framework Locators File** (`.py`)
   - Creates an empty Python file for locators

5. **Edit Robot Framework Imports** (on `.robot` and `.resource` files)
   - Browse and select files to import as Libraries, Resources, or Variables
   - Preserve and pre-select existing imports
   - Choose between relative paths or workspace paths
   - Collapsible folder structure for easy navigation

## Installation

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press `F5` in VSCode to launch the extension in debug mode

### Package and Install

1. Install vsce: `npm install -g @vscode/vsce`
2. Package the extension: `vsce package`
3. Install the generated `.vsix` file in VSCode

## Usage

### Creating New Files
1. Open a folder/workspace in VSCode
2. In the Explorer, right-click on any folder
3. Select one of the "Create Robot Framework..." options
4. Enter a filename (without extension)
5. The file will be created and opened automatically

### Editing Existing File Imports
1. Right-click on an existing `.robot` or `.resource` file in VSCode Explorer
2. Select "Edit Robot Framework Imports"
3. Browse the tree view to select files to import
4. Click on files to choose whether to import as Library, Resource, or Variables
5. Select "Confirm Imports" to update the file or "Cancel" to abort

## File Templates

### Test File (.robot)
```robot
*** Settings ***


*** Test Cases ***
```

### Resource File (.resource)
```robot
*** Settings ***


*** Keywords ***
```

### Variables File (.resource)
```robot
*** Settings ***


*** Variables ***
```

### Locators File (.py)
Empty file ready for your Python locator definitions.

## Import Selection Features

- **File Filtering**: Only shows files in allowed project folders (Libraries, Tests, Utilities, Resources, POM, etc.)
- **Import Type Selection**: Choose to import files as Library, Resource, or Variables
- **Path Options**: Select between relative paths or workspace paths
- **Preserve Existing**: Existing imports are pre-selected when editing
- **Collapsible Folders**: Folder structure is collapsed by default for easier navigation

## Requirements

- VSCode 1.74.0 or higher

## License

MIT - see the [LICENSE](LICENSE) file for details.
