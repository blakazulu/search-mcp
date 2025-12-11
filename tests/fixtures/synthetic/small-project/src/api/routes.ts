/**
 * API Routes Configuration
 *
 * Defines all API routes and their handlers for the application.
 * Implements RESTful patterns with proper error handling.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateUser, logout, validateSession } from '../auth/login';
import { handleOAuthCallback, generateAuthorizationUrl } from '../auth/oauth';
import { QueryBuilder } from '../db/query';
import { validateRequestBody, validateQueryParams } from '../utils/validation';
import { authMiddleware, rateLimitMiddleware } from './middleware';
import { ApiError, NotFoundError, ValidationError } from '../errors/api';
import { Logger } from '../utils/logger';

const logger = new Logger('api');
const router = Router();

// Apply global middleware
router.use(rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }));

/**
 * Health check endpoint.
 * Returns server status and uptime.
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Authentication Routes
 */

/**
 * POST /auth/login
 * Authenticates user with email and password.
 */
router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, rememberMe } = validateRequestBody(req.body, {
      email: { type: 'string', required: true },
      password: { type: 'string', required: true },
      rememberMe: { type: 'boolean', required: false },
    });

    const result = await authenticateUser({ email, password, rememberMe });

    if (!result.success) {
      throw new ValidationError(result.error || 'Login failed');
    }

    logger.info(`User logged in: ${email}`);
    res.json({
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/logout
 * Invalidates the current session token.
 */
router.post('/auth/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await logout(token);
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/oauth/:provider
 * Initiates OAuth flow for the specified provider.
 */
router.get('/auth/oauth/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { returnUrl = '/' } = req.query;

    const config = getOAuthConfig(provider as any);
    const authUrl = await generateAuthorizationUrl(provider as any, config, returnUrl as string);

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/oauth/:provider/callback
 * Handles OAuth callback and exchanges code for tokens.
 */
router.get('/auth/oauth/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state } = req.query;
    const { provider } = req.params;

    const config = getOAuthConfig(provider as any);
    const { user, tokens } = await handleOAuthCallback(code as string, state as string, config);

    // Create or update user account
    const localUser = await findOrCreateUser(user);

    // Generate session token
    const sessionToken = await createSession(localUser.id);

    res.redirect(`/auth/success?token=${sessionToken}`);
  } catch (error) {
    logger.error('OAuth callback failed', error);
    res.redirect('/auth/error');
  }
});

/**
 * User Routes
 */

/**
 * GET /users/:id
 * Gets user profile by ID.
 */
router.get('/users/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await QueryBuilder.table('users')
      .select('id', 'email', 'name', 'createdAt')
      .where('id', id)
      .first();

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /users/:id
 * Updates user profile.
 */
router.put('/users/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = validateRequestBody(req.body, {
      name: { type: 'string', required: false },
      email: { type: 'string', required: false },
    });

    // Ensure user can only update their own profile
    if ((req as any).userId !== id) {
      throw new ApiError(403, 'Not authorized to update this profile');
    }

    await QueryBuilder.table('users')
      .where('id', id)
      .update(updates);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /users/:id
 * Deletes a user account.
 */
router.delete('/users/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Ensure user can only delete their own account
    if ((req as any).userId !== id) {
      throw new ApiError(403, 'Not authorized to delete this account');
    }

    await QueryBuilder.table('users')
      .where('id', id)
      .delete();

    logger.info(`User deleted: ${id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * Resource Routes
 */

/**
 * GET /resources
 * Lists all resources with pagination.
 */
router.get('/resources', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'DESC' } = validateQueryParams(req.query, {
      page: { type: 'number', required: false },
      limit: { type: 'number', required: false },
      sort: { type: 'string', required: false },
      order: { type: 'string', required: false },
    });

    const offset = (page - 1) * limit;

    const resources = await QueryBuilder.table('resources')
      .where('userId', (req as any).userId)
      .orderBy(sort, order as 'ASC' | 'DESC')
      .limit(limit)
      .offset(offset)
      .get();

    const total = await QueryBuilder.table('resources')
      .where('userId', (req as any).userId)
      .count();

    res.json({
      data: resources,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /resources
 * Creates a new resource.
 */
router.post('/resources', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validateRequestBody(req.body, {
      name: { type: 'string', required: true },
      type: { type: 'string', required: true },
      content: { type: 'object', required: false },
    });

    const id = generateId();
    await QueryBuilder.table('resources').insert({
      id,
      ...data,
      userId: (req as any).userId,
      createdAt: new Date(),
    });

    logger.info(`Resource created: ${id}`);
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

// Helper functions

function getOAuthConfig(provider: 'google' | 'github' | 'microsoft') {
  const configs = {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI!,
      scope: ['email', 'profile'],
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: process.env.GITHUB_REDIRECT_URI!,
      scope: ['user:email'],
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
      scope: ['user.read', 'email'],
    },
  };
  return configs[provider];
}

async function findOrCreateUser(oauthUser: any) {
  const existing = await QueryBuilder.table('users')
    .where('email', oauthUser.email)
    .first();

  if (existing) {
    return existing;
  }

  const id = generateId();
  await QueryBuilder.table('users').insert({
    id,
    email: oauthUser.email,
    name: oauthUser.name,
    createdAt: new Date(),
  });

  return { id, email: oauthUser.email };
}

async function createSession(userId: string): Promise<string> {
  const token = generateId();
  await QueryBuilder.table('sessions').insert({
    id: generateId(),
    userId,
    token,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return token;
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export { router };
