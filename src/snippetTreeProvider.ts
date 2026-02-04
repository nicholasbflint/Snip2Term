import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { SnippetItem, isSnippet, isFolder } from './types';

const DRAG_MIME_TYPE = 'application/vnd.code.tree.snip2termView';

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

export class SnippetDragAndDropController implements vscode.TreeDragAndDropController<SnippetTreeItem> {
  readonly dropMimeTypes = [DRAG_MIME_TYPE];
  readonly dragMimeTypes = [DRAG_MIME_TYPE];

  constructor(private snippetManager: SnippetManager) {}

  handleDrag(source: readonly SnippetTreeItem[], dataTransfer: vscode.DataTransfer): void {
    const items = source.map(s => s.item);
    dataTransfer.set(DRAG_MIME_TYPE, new vscode.DataTransferItem(items));
  }

  async handleDrop(target: SnippetTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const transferItem = dataTransfer.get(DRAG_MIME_TYPE);
    if (!transferItem) {
      return;
    }

    const draggedItems: SnippetItem[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }

    // Determine the target parent folder
    // If dropped on a folder, move into that folder (at the end)
    // If dropped on a snippet, move to the same parent as that snippet (placed after it)
    // If dropped on root (target undefined), move to root
    let targetParentId: string | null;
    let targetIndex: number;

    if (!target) {
      // Dropped on root
      targetParentId = null;
      targetIndex = this.snippetManager.getChildren(null).length;
    } else if (isSnippet(target.item)) {
      // Dropped on a snippet — place after it in the same parent
      targetParentId = target.item.parentId;
      const siblings = this.snippetManager.getChildren(targetParentId);
      const targetSiblingIndex = siblings.findIndex(s => s.id === target.item.id);
      targetIndex = targetSiblingIndex + 1;
    } else {
      // Dropped on a folder — move into it at the end
      targetParentId = target.item.id;
      targetIndex = this.snippetManager.getChildren(target.item.id).length;
    }

    for (const item of draggedItems) {
      // Don't drop an item onto itself
      if (target && item.id === target.item.id) {
        continue;
      }

      // Don't drop a folder into its own descendant (circular reference)
      if (isFolder(item) && targetParentId !== null) {
        if (item.id === targetParentId || this.snippetManager.isDescendant(targetParentId, item.id)) {
          vscode.window.showWarningMessage('Cannot move a folder into its own subfolder.');
          continue;
        }
      }

      // If moving within the same parent, adjust index for items that come before the target
      let adjustedIndex = targetIndex;
      if (item.parentId === targetParentId) {
        const siblings = this.snippetManager.getChildren(targetParentId);
        const currentIndex = siblings.findIndex(s => s.id === item.id);
        if (currentIndex !== -1 && currentIndex < targetIndex) {
          adjustedIndex--;
        }
      }

      await this.snippetManager.moveItem(item, targetParentId, adjustedIndex);
    }
  }
}
