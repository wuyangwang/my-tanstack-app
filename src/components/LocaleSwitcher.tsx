// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale
import { useRouter, useMatches } from "@tanstack/react-router"
import { getLocale, locales, setLocale } from "@/paraglide/runtime"
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
  const router = useRouter()
  const matches = useMatches()
  const selectedLocale = getLocale()

  const onLocaleChange = (nextLocale: string) => {
    setLocale(nextLocale)
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
