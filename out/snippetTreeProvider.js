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
exports.SnippetDragAndDropController = exports.SnippetTreeProvider = exports.SnippetTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const DRAG_MIME_TYPE = 'application/vnd.code.tree.snip2termView';
class SnippetTreeItem extends vscode.TreeItem {
    item;
    collapsibleState;
    constructor(item, collapsibleState) {
        super(item.name, collapsibleState);
        this.item = item;
        this.collapsibleState = collapsibleState;
        if ((0, types_1.isSnippet)(item)) {
            this.contextValue = 'snippet';
            this.iconPath = new vscode.ThemeIcon('code');
            this.tooltip = item.content;
            this.command = {
                command: 'snip2term.pasteSnippet',
                title: 'Paste to Terminal',
                arguments: [item]
            };
        }
        else {
            this.contextValue = 'folder';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}
exports.SnippetTreeItem = SnippetTreeItem;
class SnippetTreeProvider {
    snippetManager;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(snippetManager) {
        this.snippetManager = snippetManager;
        snippetManager.onDidChangeData(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        const parentId = element ? element.item.id : null;
        const children = this.snippetManager.getChildren(parentId);
        return Promise.resolve(children.map(item => {
            const hasChildren = (0, types_1.isFolder)(item) && this.snippetManager.getChildren(item.id).length > 0;
            const collapsibleState = (0, types_1.isFolder)(item)
                ? (hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed)
                : vscode.TreeItemCollapsibleState.None;
            return new SnippetTreeItem(item, collapsibleState);
        }));
    }
    getParent(element) {
        const parentId = element.item.parentId;
        if (!parentId) {
            return Promise.resolve(null);
        }
        const parent = this.snippetManager.getFolder(parentId);
        if (!parent) {
            return Promise.resolve(null);
        }
        return Promise.resolve(new SnippetTreeItem(parent, vscode.TreeItemCollapsibleState.Collapsed));
    }
}
exports.SnippetTreeProvider = SnippetTreeProvider;
class SnippetDragAndDropController {
    snippetManager;
    dropMimeTypes = [DRAG_MIME_TYPE];
    dragMimeTypes = [DRAG_MIME_TYPE];
    constructor(snippetManager) {
        this.snippetManager = snippetManager;
    }
    handleDrag(source, dataTransfer) {
        const items = source.map(s => s.item);
        dataTransfer.set(DRAG_MIME_TYPE, new vscode.DataTransferItem(items));
    }
    async handleDrop(target, dataTransfer) {
        const transferItem = dataTransfer.get(DRAG_MIME_TYPE);
        if (!transferItem) {
            return;
        }
        const draggedItems = transferItem.value;
        if (!draggedItems || draggedItems.length === 0) {
            return;
        }
        // Determine the target parent folder
        // If dropped on a folder, move into that folder (at the end)
        // If dropped on a snippet, move to the same parent as that snippet (placed after it)
        // If dropped on root (target undefined), move to root
        let targetParentId;
        let targetIndex;
        if (!target) {
            // Dropped on root
            targetParentId = null;
            targetIndex = this.snippetManager.getChildren(null).length;
        }
        else if ((0, types_1.isSnippet)(target.item)) {
            // Dropped on a snippet — place after it in the same parent
            targetParentId = target.item.parentId;
            const siblings = this.snippetManager.getChildren(targetParentId);
            const targetSiblingIndex = siblings.findIndex(s => s.id === target.item.id);
            targetIndex = targetSiblingIndex + 1;
        }
        else {
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
            if ((0, types_1.isFolder)(item) && targetParentId !== null) {
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
exports.SnippetDragAndDropController = SnippetDragAndDropController;
//# sourceMappingURL=snippetTreeProvider.js.map