// Who's signed in, with buttons to sign in with Google or out again. Both
// are plain form posts, since signing in leaves for Google's page.
// account is { user: { name, email, admin } | null, signInAvailable, maxGames, alert }.
export function Account({ account }) {
  const { user, signInAvailable, maxGames, alert } = account;
  if (!user && !signInAvailable) return null;
  return (
    <section className="home-section home-account" aria-label="Account">
      {alert && <p className="menu-note" role="alert">{alert}</p>}
      {user ? (
        <form method="post" action="/sign_out" className="home-account-row">
          <span>Signed in as <strong>{user.name}</strong>{user.admin && " (admin)"}</span>
          <input type="hidden" name="_method" value="delete" />
          <CsrfField />
          <button type="submit" className="menu-item">Sign out</button>
        </form>
      ) : (
        <form method="post" action="/auth/google_oauth2" className="home-account-row">
          <span className="home-module-detail">
            Tables close after 6 idle hours. Sign in to keep up to {maxGames} for 3 idle days.
          </span>
          <CsrfField />
          <button type="submit" className="menu-item">Sign in with Google</button>
        </form>
      )}
    </section>
  );
}

function CsrfField() {
  const token = document.querySelector('meta[name="csrf-token"]')?.content || "";
  return <input type="hidden" name="authenticity_token" value={token} />;
}

// "closes in 5h", or nothing for a table that never closes.
export function closesIn(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const hours = (new Date(expiresAt).getTime() - now) / 3600000;
  if (hours < 1) return "closes within the hour";
  if (hours < 48) return `closes in ${Math.floor(hours)}h`;
  return `closes in ${Math.floor(hours / 24)} days`;
}
