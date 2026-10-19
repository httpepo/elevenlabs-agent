export class SchedulingAuthorizationError extends Error {
  readonly kind: "not_found" | "invalid_session";
  readonly status: 404 | 409;

  constructor(message: string, kind: SchedulingAuthorizationError["kind"], status: SchedulingAuthorizationError["status"]) {
    super(message);
    this.name = "SchedulingAuthorizationError";
    this.kind = kind;
    this.status = status;
  }
}

export class InvalidBookingOfferError extends Error {
  readonly status = 422 as const;

  constructor(message = "Escolha um horário oferecido recentemente antes de confirmar a reunião.") {
    super(message);
    this.name = "InvalidBookingOfferError";
  }
}
