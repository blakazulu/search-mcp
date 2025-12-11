/**
 * Cryptographic Hash Utilities
 *
 * Provides secure hashing functions for passwords, tokens, and data integrity.
 * Uses industry-standard algorithms with configurable security parameters.
 */

import * as crypto from 'crypto';

// Configuration for bcrypt-like hashing
const HASH_ALGORITHM = 'sha256';
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;

/**
 * Hashes a password using PBKDF2 with a random salt.
 *
 * Security features:
 * - Random salt prevents rainbow table attacks
 * - High iteration count provides brute-force resistance
 * - SHA-256 algorithm for strong cryptographic hashing
 *
 * @param password - Plain text password to hash
 * @returns Hashed password in format: salt$hash
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Generate random salt
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');

    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      // Return salt and hash combined
      resolve(`${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against its hash.
 *
 * @param password - Plain text password to verify
 * @param storedHash - Previously hashed password (salt$hash format)
 * @returns True if password matches
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = storedHash.split('$');

    if (!salt || !hash) {
      resolve(false);
      return;
    }

    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      // Use timing-safe comparison to prevent timing attacks
      const derivedHash = derivedKey.toString('hex');
      resolve(crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(derivedHash)));
    });
  });
}

/**
 * Generates a SHA-256 hash of the input data.
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function sha256(data: string | Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Generates a SHA-512 hash of the input data.
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function sha512(data: string | Buffer): string {
  const hash = crypto.createHash('sha512');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Generates an HMAC signature for data authentication.
 *
 * @param data - Data to sign
 * @param secret - Secret key for signing
 * @param algorithm - Hash algorithm (default: sha256)
 * @returns Hex-encoded HMAC signature
 */
export function hmac(data: string | Buffer, secret: string, algorithm: string = 'sha256'): string {
  const hmacInstance = crypto.createHmac(algorithm, secret);
  hmacInstance.update(data);
  return hmacInstance.digest('hex');
}

/**
 * Verifies an HMAC signature.
 *
 * @param data - Original data
 * @param signature - Signature to verify
 * @param secret - Secret key used for signing
 * @param algorithm - Hash algorithm used
 * @returns True if signature is valid
 */
export function verifyHmac(
  data: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  const expectedSignature = hmac(data, secret, algorithm);
  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Generates a secure random token.
 *
 * @param length - Length of token in bytes (default: 32)
 * @returns Hex-encoded random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generates a URL-safe random token.
 *
 * @param length - Length of token in bytes
 * @returns Base64url-encoded random token
 */
export function generateUrlSafeToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Computes a checksum for file integrity verification.
 *
 * @param content - File content
 * @param algorithm - Hash algorithm (default: md5 for speed)
 * @returns Hex-encoded checksum
 */
export function checksum(content: string | Buffer, algorithm: string = 'md5'): string {
  const hash = crypto.createHash(algorithm);
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Hashes data with optional salt for database storage.
 *
 * @param data - Data to hash
 * @param salt - Optional salt (generated if not provided)
 * @returns Object with salt and hash
 */
export function hashWithSalt(data: string, salt?: string): { salt: string; hash: string } {
  const useSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = sha256(useSalt + data);
  return { salt: useSalt, hash };
}

/**
 * Stretches a key using PBKDF2 for encryption key derivation.
 *
 * @param password - Base password
 * @param salt - Salt value
 * @param iterations - Number of iterations
 * @param keyLength - Desired key length in bytes
 * @returns Derived key as Buffer
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = ITERATIONS,
  keyLength: number = 32
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, HASH_ALGORITHM, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
