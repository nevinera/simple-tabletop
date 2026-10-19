# One table: its pieces, containers, and the players around it. The server
# never reads the manifest, so a game stores state in the client's shape
# (see plans/server.md) without knowing what any of it looks like.
class Game < ApplicationRecord
  SEATINGS = %w[four eight].freeze
  QUIET_AFTER = 30.seconds

  has_many :players, dependent: :destroy
  has_many :pieces, dependent: :delete_all
  has_many :containers, dependent: :delete_all

  validates :invite_token, :manifest_url, :name, presence: true
  validates :seating, inclusion: { in: SEATINGS }
  validates :manifest_url, format: { with: %r{\Ahttps?://}, message: "must be an http or https URL" }

  before_validation { self.invite_token ||= SecureRandom.urlsafe_base64(16) }

  def to_param = invite_token

  # Creates a game from the starting state the host's browser built from the
  # manifest, with the host as its first player.
  def self.start!(manifest_url:, name:, host_name:, state:)
    transaction do
      game = create!(manifest_url:, name:)
      game.replace_objects!(state)
      [ game, game.players.create!(name: host_name, host: true) ]
    end
  end

  def replace_objects!(state)
    pieces.delete_all
    containers.delete_all
    rows = ->(model, objects) { objects.to_h.map { |key, row| model.attributes_from_client(row).merge(game_id: id, key:) } }
    piece_rows = rows.(Piece, state[:pieces])
    container_rows = rows.(Container, state[:containers])
    Piece.insert_all!(piece_rows) if piece_rows.any?
    Container.insert_all!(container_rows) if container_rows.any?
  end

  # Saves one client's change if the game is still at base, the sequence the
  # client ran its action against. rows holds each changed piece, container,
  # and player in the client's shape, null for one that's gone, plus seating
  # when it changed. Returns whether the change took.
  def apply_change!(base:, rows:)
    taken = transaction do
      next false unless Game.where(id:, sequence: base).update_all("sequence = sequence + 1") == 1

      write_rows!(Piece, rows["pieces"])
      write_rows!(Container, rows["containers"])
      rows["players"].to_h.each { |public_id, row| players.where(public_id:).update_all(seat_key: row&.dig("seatId")) }
      update_columns(seating: rows["seating"]) if SEATINGS.include?(rows["seating"])
      true
    end
    reload if taken
    taken
  end

  # Lets go of everything held by players nobody has heard from lately, as a
  # change of its own. Players keep their seats. Returns the changed rows in
  # the client's shape, or nil when nothing was held.
  def release_stale_holds!
    quiet = players.where(seen_at: ...QUIET_AFTER.ago).pluck(:public_id)
    return if quiet.empty?

    released = transaction do
      held = [ pieces, containers ].map { |objects| objects.where(held_by: quiet).to_a }
      next if held.all?(&:empty?)

      Game.where(id:).update_all("sequence = sequence + 1")
      held.flatten.each { |object| object.update_columns(held_by: nil) }
      held
    end
    return unless released

    reload
    %w[pieces containers].zip(released).to_h { |kind, objects| [ kind, objects.to_h { |object| [ object.key, object.to_client ] } ] }
  end

  # Everything a client needs to show the table, in its own shape. players
  # lists who sits where, and roster everyone in the game.
  def snapshot
    seated = players.select(&:seat_key)
    {
      sequence:,
      seating:,
      tableLocked: table_locked,
      players: seated.to_h { |player| [ player.public_id, { seatId: player.seat_key } ] },
      roster: players.map(&:to_client),
      pieces: pieces.to_h { |piece| [ piece.key, piece.to_client ] },
      containers: containers.to_h { |container| [ container.key, container.to_client ] }
    }
  end

  private

  def write_rows!(model, objects)
    gone, kept = objects.to_h.partition { |_key, row| row.nil? }
    model.where(game_id: id, key: gone.map(&:first)).delete_all if gone.any?
    rows = kept.map { |key, row| model.attributes_from_client(row).merge(game_id: id, key:) }
    model.upsert_all(rows, unique_by: %i[game_id key]) if rows.any?
  end
end
