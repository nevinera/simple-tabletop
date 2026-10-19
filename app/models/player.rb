# Someone at a game, tied to their browser by its browser_token cookie (see
# PlayerCookie). Clients know them by public_id, which is what heldBy and
# players hold.
class Player < ApplicationRecord
  MAX_NAME = 40

  belongs_to :game

  validates :name, presence: true, length: { maximum: MAX_NAME }
  validates :public_id, :browser_token, presence: true
  validates :browser_token, uniqueness: { scope: :game_id }

  before_validation do
    self.public_id ||= SecureRandom.alphanumeric(12)
  end

  def to_client = { id: public_id, name:, host: }
end
