# One game's change log (see plans/server.md). A client sends each saved
# action with the rows it changed and the sequence it ran against. The server
# saves it only if the game is still at that sequence, then sends it to every
# player. Otherwise it tells the sender to catch up and try again.
#
# Drags pass straight through to the other players. Each player has one
# connection at a time: a newer one boots the older.
class GameChannel < ApplicationCable::Channel
  def subscribed
    @game = Game.find_by(ulid: params[:game].to_s.upcase)
    @player = @game && connection.current_player(@game)
    return reject unless @player

    @connection_id = SecureRandom.hex(8)
    stream_for @game, coder: ActiveSupport::JSON do |message|
      transmit(message) unless message["type"] == "drag" && message["actor"] == @player.public_id
    end
    stream_for @player, coder: ActiveSupport::JSON do |message|
      replaced if message["connectionId"] != @connection_id
    end
    GameChannel.broadcast_to(@player, { type: "connected", connectionId: @connection_id })
    @player.touch(:seen_at)
    @game.mark_active!
    transmit_snapshot
  end

  # data: actionId, base, tableAction, rows
  def act(data)
    if @game.apply_change!(base: data["base"], rows: data["rows"].to_h)
      broadcast_change(actor: @player.public_id, actionId: data["actionId"], action: data["tableAction"], rows: data["rows"])
    else
      transmit({ type: "refused", actionId: data["actionId"], sequence: @game.reload.sequence })
    end
  end

  # data: id, x, y
  def drag(data)
    GameChannel.broadcast_to(@game, { type: "drag", id: data["id"], x: data["x"], y: data["y"], actor: @player.public_id })
  end

  # Keeps this player fresh, and lets go of whatever quiet players hold.
  def ping
    @player.touch(:seen_at)
    rows = @game.release_stale_holds!
    broadcast_change(actor: nil, actionId: nil, action: nil, rows:) if rows
  end

  def resync = transmit_snapshot

  private

  def transmit_snapshot = transmit({ type: "snapshot", **@game.reload.snapshot })

  def broadcast_change(**change)
    GameChannel.broadcast_to(@game, { type: "change", sequence: @game.sequence, **change })
  end

  def replaced
    stop_all_streams
    transmit({ type: "replaced" })
  end
end
