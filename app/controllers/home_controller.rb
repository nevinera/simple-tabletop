# The front page: start a table from a built-in game or any module, or get
# back to one this browser joined or the signed-in user owns.
class HomeController < ApplicationController
  include PlayerCookie

  layout "client"

  def show
    @builtins = Builtin.all.map(&:to_client)
    joined = browser_players.to_a
    owned = current_user ? current_user.games.where.not(id: joined.map(&:game_id)).includes(:user).order(created_at: :desc) : []
    @tables = joined.map { |player| table(player.game, player) } + owned.map { |game| table(game) }
    @account = { user: current_user&.to_client, signInAvailable: sign_in_available?, maxGames: User::MAX_GAMES, alert: flash[:alert] }
  end

  private

  def table(game, player = nil)
    {
      path: table_path(game), name: game.name, playerName: player&.name, seenAt: player&.seen_at,
      owned: current_user.present? && game.user_id == current_user.id, expiresAt: game.expires_at
    }
  end
end
