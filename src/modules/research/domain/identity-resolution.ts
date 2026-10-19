import type { ResearchSearchResult } from "./briefing.ts";

const publicEmailProviders = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "uol.com.br", "bol.com.br",
  "icloud.com", "me.com", "live.com", "msn.com", "yahoo.com.br", "ymail.com",
  "proton.me", "protonmail.com", "protonmail.ch", "terra.com.br", "ig.com.br",
  "globo.com", "aol.com", "gmx.com", "zoho.com",
]);

export type IdentityAnchorType = "corporate_email" | "personal_email";

export type IdentityResolution = {
  anchorType: IdentityAnchorType;
  corporateDomain: string | null;
  queries: string[];
  isAmbiguous: boolean;
  ambiguityReason: string | null;
  personStatus: "corroborated" | "ambiguous" | "unverified";
  personReason: string | null;
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
    return {
      anchorType,
      corporateDomain,
      queries,
      isAmbiguous: false,
      ambiguityReason: null,
      personStatus: "unverified",
      personReason: null,
    };
  }

  assessCompanyResults(
    resolution: IdentityResolution,
    input: { company: string; website: string },
    results: ResearchSearchResult[],
  ): IdentityResolution {
    const personQuery = resolution.queries.at(-1);
    const companyResults = results.filter((result) => !result.query || result.query !== personQuery);
    const distinctHosts = new Set(companyResults.map((result) => parseUrlHost(result.url)).filter(Boolean));
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

  assessPersonResults(
    resolution: IdentityResolution,
    input: { fullName: string; company: string; website: string },
    results: ResearchSearchResult[],
  ): IdentityResolution {
    const personQuery = resolution.queries.at(-1);
    const hasQueryMetadata = results.some((result) => typeof result.query === "string");
    const personResults = hasQueryMetadata
      ? results.filter((result) => result.query === personQuery)
      : results;
    const personName = normalize(input.fullName);
    const companyName = normalize(input.company);
    const websiteHost = parseWebsiteHost(input.website);
    const personCandidates = personResults.filter((result) => normalize(`${result.title} ${result.excerpt}`).includes(personName));
    const corroborated = personCandidates.filter((result) => {
      const text = normalize(`${result.title} ${result.excerpt}`);
      const companyAnchor = companyName && text.includes(companyName);
      const host = parseUrlHost(result.url);
      const hostAnchor = Boolean(
        (websiteHost && (host === websiteHost || host.endsWith(`.${websiteHost}`))) ||
        (resolution.corporateDomain && (host === resolution.corporateDomain || host.endsWith(`.${resolution.corporateDomain}`))),
      );
      return companyAnchor || hostAnchor;
    });

    if (corroborated.length > 0) {
      return { ...resolution, personStatus: "corroborated", personReason: null };
    }

    if (personCandidates.length > 1) {
      return {
        ...resolution,
        personStatus: "ambiguous",
        personReason: `Foram encontradas ${personCandidates.length} referências para ${input.fullName} sem vínculo verificável com ${input.company}.`,
      };
    }

    return {
      ...resolution,
      personStatus: "unverified",
      personReason: `Não foi encontrado vínculo público verificável entre ${input.fullName} e ${input.company}.`,
    };
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

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
