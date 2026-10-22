# Ties a browser to its players, one per table it has joined, through one
# signed cookie that every player row stores.
module PlayerCookie
  COOKIE = :browser_token

  private

  def current_player(game)
    token = browser_token
    token && game.players.find_by(browser_token: token)
  end

  # Every player this browser has been, newest table visit first.
  def browser_players
    token = browser_token
    token ? Player.where(browser_token: token).includes(game: :user).order(seen_at: :desc, id: :desc) : Player.none
  end

  def browser_token = cookies.signed[COOKIE]

  # The browser's token, handing it one first if it has none.
  def browser_token!
    browser_token || SecureRandom.urlsafe_base64(24).tap do |token|
      cookies.signed.permanent[COOKIE] = { value: token, httponly: true, same_site: :lax }
    end
  end
end
