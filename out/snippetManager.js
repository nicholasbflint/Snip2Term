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
exports.SnippetManager = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const STORAGE_KEY = 'snip2term.data';
class SnippetManager {
    data;
    context;
    _onDidChangeData = new vscode.EventEmitter();
    onDidChangeData = this._onDidChangeData.event;
    constructor(context) {
        this.context = context;
        this.data = this.loadData();
        this.migrateOrderField();
    }
    loadData() {
        const stored = this.context.globalState.get(STORAGE_KEY);
        return stored || { folders: [], snippets: [] };
    }
    // Migrate existing data that lacks the order field
    migrateOrderField() {
        let needsSave = false;
        this.data.folders.forEach((folder, index) => {
            if (folder.order === undefined) {
                folder.order = index;
                needsSave = true;
            }
        });
        this.data.snippets.forEach((snippet, index) => {
            if (snippet.order === undefined) {
                snippet.order = index;
                needsSave = true;
            }
        });
        if (needsSave) {
            this.context.globalState.update(STORAGE_KEY, this.data);
        }
    }
    getNextOrder(parentId) {
        const folders = this.data.folders.filter(f => f.parentId === parentId);
        const snippets = this.data.snippets.filter(s => s.parentId === parentId);
        const maxFolder = folders.reduce((max, f) => Math.max(max, f.order ?? 0), -1);
        const maxSnippet = snippets.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
        return Math.max(maxFolder, maxSnippet) + 1;
    }
    async saveData() {
        await this.context.globalState.update(STORAGE_KEY, this.data);
        this._onDidChangeData.fire();
    }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    // Folder operations
    async createFolder(name, parentId = null) {
        const folder = {
            id: this.generateId(),
            name,
            parentId,
            order: this.getNextOrder(parentId)
        };
        this.data.folders.push(folder);
        await this.saveData();
        return folder;
    }
    getFolders(parentId = null) {
        return this.data.folders
            .filter(f => f.parentId === parentId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    getFolder(id) {
        return this.data.folders.find(f => f.id === id);
    }
    async updateFolder(id, updates) {
        const index = this.data.folders.findIndex(f => f.id === id);
        if (index !== -1) {
            this.data.folders[index] = { ...this.data.folders[index], ...updates };
            await this.saveData();
        }
    }
    async deleteFolder(id) {
        // Delete all child folders recursively
        const childFolders = this.data.folders.filter(f => f.parentId === id);
        for (const child of childFolders) {
            await this.deleteFolder(child.id);
        }
        // Delete all snippets in this folder
        this.data.snippets = this.data.snippets.filter(s => s.parentId !== id);
        // Delete the folder itself
        this.data.folders = this.data.folders.filter(f => f.id !== id);
        await this.saveData();
    }
    // Snippet operations
    async createSnippet(name, content, parentId = null) {
        const snippet = {
            id: this.generateId(),
            name,
            content,
            parentId,
            order: this.getNextOrder(parentId)
        };
        this.data.snippets.push(snippet);
        await this.saveData();
        return snippet;
    }
    getSnippets(parentId = null) {
        return this.data.snippets
            .filter(s => s.parentId === parentId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    getSnippet(id) {
        return this.data.snippets.find(s => s.id === id);
    }
    async updateSnippet(id, updates) {
        const index = this.data.snippets.findIndex(s => s.id === id);
        if (index !== -1) {
            this.data.snippets[index] = { ...this.data.snippets[index], ...updates };
            await this.saveData();
        }
    }
    async deleteSnippet(id) {
        this.data.snippets = this.data.snippets.filter(s => s.id !== id);
        await this.saveData();
    }
    // Get children (folders and snippets) for a parent
    getChildren(parentId = null) {
        const folders = this.getFolders(parentId);
        const snippets = this.getSnippets(parentId);
        return [...folders, ...snippets];
    }
    // Rename item (folder or snippet)
    async renameItem(item, newName) {
        if ((0, types_1.isSnippet)(item)) {
            await this.updateSnippet(item.id, { name: newName });
        }
        else {
            await this.updateFolder(item.id, { name: newName });
        }
    }
    // Delete item (folder or snippet)
    async deleteItem(item) {
        if ((0, types_1.isSnippet)(item)) {
            await this.deleteSnippet(item.id);
        }
        else {
            await this.deleteFolder(item.id);
        }
    }
    // Export all data as JSON string
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }
    // Export a single folder and all its descendants
    exportFolder(folderId) {
        const folders = [];
        const snippets = [];
        const collectChildren = (id) => {
            const folder = this.data.folders.find(f => f.id === id);
            if (folder) {
                folders.push(folder);
            }
            snippets.push(...this.data.snippets.filter(s => s.parentId === id));
            const childFolders = this.data.folders.filter(f => f.parentId === id);
            for (const child of childFolders) {
                collectChildren(child.id);
            }
        };
        collectChildren(folderId);
        // Set the root folder's parentId to null so it imports at top level
        if (folders.length > 0) {
            folders[0] = { ...folders[0], parentId: null };
        }
        return JSON.stringify({ folders, snippets }, null, 2);
    }
    // Check if a folder is a descendant of another folder (prevents circular moves)
    isDescendant(folderId, potentialAncestorId) {
        let current = this.getFolder(folderId);
        while (current) {
            if (current.parentId === potentialAncestorId) {
                return true;
            }
            current = current.parentId ? this.getFolder(current.parentId) : undefined;
        }
        return false;
    }
    // Move an item to a new parent and/or reorder within the target parent
    // targetIndex is the position among all children (folders + snippets) in the target parent
    async moveItem(item, newParentId, targetIndex) {
        const oldParentId = item.parentId;
        // Update parentId
        if ((0, types_1.isSnippet)(item)) {
            const index = this.data.snippets.findIndex(s => s.id === item.id);
            if (index !== -1) {
                this.data.snippets[index].parentId = newParentId;
            }
        }
        else {
            const index = this.data.folders.findIndex(f => f.id === item.id);
            if (index !== -1) {
                this.data.folders[index].parentId = newParentId;
            }
        }
        // Recalculate order for all children in the target parent
        const siblings = this.getChildren(newParentId).filter(c => c.id !== item.id);
        siblings.splice(targetIndex, 0, item);
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if ((0, types_1.isSnippet)(sibling)) {
                const idx = this.data.snippets.findIndex(s => s.id === sibling.id);
                if (idx !== -1) {
                    this.data.snippets[idx].order = i;
                }
            }
            else {
                const idx = this.data.folders.findIndex(f => f.id === sibling.id);
                if (idx !== -1) {
                    this.data.folders[idx].order = i;
                }
            }
        }
        // If moved to a different parent, compact old parent's order values
        if (oldParentId !== newParentId) {
            const oldSiblings = this.getChildren(oldParentId);
            for (let i = 0; i < oldSiblings.length; i++) {
                const sibling = oldSiblings[i];
                if ((0, types_1.isSnippet)(sibling)) {
                    const idx = this.data.snippets.findIndex(s => s.id === sibling.id);
                    if (idx !== -1) {
                        this.data.snippets[idx].order = i;
                    }
                }
                else {
                    const idx = this.data.folders.findIndex(f => f.id === sibling.id);
                    if (idx !== -1) {
                        this.data.folders[idx].order = i;
                    }
                }
            }
        }
        await this.saveData();
    }
    // Import data from JSON string
    // mode: 'replace' = overwrite all, 'merge' = update matching IDs + add new, 'append' = add all as new items
    async importData(jsonString, mode) {
        const imported = JSON.parse(jsonString);
        if (mode === 'replace') {
            this.data = imported;
        }
        else if (mode === 'merge') {
            for (const folder of imported.folders) {
                const existingIndex = this.data.folders.findIndex(f => f.id === folder.id);
                if (existingIndex !== -1) {
                    this.data.folders[existingIndex] = folder;
                }
                else {
                    this.data.folders.push(folder);
                }
            }
            for (const snippet of imported.snippets) {
                const existingIndex = this.data.snippets.findIndex(s => s.id === snippet.id);
                if (existingIndex !== -1) {
                    this.data.snippets[existingIndex] = snippet;
                }
                else {
                    this.data.snippets.push(snippet);
                }
            }
        }
        else {
            // Append: generate new IDs to avoid conflicts
            const idMap = new Map();
            for (const folder of imported.folders) {
                const newId = this.generateId();
                idMap.set(folder.id, newId);
                folder.id = newId;
                folder.parentId = folder.parentId ? idMap.get(folder.parentId) || folder.parentId : null;
                this.data.folders.push(folder);
            }
            for (const snippet of imported.snippets) {
                snippet.id = this.generateId();
                snippet.parentId = snippet.parentId ? idMap.get(snippet.parentId) || snippet.parentId : null;
                this.data.snippets.push(snippet);
            }
        }
        await this.saveData();
        return { folders: imported.folders.length, snippets: imported.snippets.length };
    }
}
exports.SnippetManager = SnippetManager;
//# sourceMappingURL=snippetManager.js.map