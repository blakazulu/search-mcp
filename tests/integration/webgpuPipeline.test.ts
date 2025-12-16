/**
 * WebGPU/DirectML Pipeline Integration Tests (SMCP-084)
 *
 * Integration tests for the WebGPU acceleration feature:
 * - Tests device detection and caching
 * - Tests platform-specific behavior
 * - Tests status reporting integration
 * - Tests configuration constants
 *
 * Note: Tests that require actual model loading are covered in
 * the unit tests (embedding.test.ts) with mocked pipelines.
 * This file focuses on integration between components.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectBestDevice,
  clearDeviceCache,
  getCachedDeviceInfo,
  formatDeviceInfo,
  isDirectMLAvailable,
  isWindows,
  isNodeEnvironment,
  isBrowserEnvironment,
  isMacOS,
  isLinux,
  supportsGPU,
  supportsDirectML,
  supportsWebGPU,
  isWebGPUAPIAvailable,
  FALLBACK_REASONS,
  DETECTION_TIMEOUT_MS,
  type DeviceInfo,
} from '../../src/engines/deviceDetection.js';

// ============================================================================
// Device Detection Integration Tests
// ============================================================================

describe('WebGPU Pipeline - Device Detection Integration', () => {
  beforeEach(() => {
    clearDeviceCache();
  });

  afterEach(() => {
    clearDeviceCache();
  });

  describe('Environment Detection', () => {
    it('should correctly identify Node.js environment', () => {
      expect(isNodeEnvironment()).toBe(true);
      expect(isBrowserEnvironment()).toBe(false);
    });

    it('should detect current platform correctly', () => {
      const platform = process.platform;
      if (platform === 'win32') {
        expect(isWindows()).toBe(true);
        expect(isMacOS()).toBe(false);
        expect(isLinux()).toBe(false);
      } else if (platform === 'darwin') {
        expect(isWindows()).toBe(false);
        expect(isMacOS()).toBe(true);
        expect(isLinux()).toBe(false);
      } else if (platform === 'linux') {
        expect(isWindows()).toBe(false);
        expect(isMacOS()).toBe(false);
        expect(isLinux()).toBe(true);
      }
    });
  });

  describe('WebGPU API Availability', () => {
    it('should report WebGPU API as unavailable in Node.js', () => {
      // WebGPU API is browser-only, not available in standard Node.js
      expect(isWebGPUAPIAvailable()).toBe(false);
    });
  });

  describe('DirectML Availability', () => {
    it('should check DirectML availability based on platform', () => {
      if (isWindows() && isNodeEnvironment()) {
        expect(isDirectMLAvailable()).toBe(true);
      } else {
        expect(isDirectMLAvailable()).toBe(false);
      }
    });
  });

  describe('Device Detection Results', () => {
    it('should return valid device info', async () => {
      const deviceInfo = await detectBestDevice();

      expect(deviceInfo).toBeDefined();
      expect(deviceInfo.device).toBeDefined();
      expect(['cpu', 'webgpu', 'dml']).toContain(deviceInfo.device);
    });

    it('should include detection time in results', async () => {
      clearDeviceCache();
      const deviceInfo = await detectBestDevice();

      expect(deviceInfo.detectionTimeMs).toBeDefined();
      expect(typeof deviceInfo.detectionTimeMs).toBe('number');
      expect(deviceInfo.detectionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect DirectML on Windows', async () => {
      if (process.platform === 'win32') {
        const deviceInfo = await detectBestDevice();

        expect(deviceInfo.device).toBe('dml');
        expect(deviceInfo.gpuName).toBe('DirectML GPU');
        expect(deviceInfo.gpuVendor).toBe('Microsoft DirectML');
      }
    });

    it('should use CPU on non-Windows platforms', async () => {
      if (process.platform !== 'win32') {
        const deviceInfo = await detectBestDevice();

        expect(deviceInfo.device).toBe('cpu');
        expect(deviceInfo.fallbackReason).toBeDefined();
      }
    });
  });

  describe('Device Detection Caching', () => {
    it('should cache device detection results', async () => {
      const deviceInfo1 = await detectBestDevice();
      const deviceInfo2 = await detectBestDevice();

      // Should return same cached instance
      expect(deviceInfo1).toBe(deviceInfo2);
    });

    it('should return cached info without re-detection', async () => {
      await detectBestDevice();
      const cached = getCachedDeviceInfo();

      expect(cached).not.toBeNull();
      expect(['cpu', 'webgpu', 'dml']).toContain(cached!.device);
    });

    it('should clear cache when clearDeviceCache is called', async () => {
      await detectBestDevice();
      expect(getCachedDeviceInfo()).not.toBeNull();

      clearDeviceCache();
      expect(getCachedDeviceInfo()).toBeNull();
    });

    it('should re-detect when forceRefresh is true', async () => {
      const deviceInfo1 = await detectBestDevice();
      clearDeviceCache();
      const deviceInfo2 = await detectBestDevice(true);

      // Values should be equal even if object is different
      expect(deviceInfo2.device).toBe(deviceInfo1.device);
    });
  });

  describe('Device Info Formatting', () => {
    it('should format WebGPU device info correctly', () => {
      const deviceInfo: DeviceInfo = {
        device: 'webgpu',
        gpuName: 'NVIDIA GeForce RTX 3080',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('WebGPU (NVIDIA GeForce RTX 3080)');
    });

    it('should format DirectML device info correctly', () => {
      const deviceInfo: DeviceInfo = {
        device: 'dml',
        gpuName: 'DirectML GPU',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('DirectML (DirectML GPU)');
    });

    it('should format CPU fallback device info correctly', () => {
      const deviceInfo: DeviceInfo = {
        device: 'cpu',
        fallbackReason: 'WebGPU API not available',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('CPU: WebGPU API not available');
    });

    it('should handle CPU without fallback reason', () => {
      const deviceInfo: DeviceInfo = {
        device: 'cpu',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('CPU');
    });

    it('should handle unknown GPU name for WebGPU', () => {
      const deviceInfo: DeviceInfo = {
        device: 'webgpu',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('WebGPU (Unknown GPU)');
    });

    it('should handle unknown GPU name for DirectML', () => {
      const deviceInfo: DeviceInfo = {
        device: 'dml',
      };

      const formatted = formatDeviceInfo(deviceInfo);
      expect(formatted).toBe('DirectML (GPU)');
    });
  });

  describe('GPU Support Helper Functions', () => {
    it('supportsGPU should reflect device detection', async () => {
      const hasGPU = await supportsGPU();
      const deviceInfo = getCachedDeviceInfo();

      if (deviceInfo?.device === 'webgpu' || deviceInfo?.device === 'dml') {
        expect(hasGPU).toBe(true);
      } else {
        expect(hasGPU).toBe(false);
      }
    });

    it('supportsDirectML should match platform check on Windows', async () => {
      const hasDML = await supportsDirectML();

      if (process.platform === 'win32') {
        expect(hasDML).toBe(true);
      } else {
        expect(hasDML).toBe(false);
      }
    });

    it('supportsWebGPU should be false in Node.js', async () => {
      const hasWebGPU = await supportsWebGPU();
      // WebGPU is browser-only, not in standard Node.js
      expect(hasWebGPU).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have correct detection timeout', () => {
      expect(DETECTION_TIMEOUT_MS).toBe(5000);
    });

    it('should have all fallback reason constants defined', () => {
      expect(FALLBACK_REASONS.NO_WEBGPU_API).toBeDefined();
      expect(FALLBACK_REASONS.NO_ADAPTER).toBeDefined();
      expect(FALLBACK_REASONS.ADAPTER_REQUEST_FAILED).toBeDefined();
      expect(FALLBACK_REASONS.DETECTION_TIMEOUT).toBeDefined();
      expect(FALLBACK_REASONS.NODE_NOT_WINDOWS).toBeDefined();
      expect(FALLBACK_REASONS.NODE_DML_DISABLED).toBeDefined();
      expect(FALLBACK_REASONS.DML_INIT_FAILED).toBeDefined();
    });
  });
});

// ============================================================================
// Embedding Engine Configuration Tests
// ============================================================================

describe('WebGPU Pipeline - Embedding Configuration', () => {
  describe('Batch Size Constants', () => {
    it('should have correct CPU batch size', async () => {
      const { BATCH_SIZE } = await import('../../src/engines/embedding.js');
      expect(BATCH_SIZE).toBe(32);
    });

    it('should have correct GPU batch size', async () => {
      const { GPU_BATCH_SIZE } = await import('../../src/engines/embedding.js');
      expect(GPU_BATCH_SIZE).toBe(64);
    });

    it('GPU batch size should be larger than CPU batch size', async () => {
      const { BATCH_SIZE, GPU_BATCH_SIZE } = await import('../../src/engines/embedding.js');
      expect(GPU_BATCH_SIZE).toBeGreaterThan(BATCH_SIZE);
    });
  });

  describe('Embedding Dimensions', () => {
    it('should have correct code embedding dimension', async () => {
      const { CODE_EMBEDDING_DIMENSION } = await import('../../src/engines/embedding.js');
      expect(CODE_EMBEDDING_DIMENSION).toBe(384);
    });

    it('should have correct docs embedding dimension', async () => {
      const { DOCS_EMBEDDING_DIMENSION } = await import('../../src/engines/embedding.js');
      expect(DOCS_EMBEDDING_DIMENSION).toBe(768);
    });
  });

  describe('Model Names', () => {
    it('should use BGE-small model for code', async () => {
      const { CODE_MODEL_NAME } = await import('../../src/engines/embedding.js');
      expect(CODE_MODEL_NAME).toBe('Xenova/bge-small-en-v1.5');
    });

    it('should use BGE-base model for docs', async () => {
      const { DOCS_MODEL_NAME } = await import('../../src/engines/embedding.js');
      expect(DOCS_MODEL_NAME).toBe('Xenova/bge-base-en-v1.5');
    });

    it('should have backward compatible MODEL_NAME export', async () => {
      const { MODEL_NAME, CODE_MODEL_NAME } = await import('../../src/engines/embedding.js');
      expect(MODEL_NAME).toBe(CODE_MODEL_NAME);
    });
  });

  describe('Engine Configurations', () => {
    it('should have correct code engine config', async () => {
      const { CODE_ENGINE_CONFIG, CODE_MODEL_NAME, CODE_EMBEDDING_DIMENSION } = await import(
        '../../src/engines/embedding.js'
      );

      expect(CODE_ENGINE_CONFIG.modelName).toBe(CODE_MODEL_NAME);
      expect(CODE_ENGINE_CONFIG.dimension).toBe(CODE_EMBEDDING_DIMENSION);
      expect(CODE_ENGINE_CONFIG.displayName).toBe('Code (BGE-small)');
    });

    it('should have correct docs engine config', async () => {
      const { DOCS_ENGINE_CONFIG, DOCS_MODEL_NAME, DOCS_EMBEDDING_DIMENSION } = await import(
        '../../src/engines/embedding.js'
      );

      expect(DOCS_ENGINE_CONFIG.modelName).toBe(DOCS_MODEL_NAME);
      expect(DOCS_ENGINE_CONFIG.dimension).toBe(DOCS_EMBEDDING_DIMENSION);
      expect(DOCS_ENGINE_CONFIG.displayName).toBe('Docs (BGE-base)');
    });

    it('should allow device option in config', async () => {
      const { CODE_ENGINE_CONFIG } = await import('../../src/engines/embedding.js');

      // Should be able to specify device in config
      const configWithCPU = { ...CODE_ENGINE_CONFIG, device: 'cpu' as const };
      expect(configWithCPU.device).toBe('cpu');

      const configWithDML = { ...CODE_ENGINE_CONFIG, device: 'dml' as const };
      expect(configWithDML.device).toBe('dml');
    });
  });
});

// ============================================================================
// Platform Compatibility Matrix Tests
// ============================================================================

describe('WebGPU Pipeline - Platform Compatibility Matrix', () => {
  describe('Windows Platform', () => {
    it('should use DirectML on Windows Node.js', async () => {
      if (process.platform === 'win32') {
        clearDeviceCache();
        const deviceInfo = await detectBestDevice();

        expect(deviceInfo.device).toBe('dml');
        expect(deviceInfo.gpuName).toBe('DirectML GPU');
        expect(deviceInfo.gpuVendor).toBe('Microsoft DirectML');
      }
    });
  });

  describe('macOS Platform', () => {
    it('should use CPU on macOS (CoreML not available in Node.js)', async () => {
      if (process.platform === 'darwin') {
        clearDeviceCache();
        const deviceInfo = await detectBestDevice();

        expect(deviceInfo.device).toBe('cpu');
        expect(deviceInfo.fallbackReason).toContain('CoreML');
      }
    });
  });

  describe('Linux Platform', () => {
    it('should use CPU on Linux (CUDA requires separate package)', async () => {
      if (process.platform === 'linux') {
        clearDeviceCache();
        const deviceInfo = await detectBestDevice();

        expect(deviceInfo.device).toBe('cpu');
        expect(deviceInfo.fallbackReason).toContain('CUDA');
      }
    });
  });
});

// ============================================================================
// Status Reporting Integration Tests
// ============================================================================

describe('WebGPU Pipeline - Status Reporting Integration', () => {
  beforeEach(() => {
    clearDeviceCache();
  });

  it('should provide device info for status reporting', async () => {
    const deviceInfo = await detectBestDevice();

    // Verify structure matches what status reporting expects
    expect(deviceInfo).toHaveProperty('device');
    expect(['cpu', 'webgpu', 'dml']).toContain(deviceInfo.device);

    if (deviceInfo.device === 'cpu') {
      // CPU may have fallback reason (except on Windows where DML should work)
      if (process.platform !== 'win32') {
        expect(deviceInfo.fallbackReason).toBeDefined();
      }
    } else {
      // GPU should have name
      expect(deviceInfo.gpuName).toBeDefined();
    }
  });

  it('should format device info for human-readable display', async () => {
    const deviceInfo = await detectBestDevice();
    const formatted = formatDeviceInfo(deviceInfo);

    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);

    // Should indicate device type in formatted string
    if (deviceInfo.device === 'webgpu') {
      expect(formatted).toContain('WebGPU');
    } else if (deviceInfo.device === 'dml') {
      expect(formatted).toContain('DirectML');
    } else {
      expect(formatted).toContain('CPU');
    }
  });

  it('should include detection time for performance monitoring', async () => {
    clearDeviceCache();
    const deviceInfo = await detectBestDevice();

    expect(deviceInfo.detectionTimeMs).toBeDefined();
    expect(deviceInfo.detectionTimeMs).toBeGreaterThanOrEqual(0);
    // Detection should be fast (under 1 second normally)
    expect(deviceInfo.detectionTimeMs).toBeLessThan(DETECTION_TIMEOUT_MS);
  });
});
