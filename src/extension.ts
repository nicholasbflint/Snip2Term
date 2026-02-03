import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { SnippetTreeProvider, SnippetTreeItem } from './snippetTreeProvider';
import { Snippet, isSnippet, isFolder } from './types';

let snippetManager: SnippetManager;
let treeProvider: SnippetTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  snippetManager = new SnippetManager(context);
  treeProvider = new SnippetTreeProvider(snippetManager);

  const treeView = vscode.window.createTreeView('snip2termView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  context.subscriptions.push(treeView);

  // Register commands - Root level creation (from toolbar)
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.createFolderAtRoot', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Folder'
      });

      if (name) {
        await snippetManager.createFolder(name, null);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.createSnippetAtRoot', async () => {
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
        await snippetManager.createSnippet(name, content, null);
      }
    })
  );

  // Context menu creation (inside folders)
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.createFolder', async (treeItem: SnippetTreeItem) => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Folder'
      });

      if (name) {
        const parentId = isFolder(treeItem.item) ? treeItem.item.id : null;
        await snippetManager.createFolder(name, parentId);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.createSnippet', async (treeItem: SnippetTreeItem) => {
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
        const parentId = isFolder(treeItem.item) ? treeItem.item.id : null;
        await snippetManager.createSnippet(name, content, parentId);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.editSnippet', async (treeItem: SnippetTreeItem) => {
      if (!isSnippet(treeItem.item)) {
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
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.rename', async (treeItem: SnippetTreeItem) => {
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: treeItem.item.name
      });

      if (newName) {
        await snippetManager.renameItem(treeItem.item, newName);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.delete', async (treeItem: SnippetTreeItem) => {
      const itemType = isSnippet(treeItem.item) ? 'snippet' : 'folder';
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete this ${itemType}?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        await snippetManager.deleteItem(treeItem.item);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.pasteSnippet', async (item: SnippetTreeItem | Snippet) => {
      const snippet = 'item' in item ? item.item : item;
      if (!isSnippet(snippet)) {
        return;
      }

      await sendToTerminal(snippet.content, false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.runSnippet', async (treeItem: SnippetTreeItem) => {
      if (!isSnippet(treeItem.item)) {
        return;
      }

      await sendToTerminal(treeItem.item.content, true);
    })
  );

  // Export snippets
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.exportSnippets', async () => {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('snip2term-snippets.json'),
        filters: { 'JSON': ['json'] }
      });

      if (uri) {
        const data = snippetManager.exportData();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
        vscode.window.showInformationMessage('Snippets exported successfully!');
      }
    })
  );

  // Import snippets
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.importSnippets', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] }
      });

      if (uris && uris.length > 0) {
        const content = await vscode.workspace.fs.readFile(uris[0]);
        const jsonString = Buffer.from(content).toString('utf8');

        const action = await vscode.window.showQuickPick(
          [
            { label: 'Merge', description: 'Add imported snippets to existing ones' },
            { label: 'Replace', description: 'Replace all existing snippets' }
          ],
          { placeHolder: 'How should snippets be imported?' }
        );

        if (action) {
          const result = await snippetManager.importData(jsonString, action.label === 'Replace');
          vscode.window.showInformationMessage(
            `Imported ${result.folders} folders and ${result.snippets} snippets!`
          );
        }
      }
    })
  );
}

async function sendToTerminal(content: string, execute: boolean): Promise<void> {
  let terminal = vscode.window.activeTerminal;

  if (!terminal) {
    terminal = vscode.window.createTerminal('Snip2Term');
  }

  terminal.show();
  terminal.sendText(content, execute);
}

export function deactivate() {}
