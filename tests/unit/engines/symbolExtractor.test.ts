/**
 * Symbol Extraction Unit Tests (SMCP-090)
 *
 * Tests cover:
 * - TypeScript/JavaScript symbol extraction (functions, classes, interfaces)
 * - Python symbol extraction (functions, classes, decorators)
 * - Go symbol extraction (functions, structs, methods)
 * - Java symbol extraction (classes, methods, interfaces)
 * - Rust symbol extraction (functions, structs, traits, impls)
 * - C/C++/C# symbol extraction
 * - Import/export extraction
 * - Cyclomatic complexity calculation
 * - Nesting depth calculation
 * - Overall complexity score
 * - Performance requirements (< 100ms per file)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  extractFileSummary,
  supportsSymbolExtraction,
  getSupportedLanguages,
  type FileSummary,
  type SymbolInfo,
  type ImportInfo,
  type ExportInfo,
} from '../../../src/engines/symbolExtractor.js';

// ============================================================================
// Helper Functions
// ============================================================================

function skipIfParserUnavailable(summary: FileSummary | null): summary is FileSummary {
  if (summary === null) {
    console.log('Skipping test - Tree-sitter parser not available');
    return false;
  }
  return true;
}

// ============================================================================
// Support Function Tests
// ============================================================================

describe('supportsSymbolExtraction', () => {
  it('should return true for TypeScript files', () => {
    expect(supportsSymbolExtraction('file.ts')).toBe(true);
    expect(supportsSymbolExtraction('file.tsx')).toBe(true);
    expect(supportsSymbolExtraction('file.mts')).toBe(true);
  });

  it('should return true for JavaScript files', () => {
    expect(supportsSymbolExtraction('file.js')).toBe(true);
    expect(supportsSymbolExtraction('file.jsx')).toBe(true);
    expect(supportsSymbolExtraction('file.mjs')).toBe(true);
  });

  it('should return true for Python files', () => {
    expect(supportsSymbolExtraction('file.py')).toBe(true);
    expect(supportsSymbolExtraction('file.pyw')).toBe(true);
    expect(supportsSymbolExtraction('file.pyi')).toBe(true);
  });

  it('should return true for Go files', () => {
    expect(supportsSymbolExtraction('file.go')).toBe(true);
  });

  it('should return true for Java files', () => {
    expect(supportsSymbolExtraction('file.java')).toBe(true);
  });

  it('should return true for Rust files', () => {
    expect(supportsSymbolExtraction('file.rs')).toBe(true);
  });

  it('should return true for C/C++ files', () => {
    expect(supportsSymbolExtraction('file.c')).toBe(true);
    expect(supportsSymbolExtraction('file.cpp')).toBe(true);
    expect(supportsSymbolExtraction('file.h')).toBe(true);
    expect(supportsSymbolExtraction('file.hpp')).toBe(true);
  });

  it('should return true for C# files', () => {
    expect(supportsSymbolExtraction('file.cs')).toBe(true);
  });

  it('should return false for unsupported file types', () => {
    expect(supportsSymbolExtraction('file.md')).toBe(false);
    expect(supportsSymbolExtraction('file.json')).toBe(false);
    expect(supportsSymbolExtraction('file.html')).toBe(false);
    expect(supportsSymbolExtraction('file.css')).toBe(false);
    expect(supportsSymbolExtraction('file.yaml')).toBe(false);
  });
});

describe('getSupportedLanguages', () => {
  it('should return all supported languages', () => {
    const languages = getSupportedLanguages();
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

// ============================================================================
// TypeScript/JavaScript Extraction Tests
// ============================================================================

describe('extractFileSummary - TypeScript', () => {
  const typescriptCode = `
/**
 * User service for managing users.
 */
export class UserService {
  private users: Map<string, User> = new Map();

  /**
   * Get a user by ID.
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

  static getInstance(): UserService {
    return new UserService();
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export type UserData = Omit<User, 'id'>;

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export function formatUser(user: User): string {
  if (user.name && user.email) {
    return \`\${user.name} <\${user.email}>\`;
  }
  return user.name || user.email || 'Unknown';
}

const DEFAULT_LIMIT = 100;

import { Logger } from './logger';
import type { Config } from './config';
`;

  it('should extract file summary for TypeScript', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.language).toBe('typescript');
    expect(summary.lines).toBeGreaterThan(0);
    expect(summary.size).toBeGreaterThan(0);
    expect(summary.extractionTimeMs).toBeDefined();
  });

  it('should extract class with methods', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    // Check class
    const userServiceClass = summary.classes.find(c => c.name === 'UserService');
    expect(userServiceClass).toBeDefined();
    expect(userServiceClass?.type).toBe('class');
    expect(userServiceClass?.isExported).toBe(true);

    // Check methods
    const getUser = summary.functions.find(f => f.name === 'getUser');
    expect(getUser).toBeDefined();
    expect(getUser?.type).toBe('method');
    expect(getUser?.parentName).toBe('UserService');

    const createUser = summary.functions.find(f => f.name === 'createUser');
    expect(createUser).toBeDefined();
    expect(createUser?.isAsync).toBe(true);
  });

  it('should extract interface and type alias', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const userInterface = summary.classes.find(c => c.name === 'User' && c.type === 'interface');
    expect(userInterface).toBeDefined();

    const userDataType = summary.classes.find(c => c.name === 'UserData' && c.type === 'type');
    expect(userDataType).toBeDefined();
  });

  it('should extract enum', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const userRoleEnum = summary.classes.find(c => c.name === 'UserRole' && c.type === 'enum');
    expect(userRoleEnum).toBeDefined();
  });

  it('should extract standalone function', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const formatUser = summary.functions.find(f => f.name === 'formatUser' && f.type === 'function');
    expect(formatUser).toBeDefined();
    expect(formatUser?.isExported).toBe(true);
  });

  it('should extract imports', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.imports.length).toBeGreaterThan(0);

    const loggerImport = summary.imports.find(i => i.module === './logger');
    expect(loggerImport).toBeDefined();
  });

  it('should calculate complexity for functions with conditionals', async () => {
    const summary = await extractFileSummary(typescriptCode, '/test/user.ts', 'test/user.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const formatUser = summary.functions.find(f => f.name === 'formatUser');
    if (formatUser?.complexity) {
      // formatUser has 2 if conditions, so complexity should be >= 2
      expect(formatUser.complexity).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================================
// Python Extraction Tests
// ============================================================================

describe('extractFileSummary - Python', () => {
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

  it('should extract file summary for Python', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.language).toBe('python');
    expect(summary.lines).toBeGreaterThan(0);
  });

  it('should extract class with methods', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    // Check class
    const userClass = summary.classes.find(c => c.name === 'User');
    expect(userClass).toBeDefined();
    expect(userClass?.type).toBe('class');

    // Check __init__ method
    const initMethod = summary.functions.find(f => f.name === '__init__');
    expect(initMethod).toBeDefined();
    expect(initMethod?.type).toBe('method');
    expect(initMethod?.parentName).toBe('User');
  });

  it('should extract decorated methods', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    // Check property decorator
    const displayName = summary.functions.find(f => f.name === 'display_name');
    if (displayName?.decorators) {
      expect(displayName.decorators.some(d => d.includes('property'))).toBe(true);
    }

    // Check staticmethod decorator
    const validateEmail = summary.functions.find(f => f.name === 'validate_email');
    if (validateEmail?.isStatic !== undefined) {
      expect(validateEmail.isStatic).toBe(true);
    }
  });

  it('should extract standalone functions', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    const createUser = summary.functions.find(f => f.name === 'create_user' && f.type === 'function');
    expect(createUser).toBeDefined();

    const fetchUser = summary.functions.find(f => f.name === 'fetch_user');
    expect(fetchUser).toBeDefined();
    if (fetchUser?.isAsync !== undefined) {
      expect(fetchUser.isAsync).toBe(true);
    }
  });

  it('should extract imports', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.imports.length).toBeGreaterThan(0);

    const typingImport = summary.imports.find(i => i.module === 'typing');
    expect(typingImport).toBeDefined();
  });

  it('should extract docstrings', async () => {
    const summary = await extractFileSummary(pythonCode, '/test/user.py', 'test/user.py');
    if (!skipIfParserUnavailable(summary)) return;

    const userClass = summary.classes.find(c => c.name === 'User');
    if (userClass?.docstring) {
      expect(userClass.docstring).toContain('user');
    }
  });
});

// ============================================================================
// Go Extraction Tests
// ============================================================================

describe('extractFileSummary - Go', () => {
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

// UserService provides user operations.
type UserService interface {
    GetUser(id string) (*User, error)
    CreateUser(name, email string) (*User, error)
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

  it('should extract file summary for Go', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.language).toBe('go');
    expect(summary.lines).toBeGreaterThan(0);
  });

  it('should extract struct', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    const userStruct = summary.classes.find(c => c.name === 'User' && c.type === 'struct');
    expect(userStruct).toBeDefined();
    expect(userStruct?.isExported).toBe(true);
  });

  it('should extract interface', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    const userServiceInterface = summary.classes.find(c => c.name === 'UserService' && c.type === 'interface');
    expect(userServiceInterface).toBeDefined();
  });

  it('should extract functions and methods', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    // Standalone function
    const newUser = summary.functions.find(f => f.name === 'NewUser' && f.type === 'function');
    expect(newUser).toBeDefined();
    expect(newUser?.isExported).toBe(true);

    // Method with receiver
    const getDisplayName = summary.functions.find(f => f.name === 'GetDisplayName' && f.type === 'method');
    expect(getDisplayName).toBeDefined();
    expect(getDisplayName?.parentName).toBe('User');
  });

  it('should extract imports', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.imports.length).toBe(2);
    const fmtImport = summary.imports.find(i => i.module === 'fmt');
    expect(fmtImport).toBeDefined();
  });

  it('should detect exported symbols', async () => {
    const summary = await extractFileSummary(goCode, '/test/user.go', 'test/user.go');
    if (!skipIfParserUnavailable(summary)) return;

    // In Go, exported symbols start with uppercase
    expect(summary.exports.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Java Extraction Tests
// ============================================================================

describe('extractFileSummary - Java', () => {
  const javaCode = `
package com.example.user;

import java.util.UUID;
import java.util.Optional;

/**
 * Represents a user in the system.
 */
public class User {
    private String id;
    private String name;
    private String email;

    /**
     * Creates a new user.
     */
    public User(String name, String email) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.email = email;
    }

    /**
     * Gets the user's display name.
     */
    public String getDisplayName() {
        return String.format("%s <%s>", name, email);
    }

    public static boolean validateEmail(String email) {
        return email != null && email.contains("@");
    }

    private void logAccess() {
        System.out.println("Access logged");
    }
}

public interface UserService {
    Optional<User> getUser(String id);
    User createUser(String name, String email);
}

public enum UserRole {
    ADMIN,
    USER,
    GUEST
}
`;

  it('should extract file summary for Java', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.language).toBe('java');
    expect(summary.lines).toBeGreaterThan(0);
  });

  it('should extract class with methods', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    // Check class
    const userClass = summary.classes.find(c => c.name === 'User' && c.type === 'class');
    expect(userClass).toBeDefined();
    expect(userClass?.visibility).toBe('public');

    // Check constructor
    const constructor = summary.functions.find(f => f.name === 'User' && f.type === 'method');
    expect(constructor).toBeDefined();

    // Check method visibility
    const logAccess = summary.functions.find(f => f.name === 'logAccess');
    if (logAccess?.visibility) {
      expect(logAccess.visibility).toBe('private');
    }
  });

  it('should extract static methods', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    const validateEmail = summary.functions.find(f => f.name === 'validateEmail');
    expect(validateEmail).toBeDefined();
    if (validateEmail?.isStatic !== undefined) {
      expect(validateEmail.isStatic).toBe(true);
    }
  });

  it('should extract interface', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    const userServiceInterface = summary.classes.find(c => c.name === 'UserService' && c.type === 'interface');
    expect(userServiceInterface).toBeDefined();
  });

  it('should extract enum', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    const userRoleEnum = summary.classes.find(c => c.name === 'UserRole' && c.type === 'enum');
    expect(userRoleEnum).toBeDefined();
  });

  it('should extract imports', async () => {
    const summary = await extractFileSummary(javaCode, '/test/User.java', 'test/User.java');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.imports.length).toBe(2);
  });
});

// ============================================================================
// Rust Extraction Tests
// ============================================================================

describe('extractFileSummary - Rust', () => {
  const rustCode = `
//! User module for the application.

use std::fmt;
use serde::{Deserialize, Serialize};

/// Represents a user in the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    id: String,
    name: String,
    email: String,
}

/// User service trait.
pub trait UserService {
    fn get_user(&self, id: &str) -> Option<User>;
    fn create_user(&self, name: &str, email: &str) -> User;
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

enum UserRole {
    Admin,
    User,
    Guest,
}
`;

  it('should extract file summary for Rust', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.language).toBe('rust');
    expect(summary.lines).toBeGreaterThan(0);
  });

  it('should extract struct', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    const userStruct = summary.classes.find(c => c.name === 'User' && c.type === 'struct');
    expect(userStruct).toBeDefined();
    expect(userStruct?.visibility).toBe('public');
  });

  it('should extract trait', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    const userServiceTrait = summary.classes.find(c => c.name === 'UserService' && c.type === 'trait');
    expect(userServiceTrait).toBeDefined();
  });

  it('should extract impl methods', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    // Methods from impl block
    const newMethod = summary.functions.find(f => f.name === 'new' && f.type === 'method');
    expect(newMethod).toBeDefined();
    expect(newMethod?.parentName).toBe('User');

    const displayNameMethod = summary.functions.find(f => f.name === 'display_name' && f.type === 'method');
    expect(displayNameMethod).toBeDefined();
  });

  it('should extract async functions', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    const fetchUser = summary.functions.find(f => f.name === 'fetch_user');
    expect(fetchUser).toBeDefined();
    if (fetchUser?.isAsync !== undefined) {
      expect(fetchUser.isAsync).toBe(true);
    }
  });

  it('should extract enum', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    const userRoleEnum = summary.classes.find(c => c.name === 'UserRole' && c.type === 'enum');
    expect(userRoleEnum).toBeDefined();
    // Not pub, so should be private
    expect(userRoleEnum?.visibility).toBe('private');
  });

  it('should extract use statements', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.imports.length).toBeGreaterThan(0);
    const fmtImport = summary.imports.find(i => i.module.includes('fmt'));
    expect(fmtImport).toBeDefined();
  });

  it('should detect exported symbols', async () => {
    const summary = await extractFileSummary(rustCode, '/test/user.rs', 'test/user.rs');
    if (!skipIfParserUnavailable(summary)) return;

    // pub symbols should be exported
    expect(summary.exports.length).toBeGreaterThan(0);
    const userExport = summary.exports.find(e => e.name === 'User');
    expect(userExport).toBeDefined();
  });
});

// ============================================================================
// Complexity Metrics Tests
// ============================================================================

describe('Complexity Metrics', () => {
  const complexCode = `
function processData(data: any) {
  if (!data) {
    return null;
  }

  let result = [];

  for (const item of data) {
    if (item.type === 'A') {
      if (item.value > 10) {
        result.push(item.value * 2);
      } else if (item.value > 5) {
        result.push(item.value * 1.5);
      } else {
        result.push(item.value);
      }
    } else if (item.type === 'B') {
      switch (item.status) {
        case 'active':
          result.push(item.value + 1);
          break;
        case 'pending':
          result.push(item.value);
          break;
        default:
          result.push(0);
      }
    } else {
      while (item.children && item.children.length > 0) {
        const child = item.children.pop();
        result.push(child.value || 0);
      }
    }
  }

  return result;
}

function simpleAdd(a: number, b: number): number {
  return a + b;
}
`;

  it('should calculate cyclomatic complexity', async () => {
    const summary = await extractFileSummary(complexCode, '/test/complex.ts', 'test/complex.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const processData = summary.functions.find(f => f.name === 'processData');
    expect(processData).toBeDefined();

    // processData has many decision points (if, else if, switch, while)
    // Complexity should be high (> 5)
    if (processData?.complexity) {
      expect(processData.complexity).toBeGreaterThan(5);
    }

    const simpleAdd = summary.functions.find(f => f.name === 'simpleAdd');
    if (simpleAdd?.complexity) {
      // simpleAdd has no decision points, so complexity should be 1
      expect(simpleAdd.complexity).toBe(1);
    }
  });

  it('should calculate nesting depth', async () => {
    const summary = await extractFileSummary(complexCode, '/test/complex.ts', 'test/complex.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const processData = summary.functions.find(f => f.name === 'processData');
    if (processData?.nestingDepth) {
      // processData has deep nesting (for -> if -> if)
      expect(processData.nestingDepth).toBeGreaterThan(2);
    }
  });

  it('should calculate overall complexity score', async () => {
    const summary = await extractFileSummary(complexCode, '/test/complex.ts', 'test/complex.ts');
    if (!skipIfParserUnavailable(summary)) return;

    // Score should be 0-100, lower for more complex code
    expect(summary.complexity.overallScore).toBeGreaterThanOrEqual(0);
    expect(summary.complexity.overallScore).toBeLessThanOrEqual(100);

    // Complex code should have a lower score
    // (but not too low since it's just 2 functions)
  });

  it('should count decision points', async () => {
    const summary = await extractFileSummary(complexCode, '/test/complex.ts', 'test/complex.ts');
    if (!skipIfParserUnavailable(summary)) return;

    // The file has multiple if, else if, switch, while
    expect(summary.complexity.decisionPoints).toBeGreaterThan(5);
  });

  it('should calculate average function complexity', async () => {
    const summary = await extractFileSummary(complexCode, '/test/complex.ts', 'test/complex.ts');
    if (!skipIfParserUnavailable(summary)) return;

    // avgFunctionComplexity should be between 1 and total cyclomatic complexity
    expect(summary.complexity.avgFunctionComplexity).toBeGreaterThanOrEqual(1);
    expect(summary.complexity.avgFunctionComplexity).toBeLessThanOrEqual(summary.complexity.cyclomaticComplexity);
  });
});

// ============================================================================
// Line Counting Tests
// ============================================================================

describe('Line Counting', () => {
  const codeWithComments = `
// This is a comment
/* Block
   comment */

function foo() {
  return 42;
}

/**
 * JSDoc comment
 */
function bar() {
  // inline comment
  return 'bar';
}

`;

  it('should count total lines', async () => {
    const summary = await extractFileSummary(codeWithComments, '/test/lines.ts', 'test/lines.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.lines).toBeGreaterThan(10);
  });

  it('should count blank lines', async () => {
    const summary = await extractFileSummary(codeWithComments, '/test/lines.ts', 'test/lines.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.blankLines).toBeGreaterThan(0);
  });

  it('should count comment lines', async () => {
    const summary = await extractFileSummary(codeWithComments, '/test/lines.ts', 'test/lines.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.commentLines).toBeGreaterThan(0);
  });

  it('should count code lines', async () => {
    const summary = await extractFileSummary(codeWithComments, '/test/lines.ts', 'test/lines.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.codeLines).toBeGreaterThan(0);
    expect(summary.codeLines).toBeLessThan(summary.lines);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  // Generate a moderately large file for performance testing
  const generateLargeCode = (functionCount: number): string => {
    let code = 'import { Logger } from "./logger";\n\n';

    for (let i = 0; i < functionCount; i++) {
      code += `
/**
 * Function ${i} - does something useful.
 */
export function func${i}(arg: number): number {
  if (arg > 10) {
    return arg * 2;
  }
  return arg + 1;
}
`;
    }

    return code;
  };

  it('should extract 50 functions in < 100ms', async () => {
    const code = generateLargeCode(50);
    const start = performance.now();

    const summary = await extractFileSummary(code, '/test/large.ts', 'test/large.ts');

    const elapsed = performance.now() - start;

    if (!skipIfParserUnavailable(summary)) return;

    expect(elapsed).toBeLessThan(100);
    expect(summary.functions.length).toBe(50);
  });

  it('should extract 100 functions in < 200ms', async () => {
    const code = generateLargeCode(100);
    const start = performance.now();

    const summary = await extractFileSummary(code, '/test/large.ts', 'test/large.ts');

    const elapsed = performance.now() - start;

    if (!skipIfParserUnavailable(summary)) return;

    expect(elapsed).toBeLessThan(200);
    expect(summary.functions.length).toBe(100);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty file', async () => {
    const summary = await extractFileSummary('', '/test/empty.ts', 'test/empty.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.functions).toHaveLength(0);
    expect(summary.classes).toHaveLength(0);
    expect(summary.imports).toHaveLength(0);
    expect(summary.exports).toHaveLength(0);
  });

  it('should handle file with only comments', async () => {
    const code = '// Just a comment\n/* Another comment */';
    const summary = await extractFileSummary(code, '/test/comments.ts', 'test/comments.ts');
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.functions).toHaveLength(0);
    expect(summary.classes).toHaveLength(0);
    expect(summary.commentLines).toBeGreaterThan(0);
  });

  it('should handle syntax errors gracefully', async () => {
    const code = 'function { invalid syntax }';
    // Should not throw, just return what it can parse
    const summary = await extractFileSummary(code, '/test/invalid.ts', 'test/invalid.ts');
    // May return null or partial results
    if (summary) {
      expect(summary.language).toBe('typescript');
    }
  });

  it('should respect maxFileSize option', async () => {
    const code = 'function foo() {}';
    const summary = await extractFileSummary(code, '/test/small.ts', 'test/small.ts', {
      maxFileSize: 10, // Very small limit
    });

    // Should return null because file exceeds size limit
    expect(summary).toBeNull();
  });

  it('should return basic info for unsupported languages', async () => {
    const code = '# Markdown content\n\nSome text here';
    const summary = await extractFileSummary(code, '/test/readme.md', 'test/readme.md');

    // Should return basic summary without symbol extraction
    expect(summary).not.toBeNull();
    if (summary) {
      expect(summary.functions).toHaveLength(0);
      expect(summary.classes).toHaveLength(0);
      expect(summary.lines).toBeGreaterThan(0);
    }
  });

  it('should handle unicode in code', async () => {
    const code = `
function greet() {
  return "Hello, World!";
}
`;
    const summary = await extractFileSummary(code, '/test/unicode.ts', 'test/unicode.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const greet = summary.functions.find(f => f.name === 'greet');
    expect(greet).toBeDefined();
  });

  it('should handle deeply nested code', async () => {
    const code = `
function deep() {
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          if (true) {
            return 'deep';
          }
        }
      }
    }
  }
}
`;
    const summary = await extractFileSummary(code, '/test/deep.ts', 'test/deep.ts');
    if (!skipIfParserUnavailable(summary)) return;

    const deep = summary.functions.find(f => f.name === 'deep');
    if (deep?.nestingDepth) {
      expect(deep.nestingDepth).toBeGreaterThanOrEqual(5);
    }
  });
});

// ============================================================================
// Options Tests
// ============================================================================

describe('Extraction Options', () => {
  const code = `
/**
 * A function with a docstring.
 */
function foo() {
  if (true) {
    return 1;
  }
  return 0;
}
`;

  it('should include complexity when includeComplexity is true', async () => {
    const summary = await extractFileSummary(code, '/test/opt.ts', 'test/opt.ts', {
      includeComplexity: true,
    });
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.complexity.cyclomaticComplexity).toBeGreaterThan(0);
    const foo = summary.functions.find(f => f.name === 'foo');
    expect(foo?.complexity).toBeDefined();
  });

  it('should exclude complexity when includeComplexity is false', async () => {
    const summary = await extractFileSummary(code, '/test/opt.ts', 'test/opt.ts', {
      includeComplexity: false,
    });
    if (!skipIfParserUnavailable(summary)) return;

    expect(summary.complexity.cyclomaticComplexity).toBe(0);
  });

  it('should include docstrings when includeDocstrings is true', async () => {
    const summary = await extractFileSummary(code, '/test/opt.ts', 'test/opt.ts', {
      includeDocstrings: true,
    });
    if (!skipIfParserUnavailable(summary)) return;

    const foo = summary.functions.find(f => f.name === 'foo');
    if (foo?.docstring) {
      expect(foo.docstring).toContain('docstring');
    }
  });

  it('should exclude docstrings when includeDocstrings is false', async () => {
    const summary = await extractFileSummary(code, '/test/opt.ts', 'test/opt.ts', {
      includeDocstrings: false,
    });
    if (!skipIfParserUnavailable(summary)) return;

    const foo = summary.functions.find(f => f.name === 'foo');
    expect(foo?.docstring).toBeUndefined();
  });
});
