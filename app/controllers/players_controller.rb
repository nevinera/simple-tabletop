# Joining a table from its link: a name, tied to this browser's cookie so it
# comes back as the same player. Everyone at the table hears about them.
class PlayersController < ApplicationController
  include PlayerCookie

  def create
    game = Game.find_by_ulid!(params[:table_id])
    if (player = current_player(game))
      return render json: player.to_client
    end

    player = game.players.create!(name: params.require(:name), browser_token: browser_token!)
    GameChannel.broadcast_to(game, { type: "roster", roster: game.players.map(&:to_client) })
    render json: player.to_client, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_content
  end
end
