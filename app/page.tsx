"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AnalysisResult } from "@/types/analysis";
import { ResultCard } from "@/components/ResultCard";

type ApiError = {
  error: string;
};

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AnalysisResult>;
  return (
    typeof candidate.summary === "string" &&
    typeof candidate.rootCause === "string" &&
    Array.isArray(candidate.fixSteps) &&
    candidate.fixSteps.every((step) => typeof step === "string") &&
    typeof candidate.improvedCode === "string" &&
    typeof candidate.whyItWorks === "string" &&
    (candidate.issueType === undefined || typeof candidate.issueType === "string") &&
    (candidate.cached === undefined || typeof candidate.cached === "boolean")
  );
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as ApiError).error === "string";
}

export default function Home() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const trimmedInput = useMemo(() => input.trim(), [input]);
  const canAnalyze = trimmedInput.length > 0 && !isLoading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedInput) {
      return;
    }

    setError("");
    setAnalysis(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: trimmedInput }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        if (isApiError(data)) {
          setError(data.error);
        } else {
          setError("Analysis failed. Please try again.");
        }
        return;
      }

      if (!isAnalysisResult(data)) {
        setError("Received an unexpected response format.");
        return;
      }

      setAnalysis(data);
    } catch {
      setError("Request failed. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            DebugFlow
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            Paste an error message, stack trace, or code snippet. DebugFlow will
            return a structured debugging plan you can apply immediately.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <label
            htmlFor="debug-input"
            className="text-sm font-medium text-slate-700 sm:text-base"
          >
            Debug Input
          </label>
          <textarea
            id="debug-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste your error, stack trace, or code here..."
            className="mt-3 h-72 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 sm:text-sm">
              {trimmedInput.length} characters
            </p>
            <button
              type="submit"
              disabled={!canAnalyze}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? "Analyzing..." : "Analyze"}
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>

        {isLoading && (
          <section
            className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              Analyzing your input...
            </div>
          </section>
        )}

        {analysis && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
              Analysis Result
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                Issue Type: {analysis.issueType ?? "Unknown Issue"}
              </span>
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                Cache: {analysis.cached ? "Hit" : "Miss"}
              </span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ResultCard title="Problem Summary">
                <p>{analysis.summary}</p>
              </ResultCard>

              <ResultCard title="Likely Root Cause">
                <p>{analysis.rootCause}</p>
              </ResultCard>

              <ResultCard title="Fix Steps" className="lg:col-span-2">
                <ol className="list-decimal space-y-2 pl-5">
                  {analysis.fixSteps.map((step, index) => (
                    <li key={`${step}-${index}`}>{step}</li>
                  ))}
                </ol>
              </ResultCard>

              <ResultCard title="Improved Code" className="lg:col-span-2">
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 sm:text-sm">
                  <code>{analysis.improvedCode}</code>
                </pre>
              </ResultCard>

              <ResultCard title="Why This Fix Works" className="lg:col-span-2">
                <p>{analysis.whyItWorks}</p>
              </ResultCard>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
