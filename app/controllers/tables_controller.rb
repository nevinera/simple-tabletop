# Starting a table, and the page players open from its link, which is also
# the invite.
class TablesController < ApplicationController
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
    if current_user&.at_game_limit?
      return render json: { error: "You have #{User::MAX_GAMES} tables already. Delete one to start another." }, status: :unprocessable_content
    end

    game, host = Game.start!(
      manifest_url: params.require(:manifest_url),
      name: params[:name].presence || "Game",
      host_name: params.require(:player_name),
      browser_token: browser_token!,
      state:,
      user: current_user
    )
    render json: { path: table_path(game) }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_content
  end

  def show
    @game = Game.find_by_ulid!(params[:id])
    @player = current_player(@game)
  end

  # Only its owner, or an admin, can delete a table.
  def destroy
    game = Game.find_by_ulid!(params[:id])
    return head :forbidden unless current_user && (game.user == current_user || current_user.admin?)

    game.destroy!
    head :no_content
  end

  # Everything the client needs to show the table.
  def state
    render json: Game.find_by_ulid!(params[:id]).snapshot
  end
end
