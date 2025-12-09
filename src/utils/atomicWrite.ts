/**
 * Atomic Write Utilities
 *
 * Provides atomic file write operations that ensure data integrity:
 * - Creates parent directories if needed
 * - Writes to a temp file first, then renames (atomic on most filesystems)
 * - Cleans up temp files on any error
 * - Uses PID and timestamp in temp filename to prevent collisions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Atomically write content to a file.
 *
 * This function ensures that writes are atomic:
 * 1. Creates parent directories if they don't exist
 * 2. Writes content to a temporary file
 * 3. Renames the temp file to the target (atomic on most filesystems)
 * 4. Cleans up the temp file on any error
 *
 * The temp file name includes timestamp and PID to prevent collisions
 * between concurrent writes and different processes.
 *
 * @param targetPath - Absolute path to the target file
 * @param content - Content to write to the file
 * @param encoding - Character encoding (default: 'utf-8')
 *
 * @example
 * ```typescript
 * await atomicWrite('/path/to/file.txt', 'Hello, World!');
 * ```
 */
export async function atomicWrite(
  targetPath: string,
  content: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  const tempPath = `${targetPath}.tmp.${Date.now()}.${process.pid}`;

  try {
    // Ensure parent directory exists
    const dir = path.dirname(targetPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Write to temp file
    await fs.promises.writeFile(tempPath, content, encoding);

    // Atomic rename
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup errors (file may not exist if write failed early)
    }
    throw error;
  }
}

/**
 * Atomically write JSON content to a file.
 *
 * This is a convenience wrapper around atomicWrite that handles
 * JSON serialization with optional pretty-printing.
 *
 * @param targetPath - Absolute path to the target file
 * @param data - Data to serialize and write
 * @param pretty - Whether to pretty-print the JSON (default: true)
 *
 * @example
 * ```typescript
 * await atomicWriteJson('/path/to/data.json', { key: 'value' });
 * // Creates: { "key": "value" }
 *
 * await atomicWriteJson('/path/to/data.json', { key: 'value' }, false);
 * // Creates: {"key":"value"}
 * ```
 */
export async function atomicWriteJson(
  targetPath: string,
  data: unknown,
  pretty: boolean = true
): Promise<void> {
  const content = pretty
    ? JSON.stringify(data, null, 2) + '\n'
    : JSON.stringify(data) + '\n';
  await atomicWrite(targetPath, content);
}
