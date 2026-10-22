# How long a game lasts: until it has gone `idle` without anyone playing, or
# reached `most` since it started, whichever comes first. A signed-in user's
# games last longer than anonymous ones, and an admin's last forever.
class GameLifetime
  ANONYMOUS = { idle: 6.hours, most: 72.hours }.freeze
  OWNED = { idle: 72.hours, most: 3.months }.freeze

  # The limits for this game, or nil when it never expires.
  def self.limits(game)
    return ANONYMOUS unless game.user
    OWNED unless game.user.admin?
  end

  # When this game expires if nobody plays it, or nil for never.
  def self.expires_at(game)
    limits = limits(game) or return
    [ game.last_active_at + limits[:idle], game.created_at + limits[:most] ].min
  end

  # Every game that has expired by now.
  def self.expired(now: Time.current)
    anonymous = Game.where(user_id: nil)
    owned = Game.where(user_id: User.where(admin: false).select(:id))
    past(anonymous, ANONYMOUS, now).or(past(owned, OWNED, now))
  end

  def self.past(games, limits, now)
    games.where("COALESCE(games.active_at, games.updated_at) < ?", now - limits[:idle])
      .or(games.where(created_at: ...(now - limits[:most])))
  end
  private_class_method :past
end
