import * as Sentry from "@sentry/browser";

let sentryInitialized = false;

function resolveClientDsn(): string {
  return (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
}

function ensureSentryInitialized(): boolean {
  if (sentryInitialized) {
    return true;
  }

  const dsn = resolveClientDsn();
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "development",
  });
  sentryInitialized = true;
  return true;
}

export function captureUiError(
  error: unknown,
  context?: Record<string, string | number | boolean | null>,
): void {
  if (!ensureSentryInitialized()) {
    return;
  }
  Sentry.captureException(error, {
    extra: context,
  });
}
