import { randomUUID } from "node:crypto";

// Modelo da demonstração existente. Os registros do fluxo completo serão
// definidos em cada módulo quando seus casos de uso forem implementados.

export type LeadForm = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
};

export type FieldErrors = Partial<Record<keyof LeadForm, string>>;

export class ValidationError extends Error {
  readonly fields: FieldErrors;
  constructor(fields: FieldErrors) {
    super("Confira os campos indicados.");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export const spicedLabels = {
  situation: "Situação",
  pain: "Dor",
  impact: "Impacto",
  criticalEvent: "Evento crítico",
  decision: "Decisão",
} as const;

type SpicedField = { value: string | null; status: "unknown"; evidence: string[] };

export type LeadRecord = {
  id: string;
  createdAt: string;
  mode: "demo";
  original: LeadForm;
  normalized: LeadForm;
  briefing: { summary: string; gaps: string[] };
  research: { status: "pending"; sources: { url: string; title: string }[] };
  spiced: Record<keyof typeof spicedLabels, SpicedField>;
  conversation: { status: "not_started"; transcript: string | null; summary: string | null };
  meeting: { status: "not_booked"; start: string | null };
  trace: {
    id: string;
    timestamp: string;
    tool: string;
    mode: "demo";
    status: "completed";
    result: string;
  }[];
};

export function parseLeadForm(input: unknown): { original: LeadForm; normalized: LeadForm } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError({ fullName: "Informe os dados do visitante." });
  }
  const record = input as Record<string, unknown>;
  const fields: FieldErrors = {};
  const original = {} as LeadForm;
  const normalized = {} as LeadForm;
  const limits: Record<keyof LeadForm, number> = {
    fullName: 120, email: 254, phone: 40, company: 160, website: 500,
  };
  for (const key of Object.keys(limits) as (keyof LeadForm)[]) {
    const value = record[key] ?? (key === "website" ? "" : undefined);
    if (typeof value !== "string") {
      fields[key] = "Informe um texto válido.";
      original[key] = "";
      normalized[key] = "";
      continue;
    }
    original[key] = value;
    normalized[key] = value.trim();
    if (value.length > limits[key]) fields[key] = "O texto ultrapassa o limite deste campo.";
    if (key !== "website" && !normalized[key]) fields[key] = "Preencha este campo.";
  }
  if (normalized.fullName.length < 2) fields.fullName = "Informe seu nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) fields.email = "Informe um e-mail válido.";
  const digits = normalized.phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(normalized.phone) || digits.length < 10 || digits.length > 15) {
    fields.phone = "Informe o telefone com DDD.";
  }
  if (normalized.website) {
    try {
      const url = new URL(normalized.website);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) {
        fields.website = "Use um endereço completo, como https://empresa.com.br.";
      }
    } catch {
      fields.website = "Use um endereço completo, como https://empresa.com.br.";
    }
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  normalized.email = normalized.email.toLowerCase();
  normalized.phone = digits;
  return { original, normalized };
}

export function createDemoLead(input: unknown): LeadRecord {
  const { original, normalized } = parseLeadForm(input);
  const createdAt = new Date().toISOString();
  const unknownField = (): SpicedField => ({ value: null, status: "unknown", evidence: [] });
  const spiced: LeadRecord["spiced"] = {
    situation: unknownField(),
    pain: unknownField(),
    impact: unknownField(),
    criticalEvent: unknownField(),
    decision: unknownField(),
  };
  return {
    id: randomUUID(), createdAt, mode: "demo", original, normalized,
    briefing: {
      summary: `${normalized.fullName} preencheu o cadastro e informou ${normalized.company} como empresa. Este briefing inicial usa apenas o formulário. O vínculo profissional, os dados da empresa e suas necessidades ainda precisam ser pesquisados ou confirmados.`,
      gaps: [
        "Identificar a empresa correta e confirmar o vínculo da pessoa.",
        "Entender a operação financeira atual e seus sistemas.",
        "Descobrir dor, impacto, evento crítico e processo de decisão.",
      ],
    },
    research: { status: "pending", sources: [] },
    spiced,
    conversation: { status: "not_started", transcript: null, summary: null },
    meeting: { status: "not_booked", start: null },
    trace: [{
      id: randomUUID(), timestamp: createdAt, tool: "prepare_initial_briefing",
      mode: "demo", status: "completed",
      result: "Briefing inicial preparado a partir do formulário. Nenhuma pesquisa externa, chamada de IA ou reserva de agenda foi executada.",
    }],
  };
}

export function isLeadId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
