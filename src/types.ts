export interface Snippet {
  id: string;
  name: string;
  content: string;
  parentId: string | null;
  order: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface SnippetData {
  folders: Folder[];
  snippets: Snippet[];
}

export type SnippetItem = Folder | Snippet;

export function isSnippet(item: SnippetItem): item is Snippet {
  return 'content' in item;
}

export function isFolder(item: SnippetItem): item is Folder {
  return !('content' in item);
}
