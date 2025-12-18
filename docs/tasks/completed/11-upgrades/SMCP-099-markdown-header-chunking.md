---
task_id: "SMCP-099"
title: "Markdown Header Chunking"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-16"
completed_date: "2025-12-18"
due_date: ""
estimated_hours: 6
actual_hours: 4
assigned_to: "Team"
tags: ["chunking", "markdown", "docs", "quality"]
---

# Task: Markdown Header Chunking

## Overview

Split markdown documents by headers for better context preservation. Instead of arbitrary character-based splits, chunk at semantic boundaries (h1, h2, h3) so each chunk represents a complete section.

## Current Problem

```markdown
# Installation

Run `npm install search-mcp`...

## Configuration

Create a config file...
<--- CHUNK BOUNDARY (arbitrary) --->
...with these options:

- option1: description
- option2: description

## Usage
...
```

**Problem:** Chunks split mid-section, losing context about what section the content belongs to.

## Target Solution

```markdown
# Chunk 1: Installation section
# Installation

Run `npm install search-mcp`...

---

# Chunk 2: Configuration section
## Configuration

Create a config file with these options:

- option1: description
- option2: description

---

# Chunk 3: Usage section
## Usage
...
```

**Benefit:** Each chunk is a complete, self-contained section with full context.

## Goals

- [x] Parse markdown headers (h1-h6)
- [x] Chunk at header boundaries
- [x] Include header hierarchy in chunk metadata
- [x] Handle large sections (sub-chunk if needed)
- [x] Preserve header context in embeddings

## Success Criteria

- Chunks align with markdown sections
- Header hierarchy preserved in metadata
- Large sections handled gracefully
- Improved search relevance for docs
- No regression for non-markdown files

## Implementation Details

### Header Parsing

```typescript
interface MarkdownSection {
    level: number;           // 1-6 for h1-h6
    title: string;           // Header text
    content: string;         // Section content (until next header)
    path: string[];          // Hierarchy: ["Installation", "Prerequisites"]
    startLine: number;
    endLine: number;
}

function parseMarkdownSections(content: string): MarkdownSection[] {
    const lines = content.split('\n');
    const sections: MarkdownSection[] = [];
    const headerStack: Array<{ level: number; title: string }> = [];

    let currentSection: MarkdownSection | null = null;
    let contentBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headerMatch) {
            // Save previous section
            if (currentSection) {
                currentSection.content = contentBuffer.join('\n');
                currentSection.endLine = i - 1;
                sections.push(currentSection);
            }

            const level = headerMatch[1].length;
            const title = headerMatch[2].trim();

            // Update header stack
            while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
                headerStack.pop();
            }
            headerStack.push({ level, title });

            // Start new section
            currentSection = {
                level,
                title,
                content: '',
                path: headerStack.map(h => h.title),
                startLine: i,
                endLine: -1,
            };
            contentBuffer = [];
        } else {
            contentBuffer.push(line);
        }
    }

    // Save last section
    if (currentSection) {
        currentSection.content = contentBuffer.join('\n');
        currentSection.endLine = lines.length - 1;
        sections.push(currentSection);
    }

    return sections;
}
```

### Chunking Strategy

```typescript
interface DocChunkOptions {
    maxChunkSize: number;     // Default: 8000 chars
    minChunkSize: number;     // Default: 500 chars
    includeHeaderPath: boolean; // Default: true
}

function chunkMarkdown(content: string, options: DocChunkOptions): Chunk[] {
    const sections = parseMarkdownSections(content);
    const chunks: Chunk[] = [];

    for (const section of sections) {
        const sectionText = formatSection(section, options);

        if (sectionText.length <= options.maxChunkSize) {
            // Section fits in one chunk
            chunks.push({
                text: sectionText,
                metadata: {
                    headerPath: section.path,
                    headerLevel: section.level,
                    startLine: section.startLine,
                    endLine: section.endLine,
                },
            });
        } else {
            // Large section: sub-chunk with header context
            const subChunks = subChunkSection(section, options);
            chunks.push(...subChunks);
        }
    }

    return chunks;
}

function formatSection(section: MarkdownSection, options: DocChunkOptions): string {
    if (options.includeHeaderPath && section.path.length > 1) {
        // Include breadcrumb for context
        const breadcrumb = section.path.slice(0, -1).join(' > ');
        return `[${breadcrumb}]\n\n${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`;
    }
    return `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`;
}
```

### Handling Large Sections

```typescript
function subChunkSection(section: MarkdownSection, options: DocChunkOptions): Chunk[] {
    const chunks: Chunk[] = [];
    const header = `${'#'.repeat(section.level)} ${section.title}`;
    const breadcrumb = section.path.length > 1
        ? `[${section.path.slice(0, -1).join(' > ')}]\n\n`
        : '';

    // Split content into paragraphs
    const paragraphs = section.content.split(/\n\n+/);
    let buffer = `${breadcrumb}${header}\n\n`;
    let partNum = 1;

    for (const paragraph of paragraphs) {
        if (buffer.length + paragraph.length > options.maxChunkSize) {
            // Save current buffer
            if (buffer.trim().length > options.minChunkSize) {
                chunks.push({
                    text: buffer.trim(),
                    metadata: {
                        headerPath: section.path,
                        headerLevel: section.level,
                        part: partNum++,
                    },
                });
            }
            // Start new buffer with context
            buffer = `${breadcrumb}${header} (continued)\n\n${paragraph}\n\n`;
        } else {
            buffer += paragraph + '\n\n';
        }
    }

    // Save remaining buffer
    if (buffer.trim().length > options.minChunkSize) {
        chunks.push({
            text: buffer.trim(),
            metadata: {
                headerPath: section.path,
                headerLevel: section.level,
                part: partNum,
            },
        });
    }

    return chunks;
}
```

### Metadata Enhancement

```typescript
interface DocChunkMetadata {
    filePath: string;
    startLine: number;
    endLine: number;
    headerPath: string[];      // ["Installation", "Prerequisites", "Node.js"]
    headerLevel: number;       // 1-6
    part?: number;             // For sub-chunked large sections
    sectionTitle: string;      // Last element of headerPath
}
```

## Subtasks

### Phase 1: Parser (2 hours)

- [x] 1.1 Implement markdown header parser
- [x] 1.2 Build header hierarchy tracker
- [x] 1.3 Handle edge cases (no headers, setext headers)
- [x] 1.4 Unit tests for parser

### Phase 2: Chunking (2 hours)

- [x] 2.1 Implement section-based chunking
- [x] 2.2 Add header context to chunks
- [x] 2.3 Handle large section sub-chunking
- [x] 2.4 Add breadcrumb formatting

### Phase 3: Integration (2 hours)

- [x] 3.1 Integrate with docs indexing pipeline
- [x] 3.2 Update chunk metadata schema
- [x] 3.3 Add configuration options
- [x] 3.4 Integration tests
- [x] 3.5 Documentation update

## Resources

- [Current chunking.ts](../../../src/engines/chunking.ts)
- [CommonMark spec](https://spec.commonmark.org/)
- [remark parser](https://github.com/remarkjs/remark) (reference)

## Acceptance Checklist

- [x] Markdown headers parsed correctly
- [x] Chunks align with sections
- [x] Header hierarchy in metadata
- [x] Large sections sub-chunked properly
- [x] Search relevance improved
- [x] Tests pass

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on ROADMAP.md item
- Focus on semantic chunking for documentation

### 2025-12-18 - 4 hours

- Implemented full markdown header chunking in `src/engines/markdownChunking.ts`
- Features implemented:
  - ATX header parsing (# through ######)
  - Setext header parsing (=== and ---)
  - YAML frontmatter detection and stripping
  - Code block boundary detection
  - Header hierarchy tracking with breadcrumb context
  - Large section sub-chunking with "(continued)" markers
  - Part number tracking in metadata
- Integrated with `chunkDocFile()` in `docsChunking.ts`
- Added 60+ unit tests in `tests/unit/engines/markdownChunking.test.ts`
- Updated exports in `src/engines/index.ts`
- Updated CHANGELOG.md with feature documentation
- All tests passing, build successful

## Notes

- [x] Consider setext-style headers (`===` and `---` underlines) - Implemented
- [x] Handle frontmatter (YAML between `---`) - Implemented
- [x] May want to treat code blocks as atomic units - Implemented (code blocks preserved within sections)
- Consider adding support for other doc formats (RST, AsciiDoc) later
