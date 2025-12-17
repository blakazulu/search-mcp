# Use Cases & Examples

[← Back to README](../README.md)

Real-world examples of how to use Search MCP effectively.

---

## Table of Contents

- [Understanding Unfamiliar Code](#understanding-unfamiliar-code)
- [Debugging Issues](#debugging-issues)
- [Documentation Lookup](#documentation-lookup)
- [Finding Connections](#finding-connections)
- [Making Changes Safely](#making-changes-safely)
- [Finding Files by Pattern](#finding-files-by-pattern)
- [Onboarding to a Feature](#onboarding-to-a-feature)
- [Learning Codebase Patterns](#learning-codebase-patterns)
- [Hybrid Search Examples](#hybrid-search-examples)
- [Best Practices](#best-practices)

---

## Understanding Unfamiliar Code

**Scenario:** You just joined a new project and need to understand how things work.

```
You: "How does authentication work in this project?"

AI: *searches codebase*

AI: "Based on src/auth/middleware.ts and src/auth/jwt.ts, authentication uses JWT tokens.
     The middleware validates tokens on each request and attaches the user to req.user..."
```

---

## Debugging Issues

**Scenario:** You're seeing an error and need to find where it originates.

```
You: "Where is the 'InvalidUserError' thrown?"

AI: *searches for error*

AI: "InvalidUserError is thrown in 3 places:
     1. src/services/user.ts:45 - when user lookup fails
     2. src/api/auth.ts:78 - when password validation fails
     3. src/middleware/validate.ts:23 - when session expired..."
```

---

## Documentation Lookup

**Scenario:** You need to check what the PRD says about a feature.

```
You: "What does the documentation say about the payment flow?"

AI: *searches docs*

AI: "According to docs/PRD.md, the payment flow should:
     1. Validate card details before submission
     2. Show a confirmation modal with total amount
     3. Retry failed payments up to 3 times..."
```

---

## Finding Connections

**Scenario:** You need to understand how different parts of the code connect.

```
You: "What files import the UserService?"

AI: *searches imports*

AI: "UserService is imported by 8 files:
     - src/api/users.ts
     - src/api/auth.ts
     - src/jobs/notifications.ts
     - src/tests/user.test.ts..."
```

---

## Making Changes Safely

**Scenario:** You need to modify a function but want to know the impact.

```
You: "I want to change the calculateTotal function. What else uses it?"

AI: *searches usage*

AI: "calculateTotal is used in:
     - src/cart/checkout.ts - calculates order total
     - src/reports/sales.ts - generates daily reports
     - src/tests/cart.test.ts - 12 test cases
     Be careful: the reports module expects a specific return format..."
```

---

## Finding Files by Pattern

**Scenario:** You know part of a filename but not the full path.

```
You: "Find all test files for authentication"

AI: *searches by pattern*

AI: "Found 4 auth-related test files:
     - src/tests/auth.test.ts
     - src/tests/auth-middleware.test.ts
     - src/tests/integration/auth-flow.test.ts
     - e2e/login.spec.ts"
```

---

## Onboarding to a Feature

**Scenario:** You're assigned to work on a feature you've never touched.

```
You: "I need to work on the notification system. Give me an overview."

AI: *searches codebase*

AI: "The notification system consists of:
     - src/services/notifications.ts - core service (sends emails, push, SMS)
     - src/jobs/notification-worker.ts - background job processor
     - src/templates/ - email templates
     Key entry point is NotificationService.send(). It queues messages
     that the worker processes every 30 seconds..."
```

---

## Learning Codebase Patterns

**Scenario:** You want to follow existing patterns when adding new code.

```
You: "How do other API endpoints handle errors in this project?"

AI: *searches patterns*

AI: "API endpoints follow a consistent pattern:
     1. Wrap handlers in asyncHandler() (src/utils/async.ts)
     2. Throw AppError with status code for expected errors
     3. Global error handler in src/middleware/error.ts formats response
     Example from src/api/users.ts:45..."
```

---

## Hybrid Search Examples

Search MCP supports three search modes to help you find code more effectively.

### Finding Exact Function Names (Keyword Mode)

**Scenario:** You know the exact function name and want to find it.

```
You: "Find the handleWebSocket function" (with mode="fts")

AI: *uses keyword search*

AI: "Found handleWebSocket in src/websocket/handler.ts:25"
```

**Why keyword mode?** Exact matches for function/class/variable names work best with keyword search.

---

### Understanding a Concept (Vector Mode)

**Scenario:** You want to understand how something works conceptually.

```
You: "How does the authentication flow work?" (with mode="vector")

AI: *uses semantic search*

AI: "Based on the code, authentication works as follows:
     1. User submits credentials to /api/auth/login
     2. AuthService validates against the database
     3. JWT token is generated and returned
     ..."
```

**Why vector mode?** Conceptual questions benefit from semantic understanding.

---

### Best of Both Worlds (Hybrid Mode - Default)

**Scenario:** General search that needs both exact matches and semantic understanding.

```
You: "Find where user passwords are hashed"

AI: *uses hybrid search (combines vector + keyword)*

AI: "Found password hashing in multiple places:
     1. src/utils/crypto.ts:12 - hashPassword function (exact match)
     2. src/auth/register.ts:45 - uses bcrypt for user registration
     3. src/auth/password-reset.ts:78 - hash comparison logic"
```

**Why hybrid mode?** Catches both the exact term "hashPassword" AND related concepts like "bcrypt" and "password validation".

---

### Tuning Search Balance with Alpha

**Scenario:** You want more control over search behavior.

```
You: "Search for database connection with alpha=0.3"

AI: *uses hybrid search with 30% semantic, 70% keyword*
    *prioritizes exact keyword matches*
```

| Alpha | Semantic | Keyword | Best For |
|-------|----------|---------|----------|
| 0.9 | 90% | 10% | Conceptual queries |
| 0.7 | 70% | 30% | Code search (default) |
| 0.5 | 50% | 50% | Balanced |
| 0.3 | 30% | 70% | API/symbol names |

---

### Searching Specific File Types

**Scenario:** Search only in documentation or only in code.

```
You: "Search docs for rate limiting" (uses search_docs)

AI: "Found rate limiting documentation in:
     1. docs/api-guide.md - Rate limiting section
     2. README.md - API limits overview"
```

```
You: "Search code for RateLimiter" (uses search_code)

AI: "Found RateLimiter class in:
     1. src/middleware/rateLimiter.ts
     2. src/utils/rateLimit.ts"
```

---

## Best Practices

### Don't Drag Docs — Ask Instead

**The Problem:**

When you drag a document into the chat, the AI reads the **entire file** into its context window. For large docs (PRDs, specs, guides), this:
- Fills up the AI's memory quickly
- Degrades response quality as context grows
- Wastes tokens on irrelevant sections

**The Solution:**

Instead of dragging, just **ask about the doc**:

| Don't Do This | Do This Instead |
|---------------|-----------------|
| *Drags PRD.md into chat* | "What does the PRD say about authentication?" |
| *Drags API-guide.md into chat* | "Search the docs for rate limiting" |
| *Drags multiple docs* | "Find documentation about the payment flow" |

The AI will use `search_docs` to retrieve only the relevant chunks, keeping your context clean.

---

### Hybrid Approach: When You Already Dragged a Doc

If you've already dragged a document into the chat, you can still benefit from Search MCP for **follow-up questions**:

```
You: *drags large-spec.md into chat*
You: "Summarize this document"

AI: *reads the full doc you dragged*
AI: "Here's a summary..."

You: "Now find where it mentions error handling"

AI: *uses search_docs instead of re-reading the whole file*
AI: "Based on section 4.2 of the spec, error handling should..."
```

**How it works:**
- The AI recognizes the doc is already indexed
- For follow-up searches, it uses `search_docs` for precision
- Avoids re-reading the entire document for each question

---

### When TO Drag Files

Dragging is still useful for:
- **Small files** (< 100 lines) - Quick to read entirely
- **Files outside your project** - External docs not in the index
- **One-time references** - Files you won't ask about again
- **Showing exact content** - When you need the AI to see specific formatting

---

### Quick Reference

| Scenario | Best Approach |
|----------|---------------|
| Large project doc (PRD, RFC, guide) | Ask: "Search docs for X" |
| Code file you're editing | AI auto-searches with `search_code` |
| External doc (not in project) | Drag into chat |
| Small config file | Either works |
| Multiple related questions about a doc | Ask (uses search) |
| Need AI to see exact formatting | Drag |

---

## What Can You Ask?

Once set up, just talk naturally:

- "How does user registration work?"
- "Find all files related to payments"
- "What's the database schema?"
- "Show me where errors are handled"
- "What files import the Logger class?"
- "Search the docs for API rate limits"

The AI will automatically search your code and find relevant files.

---

## Next Steps

- [Getting Started](./getting-started.md) - Installation guide
- [Configuration](./configuration.md) - Customize indexing behavior
- [Troubleshooting](./troubleshooting.md) - Solve common issues
