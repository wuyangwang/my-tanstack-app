// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale
import { useEffect, useState } from "react"
import { cookieName, getLocale, locales, setLocale } from "@/paraglide/runtime"
import { m } from "@/paraglide/messages"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type LocaleCode = "en" | "zh"

const localeLabels: Record<LocaleCode, string> = {
  en: "English",
  zh: "中文",
}

export default function ParaglideLocaleSwitcher() {
  const [selectedLocale, setSelectedLocale] = useState<LocaleCode>("zh")

  useEffect(() => {
    const locale = getLocale() as LocaleCode
    const hasSavedLocale = document.cookie
      .split(";")
      .some((cookie) => cookie.trim().startsWith(`${cookieName}=`))

    if (!hasSavedLocale && locale !== "zh") {
      setSelectedLocale("zh")
      void setLocale("zh")
      return
    }

    setSelectedLocale(locale)
  }, [])

  const onLocaleChange = (nextLocale: string) => {
    if (!locales.includes(nextLocale as (typeof locales)[number])) return

    setSelectedLocale(nextLocale as LocaleCode)
    void setLocale(nextLocale as LocaleCode)
  }

  return (
    <Select value={selectedLocale} onValueChange={onLocaleChange}>
      <SelectTrigger className="w-[108px]" size="sm" aria-label={m.language_label()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(locales as LocaleCode[]).map((locale) => (
          <SelectItem key={locale} value={locale}>
            {localeLabels[locale] ?? locale.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
