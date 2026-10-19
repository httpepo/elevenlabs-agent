import "server-only";
import { getServerEnvironment } from "../../config/env.ts";
import type { ResearchSearchResult } from "../../../modules/research/domain/briefing.ts";
import { ResearchProviderError, type ResearchProvider, type ResearchProviderInput } from "../../../modules/research/ports/research-provider.ts";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_RESULTS_PER_QUERY = 5;
const MAX_TIMEOUT_MS = 6_000;

export class TavilySearchAdapter implements ResearchProvider {
  async search(input: ResearchProviderInput): Promise<ResearchSearchResult[]> {
    const environment = getServerEnvironment();
    const apiKey = environment.TAVILY_API_KEY;
    if (!apiKey) throw new ResearchProviderError("TAVILY_API_KEY não está configurada no servidor.", "configuration");

    const timeoutMs = boundedTimeout(input.timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const responses = await Promise.all(input.queries.slice(0, 3).map((query) => this.searchQuery(query, apiKey, controller.signal)));
      return deduplicate(responses.flat());
    } catch (error) {
      if (isAbortError(error)) throw new ResearchProviderError("A pesquisa Tavily excedeu o limite de 6 segundos.", "timeout");
      if (error instanceof ResearchProviderError) throw error;
      throw new ResearchProviderError("A pesquisa Tavily falhou.", "failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchQuery(query: string, apiKey: string, signal: AbortSignal): Promise<ResearchSearchResult[]> {
    let response: Response;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: MAX_RESULTS_PER_QUERY,
          include_answer: false,
          include_raw_content: false,
        }),
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ResearchProviderError("A pesquisa Tavily não respondeu.", "failed");
    }
    if (!response.ok) throw new ResearchProviderError("A pesquisa Tavily retornou erro HTTP.", response.status === 408 ? "timeout" : "failed");

    const payload = await response.json() as { results?: unknown };
    if (!Array.isArray(payload.results)) throw new ResearchProviderError("A resposta Tavily não possui fontes válidas.", "failed");
    return payload.results.flatMap((item): ResearchSearchResult[] => {
      if (!item || typeof item !== "object") return [];
      const result = item as Record<string, unknown>;
      if (typeof result.url !== "string" || !isHttpUrl(result.url)) return [];
      return [{
        url: result.url,
        title: typeof result.title === "string" ? result.title : result.url,
        excerpt: typeof result.content === "string" ? result.content : "",
        query,
      }];
    });
  }
}

function deduplicate(results: ResearchSearchResult[]): ResearchSearchResult[] {
  const unique = new Map<string, ResearchSearchResult>();
  for (const result of results) {
    try {
      const url = new URL(result.url);
      url.hash = "";
      if (!unique.has(url.toString())) unique.set(url.toString(), { ...result, url: url.toString() });
    } catch { /* Resultado externo inválido não vira evidência. */ }
  }
  return [...unique.values()];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function boundedTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MAX_TIMEOUT_MS;
  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}
