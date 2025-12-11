# Contributing to Search MCP

Thank you for your interest in contributing to Search MCP! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Code Style](#code-style)
- [Project Structure](#project-structure)

---

## Code of Conduct

Be respectful and inclusive. We're all here to build something useful together.

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/search-mcp.git
   cd search-mcp
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/blakazulu/search-mcp.git
   ```

---

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm run test        # Run all tests once
npm run test:watch  # Run tests in watch mode
```

### Run Locally

```bash
# Run the MCP server locally
npx .

# Or link globally for testing
npm link
search-mcp
```

---

## Making Changes

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/changes

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:
```
feat(search): add hybrid search with BM25
fix(index): handle empty files gracefully
docs(readme): add troubleshooting section
```

---

## Testing

### Running Tests

```bash
npm run test              # Run all tests
npx vitest run <file>     # Run specific test file
npm run test:watch        # Watch mode
```

### Writing Tests

- Tests live in `tests/` directory, mirroring `src/` structure
- Use Vitest for testing
- Aim for meaningful test coverage, not 100% coverage
- Test edge cases and error conditions

Example test:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/myModule.js';

describe('myFunction', () => {
  it('should handle normal input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction('')).toThrow();
  });
});
```

---

## Submitting a Pull Request

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a branch**:
   ```bash
   git checkout -b feat/my-feature
   ```

3. **Make your changes** and commit them

4. **Run tests and lint**:
   ```bash
   npm run lint
   npm run test
   npm run build
   ```

5. **Push to your fork**:
   ```bash
   git push origin feat/my-feature
   ```

6. **Open a Pull Request** on GitHub

### PR Checklist

- [ ] Tests pass locally
- [ ] Build succeeds
- [ ] Lint passes
- [ ] New features have tests
- [ ] Documentation updated if needed
- [ ] Commit messages follow convention

---

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters and returns
- Use `async/await` over raw Promises

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### File Organization

- One export per file when possible
- Group related functions together
- Put types/interfaces at the top of files

---

## Project Structure

```
search-mcp/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server setup
│   ├── tools/             # MCP tool implementations
│   │   ├── createIndex.ts
│   │   ├── searchCode.ts
│   │   └── ...
│   ├── engines/           # Core processing logic
│   │   ├── chunking.ts
│   │   ├── embedding.ts
│   │   └── ...
│   ├── storage/           # Persistence layer
│   │   ├── lancedb.ts
│   │   ├── config.ts
│   │   └── ...
│   └── utils/             # Shared utilities
├── tests/                 # Test files (mirrors src/)
├── docs/                  # Documentation
└── dist/                  # Built output (gitignored)
```

---

## Need Help?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Join discussions on GitHub

Thank you for contributing!
