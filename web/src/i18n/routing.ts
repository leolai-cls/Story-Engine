import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh-Hant", "zh-Hans", "en"],
  defaultLocale: "zh-Hant",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
