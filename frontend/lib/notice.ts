export type NoticeKind = "success" | "error";

export interface Notice {
  kind: NoticeKind;
  text: string;
}

/**
 * Converts unknown errors into a UI-safe notice message.
 * @param error Caught error value.
 * @param fallback Fallback message when no Error instance is provided.
 * @returns Error notice payload.
 */
export function toErrorNotice(error: unknown, fallback: string): Notice {
  return {
    kind: "error",
    text: error instanceof Error ? error.message : fallback,
  };
}

/**
 * Resolves text color classes for notice rendering.
 * @param notice Notice state payload.
 * @returns CSS class string for the notice text.
 */
export function noticeTextClass(notice: Notice): string {
  return notice.kind === "error" ? "text-red-600" : "text-[#666]";
}

/**
 * Applies a normalized error notice through a state setter.
 * @param setter Notice setter function.
 * @param error Caught error value.
 * @param fallback Fallback message when no Error instance is provided.
 */
export function setErrorNotice(
  setter: (notice: Notice | null) => void,
  error: unknown,
  fallback: string,
): void {
  setter(toErrorNotice(error, fallback));
}
