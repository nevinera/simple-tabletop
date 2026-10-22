# Deletes every game that has expired (see GameLifetime), with its players
# and pieces. Returns how many it deleted.
#
#   GameSweep.call
class GameSweep
  def self.call(now: Time.current)
    GameLifetime.expired(now:).find_each.count(&:destroy)
  end
end
