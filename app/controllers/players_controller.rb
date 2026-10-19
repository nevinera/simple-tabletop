# Joining a game from its invite link: a name, then a cookie that brings the
# browser back as the same player.
class PlayersController < ApplicationController
  include PlayerCookie

  def create
    game = Game.find_by!(invite_token: params[:game_id])
    player = game.players.create!(name: params.require(:name))
    remember_player(player)
    render json: player.to_client, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_content
  end
end
