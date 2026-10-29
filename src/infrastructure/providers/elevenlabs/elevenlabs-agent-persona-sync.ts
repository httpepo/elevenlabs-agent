import "server-only";
import {
  VOICE_AGENT_ASR_KEYWORDS,
  VOICE_AGENT_FIRST_MESSAGE_TEMPLATE,
  VOICE_AGENT_NAME,
  VOICE_CALENDAR_TOOL_DESCRIPTIONS,
  buildVoiceAgentBasePrompt,
} from "../../../modules/conversation/domain/voice-prompt-templates.ts";
import { VoiceProviderError } from "../../../modules/conversation/ports/voice-provider.ts";

const AGENTS_BASE_URL = "https://api.elevenlabs.io/v1/convai/agents";
const TOOLS_BASE_URL = "https://api.elevenlabs.io/v1/convai/tools";
const SYNC_TIMEOUT_MS = 6_000;

const DEFAULT_DYNAMIC_VARIABLE_PLACEHOLDERS: Readonly<Record<string, string>> = {
  lead_id: "00000000-0000-0000-0000-000000000000",
  voice_session_id: "00000000-0000-0000-0000-000000000000",
  visitor_name: "Visitante",
  company_name: "Empresa Exemplo",
  company_website: "não informado",
  company_sector: "não confirmado publicamente",
  company_size: "não confirmado publicamente",
  company_services: "não confirmado publicamente",
  operational_complexity: "não confirmado publicamente",
  spiced_gaps: "Confirmar contexto operacional e prioridades financeiras.",
  opening_instruction:
    "Na continuidade após a saudação inicial, acolha o contexto trazido sobre a empresa sem repetir sua apresentação como Anderson, da Atlas.",
  spiced_prompt: "Conduza qualificação consultiva SPICED em português do Brasil representando a Atlas.",
};

type ElevenLabsPromptConfig = Record<string, unknown> & {
  prompt?: string;
  llm?: string;
  temperature?: number;
  max_tokens?: number;
  tool_ids?: string[];
  tools?: Array<Record<string, unknown>>;
  built_in_tools?: Record<string, unknown>;
  ignore_default_personality?: boolean;
  knowledge_base?: unknown[];
};

type ElevenLabsAgentDocument = {
  name?: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      language?: string;
      dynamic_variables?: {
        dynamic_variable_placeholders?: Record<string, string | number | boolean>;
      };
      prompt?: ElevenLabsPromptConfig;
    };
    asr?: Record<string, unknown> & {
      keywords?: string[];
    };
  };
};

type ElevenLabsToolDocument = {
  tool_config?: Record<string, unknown> & {
    name?: string;
    description?: string;
  };
};

const verifiedAgentFingerprints = new Map<string, string>();
const inFlightSyncByAgent = new Map<string, Promise<void>>();

export async function ensureElevenLabsAgentPersona(input: {
  apiKey: string;
  agentId: string;
}): Promise<void> {
  const expectedBasePrompt = buildVoiceAgentBasePrompt();
  const expectedFingerprint = `${VOICE_AGENT_NAME}|${VOICE_AGENT_FIRST_MESSAGE_TEMPLATE}|${expectedBasePrompt}`;
  if (verifiedAgentFingerprints.get(input.agentId) === expectedFingerprint) return;

  const existingTask = inFlightSyncByAgent.get(input.agentId);
  if (existingTask) return existingTask;

  const syncTask = synchronizeAgentPersona(input.apiKey, input.agentId, expectedBasePrompt, expectedFingerprint)
    .finally(() => inFlightSyncByAgent.delete(input.agentId));
  inFlightSyncByAgent.set(input.agentId, syncTask);
  return syncTask;
}

async function synchronizeAgentPersona(
  apiKey: string,
  agentId: string,
  expectedBasePrompt: string,
  expectedFingerprint: string,
): Promise<void> {
  const agentUrl = `${AGENTS_BASE_URL}/${encodeURIComponent(agentId)}`;
  const document = await fetchElevenLabsJson<ElevenLabsAgentDocument>(agentUrl, apiKey);

  if (!isPersonaUpToDate(document, expectedBasePrompt)) {
    await patchAgentWithFallbacks(agentUrl, apiKey, document, expectedBasePrompt);
  }

  const toolIds = document.conversation_config?.agent?.prompt?.tool_ids ?? [];
  if (toolIds.length > 0) {
    await Promise.allSettled(toolIds.map((toolId) => synchronizeWorkspaceToolDescription(apiKey, toolId)));
  }

  verifiedAgentFingerprints.set(agentId, expectedFingerprint);
}

function isPersonaUpToDate(document: ElevenLabsAgentDocument, expectedBasePrompt: string): boolean {
  const agentConfig = document.conversation_config?.agent;
  const knowledgeBase = agentConfig?.prompt?.knowledge_base;
  const isKnowledgeBaseEmpty = !Array.isArray(knowledgeBase) || knowledgeBase.length === 0;
  return (
    document.name === VOICE_AGENT_NAME &&
    agentConfig?.first_message === VOICE_AGENT_FIRST_MESSAGE_TEMPLATE &&
    agentConfig?.prompt?.prompt === expectedBasePrompt &&
    isKnowledgeBaseEmpty
  );
}

async function patchAgentWithFallbacks(
  agentUrl: string,
  apiKey: string,
  document: ElevenLabsAgentDocument,
  expectedBasePrompt: string,
): Promise<void> {
  const candidatePayloads = buildCandidatePatchPayloads(document, expectedBasePrompt);
  let lastStatus: number | null = null;

  for (const payload of candidatePayloads) {
    const response = await sendElevenLabsRequest(agentUrl, apiKey, "PATCH", payload);
    if (response.ok) return;
    lastStatus = response.status;
    if (response.status !== 422) break;
  }

  const isAuthFailure = lastStatus === 401 || lastStatus === 403;
  throw new VoiceProviderError(
    isAuthFailure
      ? "A credencial da ElevenLabs não possui permissão para atualizar a identidade do agente de voz."
      : "Não foi possível atualizar a identidade do agente de voz no provedor.",
    isAuthFailure || lastStatus === 422 ? "configuration" : "unavailable",
    lastStatus,
  );
}

function buildCandidatePatchPayloads(
  document: ElevenLabsAgentDocument,
  expectedBasePrompt: string,
): Array<Record<string, unknown>> {
  const existingPrompt = document.conversation_config?.agent?.prompt;
  const clonedPrompt = buildClonedPromptConfig(existingPrompt, expectedBasePrompt);
  const allowlistedPrompt = buildAllowlistedPromptConfig(existingPrompt, expectedBasePrompt);
  const minimalPrompt = buildBarePromptConfig(existingPrompt, expectedBasePrompt);

  return [
    buildFullAgentPatchPayload(document, clonedPrompt),
    buildCoreAgentPatchPayload(allowlistedPrompt),
    buildCoreAgentPatchPayload(minimalPrompt),
  ];
}

function buildFullAgentPatchPayload(
  document: ElevenLabsAgentDocument,
  promptConfig: ElevenLabsPromptConfig,
): Record<string, unknown> {
  const existingAgent = document.conversation_config?.agent;
  const existingPlaceholders = existingAgent?.dynamic_variables?.dynamic_variable_placeholders ?? {};
  const existingAsr = document.conversation_config?.asr;
  return {
    name: VOICE_AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: VOICE_AGENT_FIRST_MESSAGE_TEMPLATE,
        ...(existingAgent?.language ? { language: existingAgent.language } : {}),
        dynamic_variables: {
          dynamic_variable_placeholders: {
            ...existingPlaceholders,
            ...DEFAULT_DYNAMIC_VARIABLE_PLACEHOLDERS,
          },
        },
        prompt: promptConfig,
      },
      ...(existingAsr ? { asr: { ...existingAsr, keywords: [...VOICE_AGENT_ASR_KEYWORDS] } } : {}),
    },
  };
}

function buildCoreAgentPatchPayload(promptConfig: ElevenLabsPromptConfig): Record<string, unknown> {
  return {
    name: VOICE_AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: VOICE_AGENT_FIRST_MESSAGE_TEMPLATE,
        prompt: promptConfig,
      },
    },
  };
}

function buildClonedPromptConfig(
  existingPrompt: ElevenLabsPromptConfig | undefined,
  expectedBasePrompt: string,
): ElevenLabsPromptConfig {
  const clonedPrompt: ElevenLabsPromptConfig = structuredClone(existingPrompt ?? {});
  clonedPrompt.prompt = expectedBasePrompt;
  clonedPrompt.knowledge_base = [];
  return normalizeExclusiveTools(clonedPrompt);
}

function buildAllowlistedPromptConfig(
  existingPrompt: ElevenLabsPromptConfig | undefined,
  expectedBasePrompt: string,
): ElevenLabsPromptConfig {
  const builtInTools = filterNonNullEntries(existingPrompt?.built_in_tools);
  const promptConfig: ElevenLabsPromptConfig = {
    prompt: expectedBasePrompt,
    knowledge_base: [],
    ...(typeof existingPrompt?.llm === "string" ? { llm: existingPrompt.llm } : {}),
    ...(typeof existingPrompt?.temperature === "number" ? { temperature: existingPrompt.temperature } : {}),
    ...(typeof existingPrompt?.max_tokens === "number" ? { max_tokens: existingPrompt.max_tokens } : {}),
    ...(typeof existingPrompt?.ignore_default_personality === "boolean"
      ? { ignore_default_personality: existingPrompt.ignore_default_personality }
      : {}),
    ...(builtInTools ? { built_in_tools: builtInTools } : {}),
    ...(Array.isArray(existingPrompt?.tool_ids) ? { tool_ids: existingPrompt.tool_ids } : {}),
    ...(Array.isArray(existingPrompt?.tools) ? { tools: existingPrompt.tools } : {}),
  };
  return normalizeExclusiveTools(promptConfig);
}

function buildBarePromptConfig(
  existingPrompt: ElevenLabsPromptConfig | undefined,
  expectedBasePrompt: string,
): ElevenLabsPromptConfig {
  const toolIds = Array.isArray(existingPrompt?.tool_ids) ? existingPrompt.tool_ids : [];
  return {
    prompt: expectedBasePrompt,
    ...(toolIds.length > 0 ? { tool_ids: toolIds } : {}),
  };
}

function normalizeExclusiveTools(promptConfig: ElevenLabsPromptConfig): ElevenLabsPromptConfig {
  // A API da ElevenLabs rejeita payloads que enviem `tools` e `tool_ids` simultaneamente.
  if (Array.isArray(promptConfig.tool_ids) && promptConfig.tool_ids.length > 0) {
    delete promptConfig.tools;
    return promptConfig;
  }
  if (Array.isArray(promptConfig.tools)) {
    delete promptConfig.tool_ids;
    promptConfig.tools = promptConfig.tools.map(rewriteInlineToolDescription);
  }
  return promptConfig;
}

function filterNonNullEntries(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record || typeof record !== "object") return undefined;
  const entries = Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function rewriteInlineToolDescription(tool: Record<string, unknown>): Record<string, unknown> {
  const toolName = typeof tool.name === "string" ? tool.name : "";
  const canonicalDescription = VOICE_CALENDAR_TOOL_DESCRIPTIONS[toolName];
  if (!canonicalDescription) return tool;
  return { ...tool, description: canonicalDescription };
}

async function synchronizeWorkspaceToolDescription(apiKey: string, toolId: string): Promise<void> {
  const toolUrl = `${TOOLS_BASE_URL}/${encodeURIComponent(toolId)}`;
  const document = await fetchElevenLabsJson<ElevenLabsToolDocument>(toolUrl, apiKey);
  const toolConfig = document.tool_config;
  const toolName = typeof toolConfig?.name === "string" ? toolConfig.name : "";
  const expectedDescription = VOICE_CALENDAR_TOOL_DESCRIPTIONS[toolName];
  if (!toolConfig || !expectedDescription || toolConfig.description === expectedDescription) return;

  await sendElevenLabsRequest(toolUrl, apiKey, "PATCH", {
    tool_config: { ...toolConfig, description: expectedDescription },
  });
}

async function fetchElevenLabsJson<T>(url: string, apiKey: string): Promise<T> {
  const response = await sendElevenLabsRequest(url, apiKey, "GET");
  if (!response.ok) {
    const isAuthFailure = response.status === 401 || response.status === 403;
    throw new VoiceProviderError(
      "Não foi possível consultar a configuração do agente de voz.",
      isAuthFailure ? "configuration" : "unavailable",
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new VoiceProviderError("O provedor de voz retornou configuração inválida.", "invalid_response");
  }
}

async function sendElevenLabsRequest(
  url: string,
  apiKey: string,
  method: "GET" | "PATCH",
  body?: unknown,
): Promise<Response> {
  try {
    return await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "xi-api-key": apiKey,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new VoiceProviderError("O provedor de voz demorou para sincronizar o agente.", "timeout");
    }
    throw new VoiceProviderError("Não foi possível comunicar com o provedor de voz.", "unavailable");
  }
}
