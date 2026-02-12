import { authClient } from '@/lib/auth-client'
import { Link } from '@tanstack/react-router'

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="h-8 w-8 bg-muted animate-pulse" />
    )
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {session.user.image ? (
          <img src={session.user.image} alt="" className="h-8 w-8 grayscale" />
        ) : (
          <div className="h-8 w-8 bg-accent flex items-center justify-center border border-border">
            <span className="text-xs font-medium text-accent-foreground">
              {session.user.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        )}
        <button
          onClick={() => authClient.signOut()}
          className="flex-1 h-9 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors uppercase tracking-widest"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <Link
      to="/demo/better-auth"
      className="h-9 px-4 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center uppercase tracking-widest"
    >
      Sign in
    </Link>
  )
}
