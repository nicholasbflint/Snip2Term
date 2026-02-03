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
  }

  private loadData(): SnippetData {
    const stored = this.context.globalState.get<SnippetData>(STORAGE_KEY);
    return stored || { folders: [], snippets: [] };
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
      parentId
    };
    this.data.folders.push(folder);
    await this.saveData();
    return folder;
  }

  getFolders(parentId: string | null = null): Folder[] {
    return this.data.folders.filter(f => f.parentId === parentId);
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
      parentId
    };
    this.data.snippets.push(snippet);
    await this.saveData();
    return snippet;
  }

  getSnippets(parentId: string | null = null): Snippet[] {
    return this.data.snippets.filter(s => s.parentId === parentId);
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
