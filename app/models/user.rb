# Someone signed in with Google. Games a user starts are theirs: they last
# longer than anonymous ones (see GameLifetime), and a user owns at most
# MAX_GAMES at once. An admin has no limit, and their games never expire.
class User < ApplicationRecord
  MAX_GAMES = 10

  class NotAllowed < StandardError; end

  has_many :games, dependent: :nullify

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :google_uid, :email, :name, presence: true
  validates :google_uid, :email, uniqueness: true

  # The user Google vouched for, made or refreshed from what Google says now.
  # Raises NotAllowed for someone the allowlist leaves out.
  def self.sign_in!(google_uid:, email:, name:)
    user = find_or_initialize_by(google_uid:)
    raise NotAllowed, "#{email} isn't on the list of people who can sign in." unless user.admin? || AllowedEmail.allows?(email)

    user.update!(email:, name: name.presence || email)
    user
  end

  def at_game_limit? = !admin? && games.count >= MAX_GAMES

  # Takes on the anonymous games this browser hosted, newest first, as many
  # as the limit leaves room for. Returns how many it took.
  def claim_hosted!(browser_token)
    return 0 unless browser_token

    hosted = Game.where(user_id: nil).where(id: Player.where(browser_token:, host: true).select(:game_id)).order(created_at: :desc)
    hosted = hosted.limit([ MAX_GAMES - games.count, 0 ].max) unless admin?
    hosted.update_all(user_id: id)
  end

  def to_client = { name:, email:, admin: admin? }
end
