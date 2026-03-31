import { NextResponse } from "next/server";
import { getCachedAnalysis, setCachedAnalysis } from "@/lib/cache";
import { classifyIssue } from "@/lib/classify";
import { sha256Hash } from "@/lib/hash";
import { normalizeInput } from "@/lib/normalize";
import {
  OpenHandsConfigError,
  createFallbackAnalysis,
  parseOpenHandsAnalysisResponse,
  requestOpenHandsAnalysis,
} from "@/lib/openhands";
import type { AnalysisResult } from "@/types/analysis";

type AnalyzeRequestBody = {
  input?: unknown;
};

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (typeof body.input !== "string" || body.input.trim().length === 0) {
    return NextResponse.json(
      { error: "Input is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const normalizedInput = normalizeInput(body.input);
  if (!normalizedInput) {
    return NextResponse.json(
      { error: "Input is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const inputHash = sha256Hash(normalizedInput);
  const cachedAnalysis = getCachedAnalysis(inputHash);

  if (cachedAnalysis) {
    return NextResponse.json({
      ...cachedAnalysis,
      cached: true,
    });
  }

  const issueType = classifyIssue(normalizedInput);

  let analysis: AnalysisResult;

  try {
    const sdkResponse = await requestOpenHandsAnalysis(normalizedInput, issueType);
    const parsed = parseOpenHandsAnalysisResponse(sdkResponse, normalizedInput);
    analysis = {
      ...parsed,
      issueType,
      cached: false,
    };
  } catch (error) {
    if (error instanceof OpenHandsConfigError) {
      return NextResponse.json(
        {
          error:
            "OpenHands is not configured correctly on the server. Check required environment variables.",
        },
        { status: 500 },
      );
    }

    const fallback = createFallbackAnalysis(normalizedInput);
    analysis = {
      ...fallback,
      issueType,
      cached: false,
    };
  }

  setCachedAnalysis(inputHash, {
    summary: analysis.summary,
    rootCause: analysis.rootCause,
    fixSteps: analysis.fixSteps,
    improvedCode: analysis.improvedCode,
    whyItWorks: analysis.whyItWorks,
    issueType: analysis.issueType,
  });

  return NextResponse.json(analysis);
}
