# The front page: start a table from a built-in game or any module, or get
# back to one this browser joined.
class HomeController < ApplicationController
  include PlayerCookie

  layout "client"

  def show
    @builtins = Builtin.all.map(&:to_client)
    @tables = browser_players.map do |player|
      { path: table_path(player.game), name: player.game.name, playerName: player.name, seenAt: player.seen_at }
    end
  end
end
