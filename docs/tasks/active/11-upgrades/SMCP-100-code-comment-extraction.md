---
task_id: "SMCP-100"
title: "Code Comment Extraction"
category: "Technical"
priority: "P3"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["indexing", "comments", "docs", "search-quality"]
---
# Task: Code Comment Extraction

## Overview

Extract and index code comments separately for doc search. JSDoc, docstrings, and inline comments contain valuable documentation that should be searchable through `search_docs` alongside markdown files.

## Current Problem

```typescript
// Current: Comments buried in code chunks
// search_docs only searches .md and .txt files
// Valuable documentation in code is only in search_code results

/**
 * Authenticates a user with the given credentials.
 * @param username - The user's login name
 * @param password - The user's password
 * @returns A JWT token if successful
 * @throws AuthenticationError if credentials are invalid
 */
async function authenticateUser(username: string, password: string): Promise<string> {
    // This documentation is not searchable via search_docs
}
```

**Problem:** Searching "how to authenticate" in docs returns nothing, even though the answer is in JSDoc.

## Target Solution

```typescript
// After: Comments extracted and indexed in docs search
const extractedDocs = [
    {
        type: 'jsdoc',
        content: 'Authenticates a user with the given credentials...',
        symbol: 'authenticateUser',
        file: 'auth.ts',
        line: 15,
    },
    {
        type: 'docstring',
        content: 'Calculate the total price including tax and discounts...',
        symbol: 'calculate_total',
        file: 'pricing.py',
        line: 42,
    },
];

// Now searchable via search_docs:
// Query: "how to authenticate" → finds JSDoc from auth.ts
// Query: "calculate price" → finds docstring from pricing.py
```

## Goals

- [ ] Extract JSDoc/TSDoc comments from JS/TS files
- [ ] Extract docstrings from Python files
- [ ] Extract block comments from other languages
- [ ] Index extracted docs in docs search
- [ ] Link back to source code location

## Success Criteria

- JSDoc comments searchable via search_docs
- Python docstrings searchable via search_docs
- Source file and line number in results
- No duplication (same content in code AND docs)
- Configurable (can disable if not wanted)

## Implementation Details

### Comment Types to Extract

```typescript
type CommentType =
    | 'jsdoc'       // /** ... */ in JS/TS
    | 'tsdoc'       // /** ... */ with @tags in TS
    | 'docstring'   // """...""" or '''...''' in Python
    | 'rustdoc'     // /// or //! in Rust
    | 'javadoc'     // /** ... */ in Java
    | 'xmldoc'      // /// <summary> in C#
    | 'godoc'       // // Package/Function comments in Go
    | 'block'       // /* ... */ generic
    | 'inline';     // // or # generic
```

### Extraction Patterns

```typescript
// JavaScript/TypeScript JSDoc
const JSDOC_PATTERN = /\/\*\*\s*([\s\S]*?)\s*\*\//g;

// Python docstrings (after def/class)
const PYTHON_DOCSTRING = /(?:def|class)\s+(\w+)[^:]*:\s*(?:\n\s*)?("""[\s\S]*?"""|'''[\s\S]*?''')/g;

// Rust doc comments
const RUSTDOC_PATTERN = /(?:\/\/\/|\/\/!)\s*(.+)/g;

// Go doc comments (must precede declaration)
const GODOC_PATTERN = /\/\/\s*(\w+)\s+(.+?)(?=\nfunc|\ntype|\nvar|\nconst)/g;
```

### Extractor Interface

```typescript
interface ExtractedComment {
    type: CommentType;
    content: string;          // The comment text (cleaned)
    rawContent: string;       // Original with markers
    symbol?: string;          // Associated function/class name
    filePath: string;
    startLine: number;
    endLine: number;
    tags?: CommentTag[];      // @param, @returns, etc.
}

interface CommentTag {
    name: string;             // 'param', 'returns', 'example'
    value: string;            // Tag content
}

interface CommentExtractor {
    extract(content: string, filePath: string): ExtractedComment[];
}
```

### JSDoc Extractor

```typescript
class JSDocExtractor implements CommentExtractor {
    private readonly JSDOC_REGEX = /\/\*\*\s*([\s\S]*?)\s*\*\//g;
    private readonly TAG_REGEX = /@(\w+)\s*(?:\{([^}]+)\})?\s*(\[?\w+\]?)?\s*-?\s*(.*)/g;

    extract(content: string, filePath: string): ExtractedComment[] {
        const comments: ExtractedComment[] = [];
        const lines = content.split('\n');

        let match;
        while ((match = this.JSDOC_REGEX.exec(content)) !== null) {
            const rawContent = match[0];
            const commentBody = match[1];

            // Find line number
            const beforeMatch = content.slice(0, match.index);
            const startLine = beforeMatch.split('\n').length;

            // Find associated symbol (next non-comment line)
            const symbol = this.findAssociatedSymbol(content, match.index + rawContent.length);

            // Parse tags
            const tags = this.parseTags(commentBody);

            // Clean content
            const cleanContent = this.cleanJSDoc(commentBody);

            comments.push({
                type: 'jsdoc',
                content: cleanContent,
                rawContent,
                symbol,
                filePath,
                startLine,
                endLine: startLine + rawContent.split('\n').length - 1,
                tags,
            });
        }

        return comments;
    }

    private cleanJSDoc(content: string): string {
        return content
            .replace(/^\s*\*\s?/gm, '')  // Remove leading * from each line
            .replace(/@\w+[^\n]*/g, '')  // Remove @tags
            .trim();
    }

    private findAssociatedSymbol(content: string, afterIndex: number): string | undefined {
        const remaining = content.slice(afterIndex);
        const match = remaining.match(/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/);
        return match?.[1];
    }

    private parseTags(content: string): CommentTag[] {
        const tags: CommentTag[] = [];
        let match;
        while ((match = this.TAG_REGEX.exec(content)) !== null) {
            tags.push({
                name: match[1],
                value: [match[2], match[3], match[4]].filter(Boolean).join(' '),
            });
        }
        return tags;
    }
}
```

### Python Docstring Extractor

```typescript
class PythonDocstringExtractor implements CommentExtractor {
    private readonly DOCSTRING_REGEX = /(?:def|class)\s+(\w+)[^:]*:\s*\n(\s*)("""[\s\S]*?"""|'''[\s\S]*?''')/g;

    extract(content: string, filePath: string): ExtractedComment[] {
        const comments: ExtractedComment[] = [];

        let match;
        while ((match = this.DOCSTRING_REGEX.exec(content)) !== null) {
            const symbol = match[1];
            const rawContent = match[3];

            const beforeMatch = content.slice(0, match.index);
            const startLine = beforeMatch.split('\n').length;

            const cleanContent = rawContent
                .replace(/^["']{3}|["']{3}$/g, '')
                .trim();

            comments.push({
                type: 'docstring',
                content: cleanContent,
                rawContent,
                symbol,
                filePath,
                startLine,
                endLine: startLine + rawContent.split('\n').length - 1,
            });
        }

        return comments;
    }
}
```

### Integration with Docs Index

```typescript
// In indexing pipeline
async function indexProject(projectPath: string) {
    // Index markdown files (existing)
    const docFiles = await glob('**/*.{md,txt}', { cwd: projectPath });
    await indexDocFiles(docFiles);

    // NEW: Extract and index code comments
    if (config.extractComments !== false) {
        const codeFiles = await glob('**/*.{ts,js,py,rs,go,java}', { cwd: projectPath });

        for (const file of codeFiles) {
            const content = await fs.readFile(file, 'utf-8');
            const extractor = getExtractorForFile(file);
            const comments = extractor.extract(content, file);

            // Index each comment as a doc chunk
            for (const comment of comments) {
                await indexDocChunk({
                    text: formatCommentForIndex(comment),
                    metadata: {
                        type: 'code-comment',
                        commentType: comment.type,
                        symbol: comment.symbol,
                        filePath: comment.filePath,
                        startLine: comment.startLine,
                    },
                });
            }
        }
    }
}

function formatCommentForIndex(comment: ExtractedComment): string {
    let text = comment.content;

    if (comment.symbol) {
        text = `${comment.symbol}: ${text}`;
    }

    if (comment.tags?.length) {
        const tagText = comment.tags
            .map(t => `@${t.name}: ${t.value}`)
            .join('\n');
        text += '\n\n' + tagText;
    }

    return text;
}
```

## Subtasks

### Phase 1: Extractors (4 hours)

- [ ] 1.1 Implement JSDoc/TSDoc extractor
- [ ] 1.2 Implement Python docstring extractor
- [ ] 1.3 Implement Rust doc comment extractor
- [ ] 1.4 Implement Go doc comment extractor
- [ ] 1.5 Unit tests for each extractor

### Phase 2: Integration (2 hours)

- [ ] 2.1 Add extraction to indexing pipeline
- [ ] 2.2 Store in docs index with metadata
- [ ] 2.3 Add configuration option
- [ ] 2.4 Handle deduplication

### Phase 3: Testing (2 hours)

- [ ] 3.1 Test search_docs finds code comments
- [ ] 3.2 Test result formatting with source link
- [ ] 3.3 Performance impact testing
- [ ] 3.4 Integration tests

## Resources

- [JSDoc reference](https://jsdoc.app/)
- [Python docstring conventions (PEP 257)](https://www.python.org/dev/peps/pep-0257/)
- [Rust doc comments](https://doc.rust-lang.org/rustdoc/)
- [Go doc comments](https://go.dev/doc/comment)

## Acceptance Checklist

- [ ] JSDoc comments extracted and indexed
- [ ] Python docstrings extracted and indexed
- [ ] search_docs returns code comments
- [ ] Source location in results
- [ ] Configurable enable/disable
- [ ] Tests pass

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on ROADMAP.md item
- Focus on making code documentation searchable

## Notes - after finishing update these in future roadmap tasks

- Consider whether to index ALL comments or just doc comments
- May want to filter short/trivial comments
- Could enhance results to show code context alongside comment
- Future: Support more languages (PHP, Ruby, Java, C#)
