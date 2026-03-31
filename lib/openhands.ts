import type { AnalysisResult } from "@/types/analysis";

type OpenHandsConfig = {
  baseUrl: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  sessionApiKey?: string;
  timeoutMs: number;
  workingDir: string;
};

type LegacyStartConversationResponse = {
  id?: string;
};

type V1StartTask = {
  id?: string;
  status?: string;
  detail?: string | null;
  app_conversation_id?: string | null;
  sandbox_id?: string | null;
};

type V1StartTaskListResponse = Array<V1StartTask | null>;

type LegacyAskAgentResponse = {
  response?: unknown;
};

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_WORKING_DIR = "/tmp";
const V1_START_TASK_TIMEOUT_MS = 60_000;
const V1_ASSISTANT_MESSAGE_TIMEOUT_MS = 90_000;
const V1_POLL_INTERVAL_MS = 1_500;

export class OpenHandsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenHandsConfigError";
  }
}

class OpenHandsSdkClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  constructor(config: OpenHandsConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;

    this.headers = {
      "Content-Type": "application/json",
      ...(config.sessionApiKey
        ? { "X-Session-API-Key": config.sessionApiKey }
        : {}),
    };
  }

  async startAppConversation(
    config: OpenHandsConfig,
    initialPrompt: string,
  ): Promise<string> {
    const payload = {
      llm_model: config.llmModel,
      agent_type: "default",
      initial_message: {
        role: "user",
        content: [{ type: "text", text: initialPrompt }],
        run: true,
      },
    };

    const response = (await this.request("/api/v1/app-conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as V1StartTask | null;

    const taskId = response?.id;
    if (typeof taskId !== "string" || taskId.length === 0) {
      throw new Error("OpenHands did not return a valid start task ID.");
    }

    return taskId;
  }

  async getStartTask(taskId: string): Promise<V1StartTask | null> {
    const response = (await this.request(
      `/api/v1/app-conversations/start-tasks?ids=${encodeURIComponent(taskId)}`,
      { method: "GET" },
    )) as V1StartTaskListResponse | null;

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    return response[0] ?? null;
  }

  async getMessageEvents(conversationId: string): Promise<unknown> {
    return this.request(
      `/api/v1/conversation/${conversationId}/events/search?limit=100&kind__eq=MessageEvent`,
      { method: "GET" },
    );
  }

  async deleteSandbox(sandboxId: string): Promise<void> {
    try {
      await this.request(`/api/v1/sandboxes/${sandboxId}`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort cleanup only.
    }
  }

  async startLegacyConversation(config: OpenHandsConfig): Promise<string> {
    const payload = {
      agent: {
        llm: {
          model: config.llmModel,
          api_key: config.llmApiKey,
          ...(config.llmBaseUrl ? { base_url: config.llmBaseUrl } : {}),
        },
        tools: [],
      },
      workspace: {
        kind: "LocalWorkspace",
        working_dir: config.workingDir,
      },
    };

    const response = (await this.request("/api/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as LegacyStartConversationResponse | null;

    const conversationId = response?.id;
    if (typeof conversationId !== "string" || conversationId.length === 0) {
      throw new Error("OpenHands did not return a valid conversation ID.");
    }

    return conversationId;
  }

  async askLegacyAgent(conversationId: string, question: string): Promise<unknown> {
    return this.request(`/api/conversations/${conversationId}/ask_agent`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }) as Promise<LegacyAskAgentResponse | string | unknown>;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await this.request(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenHands request timed out after ${this.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const raw = await response.text();
    let parsed: unknown = null;

    if (raw.trim().length > 0) {
      const candidate = parseCandidateJson(raw);
      parsed = candidate ?? raw;
    }

    if (!response.ok) {
      const message =
        extractErrorMessage(parsed) ??
        `OpenHands request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return parsed;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readConfig(): OpenHandsConfig {
  const baseUrl = process.env.OPENHANDS_BASE_URL?.trim();
  const llmModel = process.env.OPENHANDS_LLM_MODEL?.trim();
  const llmApiKey = process.env.OPENHANDS_LLM_API_KEY?.trim();

  const missing: string[] = [];
  if (!baseUrl) missing.push("OPENHANDS_BASE_URL");
  if (!llmModel) missing.push("OPENHANDS_LLM_MODEL");
  if (!llmApiKey) missing.push("OPENHANDS_LLM_API_KEY");

  if (missing.length > 0) {
    throw new OpenHandsConfigError(
      `Missing required OpenHands environment variable(s): ${missing.join(", ")}`,
    );
  }

  const requiredBaseUrl = baseUrl as string;
  const requiredLlmModel = llmModel as string;
  const requiredLlmApiKey = llmApiKey as string;

  return {
    baseUrl: stripTrailingSlash(requiredBaseUrl),
    llmModel: requiredLlmModel,
    llmApiKey: requiredLlmApiKey,
    llmBaseUrl: process.env.OPENHANDS_LLM_BASE_URL?.trim() || undefined,
    sessionApiKey: process.env.OPENHANDS_SESSION_API_KEY?.trim() || undefined,
    timeoutMs: parsePositiveInt(
      process.env.OPENHANDS_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    workingDir: process.env.OPENHANDS_WORKING_DIR?.trim() || DEFAULT_WORKING_DIR,
  };
}

function buildPrompt(input: string, issueType: string): string {
  return [
    "You are a debugging assistant for developers.",
    `Detected issue type: ${issueType}.`,
    "Analyze the input and return valid JSON only.",
    "No markdown fences and no extra text.",
    "The JSON must include exactly these keys:",
    "summary, rootCause, fixSteps, improvedCode, whyItWorks.",
    "fixSteps must be an array of strings.",
    "",
    "Debugging context:",
    "<input>",
    input,
    "</input>",
  ].join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function pickField(
  data: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (key in data) {
      return data[key];
    }
  }

  return undefined;
}

function pickString(
  data: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  const value = pickField(data, keys);
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFixSteps(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((step) => step.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.replace(/^[\s\-*0-9.)]+/, "").trim())
      .filter((step) => step.length > 0);
  }

  return [];
}

function isLikelyAnalysisShape(data: Record<string, unknown>): boolean {
  const analysisKeys = [
    "summary",
    "rootCause",
    "fixSteps",
    "improvedCode",
    "whyItWorks",
    "problemSummary",
    "likelyRootCause",
    "steps",
    "fixedCode",
    "explanation",
  ];

  return analysisKeys.some((key) => key in data);
}

function toCoreAnalysisResult(value: unknown): AnalysisResult | null {
  const data = asRecord(value);
  if (!data || !isLikelyAnalysisShape(data)) {
    return null;
  }

  const summary =
    pickString(data, ["summary", "problemSummary", "issueSummary"]) ??
    "Detected a likely debugging issue from the provided input.";
  const rootCause =
    pickString(data, ["rootCause", "likelyRootCause", "cause", "diagnosis"]) ??
    "The failure is likely caused by a runtime logic or state mismatch.";
  const fixSteps = normalizeFixSteps(
    pickField(data, ["fixSteps", "steps", "fixes", "recommendations"]),
  );
  const improvedCode =
    pickString(data, ["improvedCode", "fixedCode", "suggestedCode", "code"]) ??
    "// Add null/undefined guards around the failing line and validate inputs.";
  const whyItWorks =
    pickString(data, ["whyItWorks", "explanation", "rationale"]) ??
    "This approach validates state before use and prevents the runtime failure path.";

  return {
    summary,
    rootCause,
    fixSteps:
      fixSteps.length > 0
        ? fixSteps
        : [
            "Locate the exact failing line and inspect values used there.",
            "Add guards for null/undefined before property access or calls.",
            "Retest with a minimal reproducible case.",
          ],
    improvedCode,
    whyItWorks,
  };
}

function parseCandidateJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractErrorMessage(responseBody: unknown): string | null {
  if (!responseBody) {
    return null;
  }

  if (typeof responseBody === "string") {
    const trimmed = responseBody.trim();
    if (!trimmed) {
      return null;
    }

    if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return null;
    }

    return trimmed.slice(0, 500);
  }

  if (typeof responseBody !== "object") {
    return null;
  }

  const data = responseBody as Record<string, unknown>;

  if (typeof data.error === "string") {
    return data.error;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return null;
}

function findNestedAnalysisResult(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): AnalysisResult | null {
  if (depth > 6) {
    return null;
  }

  const direct = toCoreAnalysisResult(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNestedAnalysisResult(item, depth + 1, seen);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (seen.has(record)) {
    return null;
  }
  seen.add(record);

  for (const nestedValue of Object.values(record)) {
    const nested = findNestedAnalysisResult(nestedValue, depth + 1, seen);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function collectTextCandidates(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  out = new Set<string>(),
): string[] {
  if (depth > 6) {
    return [...out];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      out.add(trimmed);
    }
    return [...out];
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextCandidates(item, depth + 1, seen, out);
    }
    return [...out];
  }

  const record = asRecord(value);
  if (!record) {
    return [...out];
  }

  if (seen.has(record)) {
    return [...out];
  }
  seen.add(record);

  for (const nestedValue of Object.values(record)) {
    collectTextCandidates(nestedValue, depth + 1, seen, out);
  }

  return [...out];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAssistantTextFromMessageEvents(payload: unknown): string | null {
  const data = asRecord(payload);
  if (!data) {
    return null;
  }

  const items = data.items;
  if (!Array.isArray(items)) {
    return null;
  }

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const event = asRecord(items[i]);
    if (!event) {
      continue;
    }

    const source = event.source;
    if (typeof source === "string" && source !== "agent") {
      continue;
    }

    const llmMessage = asRecord(event.llm_message);
    if (!llmMessage) {
      continue;
    }

    const role = llmMessage.role;
    if (typeof role === "string" && role !== "assistant") {
      continue;
    }

    const content = llmMessage.content;

    if (typeof content === "string" && content.trim().length > 0) {
      return content;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const partRecord = asRecord(part);
        if (!partRecord) {
          continue;
        }

        if (partRecord.type === "text" && typeof partRecord.text === "string") {
          const text = partRecord.text.trim();
          if (text.length > 0) {
            return text;
          }
        }
      }
    }
  }

  return null;
}

async function waitForReadyStartTask(
  client: OpenHandsSdkClient,
  taskId: string,
  timeoutMs = V1_START_TASK_TIMEOUT_MS,
): Promise<V1StartTask> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "UNKNOWN";
  let lastDetail: string | null | undefined;

  while (Date.now() < deadline) {
    const task = await client.getStartTask(taskId);

    if (task) {
      lastStatus = task.status ?? lastStatus;
      lastDetail = task.detail;

      if (task.status === "READY" && task.app_conversation_id) {
        return task;
      }

      if (task.status === "ERROR") {
        throw new Error(
          task.detail?.trim() ||
            "OpenHands failed to start the conversation runtime.",
        );
      }
    }

    await sleep(V1_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for OpenHands start task (last status: ${lastStatus}${
      lastDetail ? `, detail: ${lastDetail}` : ""
    }).`,
  );
}

async function waitForAssistantMessage(
  client: OpenHandsSdkClient,
  conversationId: string,
  timeoutMs = V1_ASSISTANT_MESSAGE_TIMEOUT_MS,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const eventsPayload = await client.getMessageEvents(conversationId);
    const assistantText = extractAssistantTextFromMessageEvents(eventsPayload);
    if (assistantText) {
      return assistantText;
    }

    await sleep(V1_POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for an assistant message from OpenHands.");
}

function parseAnalysisResultFromText(raw: string): AnalysisResult | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const direct = parseCandidateJson(withoutFences);
  const directParsed = toCoreAnalysisResult(direct);
  if (directParsed) {
    return directParsed;
  }

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const sliced = withoutFences.slice(firstBrace, lastBrace + 1);
  const nested = parseCandidateJson(sliced);
  return toCoreAnalysisResult(nested);
}

function looksLikeCode(input: string): boolean {
  const sample = input.trim();
  if (sample.length === 0) {
    return false;
  }

  const codeSignals = [
    "function ",
    "const ",
    "let ",
    "class ",
    "import ",
    "export ",
    "=>",
    "{",
    "}",
    ";",
  ];

  return codeSignals.some((signal) => sample.includes(signal));
}

export function createFallbackAnalysis(input: string): AnalysisResult {
  const improvedCode = looksLikeCode(input)
    ? input.trim()
    : "// Add the exact failing line and stack trace for a more precise fix.";

  return {
    summary:
      "The analysis service could not return a fully parseable response, so this is a safe fallback diagnosis.",
    rootCause:
      "The input appears related to a runtime or logic bug, but the upstream model response was incomplete or malformed.",
    fixSteps: [
      "Locate the exact failing line and inspect every variable used there.",
      "Add guards for nullable/undefined values before property access or method calls.",
      "Create a minimal reproducible snippet and verify one fix at a time.",
    ],
    improvedCode,
    whyItWorks:
      "Fallback guidance reduces risk while you gather clearer execution context for a second analysis pass.",
  };
}

export async function requestOpenHandsAnalysis(
  input: string,
  issueType: string,
): Promise<unknown> {
  const config = readConfig();
  const client = new OpenHandsSdkClient(config);
  const prompt = buildPrompt(input, issueType);
  let sandboxId: string | null = null;

  try {
    const taskId = await client.startAppConversation(config, prompt);
    const readyTask = await waitForReadyStartTask(client, taskId);
    sandboxId = readyTask.sandbox_id ?? null;

    return await waitForAssistantMessage(client, readyTask.app_conversation_id!);
  } catch {
    // Fallback for older OpenHands deployments that still expose ask_agent.
    let legacyConversationId: string | null = null;

    try {
      legacyConversationId = await client.startLegacyConversation(config);
      return await client.askLegacyAgent(legacyConversationId, prompt);
    } finally {
      if (legacyConversationId) {
        await client.deleteConversation(legacyConversationId);
      }
    }
  } finally {
    if (sandboxId) {
      await client.deleteSandbox(sandboxId);
    }
  }
}

export function parseOpenHandsAnalysisResponse(
  sdkResponse: unknown,
  input: string,
): AnalysisResult {
  const direct = toCoreAnalysisResult(sdkResponse);
  if (direct) {
    return direct;
  }

  const nested = findNestedAnalysisResult(sdkResponse);
  if (nested) {
    return nested;
  }

  for (const candidateText of collectTextCandidates(sdkResponse)) {
    const parsed = parseAnalysisResultFromText(candidateText);
    if (parsed) {
      return parsed;
    }
  }

  return createFallbackAnalysis(input);
}
