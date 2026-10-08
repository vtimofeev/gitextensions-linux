import { dateFormatter } from "../domain/date-format";
import { en, type MessageKey } from "./en";
import { ru } from "./ru";
import type { Preferences } from "../store/preferences";
export class I18n {
  constructor(private readonly preferences: Preferences) {}
  t(key: MessageKey, params: Record<string, string | number> = {}): string {
    const message =
      (this.preferences.locale === "ru" ? ru : en)[key] ?? en[key];
    return message.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? ""),
    );
  }
  date(value: string) {
    return dateFormatter(this.preferences.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
}
declare module "vue" {
  interface ComponentCustomProperties {
    $t: I18n["t"];
  }
}
