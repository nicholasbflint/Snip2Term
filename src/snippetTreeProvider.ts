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

  private filterQuery: string = '';
  private matchingSnippetIds: Set<string> = new Set();
  private matchingFolderIds: Set<string> = new Set();
  private ancestorFolderIds: Set<string> = new Set();

  constructor(private snippetManager: SnippetManager) {
    snippetManager.onDidChangeData(() => this.refresh());
  }

  setFilter(query: string): void {
    this.filterQuery = query;
    if (query) {
      const matchingSnippets = this.snippetManager.searchSnippets(query);
      const matchingFolders = this.snippetManager.searchFolders(query);

      this.matchingSnippetIds = new Set(matchingSnippets.map(s => s.id));
      this.matchingFolderIds = new Set(matchingFolders.map(f => f.id));

      // Collect all ancestor folders of matching items
      this.ancestorFolderIds = new Set<string>();
      for (const snippet of matchingSnippets) {
        const ancestors = this.snippetManager.getAncestorIds(snippet.parentId);
        ancestors.forEach(id => this.ancestorFolderIds.add(id));
      }
      for (const folder of matchingFolders) {
        const ancestors = this.snippetManager.getAncestorIds(folder.parentId);
        ancestors.forEach(id => this.ancestorFolderIds.add(id));
      }
    } else {
      this.matchingSnippetIds.clear();
      this.matchingFolderIds.clear();
      this.ancestorFolderIds.clear();
    }
    this.refresh();
  }

  clearFilter(): void {
    this.setFilter('');
  }

  isFiltering(): boolean {
    return this.filterQuery.length > 0;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SnippetTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SnippetTreeItem): Thenable<SnippetTreeItem[]> {
    const parentId = element ? element.item.id : null;
    let children = this.snippetManager.getChildren(parentId);

    // Apply filter if active
    if (this.filterQuery) {
      children = children.filter(item => {
        if (isSnippet(item)) {
          return this.matchingSnippetIds.has(item.id);
        } else {
          // Show folder if it matches, or if it's an ancestor of a matching item
          return this.matchingFolderIds.has(item.id) || this.ancestorFolderIds.has(item.id);
        }
      });
    }

    return Promise.resolve(
      children.map(item => {
        const hasChildren = isFolder(item) && this.getFilteredChildCount(item.id) > 0;
        const collapsibleState = isFolder(item)
          ? (this.filterQuery ? vscode.TreeItemCollapsibleState.Expanded : (hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed))
          : vscode.TreeItemCollapsibleState.None;

        return new SnippetTreeItem(item, collapsibleState);
      })
    );
  }

  private getFilteredChildCount(parentId: string): number {
    const children = this.snippetManager.getChildren(parentId);
    if (!this.filterQuery) {
      return children.length;
    }
    return children.filter(item => {
      if (isSnippet(item)) {
        return this.matchingSnippetIds.has(item.id);
      } else {
        return this.matchingFolderIds.has(item.id) || this.ancestorFolderIds.has(item.id);
      }
    }).length;
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
