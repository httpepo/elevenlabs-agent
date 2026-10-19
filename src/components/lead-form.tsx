"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import { Input } from "@/design-system/components/ui/input";
import { Label } from "@/design-system/components/ui/label";
import type { FieldErrors, LeadForm } from "@/modules/leads/application/lead-dto";

const fields: { name: keyof LeadForm; label: string; type: string; placeholder: string; autoComplete: string; max: number; optional?: boolean }[] = [
  { name: "fullName", label: "Nome", type: "text", placeholder: "Seu nome", autoComplete: "name", max: 120 },
  { name: "email", label: "E-mail", type: "email", placeholder: "voce@empresa.com.br", autoComplete: "email", max: 254 },
  { name: "phone", label: "Telefone com DDD", type: "tel", placeholder: "(11) 99999-9999", autoComplete: "tel", max: 40 },
  { name: "company", label: "Empresa", type: "text", placeholder: "Nome da empresa", autoComplete: "organization", max: 160 },
  { name: "website", label: "Site da empresa", type: "url", placeholder: "https://empresa.com.br", autoComplete: "url", max: 500, optional: true },
  { name: "employeeCount", label: "Número de funcionários", type: "text", placeholder: "Ex.: 11–50", autoComplete: "off", max: 50, optional: true },
];

export function LeadFormComponent({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !enabled) return;
    setPending(true);
    setErrors({});
    setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.fields ?? {});
        setMessage(body.error ?? "Não foi possível salvar. Tente novamente.");
        setPending(false);
        return;
      }
      router.push(`/atendimento/${body.id}`);
    } catch {
      setMessage("Não foi possível conectar. Confira sua conexão e tente novamente.");
      setPending(false);
    }
  }

  return (
    <Card className="lead-form">
    <form id="cadastro" onSubmit={submit} aria-label="Seus dados para atendimento" aria-busy={pending}>
      <div className="form-heading"><h2>Conte um pouco sobre você.</h2></div>
      {fields.map((field) => (
        <div className="form-field" key={field.name}>
          <Label htmlFor={field.name}>{field.label}{field.optional && <span className="muted"> · opcional</span>}</Label>
          <Input id={field.name} name={field.name} type={field.type} placeholder={field.placeholder}
            className="min-h-11 aria-invalid:border-destructive"
            autoComplete={field.autoComplete} required={!field.optional} maxLength={field.max}
            disabled={pending || !enabled} aria-invalid={errors[field.name] ? "true" : undefined}
            aria-describedby={errors[field.name] ? `${field.name}-error` : undefined} />
          {errors[field.name] && <small className="field-error" id={`${field.name}-error`}>{errors[field.name]}</small>}
        </div>
      ))}
      {message && <p className="field-error" role="alert">{message}</p>}
      <Button type="submit" variant="brand" size="lg" className="mt-1 min-h-11 w-full justify-between" disabled={pending || !enabled}>{pending ? "Conectando com a Atlas…" : "Fale com a Atlas"}<span aria-hidden="true">↗</span></Button>
      <p className="form-note">Seus dados ficam protegidos para dar continuidade ao atendimento.</p>
    </form>
    </Card>
  );
}
