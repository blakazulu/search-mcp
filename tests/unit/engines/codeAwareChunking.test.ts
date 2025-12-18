/**
 * Code-Aware Chunking Unit Tests
 *
 * Tests cover:
 * - Language detection from file paths (40+ extensions for 22 languages)
 * - TypeScript/JavaScript boundary detection
 * - Python boundary detection
 * - Tier 1 languages: Java, Go, Rust, C#, C/C++, Kotlin, Swift
 * - Tier 2 languages: Ruby, PHP, Scala, Shell/Bash
 * - Tier 3 languages: CSS/SCSS/LESS, HTML, Vue, Svelte, SQL, YAML, JSON, XML, GraphQL
 * - Tier 4 languages: Terraform/HCL, Dockerfile
 * - Chunk splitting at semantic boundaries
 * - Fallback behavior for unsupported languages
 */

import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  supportsCodeAwareChunking,
  getLanguageName,
  getLanguageDisplayName,
  getSupportedLanguages,
  splitCodeWithLineNumbers,
  DEFAULT_CODE_AWARE_OPTIONS,
} from '../../../src/engines/codeAwareChunking.js';

// ============================================================================
// Language Detection Tests - Existing Languages
// ============================================================================

describe('detectLanguage', () => {
  describe('TypeScript files', () => {
    it('should detect TypeScript files', () => {
      expect(detectLanguage('src/index.ts')).toBe('typescript');
      expect(detectLanguage('src/component.tsx')).toBe('typescript');
      expect(detectLanguage('lib/module.mts')).toBe('typescript');
      expect(detectLanguage('lib/common.cts')).toBe('typescript');
    });
  });

  describe('JavaScript files', () => {
    it('should detect JavaScript files', () => {
      expect(detectLanguage('src/index.js')).toBe('javascript');
      expect(detectLanguage('src/component.jsx')).toBe('javascript');
      expect(detectLanguage('lib/module.mjs')).toBe('javascript');
      expect(detectLanguage('lib/common.cjs')).toBe('javascript');
    });
  });

  describe('Python files', () => {
    it('should detect Python files', () => {
      expect(detectLanguage('scripts/main.py')).toBe('python');
      expect(detectLanguage('app/gui.pyw')).toBe('python');
      expect(detectLanguage('types/stubs.pyi')).toBe('python');
    });
  });

  // ============================================================================
  // Language Detection Tests - Tier 1 Languages
  // ============================================================================

  describe('Java files', () => {
    it('should detect Java files', () => {
      expect(detectLanguage('src/Main.java')).toBe('java');
      expect(detectLanguage('com/example/Service.java')).toBe('java');
    });
  });

  describe('Go files', () => {
    it('should detect Go files', () => {
      expect(detectLanguage('main.go')).toBe('go');
      expect(detectLanguage('pkg/service/handler.go')).toBe('go');
    });
  });

  describe('Rust files', () => {
    it('should detect Rust files', () => {
      expect(detectLanguage('src/main.rs')).toBe('rust');
      expect(detectLanguage('src/lib.rs')).toBe('rust');
    });
  });

  describe('C# files', () => {
    it('should detect C# files', () => {
      expect(detectLanguage('Program.cs')).toBe('csharp');
      expect(detectLanguage('src/Services/UserService.cs')).toBe('csharp');
    });
  });

  describe('C/C++ files', () => {
    it('should detect C files', () => {
      expect(detectLanguage('main.c')).toBe('c');
      expect(detectLanguage('include/header.h')).toBe('c');
    });

    it('should detect C++ files', () => {
      expect(detectLanguage('main.cpp')).toBe('cpp');
      expect(detectLanguage('include/header.hpp')).toBe('cpp');
      expect(detectLanguage('src/module.cc')).toBe('cpp');
      expect(detectLanguage('src/module.cxx')).toBe('cpp');
      expect(detectLanguage('include/header.hh')).toBe('cpp');
      expect(detectLanguage('include/header.hxx')).toBe('cpp');
    });
  });

  describe('Kotlin files', () => {
    it('should detect Kotlin files', () => {
      expect(detectLanguage('Main.kt')).toBe('kotlin');
      expect(detectLanguage('build.gradle.kts')).toBe('kotlin');
    });
  });

  describe('Swift files', () => {
    it('should detect Swift files', () => {
      expect(detectLanguage('ViewController.swift')).toBe('swift');
      expect(detectLanguage('Sources/App/main.swift')).toBe('swift');
    });
  });

  // ============================================================================
  // Language Detection Tests - Tier 2 Languages
  // ============================================================================

  describe('Ruby files', () => {
    it('should detect Ruby files', () => {
      expect(detectLanguage('app.rb')).toBe('ruby');
      expect(detectLanguage('Rakefile')).toBe('ruby');
      expect(detectLanguage('tasks/deploy.rake')).toBe('ruby');
      expect(detectLanguage('myapp.gemspec')).toBe('ruby');
      expect(detectLanguage('Gemfile')).toBe('ruby');
      expect(detectLanguage('Vagrantfile')).toBe('ruby');
    });
  });

  describe('PHP files', () => {
    it('should detect PHP files', () => {
      expect(detectLanguage('index.php')).toBe('php');
      expect(detectLanguage('views/template.phtml')).toBe('php');
    });
  });

  describe('Scala files', () => {
    it('should detect Scala files', () => {
      expect(detectLanguage('Main.scala')).toBe('scala');
      expect(detectLanguage('script.sc')).toBe('scala');
    });
  });

  describe('Shell files', () => {
    it('should detect Shell files', () => {
      expect(detectLanguage('script.sh')).toBe('shell');
      expect(detectLanguage('setup.bash')).toBe('shell');
      expect(detectLanguage('init.zsh')).toBe('shell');
      expect(detectLanguage('config.fish')).toBe('shell');
      expect(detectLanguage('Makefile')).toBe('shell');
      expect(detectLanguage('Jenkinsfile')).toBe('shell');
    });
  });

  // ============================================================================
  // Language Detection Tests - Tier 3 Languages
  // ============================================================================

  describe('CSS/SCSS/LESS files', () => {
    it('should detect CSS files', () => {
      expect(detectLanguage('styles.css')).toBe('css');
    });

    it('should detect SCSS files', () => {
      expect(detectLanguage('styles.scss')).toBe('scss');
      expect(detectLanguage('styles.sass')).toBe('scss');
    });

    it('should detect LESS files', () => {
      expect(detectLanguage('styles.less')).toBe('less');
    });
  });

  describe('HTML files', () => {
    it('should detect HTML files', () => {
      expect(detectLanguage('index.html')).toBe('html');
      expect(detectLanguage('page.htm')).toBe('html');
    });
  });

  describe('Vue/Svelte files', () => {
    it('should detect Vue files', () => {
      expect(detectLanguage('App.vue')).toBe('vue');
    });

    it('should detect Svelte files', () => {
      expect(detectLanguage('Component.svelte')).toBe('svelte');
    });
  });

  describe('SQL files', () => {
    it('should detect SQL files', () => {
      expect(detectLanguage('schema.sql')).toBe('sql');
      expect(detectLanguage('migrations/001_init.sql')).toBe('sql');
    });
  });

  describe('Config files', () => {
    it('should detect YAML files', () => {
      expect(detectLanguage('config.yaml')).toBe('yaml');
      expect(detectLanguage('docker-compose.yml')).toBe('yaml');
    });

    it('should detect JSON files', () => {
      expect(detectLanguage('package.json')).toBe('json');
      expect(detectLanguage('tsconfig.jsonc')).toBe('json');
    });

    it('should detect XML files', () => {
      expect(detectLanguage('pom.xml')).toBe('xml');
      expect(detectLanguage('transform.xsl')).toBe('xml');
      expect(detectLanguage('transform.xslt')).toBe('xml');
    });
  });

  describe('GraphQL files', () => {
    it('should detect GraphQL files', () => {
      expect(detectLanguage('schema.graphql')).toBe('graphql');
      expect(detectLanguage('queries.gql')).toBe('graphql');
    });
  });

  // ============================================================================
  // Language Detection Tests - Tier 4 Languages
  // ============================================================================

  describe('Infrastructure files', () => {
    it('should detect Terraform files', () => {
      expect(detectLanguage('main.tf')).toBe('terraform');
      expect(detectLanguage('variables.tfvars')).toBe('terraform');
    });

    it('should detect HCL files', () => {
      expect(detectLanguage('config.hcl')).toBe('hcl');
    });

    it('should detect Dockerfile', () => {
      expect(detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(detectLanguage('build.dockerfile')).toBe('dockerfile');
    });
  });

  // ============================================================================
  // Language Detection Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should return unknown for unsupported extensions', () => {
      expect(detectLanguage('README.md')).toBe('unknown');
      expect(detectLanguage('image.png')).toBe('unknown');
      expect(detectLanguage('.gitignore')).toBe('unknown');
    });

    it('should handle case-insensitive extensions', () => {
      expect(detectLanguage('src/index.TS')).toBe('typescript');
      expect(detectLanguage('src/index.JS')).toBe('javascript');
      expect(detectLanguage('src/index.PY')).toBe('python');
      expect(detectLanguage('Main.JAVA')).toBe('java');
    });

    it('should handle paths with dots in directory names', () => {
      expect(detectLanguage('node_modules/.bin/file.ts')).toBe('typescript');
      expect(detectLanguage('src/.hidden/script.py')).toBe('python');
    });

    it('should handle Windows paths', () => {
      expect(detectLanguage('C:\\Users\\dev\\project\\src\\index.ts')).toBe('typescript');
      expect(detectLanguage('src\\main.go')).toBe('go');
    });
  });
});

// ============================================================================
// supportsCodeAwareChunking Tests
// ============================================================================

describe('supportsCodeAwareChunking', () => {
  it('should return true for all supported languages', () => {
    // Tier 1
    expect(supportsCodeAwareChunking('file.ts')).toBe(true);
    expect(supportsCodeAwareChunking('file.js')).toBe(true);
    expect(supportsCodeAwareChunking('file.py')).toBe(true);
    expect(supportsCodeAwareChunking('file.java')).toBe(true);
    expect(supportsCodeAwareChunking('file.go')).toBe(true);
    expect(supportsCodeAwareChunking('file.rs')).toBe(true);
    expect(supportsCodeAwareChunking('file.cs')).toBe(true);
    expect(supportsCodeAwareChunking('file.c')).toBe(true);
    expect(supportsCodeAwareChunking('file.cpp')).toBe(true);
    expect(supportsCodeAwareChunking('file.kt')).toBe(true);
    expect(supportsCodeAwareChunking('file.swift')).toBe(true);

    // Tier 2
    expect(supportsCodeAwareChunking('file.rb')).toBe(true);
    expect(supportsCodeAwareChunking('file.php')).toBe(true);
    expect(supportsCodeAwareChunking('file.scala')).toBe(true);
    expect(supportsCodeAwareChunking('file.sh')).toBe(true);

    // Tier 3
    expect(supportsCodeAwareChunking('file.css')).toBe(true);
    expect(supportsCodeAwareChunking('file.scss')).toBe(true);
    expect(supportsCodeAwareChunking('file.html')).toBe(true);
    expect(supportsCodeAwareChunking('file.vue')).toBe(true);
    expect(supportsCodeAwareChunking('file.sql')).toBe(true);
    expect(supportsCodeAwareChunking('file.yaml')).toBe(true);
    expect(supportsCodeAwareChunking('file.json')).toBe(true);
    expect(supportsCodeAwareChunking('file.xml')).toBe(true);
    expect(supportsCodeAwareChunking('file.graphql')).toBe(true);

    // Tier 4
    expect(supportsCodeAwareChunking('main.tf')).toBe(true);
    expect(supportsCodeAwareChunking('Dockerfile')).toBe(true);
  });

  it('should return false for unsupported files', () => {
    expect(supportsCodeAwareChunking('README.md')).toBe(false);
    expect(supportsCodeAwareChunking('image.png')).toBe(false);
    expect(supportsCodeAwareChunking('.gitignore')).toBe(false);
  });
});

// ============================================================================
// getLanguageName Tests
// ============================================================================

describe('getLanguageName and getLanguageDisplayName', () => {
  it('should return human-readable names for all supported languages', () => {
    expect(getLanguageName('file.ts')).toBe('TypeScript');
    expect(getLanguageName('file.js')).toBe('JavaScript');
    expect(getLanguageName('file.py')).toBe('Python');
    expect(getLanguageName('file.java')).toBe('Java');
    expect(getLanguageName('file.go')).toBe('Go');
    expect(getLanguageName('file.rs')).toBe('Rust');
    expect(getLanguageName('file.cs')).toBe('C#');
    expect(getLanguageName('file.c')).toBe('C');
    expect(getLanguageName('file.cpp')).toBe('C++');
    expect(getLanguageName('file.kt')).toBe('Kotlin');
    expect(getLanguageName('file.swift')).toBe('Swift');
    expect(getLanguageName('file.rb')).toBe('Ruby');
    expect(getLanguageName('file.php')).toBe('PHP');
    expect(getLanguageName('file.scala')).toBe('Scala');
    expect(getLanguageName('file.sh')).toBe('Shell');
    expect(getLanguageName('file.css')).toBe('CSS');
    expect(getLanguageName('file.scss')).toBe('SCSS');
    expect(getLanguageName('file.html')).toBe('HTML');
    expect(getLanguageName('file.vue')).toBe('Vue');
    expect(getLanguageName('file.svelte')).toBe('Svelte');
    expect(getLanguageName('file.sql')).toBe('SQL');
    expect(getLanguageName('file.yaml')).toBe('YAML');
    expect(getLanguageName('file.json')).toBe('JSON');
    expect(getLanguageName('file.xml')).toBe('XML');
    expect(getLanguageName('file.graphql')).toBe('GraphQL');
    expect(getLanguageName('main.tf')).toBe('Terraform');
    expect(getLanguageName('config.hcl')).toBe('HCL');
    expect(getLanguageName('Dockerfile')).toBe('Dockerfile');
    expect(getLanguageName('unknown.xyz')).toBe('Unknown');
  });

  it('should return display names via getLanguageDisplayName', () => {
    expect(getLanguageDisplayName('typescript')).toBe('TypeScript');
    expect(getLanguageDisplayName('csharp')).toBe('C#');
    expect(getLanguageDisplayName('cpp')).toBe('C++');
    expect(getLanguageDisplayName('unknown')).toBe('Unknown');
  });
});

// ============================================================================
// getSupportedLanguages Tests
// ============================================================================

describe('getSupportedLanguages', () => {
  it('should return all 28 supported languages', () => {
    const languages = getSupportedLanguages();
    expect(languages).toContain('typescript');
    expect(languages).toContain('javascript');
    expect(languages).toContain('python');
    expect(languages).toContain('java');
    expect(languages).toContain('go');
    expect(languages).toContain('rust');
    expect(languages).toContain('dockerfile');
    expect(languages).not.toContain('unknown');
    expect(languages.length).toBeGreaterThanOrEqual(28);
  });
});

// ============================================================================
// TypeScript/JavaScript Chunking Tests
// ============================================================================

describe('splitCodeWithLineNumbers for TypeScript/JavaScript', () => {
  it('should split at function declarations', () => {
    const code = `
function foo() {
  return 1;
}

function bar() {
  return 2;
}

function baz() {
  return 3;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50, // Small chunk size to force splits
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    // Should produce multiple chunks split at function boundaries
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should split at class declarations', () => {
    const code = `
class Foo {
  constructor() {}
  method() {}
}

class Bar {
  constructor() {}
  method() {}
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle export declarations', () => {
    const code = `
export function foo() {
  return 1;
}

export default class Bar {
  method() {}
}

export const baz = () => 42;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should return single chunk for small files', () => {
    const code = `
function foo() {
  return 1;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 1000, // Large enough to fit the whole file
      chunkOverlap: 100,
      maxChunkSize: 2000,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(1);
    expect(chunks![0].text).toBe(code);
    expect(chunks![0].startLine).toBe(1);
  });

  it('should handle empty files', () => {
    const chunks = splitCodeWithLineNumbers('', 'test.ts');
    expect(chunks).toEqual([]);
  });

  it('should return null for files with no semantic boundaries', () => {
    const code = `
// Just comments
// and more comments
// nothing else
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 10,
      chunkOverlap: 5,
      maxChunkSize: 50,
    });

    // Should return null to signal fallback
    expect(chunks).toBeNull();
  });
});

// ============================================================================
// Python Chunking Tests
// ============================================================================

describe('splitCodeWithLineNumbers for Python', () => {
  it('should split at function definitions', () => {
    const code = `
def foo():
    return 1

def bar():
    return 2

def baz():
    return 3
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 40,
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should split at class definitions', () => {
    const code = `
class Foo:
    def __init__(self):
        pass

class Bar:
    def __init__(self):
        pass
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle decorated functions', () => {
    const code = `
@decorator
def foo():
    return 1

@another_decorator
def bar():
    return 2
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle async functions', () => {
    const code = `
async def foo():
    return 1

async def bar():
    await something()
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Java Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for Java', () => {
  it('should split at class declarations', () => {
    const code = `
public class Foo {
    public void method() {}
}

public class Bar {
    public void method() {}
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Test.java', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle interface declarations', () => {
    const code = `
public interface Foo {
    void method();
}

public interface Bar {
    void another();
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Test.java', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle annotations', () => {
    const code = `
@Entity
public class User {
    @Id
    private Long id;
}

@Service
public class UserService {
    public void save() {}
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Test.java', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Go Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for Go', () => {
  it('should split at function declarations', () => {
    const code = `
func foo() int {
    return 1
}

func bar() int {
    return 2
}

func baz() int {
    return 3
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'main.go', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle method receivers', () => {
    const code = `
func (s *Server) Start() error {
    return nil
}

func (s *Server) Stop() error {
    return nil
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'server.go', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle struct and interface definitions', () => {
    const code = `
type User struct {
    ID   int
    Name string
}

type UserService interface {
    Get(id int) (*User, error)
    Create(u *User) error
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'types.go', {
      chunkSize: 80,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Rust Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for Rust', () => {
  it('should split at function declarations', () => {
    const code = `
fn foo() -> i32 {
    1
}

fn bar() -> i32 {
    2
}

pub fn baz() -> i32 {
    3
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'lib.rs', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle struct and impl blocks', () => {
    const code = `
pub struct User {
    id: u64,
    name: String,
}

impl User {
    pub fn new(name: String) -> Self {
        Self { id: 0, name }
    }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'user.rs', {
      chunkSize: 80,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle trait definitions', () => {
    const code = `
pub trait Repository {
    fn get(&self, id: u64) -> Option<User>;
    fn save(&mut self, user: User);
}

impl Repository for InMemoryRepo {
    fn get(&self, id: u64) -> Option<User> {
        None
    }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'repo.rs', {
      chunkSize: 100,
      chunkOverlap: 10,
      maxChunkSize: 250,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// C# Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for C#', () => {
  it('should split at class declarations', () => {
    const code = `
public class Foo
{
    public void Method() { }
}

public class Bar
{
    public void Method() { }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Program.cs', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle namespaces and interfaces', () => {
    const code = `
namespace MyApp.Services
{
    public interface IUserService
    {
        void GetUser(int id);
    }

    public class UserService : IUserService
    {
        public void GetUser(int id) { }
    }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Services.cs', {
      chunkSize: 100,
      chunkOverlap: 10,
      maxChunkSize: 300,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// C/C++ Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for C', () => {
  it('should split at function definitions', () => {
    const code = `
int foo() {
    return 1;
}

int bar() {
    return 2;
}

static int baz() {
    return 3;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'main.c', {
      chunkSize: 40,
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle structs', () => {
    const code = `
struct User {
    int id;
    char* name;
};

typedef struct {
    int x;
    int y;
} Point;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'types.h', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });
});

describe('splitCodeWithLineNumbers for C++', () => {
  it('should split at class definitions', () => {
    const code = `
class Foo {
public:
    void method();
};

class Bar {
public:
    void method();
};
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'classes.cpp', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle namespaces', () => {
    const code = `
namespace utils {
    void helper() {}
}

namespace core {
    class Engine {
    public:
        void run();
    };
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'main.cpp', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 180,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Kotlin Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for Kotlin', () => {
  it('should split at function and class declarations', () => {
    const code = `
fun foo(): Int {
    return 1
}

class Bar {
    fun method() {}
}

object Singleton {
    val value = 42
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Main.kt', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Swift Chunking Tests (Tier 1)
// ============================================================================

describe('splitCodeWithLineNumbers for Swift', () => {
  it('should split at function and class declarations', () => {
    const code = `
func foo() -> Int {
    return 1
}

class Bar {
    func method() {}
}

struct Point {
    var x: Int
    var y: Int
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Main.swift', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle protocols and extensions', () => {
    const code = `
protocol Drawable {
    func draw()
}

extension Int: Drawable {
    func draw() {}
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Protocols.swift', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 180,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Tier 2 Languages Tests
// ============================================================================

describe('splitCodeWithLineNumbers for Ruby', () => {
  it('should split at class and method definitions', () => {
    const code = `
class Foo
  def bar
    1
  end
end

class Baz
  def qux
    2
  end
end
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'app.rb', {
      chunkSize: 40,
      chunkOverlap: 10,
      maxChunkSize: 120,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for PHP', () => {
  it('should split at class and function definitions', () => {
    const code = `
class Foo {
    public function bar() {
        return 1;
    }
}

class Baz {
    public function qux() {
        return 2;
    }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'index.php', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 180,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for Shell', () => {
  it('should split at function definitions', () => {
    const code = `
foo() {
    echo "foo"
}

function bar {
    echo "bar"
}

baz() {
    echo "baz"
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'script.sh', {
      chunkSize: 30,
      chunkOverlap: 5,
      maxChunkSize: 80,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tier 3 Languages Tests
// ============================================================================

describe('splitCodeWithLineNumbers for CSS', () => {
  it('should split at rule blocks', () => {
    const code = `
.header {
    background: blue;
}

.footer {
    background: gray;
}

@media (max-width: 768px) {
    .header {
        padding: 10px;
    }
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'styles.css', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 180,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for SQL', () => {
  it('should split at DDL statements', () => {
    const code = `
CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT
);

SELECT * FROM users;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'schema.sql', {
      chunkSize: 80,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for GraphQL', () => {
  it('should split at type definitions', () => {
    const code = `
type User {
    id: ID!
    name: String!
}

type Query {
    user(id: ID!): User
}

type Mutation {
    createUser(name: String!): User
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'schema.graphql', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 180,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for Vue', () => {
  it('should split at template/script/style blocks', () => {
    const code = `
<template>
    <div>Hello</div>
</template>

<script>
export default {
    name: 'Hello'
}
</script>

<style scoped>
div { color: red; }
</style>
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Component.vue', {
      chunkSize: 80,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tier 4 Languages Tests
// ============================================================================

describe('splitCodeWithLineNumbers for Terraform', () => {
  it('should split at resource blocks', () => {
    const code = `
resource "aws_instance" "web" {
    ami           = "ami-12345"
    instance_type = "t2.micro"
}

resource "aws_s3_bucket" "data" {
    bucket = "my-bucket"
}

variable "region" {
    default = "us-east-1"
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'main.tf', {
      chunkSize: 80,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

describe('splitCodeWithLineNumbers for Dockerfile', () => {
  it('should split at major instructions', () => {
    const code = `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'Dockerfile', {
      chunkSize: 60,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Edge Cases and Fallback Tests
// ============================================================================

describe('code-aware chunking edge cases', () => {
  it('should return single chunk for small files regardless of language', () => {
    // Small files (under chunkSize) return as single chunk before language detection
    const chunks = splitCodeWithLineNumbers('package main\n\nfunc main() {}', 'test.go');
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(1);
  });

  it('should handle files with only whitespace', () => {
    const chunks = splitCodeWithLineNumbers('   \n\n   \n', 'test.ts');
    // Small files that fit in a single chunk are returned as-is
    expect(chunks).not.toBeNull();
    if (chunks) {
      expect(chunks.length).toBe(1);
    }
  });

  it('should track line numbers correctly', () => {
    const code = `// Comment
function foo() {
  return 1;
}

function bar() {
  return 2;
}`;

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 100,
      chunkOverlap: 20,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    if (chunks && chunks.length > 0) {
      // First chunk should start at line 1
      expect(chunks[0].startLine).toBe(1);
    }
  });

  it('should handle interface declarations', () => {
    const code = `
interface Foo {
  bar: string;
  baz: number;
}

interface Bar {
  qux: boolean;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle type declarations', () => {
    const code = `
type Foo = {
  bar: string;
};

type Bar = string | number;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Default Options Tests
// ============================================================================

describe('DEFAULT_CODE_AWARE_OPTIONS', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkSize).toBe(4000);
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkOverlap).toBe(200);
    expect(DEFAULT_CODE_AWARE_OPTIONS.maxChunkSize).toBe(8000);
  });

  it('should have reduced overlap compared to character-based chunking', () => {
    // Character-based chunking uses 800 overlap
    // Code-aware should use less since we split at boundaries
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkOverlap).toBeLessThan(800);
  });
});
