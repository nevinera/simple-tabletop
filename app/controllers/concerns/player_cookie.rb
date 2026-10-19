# Ties a browser to its player in each game it has joined, through a signed
# cookie per game.
module PlayerCookie
  private

  def remember_player(player)
    cookies.signed.permanent[cookie_name(player.game)] = { value: player.cookie_token, httponly: true, same_site: :lax }
  end

  def current_player(game)
    token = cookies.signed[cookie_name(game)]
    token && game.players.find_by(cookie_token: token)
  end

  def cookie_name(game) = "player_#{game.id}"
end
