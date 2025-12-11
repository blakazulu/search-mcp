# API Documentation

## Overview

This document describes the RESTful API endpoints provided by the application.

## Base URL

All endpoints are prefixed with `/api/v1`.

## Authentication

Most endpoints require authentication via Bearer token:

```
Authorization: Bearer <token>
```

## Endpoints

### Health Check

```
GET /health
```

Returns server status and uptime.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 12345.67,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Authentication

#### Login

```
POST /auth/login
```

Authenticates a user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "rememberMe": true
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2024-01-16T10:30:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid email or password
- `422 Unprocessable Entity`: Validation failed

#### Logout

```
POST /auth/logout
```

Invalidates the current session token.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
- `204 No Content`

#### OAuth Login

```
GET /auth/oauth/:provider
```

Initiates OAuth flow for the specified provider.

**Parameters:**
- `provider`: One of `google`, `github`, `microsoft`

**Query Parameters:**
- `returnUrl`: URL to redirect after authentication (optional)

**Response:**
- `302 Redirect` to provider's authorization page

#### OAuth Callback

```
GET /auth/oauth/:provider/callback
```

Handles OAuth callback from provider.

**Query Parameters:**
- `code`: Authorization code from provider
- `state`: State parameter for CSRF validation

**Response:**
- `302 Redirect` to application with token

---

### Users

#### Get User Profile

```
GET /users/:id
```

Retrieves a user's profile information.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: User not found
- `401 Unauthorized`: Authentication required

#### Update User Profile

```
PUT /users/:id
```

Updates a user's profile information.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

**Response:**
```json
{
  "success": true
}
```

**Error Responses:**
- `403 Forbidden`: Not authorized to update this profile
- `422 Unprocessable Entity`: Validation failed

#### Delete User Account

```
DELETE /users/:id
```

Deletes a user account.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
- `204 No Content`

**Error Responses:**
- `403 Forbidden`: Not authorized to delete this account

---

### Resources

#### List Resources

```
GET /resources
```

Lists all resources with pagination.

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sort`: Sort field (default: createdAt)
- `order`: Sort order, ASC or DESC (default: DESC)

**Response:**
```json
{
  "data": [
    {
      "id": "res_123",
      "name": "My Resource",
      "type": "document",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

#### Create Resource

```
POST /resources
```

Creates a new resource.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "New Resource",
  "type": "document",
  "content": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "id": "res_456"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "requestId": "req_abc123"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `BAD_REQUEST` | 400 | Invalid request format |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

API requests are rate limited to 100 requests per minute per IP.

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## WebSocket API

Connect to `/ws` for real-time updates.

**Authentication:**
Include token as query parameter: `/ws?token=<token>`

**Message Format:**
```json
{
  "type": "message_type",
  "payload": {},
  "timestamp": 1705312200000
}
```

**Available Message Types:**
- `ping` / `pong`: Connection health check
- `subscribe`: Subscribe to a room
- `unsubscribe`: Unsubscribe from a room
- `authenticate`: Authenticate the connection

---

## SDK Examples

### JavaScript/TypeScript

```typescript
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123!'
  })
});

const { token } = await response.json();
```

### cURL

```bash
curl -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123!"}'
```
