import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { SnippetTreeProvider, SnippetTreeItem, SnippetDragAndDropController } from './snippetTreeProvider';
import { Snippet, isSnippet, isFolder } from './types';

let snippetManager: SnippetManager;
let treeProvider: SnippetTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  snippetManager = new SnippetManager(context);
  treeProvider = new SnippetTreeProvider(snippetManager);

  const dragAndDropController = new SnippetDragAndDropController(snippetManager);

  const treeView = vscode.window.createTreeView('snip2termView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    dragAndDropController,
    canSelectMany: true
  });

  context.subscriptions.push(treeView);

  // Helper to get parent folder ID from current selection
  const getSelectedFolderId = (): string | null => {
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
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.createFolderAtRoot', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Folder'
      });

      if (name) {
        const parentId = getSelectedFolderId();
        await snippetManager.createFolder(name, parentId);
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
        const parentId = getSelectedFolderId();
        await snippetManager.createSnippet(name, content, parentId);
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

  // Export a single folder
  context.subscriptions.push(
    vscode.commands.registerCommand('snip2term.exportFolder', async (treeItem: SnippetTreeItem) => {
      if (!isFolder(treeItem.item)) {
        return;
      }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${treeItem.item.name}.json`),
        filters: { 'JSON': ['json'] }
      });

      if (uri) {
        const data = snippetManager.exportFolder(treeItem.item.id);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
        vscode.window.showInformationMessage(`Folder "${treeItem.item.name}" exported successfully!`);
      }
    })
  );

  // Export all snippets
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
            { label: 'Merge', description: 'Update matching items by ID, add new ones', value: 'merge' as const },
            { label: 'Append', description: 'Add all as new items (duplicates possible)', value: 'append' as const },
            { label: 'Replace', description: 'Replace all existing snippets entirely', value: 'replace' as const }
          ],
          { placeHolder: 'How should snippets be imported?' }
        );

        if (action) {
          const result = await snippetManager.importData(jsonString, action.value);
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
