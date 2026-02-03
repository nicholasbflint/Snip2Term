"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSnippet = isSnippet;
exports.isFolder = isFolder;
function isSnippet(item) {
    return 'content' in item;
}
function isFolder(item) {
    return !('content' in item);
}
//# sourceMappingURL=types.js.map