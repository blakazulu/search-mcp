/**
 * Device Detection Engine
 *
 * Detects the best available compute device at runtime.
 * Enables automatic performance optimization without user configuration.
 *
 * Device Priority by Environment:
 *
 * **Browser Environment:**
 * - WebGPU > CPU (WASM)
 *
 * **Node.js Environment:**
 * - Windows: DirectML (dml) > CPU
 * - macOS: CPU only (CoreML not available in Node.js)
 * - Linux: CPU only (CUDA not available in standard onnxruntime-node)
 *
 * GPU Support Notes:
 * - WebGPU: Only available in browsers, not in Node.js
 * - DirectML: Windows GPU acceleration via onnxruntime-node
 * - CUDA: Requires separate onnxruntime-node-cuda package (not included)
 * - CoreML: Not available for Node.js bindings
 *
 * @example
 * ```typescript
 * const deviceInfo = await detectBestDevice();
 * console.log(deviceInfo.device); // 'webgpu', 'dml', or 'cpu'
 * console.log(deviceInfo.gpuName); // 'DirectML GPU' (if available)
 * ```
 */

import { getLogger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Available compute devices for embedding generation.
 *
 * - 'webgpu': WebGPU acceleration (browser only)
 * - 'dml': DirectML acceleration (Windows Node.js only)
 * - 'cpu': CPU computation (always available)
 */
export type ComputeDevice = 'webgpu' | 'dml' | 'cpu';

/**
 * Information about the detected compute device
 */
export interface DeviceInfo {
  /** The selected compute device */
  device: ComputeDevice;
  /** GPU name/model if WebGPU is available */
  gpuName?: string;
  /** GPU vendor if WebGPU is available */
  gpuVendor?: string;
  /** Reason for falling back to CPU (if device is 'cpu') */
  fallbackReason?: string;
  /** Time taken to detect the device in milliseconds */
  detectionTimeMs?: number;
}

/**
 * WebGPU adapter information (subset of GPUAdapterInfo)
 */
interface WebGPUAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

/**
 * WebGPU adapter interface (subset of GPUAdapter)
 */
interface WebGPUAdapter {
  info?: WebGPUAdapterInfo;
  requestAdapterInfo?: () => Promise<WebGPUAdapterInfo>;
}

/**
 * WebGPU navigator.gpu interface
 */
interface WebGPUNavigator {
  gpu?: {
    requestAdapter: (options?: unknown) => Promise<WebGPUAdapter | null>;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Component name for logging
 */
const COMPONENT = 'DeviceDetection';

/**
 * Fallback reasons as constants for consistency
 */
export const FALLBACK_REASONS = {
  NO_WEBGPU_API: 'WebGPU API not available in this environment',
  NO_ADAPTER: 'No GPU adapter found',
  ADAPTER_REQUEST_FAILED: 'GPU adapter request failed',
  DETECTION_TIMEOUT: 'Device detection timed out',
  NODE_NOT_WINDOWS: 'DirectML only available on Windows',
  NODE_DML_DISABLED: 'DirectML disabled by configuration',
  DML_INIT_FAILED: 'DirectML initialization failed',
} as const;

/**
 * Maximum time allowed for device detection (ms)
 */
export const DETECTION_TIMEOUT_MS = 5000;

// ============================================================================
// Cached Device Info
// ============================================================================

/**
 * Cached device info to avoid repeated detection during session
 */
let cachedDeviceInfo: DeviceInfo | null = null;

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running in a browser environment.
 *
 * @returns True if running in a browser
 */
export function isBrowserEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !('versions' in process)
  );
}

/**
 * Check if running in Node.js environment.
 *
 * @returns True if running in Node.js
 */
export function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Check if running on Windows.
 *
 * @returns True if running on Windows
 */
export function isWindows(): boolean {
  return typeof process !== 'undefined' && process.platform === 'win32';
}

/**
 * Check if running on macOS.
 *
 * @returns True if running on macOS
 */
export function isMacOS(): boolean {
  return typeof process !== 'undefined' && process.platform === 'darwin';
}

/**
 * Check if running on Linux.
 *
 * @returns True if running on Linux
 */
export function isLinux(): boolean {
  return typeof process !== 'undefined' && process.platform === 'linux';
}

// ============================================================================
// DirectML Detection (Windows Node.js)
// ============================================================================

/**
 * Check if DirectML is available.
 * DirectML is available on Windows via onnxruntime-node.
 *
 * @returns True if DirectML is available
 */
export function isDirectMLAvailable(): boolean {
  // DirectML requires Windows and Node.js
  return isNodeEnvironment() && isWindows();
}

/**
 * Detect DirectML GPU device on Windows.
 * Note: DirectML doesn't expose GPU name directly, so we report it as 'DirectML GPU'.
 *
 * @returns Device info for DirectML or null if not available
 */
async function detectDirectML(): Promise<DeviceInfo | null> {
  if (!isDirectMLAvailable()) {
    return null;
  }

  // DirectML is available on Windows
  // We don't actually test it here - the embedding engine will handle fallback if it fails
  return {
    device: 'dml',
    gpuName: 'DirectML GPU',
    gpuVendor: 'Microsoft DirectML',
  };
}

// ============================================================================
// WebGPU Detection (Browser only)
// ============================================================================

/**
 * Check if WebGPU API is available in the current environment.
 *
 * WebGPU is available in:
 * - Modern browsers (Chrome 113+, Edge 113+, Firefox behind flag)
 * - Node.js with native WebGPU bindings (experimental)
 *
 * @returns True if navigator.gpu exists
 */
export function isWebGPUAPIAvailable(): boolean {
  try {
    // Check for WebGPU API in global scope
    // In Node.js, this may be provided by native bindings
    const nav = globalThis.navigator as WebGPUNavigator | undefined;
    return nav?.gpu !== undefined;
  } catch {
    return false;
  }
}

/**
 * Request a WebGPU adapter from the system.
 *
 * @returns The GPU adapter or null if unavailable
 */
async function requestWebGPUAdapter(): Promise<WebGPUAdapter | null> {
  try {
    const nav = globalThis.navigator as WebGPUNavigator | undefined;
    if (!nav?.gpu) {
      return null;
    }

    // Request a high-performance adapter
    const adapter = await nav.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    return adapter;
  } catch {
    return null;
  }
}

/**
 * Extract GPU information from an adapter.
 *
 * @param adapter - The WebGPU adapter
 * @returns GPU name and vendor, or undefined values if not available
 */
async function getGPUInfo(
  adapter: WebGPUAdapter
): Promise<{ gpuName?: string; gpuVendor?: string }> {
  try {
    // Try to get adapter info (method varies by implementation)
    let info: WebGPUAdapterInfo | undefined;

    // First try the info property (newer API)
    if (adapter.info) {
      info = adapter.info;
    }
    // Then try requestAdapterInfo method (older API)
    else if (adapter.requestAdapterInfo) {
      info = await adapter.requestAdapterInfo();
    }

    if (!info) {
      return {};
    }

    // Build GPU name from available info
    // Different implementations provide different fields
    const parts: string[] = [];
    if (info.vendor) parts.push(info.vendor);
    if (info.device) parts.push(info.device);
    if (info.architecture) parts.push(`(${info.architecture})`);

    const gpuName = parts.length > 0 ? parts.join(' ') : info.description;

    return {
      gpuName: gpuName || 'Unknown GPU',
      gpuVendor: info.vendor,
    };
  } catch {
    return { gpuName: 'Unknown GPU' };
  }
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect the best available compute device.
 *
 * This function checks for GPU availability based on the runtime environment:
 *
 * **Browser Environment:**
 * - Checks for WebGPU API and requests GPU adapter
 * - Falls back to CPU (WASM) if WebGPU not available
 *
 * **Node.js Environment:**
 * - Windows: Uses DirectML for GPU acceleration
 * - macOS/Linux: Falls back to CPU (no GPU support in standard onnxruntime-node)
 *
 * Results are cached for the session to avoid repeated GPU queries.
 *
 * @param forceRefresh - If true, ignore cached result and re-detect
 * @returns Device information including device type, GPU name (if available), and fallback reason (if CPU)
 *
 * @example
 * ```typescript
 * const deviceInfo = await detectBestDevice();
 * if (deviceInfo.device === 'webgpu' || deviceInfo.device === 'dml') {
 *   console.log(`Using GPU: ${deviceInfo.gpuName}`);
 * } else {
 *   console.log(`Using CPU: ${deviceInfo.fallbackReason}`);
 * }
 * ```
 */
export async function detectBestDevice(forceRefresh = false): Promise<DeviceInfo> {
  const logger = getLogger();

  // Return cached result if available
  if (cachedDeviceInfo && !forceRefresh) {
    logger.debug(COMPONENT, 'Returning cached device info', {
      device: cachedDeviceInfo.device,
      gpuName: cachedDeviceInfo.gpuName,
    });
    return cachedDeviceInfo;
  }

  const startTime = Date.now();
  logger.info(COMPONENT, 'Detecting best compute device...', {
    isNode: isNodeEnvironment(),
    isBrowser: isBrowserEnvironment(),
    platform: typeof process !== 'undefined' ? process.platform : 'browser',
  });

  try {
    // Node.js Environment: Check for DirectML (Windows) first
    if (isNodeEnvironment()) {
      return await detectBestDeviceNode(startTime, logger);
    }

    // Browser Environment: Check for WebGPU
    return await detectBestDeviceBrowser(startTime, logger);
  } catch (error) {
    // Handle any unexpected errors
    const err = error instanceof Error ? error : new Error(String(error));
    const deviceInfo: DeviceInfo = {
      device: 'cpu',
      fallbackReason: `${FALLBACK_REASONS.ADAPTER_REQUEST_FAILED}: ${err.message}`,
      detectionTimeMs: Date.now() - startTime,
    };

    cachedDeviceInfo = deviceInfo;
    logger.warn(COMPONENT, 'Device detection failed, using CPU', {
      error: err.message,
      detectionTimeMs: deviceInfo.detectionTimeMs,
    });

    return deviceInfo;
  }
}

/**
 * Detect best device in Node.js environment.
 * @internal
 */
async function detectBestDeviceNode(
  startTime: number,
  logger: ReturnType<typeof getLogger>
): Promise<DeviceInfo> {
  // Check for DirectML on Windows
  if (isWindows()) {
    const dmlInfo = await detectDirectML();
    if (dmlInfo) {
      dmlInfo.detectionTimeMs = Date.now() - startTime;
      cachedDeviceInfo = dmlInfo;
      logger.info(COMPONENT, 'DirectML available, using GPU acceleration', {
        gpuName: dmlInfo.gpuName,
        detectionTimeMs: dmlInfo.detectionTimeMs,
      });
      return dmlInfo;
    }
  }

  // macOS - no GPU support in Node.js
  if (isMacOS()) {
    const deviceInfo: DeviceInfo = {
      device: 'cpu',
      fallbackReason: 'CoreML not available for Node.js bindings',
      detectionTimeMs: Date.now() - startTime,
    };
    cachedDeviceInfo = deviceInfo;
    logger.info(COMPONENT, 'macOS detected, using CPU (CoreML not available in Node.js)', {
      detectionTimeMs: deviceInfo.detectionTimeMs,
    });
    return deviceInfo;
  }

  // Linux - no GPU support in standard onnxruntime-node
  if (isLinux()) {
    const deviceInfo: DeviceInfo = {
      device: 'cpu',
      fallbackReason: 'CUDA not available in standard onnxruntime-node',
      detectionTimeMs: Date.now() - startTime,
    };
    cachedDeviceInfo = deviceInfo;
    logger.info(COMPONENT, 'Linux detected, using CPU (CUDA requires separate package)', {
      detectionTimeMs: deviceInfo.detectionTimeMs,
    });
    return deviceInfo;
  }

  // Unknown platform - use CPU
  const deviceInfo: DeviceInfo = {
    device: 'cpu',
    fallbackReason: 'Unknown platform, defaulting to CPU',
    detectionTimeMs: Date.now() - startTime,
  };
  cachedDeviceInfo = deviceInfo;
  logger.info(COMPONENT, 'Unknown Node.js platform, using CPU', {
    platform: process.platform,
    detectionTimeMs: deviceInfo.detectionTimeMs,
  });
  return deviceInfo;
}

/**
 * Detect best device in browser environment.
 * @internal
 */
async function detectBestDeviceBrowser(
  startTime: number,
  logger: ReturnType<typeof getLogger>
): Promise<DeviceInfo> {
  // Check if WebGPU API is available
  if (!isWebGPUAPIAvailable()) {
    const deviceInfo: DeviceInfo = {
      device: 'cpu',
      fallbackReason: FALLBACK_REASONS.NO_WEBGPU_API,
      detectionTimeMs: Date.now() - startTime,
    };
    cachedDeviceInfo = deviceInfo;
    logger.info(COMPONENT, 'No WebGPU API, using CPU (WASM)', {
      reason: deviceInfo.fallbackReason,
      detectionTimeMs: deviceInfo.detectionTimeMs,
    });
    return deviceInfo;
  }

  // Request GPU adapter with timeout
  const adapterPromise = requestWebGPUAdapter();
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), DETECTION_TIMEOUT_MS)
  );

  const adapter = await Promise.race([adapterPromise, timeoutPromise]);

  if (adapter === null) {
    // Could be timeout or no adapter found
    const elapsedTime = Date.now() - startTime;
    const isTimeout = elapsedTime >= DETECTION_TIMEOUT_MS - 100; // Allow 100ms margin

    const deviceInfo: DeviceInfo = {
      device: 'cpu',
      fallbackReason: isTimeout
        ? FALLBACK_REASONS.DETECTION_TIMEOUT
        : FALLBACK_REASONS.NO_ADAPTER,
      detectionTimeMs: elapsedTime,
    };
    cachedDeviceInfo = deviceInfo;
    logger.info(COMPONENT, 'No GPU adapter, using CPU (WASM)', {
      reason: deviceInfo.fallbackReason,
      detectionTimeMs: deviceInfo.detectionTimeMs,
    });
    return deviceInfo;
  }

  // Extract GPU information
  const gpuInfo = await getGPUInfo(adapter);

  const deviceInfo: DeviceInfo = {
    device: 'webgpu',
    gpuName: gpuInfo.gpuName,
    gpuVendor: gpuInfo.gpuVendor,
    detectionTimeMs: Date.now() - startTime,
  };

  cachedDeviceInfo = deviceInfo;
  logger.info(COMPONENT, `GPU detected: ${deviceInfo.gpuName}, using WebGPU`, {
    gpuName: deviceInfo.gpuName,
    gpuVendor: deviceInfo.gpuVendor,
    detectionTimeMs: deviceInfo.detectionTimeMs,
  });

  return deviceInfo;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the currently cached device info without triggering detection.
 *
 * @returns Cached device info or null if not yet detected
 */
export function getCachedDeviceInfo(): DeviceInfo | null {
  return cachedDeviceInfo;
}

/**
 * Clear the cached device info.
 * Mainly used for testing purposes.
 */
export function clearDeviceCache(): void {
  cachedDeviceInfo = null;
}

/**
 * Format device info for display in logs or status messages.
 *
 * @param deviceInfo - The device info to format
 * @returns Human-readable string describing the compute device
 *
 * @example
 * ```typescript
 * const deviceInfo = await detectBestDevice();
 * console.log(formatDeviceInfo(deviceInfo));
 * // "WebGPU (NVIDIA GeForce RTX 3080)"
 * // or "DirectML (DirectML GPU)"
 * // or "CPU: WebGPU API not available"
 * ```
 */
export function formatDeviceInfo(deviceInfo: DeviceInfo): string {
  switch (deviceInfo.device) {
    case 'webgpu':
      return `WebGPU (${deviceInfo.gpuName || 'Unknown GPU'})`;
    case 'dml':
      return `DirectML (${deviceInfo.gpuName || 'GPU'})`;
    case 'cpu':
    default:
      return `CPU${deviceInfo.fallbackReason ? `: ${deviceInfo.fallbackReason}` : ''}`;
  }
}

/**
 * Check if the current device supports WebGPU acceleration.
 * This is a convenience wrapper around detectBestDevice().
 *
 * @returns True if WebGPU is available
 */
export async function supportsWebGPU(): Promise<boolean> {
  const deviceInfo = await detectBestDevice();
  return deviceInfo.device === 'webgpu';
}

/**
 * Check if the current device supports DirectML acceleration.
 * This is a convenience wrapper around detectBestDevice().
 *
 * @returns True if DirectML is available
 */
export async function supportsDirectML(): Promise<boolean> {
  const deviceInfo = await detectBestDevice();
  return deviceInfo.device === 'dml';
}

/**
 * Check if any GPU acceleration is available.
 * Returns true for either WebGPU (browser) or DirectML (Windows Node.js).
 *
 * @returns True if GPU acceleration is available
 */
export async function supportsGPU(): Promise<boolean> {
  const deviceInfo = await detectBestDevice();
  return deviceInfo.device === 'webgpu' || deviceInfo.device === 'dml';
}
