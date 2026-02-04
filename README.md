# Snip2Term

Organize terminal snippets and send them to the terminal with a click.

Snip2Term adds a sidebar panel where you can store frequently used terminal commands, organize them into folders, and execute them instantly.

## Features

### Snippet Management

- **Create snippets** — Save any terminal command as a reusable snippet
- **Organize with folders** — Group related snippets into nested folders
- **Edit and rename** — Update snippet commands or names via the context menu
- **Drag and drop** — Reorder snippets and move them between folders

### Running Snippets

- **Click to paste** — Click a snippet to paste it into the active terminal (without executing)
- **Run in Terminal** — Right-click and select "Run in Terminal" to paste and execute immediately
- If no terminal is open, one is created automatically

### Placeholders

Snippets can contain interactive placeholders that prompt for input when executed.

**Text input:**

```
ls {prompt: Enter ls parameters}
```

Clicking this snippet prompts for "Enter ls parameters" and substitutes your input. For example, entering `-la` sends `ls -la` to the terminal.

**Selection list:**

```
docker run --rm -it {prompt: Select image; list: node, python, ubuntu, alpine}
```

This presents a dropdown with the listed options instead of a free-text input.

**Multiple placeholders:**

```
scp {prompt: Source file} {prompt: User}@{prompt: Host}:{prompt: Destination path}
```

Each placeholder is resolved sequentially. If you cancel any prompt, the entire command is aborted.

**Syntax reference:**

| Syntax | Behavior |
|---|---|
| `{prompt: Text}` | Free-text input box |
| `{prompt: Text; list: a, b, c}` | Quick pick dropdown |

### Import and Export

- **Export all snippets** — Save your entire snippet library to a JSON file
- **Export a folder** — Right-click a folder to export just that folder and its contents
- **Import snippets** — Load snippets from a JSON file with three merge strategies:
  - **Merge** — Update matching items by ID, add new ones
  - **Append** — Add all as new items (duplicates possible)
  - **Replace** — Overwrite all existing snippets

## Usage

1. Open the **Snip2Term** panel from the activity bar (terminal icon)
2. Click the **+** button to create a snippet, or the folder icon to create a folder
3. Enter a name and the terminal command
4. Click the snippet to paste it into your terminal, or right-click for more options

## Development

```sh
npm install
npm run compile
```

To watch for changes during development:

```sh
npm run watch
```
