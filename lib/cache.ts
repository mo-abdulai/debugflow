import type { AnalysisResult } from "@/types/analysis";

type CachedAnalysis = Omit<AnalysisResult, "cached">;

type CacheEntry = {
  value: CachedAnalysis;
  expiresAt: number;
};

export const ANALYSIS_CACHE_TTL_MS = 60 * 60 * 1000;

const analysisCache = new Map<string, CacheEntry>();

export function getCachedAnalysis(hash: string): CachedAnalysis | null {
  const entry = analysisCache.get(hash);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    analysisCache.delete(hash);
    return null;
  }

  return entry.value;
}

export function setCachedAnalysis(
  hash: string,
  value: CachedAnalysis,
  ttlMs = ANALYSIS_CACHE_TTL_MS,
): void {
  analysisCache.set(hash, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}
