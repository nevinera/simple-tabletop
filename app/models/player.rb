# Someone at a game, tied to their browser by a cookie holding cookie_token.
# Clients know them by public_id, which is what heldBy and players hold.
class Player < ApplicationRecord
  MAX_NAME = 40

  belongs_to :game

  validates :name, presence: true, length: { maximum: MAX_NAME }
  validates :public_id, :cookie_token, presence: true

  before_validation do
    self.public_id ||= SecureRandom.alphanumeric(12)
    self.cookie_token ||= SecureRandom.urlsafe_base64(24)
  end

  def to_client = { id: public_id, name:, host: }
end
