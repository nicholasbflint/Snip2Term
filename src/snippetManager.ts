import * as vscode from 'vscode';
import { Snippet, Folder, SnippetData, SnippetItem, isSnippet } from './types';

const STORAGE_KEY = 'snip2term.data';

export class SnippetManager {
  private data: SnippetData;
  private context: vscode.ExtensionContext;
  private _onDidChangeData = new vscode.EventEmitter<void>();
  readonly onDidChangeData = this._onDidChangeData.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.data = this.loadData();
    this.migrateOrderField();
  }

  private loadData(): SnippetData {
    const stored = this.context.globalState.get<SnippetData>(STORAGE_KEY);
    return stored || { folders: [], snippets: [] };
  }

  // Migrate existing data that lacks the order field
  private migrateOrderField(): void {
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

  private getNextOrder(parentId: string | null): number {
    const folders = this.data.folders.filter(f => f.parentId === parentId);
    const snippets = this.data.snippets.filter(s => s.parentId === parentId);
    const maxFolder = folders.reduce((max, f) => Math.max(max, f.order ?? 0), -1);
    const maxSnippet = snippets.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
    return Math.max(maxFolder, maxSnippet) + 1;
  }

  private async saveData(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.data);
    this._onDidChangeData.fire();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Folder operations
  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const folder: Folder = {
      id: this.generateId(),
      name,
      parentId,
      order: this.getNextOrder(parentId)
    };
    this.data.folders.push(folder);
    await this.saveData();
    return folder;
  }

  getFolders(parentId: string | null = null): Folder[] {
    return this.data.folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getFolder(id: string): Folder | undefined {
    return this.data.folders.find(f => f.id === id);
  }

  async updateFolder(id: string, updates: Partial<Omit<Folder, 'id'>>): Promise<void> {
    const index = this.data.folders.findIndex(f => f.id === id);
    if (index !== -1) {
      this.data.folders[index] = { ...this.data.folders[index], ...updates };
      await this.saveData();
    }
  }

  async deleteFolder(id: string): Promise<void> {
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
  async createSnippet(name: string, content: string, parentId: string | null = null): Promise<Snippet> {
    const snippet: Snippet = {
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

  getSnippets(parentId: string | null = null): Snippet[] {
    return this.data.snippets
      .filter(s => s.parentId === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getSnippet(id: string): Snippet | undefined {
    return this.data.snippets.find(s => s.id === id);
  }

  async updateSnippet(id: string, updates: Partial<Omit<Snippet, 'id'>>): Promise<void> {
    const index = this.data.snippets.findIndex(s => s.id === id);
    if (index !== -1) {
      this.data.snippets[index] = { ...this.data.snippets[index], ...updates };
      await this.saveData();
    }
  }

  async deleteSnippet(id: string): Promise<void> {
    this.data.snippets = this.data.snippets.filter(s => s.id !== id);
    await this.saveData();
  }

  // Get children (folders and snippets) for a parent
  getChildren(parentId: string | null = null): SnippetItem[] {
    const folders = this.getFolders(parentId);
    const snippets = this.getSnippets(parentId);
    return [...folders, ...snippets];
  }

  // Rename item (folder or snippet)
  async renameItem(item: SnippetItem, newName: string): Promise<void> {
    if (isSnippet(item)) {
      await this.updateSnippet(item.id, { name: newName });
    } else {
      await this.updateFolder(item.id, { name: newName });
    }
  }

  // Delete item (folder or snippet)
  async deleteItem(item: SnippetItem): Promise<void> {
    if (isSnippet(item)) {
      await this.deleteSnippet(item.id);
    } else {
      await this.deleteFolder(item.id);
    }
  }

  // Export all data as JSON string
  exportData(): string {
    return JSON.stringify(this.data, null, 2);
  }

  // Export a single folder and all its descendants
  exportFolder(folderId: string): string {
    const folders: Folder[] = [];
    const snippets: Snippet[] = [];

    const collectChildren = (id: string) => {
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
  isDescendant(folderId: string, potentialAncestorId: string): boolean {
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
  async moveItem(item: SnippetItem, newParentId: string | null, targetIndex: number): Promise<void> {
    const oldParentId = item.parentId;

    // Update parentId
    if (isSnippet(item)) {
      const index = this.data.snippets.findIndex(s => s.id === item.id);
      if (index !== -1) {
        this.data.snippets[index].parentId = newParentId;
      }
    } else {
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
      if (isSnippet(sibling)) {
        const idx = this.data.snippets.findIndex(s => s.id === sibling.id);
        if (idx !== -1) { this.data.snippets[idx].order = i; }
      } else {
        const idx = this.data.folders.findIndex(f => f.id === sibling.id);
        if (idx !== -1) { this.data.folders[idx].order = i; }
      }
    }

    // If moved to a different parent, compact old parent's order values
    if (oldParentId !== newParentId) {
      const oldSiblings = this.getChildren(oldParentId);
      for (let i = 0; i < oldSiblings.length; i++) {
        const sibling = oldSiblings[i];
        if (isSnippet(sibling)) {
          const idx = this.data.snippets.findIndex(s => s.id === sibling.id);
          if (idx !== -1) { this.data.snippets[idx].order = i; }
        } else {
          const idx = this.data.folders.findIndex(f => f.id === sibling.id);
          if (idx !== -1) { this.data.folders[idx].order = i; }
        }
      }
    }

    await this.saveData();
  }

  // Search snippets by name or content (case-insensitive)
  searchSnippets(query: string): Snippet[] {
    const lowerQuery = query.toLowerCase();
    return this.data.snippets.filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.content.toLowerCase().includes(lowerQuery)
    );
  }

  // Search folders by name (case-insensitive)
  searchFolders(query: string): Folder[] {
    const lowerQuery = query.toLowerCase();
    return this.data.folders.filter(f =>
      f.name.toLowerCase().includes(lowerQuery)
    );
  }

  // Get all ancestor folder IDs for a given parent ID
  getAncestorIds(parentId: string | null): Set<string> {
    const ancestors = new Set<string>();
    let current = parentId;
    while (current) {
      ancestors.add(current);
      const folder = this.getFolder(current);
      current = folder?.parentId ?? null;
    }
    return ancestors;
  }

  // Import data from JSON string
  // mode: 'replace' = overwrite all, 'merge' = update matching IDs + add new, 'append' = add all as new items
  async importData(jsonString: string, mode: 'replace' | 'merge' | 'append'): Promise<{ folders: number; snippets: number }> {
    const imported = JSON.parse(jsonString) as SnippetData;

    if (mode === 'replace') {
      this.data = imported;
    } else if (mode === 'merge') {
      for (const folder of imported.folders) {
        const existingIndex = this.data.folders.findIndex(f => f.id === folder.id);
        if (existingIndex !== -1) {
          this.data.folders[existingIndex] = folder;
        } else {
          this.data.folders.push(folder);
        }
      }

      for (const snippet of imported.snippets) {
        const existingIndex = this.data.snippets.findIndex(s => s.id === snippet.id);
        if (existingIndex !== -1) {
          this.data.snippets[existingIndex] = snippet;
        } else {
          this.data.snippets.push(snippet);
        }
      }
    } else {
      // Append: generate new IDs to avoid conflicts
      const idMap = new Map<string, string>();

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
