import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { SnippetItem, isSnippet, isFolder } from './types';

export class SnippetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly item: SnippetItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(item.name, collapsibleState);

    if (isSnippet(item)) {
      this.contextValue = 'snippet';
      this.iconPath = new vscode.ThemeIcon('code');
      this.tooltip = item.content;
      this.command = {
        command: 'snip2term.pasteSnippet',
        title: 'Paste to Terminal',
        arguments: [item]
      };
    } else {
      this.contextValue = 'folder';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }
}

export class SnippetTreeProvider implements vscode.TreeDataProvider<SnippetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SnippetTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private snippetManager: SnippetManager) {
    snippetManager.onDidChangeData(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SnippetTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SnippetTreeItem): Thenable<SnippetTreeItem[]> {
    const parentId = element ? element.item.id : null;
    const children = this.snippetManager.getChildren(parentId);

    return Promise.resolve(
      children.map(item => {
        const hasChildren = isFolder(item) && this.snippetManager.getChildren(item.id).length > 0;
        const collapsibleState = isFolder(item)
          ? (hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed)
          : vscode.TreeItemCollapsibleState.None;

        return new SnippetTreeItem(item, collapsibleState);
      })
    );
  }

  getParent(element: SnippetTreeItem): Thenable<SnippetTreeItem | null> {
    const parentId = element.item.parentId;
    if (!parentId) {
      return Promise.resolve(null);
    }

    const parent = this.snippetManager.getFolder(parentId);
    if (!parent) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      new SnippetTreeItem(parent, vscode.TreeItemCollapsibleState.Collapsed)
    );
  }
}
