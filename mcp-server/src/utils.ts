/**
 * @file utils.ts
 * @description
 * A utility module for managing an in-memory cache system with TTL (Time-To-Live) support.
 * This module provides functions to fetch data with caching, track cache statistics, and manage cache entries.
 * It is designed to optimize performance by reducing redundant network requests and providing insights into cache usage.
 *
 * Features:
 * - In-memory caching with TTL support.
 * - Cache hit/miss tracking and statistics.
 * - Automatic cache expiration and cleanup.
 * - Fetching data with cache fallback.
 * - Retrieving popular cache entries and memory usage statistics.
 *
 * Usage:
 * - Use `fetchWithCache` to fetch data with caching.
 * - Use `getCacheStats` to retrieve cache performance metrics.
 * - Use `clearExpiredCache` or `clearCache` to manage cache entries.
 * - Use `getPopularCacheEntries` to analyze frequently accessed cache entries.
 */


import { performance } from 'perf_hooks';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  oldestEntry?: number | undefined;
  newestEntry?: number | undefined;
}

const inMemoryCache: Map<string, CacheEntry> = new Map();
let cacheHits = 0;
let cacheMisses = 0;

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function getCached(url: string): unknown | undefined {
  const entry = inMemoryCache.get(url);
  if (!entry) {
    cacheMisses++;
    return undefined;
  }
  
  if (Date.now() > entry.expiresAt) {
    inMemoryCache.delete(url);
    cacheMisses++;
    return undefined;
  }
  
  entry.hitCount++;
  cacheHits++;
  return entry.value;
}

function setCached(url: string, value: unknown, ttlSeconds: number): void {
  const now = Date.now();
  inMemoryCache.set(url, { 
    value, 
    expiresAt: now + ttlSeconds * 1000,
    createdAt: now,
    hitCount: 0
  });
}

export async function fetchWithCache(url: string, ttlSeconds: number): Promise<unknown> {
  const startTime = performance.now();
  
  try {
    const cached = getCached(url);
    if (cached !== undefined) {
      console.error(`Cache hit for ${url} (${(performance.now() - startTime).toFixed(2)}ms)`);
      return cached;
    }
    
    console.error(`Fetching ${url}...`);
    const response = await fetch(url);
    const responseBody = await parseResponseBody(response);
    
    if (!response.ok) {
      const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Error fetching data from ${url} - ${errorMessage}`);
    }
    
    setCached(url, responseBody, ttlSeconds);
    console.error(`Cached ${url} (${(performance.now() - startTime).toFixed(2)}ms)`);
    return responseBody;
    
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    if (error instanceof Error) {
      throw new Error(`Failed to fetch ${url} after ${duration}ms: ${error.message}`);
    }
    throw new Error(`Failed to fetch ${url} after ${duration}ms: Unknown error`);
  }
}

export function getCacheStats(): CacheStats {
  const entries = Array.from(inMemoryCache.values());
  const memUsage = process.memoryUsage();
  
  return {
    totalEntries: inMemoryCache.size,
    totalHits: cacheHits,
    totalMisses: cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
    memoryUsage: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    },
    oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.createdAt)) : undefined,
    newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.createdAt)) : undefined
  };
}

export function clearExpiredCache(): number {
  const now = Date.now();
  let cleared = 0;
  
  for (const [key, entry] of inMemoryCache.entries()) {
    if (now > entry.expiresAt) {
      inMemoryCache.delete(key);
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.error(`Cleared ${cleared} expired cache entries`);
  }
  
  return cleared;
}

export function clearCache(): void {
  const size = inMemoryCache.size;
  inMemoryCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  console.error(`Cleared all cache entries (${size} items)`);
}

export function getPopularCacheEntries(limit: number = 10): Array<{url: string, hitCount: number, age: number}> {
  const now = Date.now();
  return Array.from(inMemoryCache.entries())
    .map(([url, entry]) => ({
      url,
      hitCount: entry.hitCount,
      age: now - entry.createdAt
    }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, limit);
}