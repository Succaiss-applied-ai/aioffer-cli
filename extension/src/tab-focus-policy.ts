export type ApplicationTabOpenCommand =
  | "browser.start_application_rpa"
  | "browser.open_application_url"
  | "browser.open_manual_application";

/**
 * Automatic work must preserve the user's current tab. Only an explicit
 * manual-assist command is allowed to foreground the recruitment page.
 */
export function applicationTabShouldOpenActive(command: ApplicationTabOpenCommand): boolean {
  return command === "browser.open_manual_application";
}
