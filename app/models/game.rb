# One table: its pieces, containers, and the players around it. The server
# never reads the manifest, so a game stores state in the client's shape
# (see plans/server.md) without knowing what any of it looks like.
class Game < ApplicationRecord
  SEATINGS = %w[four eight].freeze

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
end
