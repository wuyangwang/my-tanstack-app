// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale
import { getLocale, locales, setLocale } from '@/paraglide/runtime'
import { m } from '@/paraglide/messages'
import { cn } from '@/lib/utils'

export default function ParaglideLocaleSwitcher() {
  const currentLocale = getLocale()

  return (
    <div
      className="flex gap-2 items-center text-inherit"
      aria-label={m.language_label()}
    >
      <span className="opacity-80 text-sm">
        {m.current_locale({ locale: currentLocale })}
      </span>
      <div className="flex gap-1">
        {locales.map((locale) => (
          <button
            key={locale}
            onClick={() => setLocale(locale)}
            aria-pressed={locale === currentLocale}
            className={cn(
              "cursor-pointer px-3 py-1 rounded-full border text-xs transition-colors",
              locale === currentLocale
                ? "bg-primary text-primary-foreground border-primary font-bold"
                : "bg-transparent border-border hover:bg-accent text-foreground font-medium"
            )}
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
