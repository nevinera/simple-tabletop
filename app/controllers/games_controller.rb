# Starting a game, and the page players open from its invite link.
class GamesController < ApplicationController
  include PlayerCookie

  MAX_OBJECTS = 10_000

  layout "client"

  # The host's browser posts the manifest URL and the starting state it
  # built from the manifest.
  def create
    state = params.require(:state).permit!.to_h.deep_symbolize_keys
    if state.values_at(:pieces, :containers).sum { |objects| objects.to_h.size } > MAX_OBJECTS
      return render json: { error: "That table has too many pieces." }, status: :unprocessable_content
    end

    game, host = Game.start!(
      manifest_url: params.require(:manifest_url),
      name: params[:name].presence || "Game",
      host_name: params.require(:player_name),
      state:
    )
    remember_player(host)
    render json: { path: game_path(game) }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_content
  end

  def show
    @game = Game.find_by!(invite_token: params[:id])
    @player = current_player(@game)
  end

  # Everything the client needs to show the table.
  def state
    render json: Game.find_by!(invite_token: params[:id]).snapshot
  end
end
