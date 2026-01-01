# Robot Framework Toolkit for PyCharm

Replicating the essential features of the VS Code Robot Framework Toolkit for PyCharm.

## Features

- **Smart Import Management**: Easily add Library, Resource, and Variables imports.
- **File View Tracking**: See which files are currently open in your editor with a visual indicator (●) in the tree view.
- **Target File Locking**: Lock the navigation to a specific file to maintain focus while exploring dependencies.
- **Import Suggestions**: Automatically suggests relevant imports based on keywords used in your Robot files (marked with ⭐).
- **Keyword Explorer**: Explore keywords from any file with documentation and argument details.
- **Keyword Insertion**: Double-click or use the details panel to insert keywords directly into your code.
- **Search and Filter**: Quickly find files in your project with real-time filtering.
- **Path Selection**: Support for workspace-relative paths.

## Installation

1. Download the latest release `.zip` file.
2. In PyCharm, go to `Settings` (or `Preferences` on macOS) > `Plugins`.
3. Click the gear icon and select `Install Plugin from Disk...`.
4. Select the downloaded `.zip` file and restart PyCharm.

## Development

Built using Kotlin and the IntelliJ Platform SDK.

### Build and Package
```bash
./gradlew buildPlugin
```
The output will be in `build/distributions/`.

## License
MIT
