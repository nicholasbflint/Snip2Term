"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const snippetManager_1 = require("./snippetManager");
const snippetTreeProvider_1 = require("./snippetTreeProvider");
const types_1 = require("./types");
let snippetManager;
let treeProvider;
function activate(context) {
    snippetManager = new snippetManager_1.SnippetManager(context);
    treeProvider = new snippetTreeProvider_1.SnippetTreeProvider(snippetManager);
    const treeView = vscode.window.createTreeView('snip2termView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    // Helper to get parent folder ID from current selection
    const getSelectedFolderId = () => {
        const selected = treeView.selection[0];
        if (!selected) {
            return null;
        }
        const item = selected.item;
        // If folder is selected, create inside it
        // If snippet is selected, create in its parent folder
        if ('content' in item) {
            return item.parentId;
        }
        return item.id;
    };
    // Register commands - Toolbar creation (respects selection)
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.createFolderAtRoot', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'My Folder'
        });
        if (name) {
            const parentId = getSelectedFolderId();
            await snippetManager.createFolder(name, parentId);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.createSnippetAtRoot', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter snippet name',
            placeHolder: 'My Snippet'
        });
        if (!name) {
            return;
        }
        const content = await vscode.window.showInputBox({
            prompt: 'Enter snippet content (terminal command)',
            placeHolder: 'echo "Hello World"'
        });
        if (content !== undefined) {
            const parentId = getSelectedFolderId();
            await snippetManager.createSnippet(name, content, parentId);
        }
    }));
    // Context menu creation (inside folders)
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.createFolder', async (treeItem) => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'My Folder'
        });
        if (name) {
            const parentId = (0, types_1.isFolder)(treeItem.item) ? treeItem.item.id : null;
            await snippetManager.createFolder(name, parentId);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.createSnippet', async (treeItem) => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter snippet name',
            placeHolder: 'My Snippet'
        });
        if (!name) {
            return;
        }
        const content = await vscode.window.showInputBox({
            prompt: 'Enter snippet content (terminal command)',
            placeHolder: 'echo "Hello World"'
        });
        if (content !== undefined) {
            const parentId = (0, types_1.isFolder)(treeItem.item) ? treeItem.item.id : null;
            await snippetManager.createSnippet(name, content, parentId);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.editSnippet', async (treeItem) => {
        if (!(0, types_1.isSnippet)(treeItem.item)) {
            return;
        }
        const snippet = treeItem.item;
        const content = await vscode.window.showInputBox({
            prompt: 'Edit snippet content',
            value: snippet.content,
            placeHolder: 'echo "Hello World"'
        });
        if (content !== undefined) {
            await snippetManager.updateSnippet(snippet.id, { content });
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.rename', async (treeItem) => {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: treeItem.item.name
        });
        if (newName) {
            await snippetManager.renameItem(treeItem.item, newName);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.delete', async (treeItem) => {
        const itemType = (0, types_1.isSnippet)(treeItem.item) ? 'snippet' : 'folder';
        const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete this ${itemType}?`, { modal: true }, 'Delete');
        if (confirm === 'Delete') {
            await snippetManager.deleteItem(treeItem.item);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.pasteSnippet', async (item) => {
        const snippet = 'item' in item ? item.item : item;
        if (!(0, types_1.isSnippet)(snippet)) {
            return;
        }
        await sendToTerminal(snippet.content, false);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.runSnippet', async (treeItem) => {
        if (!(0, types_1.isSnippet)(treeItem.item)) {
            return;
        }
        await sendToTerminal(treeItem.item.content, true);
    }));
    // Export snippets
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.exportSnippets', async () => {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('snip2term-snippets.json'),
            filters: { 'JSON': ['json'] }
        });
        if (uri) {
            const data = snippetManager.exportData();
            await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
            vscode.window.showInformationMessage('Snippets exported successfully!');
        }
    }));
    // Import snippets
    context.subscriptions.push(vscode.commands.registerCommand('snip2term.importSnippets', async () => {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] }
        });
        if (uris && uris.length > 0) {
            const content = await vscode.workspace.fs.readFile(uris[0]);
            const jsonString = Buffer.from(content).toString('utf8');
            const action = await vscode.window.showQuickPick([
                { label: 'Merge', description: 'Add imported snippets to existing ones' },
                { label: 'Replace', description: 'Replace all existing snippets' }
            ], { placeHolder: 'How should snippets be imported?' });
            if (action) {
                const result = await snippetManager.importData(jsonString, action.label === 'Replace');
                vscode.window.showInformationMessage(`Imported ${result.folders} folders and ${result.snippets} snippets!`);
            }
        }
    }));
}
async function sendToTerminal(content, execute) {
    let terminal = vscode.window.activeTerminal;
    if (!terminal) {
        terminal = vscode.window.createTerminal('Snip2Term');
    }
    terminal.show();
    terminal.sendText(content, execute);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map