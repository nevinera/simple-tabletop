# One game's change log (see plans/server.md). A client sends each saved
# action with the rows it changed and the sequence it ran against. The server
# saves it only if the game is still at that sequence, then sends it to every
# player. Otherwise it tells the sender to catch up and try again.
class GameChannel < ApplicationCable::Channel
  def subscribed
    @game = Game.find_by(invite_token: params[:game])
    @player = @game && connection.current_player(@game)
    return reject unless @player

    stream_for @game
    transmit_snapshot
  end

  # data: actionId, base, tableAction, rows
  def act(data)
    if @game.apply_change!(base: data["base"], rows: data["rows"].to_h)
      GameChannel.broadcast_to(@game, {
        type: "change", sequence: @game.sequence, actor: @player.public_id,
        actionId: data["actionId"], action: data["tableAction"], rows: data["rows"]
      })
    else
      transmit({ type: "refused", actionId: data["actionId"], sequence: @game.reload.sequence })
    end
  end

  def resync = transmit_snapshot

  private

  def transmit_snapshot = transmit({ type: "snapshot", **@game.reload.snapshot })
end
