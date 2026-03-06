const DATE_TIME_WITH_TIMEZONE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

const DATE_WITH_TIMEZONE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZoneName: "short",
});

function toValidDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTimeWithTimezone(value: string | number | Date | null | undefined): string {
  const date = toValidDate(value);
  if (!date) return "-";
  return DATE_TIME_WITH_TIMEZONE_FORMATTER.format(date);
}

export function formatDateWithTimezone(value: string | number | Date | null | undefined): string {
  const date = toValidDate(value);
  if (!date) return "-";
  return DATE_WITH_TIMEZONE_FORMATTER.format(date);
}
