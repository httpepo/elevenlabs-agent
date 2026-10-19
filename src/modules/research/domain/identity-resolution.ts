import type { ResearchSearchResult } from "./briefing.ts";

const publicEmailProviders = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "uol.com.br", "bol.com.br",
  "icloud.com", "live.com", "proton.me", "protonmail.com", "terra.com.br",
]);

export type IdentityAnchorType = "corporate_email" | "personal_email";

export type IdentityResolution = {
  anchorType: IdentityAnchorType;
  corporateDomain: string | null;
  queries: string[];
  isAmbiguous: boolean;
  ambiguityReason: string | null;
};

export class IdentityResolver {
  resolve(input: { fullName: string; email: string; company: string; website: string }): IdentityResolution {
    const emailDomain = input.email.split("@")[1]?.toLowerCase() ?? "";
    const anchorType = publicEmailProviders.has(emailDomain) ? "personal_email" : "corporate_email";
    const websiteHost = parseWebsiteHost(input.website);
    const corporateDomain = anchorType === "corporate_email" ? emailDomain : null;
    const domainAnchor = corporateDomain ?? websiteHost;
    const companyQuery = quote(input.company);
    const queries = domainAnchor
      ? [`site:${domainAnchor} ${companyQuery}`, `${companyQuery} ${domainAnchor}`]
      : [`${companyQuery} empresa`, `${companyQuery} site oficial`];
    const personAnchor = domainAnchor ?? input.company;
    queries.push(`${quote(input.fullName)} ${companyQuery} ${personAnchor}`);
    return { anchorType, corporateDomain, queries, isAmbiguous: false, ambiguityReason: null };
  }

  assessCompanyResults(
    resolution: IdentityResolution,
    input: { company: string; website: string },
    results: ResearchSearchResult[],
  ): IdentityResolution {
    const distinctHosts = new Set(results.map((result) => parseUrlHost(result.url)).filter(Boolean));
    const websiteHost = parseWebsiteHost(input.website);
    const hasExpectedHost = websiteHost ? distinctHosts.has(websiteHost) : false;
    const hasCorporateHost = resolution.corporateDomain
      ? [...distinctHosts].some((host) => host === resolution.corporateDomain || host.endsWith(`.${resolution.corporateDomain}`))
      : false;
    const isAmbiguous = distinctHosts.size > 1 && !hasExpectedHost && !hasCorporateHost;
    return isAmbiguous
      ? {
        ...resolution,
        isAmbiguous: true,
        ambiguityReason: `Foram encontradas ${distinctHosts.size} organizações distintas para ${input.company}; confirme ramo e localização.`,
      }
      : resolution;
  }
}

function quote(value: string): string {
  return `"${value.replaceAll('"', "").trim()}"`;
}

function parseWebsiteHost(website: string): string | null {
  if (!website) return null;
  try { return new URL(website).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function parseUrlHost(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
