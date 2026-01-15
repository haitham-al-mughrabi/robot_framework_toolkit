import * as vscode from 'vscode';

/**
 * Settings panel for Robot Framework Toolkit
 */
export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveSettings':
                        this._saveSettings(message.settings);
                        return;
                    case 'getSettings':
                        this._sendCurrentSettings();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        // If we already have a panel, show it
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'rfToolkitSettings',
            'Robot Framework Toolkit Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    }

    private async _saveSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('robotFrameworkToolkit');

        try {
            // Save import path type
            if (settings.importPathType) {
                await config.update('importPathType', settings.importPathType, vscode.ConfigurationTarget.Global);
            }

            vscode.window.showInformationMessage('Settings saved successfully!');
            this._sendCurrentSettings();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to save settings: ${msg}`);
        }
    }

    private _sendCurrentSettings() {
        const config = vscode.workspace.getConfiguration('robotFrameworkToolkit');
        const settings = {
            importPathType: config.get('importPathType', 'relative')
        };

        this._panel.webview.postMessage({
            command: 'loadSettings',
            settings: settings
        });
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);

        // Send current settings after HTML is loaded
        setTimeout(() => this._sendCurrentSettings(), 100);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Robot Framework Toolkit Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }

        h1 {
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        .setting-group {
            margin-bottom: 30px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
        }

        .setting-label {
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .setting-description {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }

        select {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }

        select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            margin-right: 10px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .buttons {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .option-description {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-left: 10px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <h1>Robot Framework Toolkit Settings</h1>

    <div class="setting-group">
        <div class="setting-label">Import Path Type</div>
        <div class="setting-description">
            Choose the default path type for imports when creating or adding imports to Robot Framework files.
        </div>
        <select id="importPathType">
            <option value="relative">Relative Paths (e.g., ../folder/file.py)</option>
            <option value="absolute">Workspace Root Paths (e.g., folder/file.py)</option>
        </select>
    </div>

    <div class="buttons">
        <button id="saveBtn">Save Settings</button>
        <button class="secondary" id="resetBtn">Reset to Defaults</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Load settings when they arrive from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadSettings':
                    loadSettings(message.settings);
                    break;
            }
        });

        function loadSettings(settings) {
            document.getElementById('importPathType').value = settings.importPathType || 'relative';
        }

        function saveSettings() {
            const settings = {
                importPathType: document.getElementById('importPathType').value
            };

            vscode.postMessage({
                command: 'saveSettings',
                settings: settings
            });
        }

        function resetToDefaults() {
            document.getElementById('importPathType').value = 'relative';
            saveSettings();
        }

        // Event listeners
        document.getElementById('saveBtn').addEventListener('click', saveSettings);
        document.getElementById('resetBtn').addEventListener('click', resetToDefaults);

        // Request initial settings
        vscode.postMessage({ command: 'getSettings' });
    </script>
</body>
</html>`;
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
