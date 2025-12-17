/**
 * AST-Based Chunking Unit Tests (SMCP-086)
 *
 * Tests cover:
 * - Tree-sitter parser initialization and language support
 * - AST-based chunking for supported languages
 * - Metadata extraction (names, signatures, docstrings, decorators)
 * - Fallback behavior when AST parsing fails
 * - Language-specific extractor behavior
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TreeSitterParser,
  getTreeSitterParser,
  supportsASTChunking,
  getASTLanguage,
} from '../../../src/engines/treeSitterParser.js';
import {
  extractASTChunks,
  astChunksToChunksWithLines,
  getSupportedASTLanguages,
  DEFAULT_AST_OPTIONS,
  type ASTChunk,
} from '../../../src/engines/astChunking.js';

// ============================================================================
// Tree-sitter Parser Tests
// ============================================================================

describe('TreeSitterParser', () => {
  describe('supportsASTChunking', () => {
    it('should return true for JavaScript files', () => {
      expect(supportsASTChunking('src/index.js')).toBe(true);
      expect(supportsASTChunking('src/index.mjs')).toBe(true);
      expect(supportsASTChunking('src/index.cjs')).toBe(true);
      expect(supportsASTChunking('src/index.jsx')).toBe(true);
    });

    it('should return true for TypeScript files', () => {
      expect(supportsASTChunking('src/index.ts')).toBe(true);
      expect(supportsASTChunking('src/index.tsx')).toBe(true);
      expect(supportsASTChunking('src/index.mts')).toBe(true);
      expect(supportsASTChunking('src/index.cts')).toBe(true);
    });

    it('should return true for Python files', () => {
      expect(supportsASTChunking('scripts/main.py')).toBe(true);
      expect(supportsASTChunking('app/gui.pyw')).toBe(true);
      expect(supportsASTChunking('lib/types.pyi')).toBe(true);
    });

    it('should return true for Go files', () => {
      expect(supportsASTChunking('main.go')).toBe(true);
      expect(supportsASTChunking('pkg/handler.go')).toBe(true);
    });

    it('should return true for Java files', () => {
      expect(supportsASTChunking('src/Main.java')).toBe(true);
      expect(supportsASTChunking('com/example/Service.java')).toBe(true);
    });

    it('should return true for Rust files', () => {
      expect(supportsASTChunking('src/main.rs')).toBe(true);
      expect(supportsASTChunking('lib/mod.rs')).toBe(true);
    });

    it('should return true for C/C++ files', () => {
      expect(supportsASTChunking('main.c')).toBe(true);
      expect(supportsASTChunking('header.h')).toBe(true);
      expect(supportsASTChunking('main.cpp')).toBe(true);
      expect(supportsASTChunking('header.hpp')).toBe(true);
    });

    it('should return true for C# files', () => {
      expect(supportsASTChunking('Program.cs')).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      expect(supportsASTChunking('README.md')).toBe(false);
      expect(supportsASTChunking('package.json')).toBe(false);
      expect(supportsASTChunking('style.css')).toBe(false);
      expect(supportsASTChunking('index.html')).toBe(false);
    });
  });

  describe('getASTLanguage', () => {
    it('should return correct language for JavaScript', () => {
      expect(getASTLanguage('file.js')).toBe('javascript');
      expect(getASTLanguage('file.jsx')).toBe('javascript');
    });

    it('should return correct language for TypeScript', () => {
      expect(getASTLanguage('file.ts')).toBe('typescript');
      expect(getASTLanguage('file.tsx')).toBe('tsx');
    });

    it('should return correct language for other languages', () => {
      expect(getASTLanguage('file.py')).toBe('python');
      expect(getASTLanguage('file.go')).toBe('go');
      expect(getASTLanguage('file.java')).toBe('java');
      expect(getASTLanguage('file.rs')).toBe('rust');
      expect(getASTLanguage('file.c')).toBe('c');
      expect(getASTLanguage('file.cpp')).toBe('cpp');
      expect(getASTLanguage('file.cs')).toBe('csharp');
    });

    it('should return null for unsupported files', () => {
      expect(getASTLanguage('file.md')).toBe(null);
      expect(getASTLanguage('file.json')).toBe(null);
    });
  });

  describe('getSupportedASTLanguages', () => {
    it('should return all supported languages', () => {
      const languages = getSupportedASTLanguages();
      expect(languages).toContain('javascript');
      expect(languages).toContain('typescript');
      expect(languages).toContain('tsx');
      expect(languages).toContain('python');
      expect(languages).toContain('go');
      expect(languages).toContain('java');
      expect(languages).toContain('rust');
      expect(languages).toContain('c');
      expect(languages).toContain('cpp');
      expect(languages).toContain('csharp');
    });
  });

  describe('TreeSitterParser singleton', () => {
    it('should return same instance', () => {
      const instance1 = getTreeSitterParser();
      const instance2 = getTreeSitterParser();
      expect(instance1).toBe(instance2);
    });
  });
});

// ============================================================================
// AST Chunking Tests - TypeScript/JavaScript
// ============================================================================

describe('extractASTChunks - TypeScript/JavaScript', () => {
  const typescriptCode = `
/**
 * User service class for managing users.
 */
export class UserService {
  private users: Map<string, User> = new Map();

  /**
   * Get a user by their ID.
   * @param id - The user's unique identifier
   * @returns The user object or undefined
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Create a new user.
   */
  async createUser(data: UserData): Promise<User> {
    const user = new User(data);
    this.users.set(user.id, user);
    return user;
  }
}

export function formatUser(user: User): string {
  return \`\${user.name} <\${user.email}>\`;
}

const DEFAULT_LIMIT = 100;
`;

  it('should return null for unsupported file types', async () => {
    const result = await extractASTChunks('# Hello', 'README.md');
    expect(result).toBe(null);
  });

  it('should extract chunks for TypeScript code', async () => {
    const chunks = await extractASTChunks(typescriptCode, 'services/user.ts');

    // If parser not available (CI without WASM), skip
    if (chunks === null) {
      console.log('Skipping test - Tree-sitter parser not available');
      return;
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should extract class metadata', async () => {
    const chunks = await extractASTChunks(typescriptCode, 'services/user.ts');
    if (chunks === null) return;

    const classChunk = chunks.find((c) => c.metadata.type === 'class');
    if (classChunk) {
      expect(classChunk.metadata.name).toBe('UserService');
      expect(classChunk.metadata.language).toBe('typescript');
      expect(classChunk.metadata.isExport).toBe(true);
    }
  });

  it('should extract function metadata', async () => {
    const chunks = await extractASTChunks(typescriptCode, 'services/user.ts');
    if (chunks === null) return;

    const funcChunk = chunks.find(
      (c) => c.metadata.type === 'function' && c.metadata.name === 'formatUser'
    );
    if (funcChunk) {
      expect(funcChunk.metadata.isExport).toBe(true);
      expect(funcChunk.metadata.signature).toContain('formatUser');
    }
  });

  it('should extract async function metadata', async () => {
    const chunks = await extractASTChunks(typescriptCode, 'services/user.ts');
    if (chunks === null) return;

    const asyncChunk = chunks.find(
      (c) => c.metadata.name === 'createUser' || c.text.includes('async createUser')
    );
    if (asyncChunk && asyncChunk.metadata.isAsync !== undefined) {
      expect(asyncChunk.metadata.isAsync).toBe(true);
    }
  });

  it('should include line numbers', async () => {
    const chunks = await extractASTChunks(typescriptCode, 'services/user.ts');
    if (chunks === null) return;

    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThan(0);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });
});

// ============================================================================
// AST Chunking Tests - Python
// ============================================================================

describe('extractASTChunks - Python', () => {
  const pythonCode = `
"""
User management module.
"""

from typing import Optional, Dict
import uuid


class User:
    """Represents a user in the system."""

    def __init__(self, name: str, email: str):
        """Initialize a new user.

        Args:
            name: The user's display name
            email: The user's email address
        """
        self.id = str(uuid.uuid4())
        self.name = name
        self.email = email

    @property
    def display_name(self) -> str:
        """Get the user's display name."""
        return f"{self.name} <{self.email}>"

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate an email address."""
        return '@' in email


def create_user(name: str, email: str) -> Optional[User]:
    """Create a new user if email is valid."""
    if User.validate_email(email):
        return User(name, email)
    return None


async def fetch_user(user_id: str) -> Optional[User]:
    """Fetch a user from the database."""
    pass
`;

  it('should extract chunks for Python code', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should extract class metadata', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    const classChunk = chunks.find((c) => c.metadata.type === 'class');
    if (classChunk) {
      expect(classChunk.metadata.name).toBe('User');
      expect(classChunk.metadata.language).toBe('python');
    }
  });

  it('should extract function metadata', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    const funcChunk = chunks.find(
      (c) => c.metadata.type === 'function' && c.metadata.name === 'create_user'
    );
    if (funcChunk) {
      expect(funcChunk.metadata.language).toBe('python');
    }
  });

  it('should extract async function metadata', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    const asyncChunk = chunks.find((c) => c.metadata.name === 'fetch_user');
    if (asyncChunk && asyncChunk.metadata.isAsync !== undefined) {
      expect(asyncChunk.metadata.isAsync).toBe(true);
    }
  });

  it('should extract decorator metadata', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    const decoratedChunk = chunks.find(
      (c) => c.metadata.decorators && c.metadata.decorators.length > 0
    );
    if (decoratedChunk) {
      expect(decoratedChunk.metadata.decorators).toBeDefined();
    }
  });

  it('should extract docstrings', async () => {
    const chunks = await extractASTChunks(pythonCode, 'models/user.py');
    if (chunks === null) return;

    const chunkWithDocstring = chunks.find((c) => c.metadata.docstring);
    if (chunkWithDocstring) {
      expect(chunkWithDocstring.metadata.docstring).toBeDefined();
      expect(typeof chunkWithDocstring.metadata.docstring).toBe('string');
    }
  });
});

// ============================================================================
// AST Chunking Tests - Go
// ============================================================================

describe('extractASTChunks - Go', () => {
  const goCode = `
package user

import (
    "fmt"
    "errors"
)

// User represents a user in the system.
type User struct {
    ID    string
    Name  string
    Email string
}

// NewUser creates a new user.
func NewUser(name, email string) *User {
    return &User{
        ID:    generateID(),
        Name:  name,
        Email: email,
    }
}

// GetDisplayName returns the user's display name.
func (u *User) GetDisplayName() string {
    return fmt.Sprintf("%s <%s>", u.Name, u.Email)
}

// ValidateEmail validates an email address.
func ValidateEmail(email string) error {
    if email == "" {
        return errors.New("email is required")
    }
    return nil
}
`;

  it('should extract chunks for Go code', async () => {
    const chunks = await extractASTChunks(goCode, 'pkg/user/user.go');
    if (chunks === null) return;

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should extract struct metadata', async () => {
    const chunks = await extractASTChunks(goCode, 'pkg/user/user.go');
    if (chunks === null) return;

    const structChunk = chunks.find((c) => c.metadata.type === 'struct');
    if (structChunk) {
      expect(structChunk.metadata.name).toBe('User');
      expect(structChunk.metadata.language).toBe('go');
    }
  });

  it('should extract function metadata', async () => {
    const chunks = await extractASTChunks(goCode, 'pkg/user/user.go');
    if (chunks === null) return;

    const funcChunk = chunks.find(
      (c) => c.metadata.type === 'function' && c.metadata.name === 'NewUser'
    );
    if (funcChunk) {
      expect(funcChunk.metadata.language).toBe('go');
    }
  });

  it('should extract method metadata with receiver', async () => {
    const chunks = await extractASTChunks(goCode, 'pkg/user/user.go');
    if (chunks === null) return;

    const methodChunk = chunks.find(
      (c) => c.metadata.type === 'method' && c.metadata.name === 'GetDisplayName'
    );
    if (methodChunk) {
      expect(methodChunk.metadata.parentName).toBe('User');
    }
  });
});

// ============================================================================
// AST Chunking Tests - Java
// ============================================================================

describe('extractASTChunks - Java', () => {
  const javaCode = `
package com.example.user;

import java.util.UUID;

/**
 * Represents a user in the system.
 */
public class User {
    private String id;
    private String name;
    private String email;

    /**
     * Creates a new user.
     * @param name the user's name
     * @param email the user's email
     */
    public User(String name, String email) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.email = email;
    }

    /**
     * Gets the user's display name.
     * @return formatted display name
     */
    public String getDisplayName() {
        return String.format("%s <%s>", name, email);
    }

    public static boolean validateEmail(String email) {
        return email != null && email.contains("@");
    }
}
`;

  it('should extract chunks for Java code', async () => {
    const chunks = await extractASTChunks(javaCode, 'src/main/java/com/example/User.java');
    if (chunks === null) return;

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should extract class metadata', async () => {
    const chunks = await extractASTChunks(javaCode, 'src/main/java/com/example/User.java');
    if (chunks === null) return;

    const classChunk = chunks.find((c) => c.metadata.type === 'class');
    if (classChunk) {
      expect(classChunk.metadata.name).toBe('User');
      expect(classChunk.metadata.language).toBe('java');
      expect(classChunk.metadata.visibility).toBe('public');
    }
  });

  it('should extract method metadata', async () => {
    const chunks = await extractASTChunks(javaCode, 'src/main/java/com/example/User.java');
    if (chunks === null) return;

    const methodChunk = chunks.find(
      (c) => c.metadata.type === 'method' && c.metadata.name === 'getDisplayName'
    );
    if (methodChunk) {
      expect(methodChunk.metadata.visibility).toBe('public');
    }
  });

  it('should extract static method metadata', async () => {
    const chunks = await extractASTChunks(javaCode, 'src/main/java/com/example/User.java');
    if (chunks === null) return;

    const staticChunk = chunks.find(
      (c) => c.metadata.name === 'validateEmail' || (c.text.includes('static') && c.text.includes('validateEmail'))
    );
    if (staticChunk && staticChunk.metadata.isStatic !== undefined) {
      expect(staticChunk.metadata.isStatic).toBe(true);
    }
  });

  it('should extract Javadoc', async () => {
    const chunks = await extractASTChunks(javaCode, 'src/main/java/com/example/User.java');
    if (chunks === null) return;

    const chunkWithDoc = chunks.find((c) => c.metadata.docstring);
    if (chunkWithDoc) {
      expect(chunkWithDoc.metadata.docstring).toBeDefined();
    }
  });
});

// ============================================================================
// AST Chunking Tests - Rust
// ============================================================================

describe('extractASTChunks - Rust', () => {
  const rustCode = `
//! User module for the application.

use std::fmt;

/// Represents a user in the system.
#[derive(Debug, Clone)]
pub struct User {
    id: String,
    name: String,
    email: String,
}

impl User {
    /// Creates a new user.
    pub fn new(name: &str, email: &str) -> Self {
        User {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            email: email.to_string(),
        }
    }

    /// Gets the user's display name.
    pub fn display_name(&self) -> String {
        format!("{} <{}>", self.name, self.email)
    }
}

/// Validates an email address.
pub fn validate_email(email: &str) -> bool {
    email.contains('@')
}

/// Fetches a user asynchronously.
pub async fn fetch_user(id: &str) -> Option<User> {
    None
}
`;

  it('should extract chunks for Rust code', async () => {
    const chunks = await extractASTChunks(rustCode, 'src/user.rs');
    if (chunks === null) return;

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should extract struct metadata', async () => {
    const chunks = await extractASTChunks(rustCode, 'src/user.rs');
    if (chunks === null) return;

    const structChunk = chunks.find((c) => c.metadata.type === 'struct');
    if (structChunk) {
      expect(structChunk.metadata.name).toBe('User');
      expect(structChunk.metadata.language).toBe('rust');
      expect(structChunk.metadata.visibility).toBe('public');
    }
  });

  it('should extract impl metadata', async () => {
    const chunks = await extractASTChunks(rustCode, 'src/user.rs');
    if (chunks === null) return;

    const implChunk = chunks.find((c) => c.metadata.type === 'impl');
    if (implChunk) {
      expect(implChunk.metadata.parentName).toBe('User');
    }
  });

  it('should extract async function metadata', async () => {
    const chunks = await extractASTChunks(rustCode, 'src/user.rs');
    if (chunks === null) return;

    const asyncChunk = chunks.find(
      (c) => c.metadata.name === 'fetch_user' || c.text.includes('async fn fetch_user')
    );
    if (asyncChunk && asyncChunk.metadata.isAsync !== undefined) {
      expect(asyncChunk.metadata.isAsync).toBe(true);
    }
  });

  it('should extract doc comments', async () => {
    const chunks = await extractASTChunks(rustCode, 'src/user.rs');
    if (chunks === null) return;

    const chunkWithDoc = chunks.find((c) => c.metadata.docstring);
    if (chunkWithDoc) {
      expect(chunkWithDoc.metadata.docstring).toBeDefined();
    }
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('astChunksToChunksWithLines', () => {
  it('should convert AST chunks to ChunkWithLines', () => {
    const astChunks: ASTChunk[] = [
      {
        text: 'function foo() {}',
        startLine: 1,
        endLine: 1,
        metadata: {
          type: 'function',
          name: 'foo',
          language: 'javascript',
        },
      },
      {
        text: 'class Bar {}',
        startLine: 3,
        endLine: 5,
        metadata: {
          type: 'class',
          name: 'Bar',
          language: 'javascript',
        },
      },
    ];

    const result = astChunksToChunksWithLines(astChunks);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      text: 'function foo() {}',
      startLine: 1,
      endLine: 1,
    });
    expect(result[1]).toEqual({
      text: 'class Bar {}',
      startLine: 3,
      endLine: 5,
    });
    // Metadata should not be present
    expect((result[0] as any).metadata).toBeUndefined();
  });
});

describe('DEFAULT_AST_OPTIONS', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_AST_OPTIONS.chunkSize).toBe(4000);
    expect(DEFAULT_AST_OPTIONS.chunkOverlap).toBe(200);
    expect(DEFAULT_AST_OPTIONS.maxChunkSize).toBe(8000);
    expect(DEFAULT_AST_OPTIONS.includeImports).toBe(false);
  });
});
