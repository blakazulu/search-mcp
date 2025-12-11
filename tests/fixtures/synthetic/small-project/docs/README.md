# Small Project

A sample TypeScript application demonstrating authentication, database operations, and API development patterns.

## Overview

This project provides a foundation for building secure web applications with:

- **Authentication**: User login with password hashing, OAuth integration (Google, GitHub, Microsoft)
- **Database**: Connection pooling, query builder, and migration system
- **API**: RESTful routes, middleware, and WebSocket support
- **Utilities**: Validation, logging, caching, and cryptographic functions

## Getting Started

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file with the following variables:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=myapp
DATABASE_USER=admin
DATABASE_PASSWORD=secret

JWT_SECRET=your-secret-key
SESSION_EXPIRY=86400000

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### Running the Application

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## Architecture

### Directory Structure

```
src/
  auth/           # Authentication module
    login.ts      # Email/password authentication
    oauth.ts      # OAuth 2.0 implementation
    types.ts      # Authentication types
  db/             # Database module
    connection.ts # Connection pooling
    query.ts      # Query builder
    migrations.ts # Schema migrations
  api/            # API module
    routes.ts     # Route definitions
    middleware.ts # Request middleware
    websocket.ts  # WebSocket handling
  utils/          # Utility functions
    hash.ts       # Password hashing
    validation.ts # Input validation
    logger.ts     # Logging utility
    crypto.ts     # Encryption utilities
  services/       # Business logic services
    fileWatcher.ts # File system monitoring
    cache.ts      # Caching service
    queue.ts      # Job queue
    embedding.ts  # Vector embeddings
  errors/         # Error classes
    auth.ts       # Authentication errors
    api.ts        # API errors
```

## Features

### Authentication

The authentication system supports multiple methods:

1. **Email/Password Login**
   - Secure password hashing with PBKDF2
   - Session token generation
   - Login attempt tracking

2. **OAuth 2.0**
   - Google, GitHub, Microsoft providers
   - CSRF protection with state parameter
   - Token refresh support

### Database

The database layer provides:

- **Connection Pooling**: Efficient connection management with automatic cleanup
- **Query Builder**: Fluent interface for SQL construction with injection prevention
- **Migrations**: Version-controlled schema changes

### API

RESTful API with:

- **Rate Limiting**: Configurable request limits per endpoint
- **Authentication Middleware**: JWT validation
- **CORS Support**: Configurable origin policies
- **Error Handling**: Consistent error response format

### Performance Optimization

Built-in optimizations include:

- LRU caching for frequently accessed data
- Connection pooling for database efficiency
- Batch processing for embeddings
- Job queue for async operations

## Security

Security measures implemented:

- Password hashing with salt
- CSRF protection
- Rate limiting
- Input validation and sanitization
- SQL injection prevention
- XSS protection

## API Documentation

See [API Documentation](./api.md) for detailed endpoint information.

## Security Guide

See [Security Guide](./security.md) for security best practices and configuration.
