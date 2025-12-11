# Troubleshooting

[← Back to README](../README.md)

Solutions for common issues with Search MCP.

---

## Table of Contents

- [Error Reference](#error-reference)
  - [INDEX_NOT_FOUND](#index_not_found)
  - [MODEL_DOWNLOAD_FAILED](#model_download_failed)
  - [INDEX_CORRUPT](#index_corrupt)
  - [FILE_LIMIT_WARNING](#file_limit_warning)
  - [PERMISSION_DENIED](#permission_denied)
  - [DISK_FULL](#disk_full)
  - [FILE_NOT_FOUND](#file_not_found)
  - [INVALID_PATTERN](#invalid_pattern)
  - [PROJECT_NOT_DETECTED](#project_not_detected)
  - [SYMLINK_NOT_ALLOWED](#symlink_not_allowed)
  - [Resource Limits](#resource-limits)
- [Common Issues](#common-issues)
- [Getting Help](#getting-help)

---

## Error Reference

All errors include two messages:
- **User Message** - Friendly explanation
- **Developer Message** - Technical details for debugging

---

### INDEX_NOT_FOUND

**When:** You try to search before creating an index.

| | Message |
|---|---------|
| **User** | "This project hasn't been indexed yet. Would you like to index it now?" |
| **Developer** | `INDEX_NOT_FOUND: No index at <storage-path>/indexes/{hash}/` |

**Solution:** Run `create_index` or say "Index this project" to create the index.

---

### MODEL_DOWNLOAD_FAILED

**When:** The embedding model fails to download on first use.

| | Message |
|---|---------|
| **User** | "Couldn't set up the search engine. Please check your internet connection and try again." |
| **Developer** | `MODEL_DOWNLOAD_FAILED: ENOTFOUND huggingface.co` |

**Solution:**
1. Check your internet connection
2. Verify huggingface.co is accessible
3. Try again - the download will resume where it left off

---

### INDEX_CORRUPT

**When:** The index database is damaged or unreadable.

| | Message |
|---|---------|
| **User** | "The search index seems corrupted. Rebuilding it now..." |
| **Developer** | `INDEX_CORRUPT: LanceDB read error - {details}` |

**Solution:** The system will automatically rebuild the index. If it persists:
1. Run `delete_index`
2. Run `create_index`

---

### FILE_LIMIT_WARNING

**When:** Your project has more than 50,000 files.

| | Message |
|---|---------|
| **User** | "This project is very large (65,000 files). Indexing may take several minutes. Continue?" |
| **Developer** | `FILE_LIMIT_WARNING: 65,000 files exceeds soft limit of 50,000` |

**Solution:** This is just a warning. You can:
1. Continue anyway (indexing will take longer)
2. Add patterns to `exclude` in config to reduce file count

---

### PERMISSION_DENIED

**When:** Search MCP can't read some files in your project.

| | Message |
|---|---------|
| **User** | "Can't access some files in this project. Check folder permissions." |
| **Developer** | `PERMISSION_DENIED: EACCES reading {path}` |

**Solution:**
1. Check file/folder permissions
2. On Mac/Linux: `chmod +r <file>` or `chmod +rx <folder>`
3. Files that can't be read are skipped (other files still indexed)

---

### DISK_FULL

**When:** Not enough disk space to create or update the index.

| | Message |
|---|---------|
| **User** | "Not enough disk space to create the search index. Free up some space and try again." |
| **Developer** | `DISK_FULL: ENOSPC - need ~{needed}MB, have {available}MB` |

**Solution:**
1. Free up disk space
2. The index typically needs ~100KB per 1000 chunks
3. The embedding model needs ~100MB (one-time)

---

### FILE_NOT_FOUND

**When:** You try to reindex a file that doesn't exist.

| | Message |
|---|---------|
| **User** | "The file '{path}' doesn't exist or isn't indexed." |
| **Developer** | `FILE_NOT_FOUND: {path} not in index` |

**Solution:**
1. Check the file path is correct
2. Make sure the file hasn't been deleted
3. Check if the file is in the exclude list or deny list

---

### INVALID_PATTERN

**When:** A glob pattern in search_by_path is malformed.

| | Message |
|---|---------|
| **User** | "The search pattern '{pattern}' is invalid. Please check the syntax." |
| **Developer** | `INVALID_PATTERN: {glob_error}` |

**Solution:** Fix the glob pattern. Valid examples:
- `**/*.ts` - All TypeScript files
- `src/**/*` - Everything in src folder
- `**/auth*` - Files with "auth" in the name

---

### PROJECT_NOT_DETECTED

**When:** Can't find a project root marker (.git, package.json, etc.).

| | Message |
|---|---------|
| **User** | "Could not detect project root. Please choose a directory." |
| **Developer** | `PROJECT_NOT_DETECTED: No markers found in path hierarchy` |

**Solution:** You'll be prompted to:
1. Use the current directory as project root, OR
2. Enter a custom path

---

### SYMLINK_NOT_ALLOWED

**When:** A file is a symbolic link (symlink) pointing elsewhere.

| | Message |
|---|---------|
| **User** | "Symbolic links are not allowed for security reasons." |
| **Developer** | `SYMLINK_NOT_ALLOWED: Symlink detected at path: {path}` |

**Why:** Symlinks could point to sensitive files outside your project (e.g., `/etc/passwd`). For security, Search MCP skips symlinks during indexing.

**Solution:**
1. This is expected security behavior - symlinks are skipped with a warning
2. If you need the file indexed, replace the symlink with the actual file
3. During indexing, symlinks are silently skipped (no error thrown)

---

### Resource Limits

Search MCP enforces resource limits to prevent denial-of-service attacks:

| Limit | Value | Error When Exceeded |
|-------|-------|---------------------|
| Query length | 1,000 chars | Zod validation error |
| Glob pattern length | 200 chars | Zod validation error |
| Glob wildcards | 10 max | "Pattern has too many wildcards" |
| Chunks per file | 1,000 | ResourceLimitError |
| Directory depth | 20 levels | Traversal stops |
| JSON config size | 10 MB | ResourceLimitError |
| Glob results | 100,000 files | ResourceLimitError |

**If you hit a limit:**
1. **Query too long**: Break your search into smaller queries
2. **Too many chunks**: Split very large files or exclude them
3. **Too many files**: Add patterns to `exclude` in config
4. **Pattern too complex**: Simplify your glob pattern

---

## Common Issues

### Search results seem irrelevant

**Cause:** Index might be stale or corrupted.

**Solution:** Run `reindex_project` to rebuild from scratch.

---

### Indexing is very slow

**Cause:** Large project or many files.

**Solutions:**
1. Add patterns to `exclude` in config
2. Make sure `node_modules` and build folders are being skipped (they should be by default)
3. Check if binary files are being detected correctly
4. Consider using the `lazy` or `git` indexing strategy

---

### Changes not being picked up

**Cause:** File watcher might have missed events.

**Solutions:**
1. Run `reindex_file` for the specific file
2. Run `reindex_project` to force full rebuild
3. The integrity engine runs on startup and catches drift
4. If using `git` strategy, changes aren't indexed until committed

---

### Model keeps re-downloading

**Cause:** Cache directory permissions or corruption.

**Solution:**
1. Check `~/.cache/huggingface/` exists and is writable
2. Delete the cache folder and let it re-download fresh

---

### MCP server not connecting

**Cause:** Configuration file syntax error or wrong location.

**Solutions:**
1. Validate JSON syntax (use a JSON validator)
2. Verify config file is in the correct location for your client
3. Restart the AI assistant after config changes
4. Check Node.js is installed: `node --version`

---

### First search is slow

**Cause:** Lazy strategy flushing pending changes.

**Solutions:**
1. This is expected behavior with `lazy` indexing strategy
2. Subsequent searches will be fast
3. Switch to `realtime` strategy if instant results are critical

---

## Getting Help

- [GitHub Issues](https://github.com/blakazulu/search-mcp/issues) - Report bugs or request features
- [Getting Started Guide](./getting-started.md) - Installation help
- [Configuration Reference](./configuration.md) - Settings reference

---

## Next Steps

- [Getting Started](./getting-started.md) - Installation guide
- [Configuration](./configuration.md) - Customize indexing behavior
- [Examples](./examples.md) - Common use cases
