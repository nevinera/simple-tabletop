module ApplicationCable
  # Players are tied to each game by its own cookie, so a connection doesn't
  # know its player until a channel names the game.
  class Connection < ActionCable::Connection::Base
    include PlayerCookie

    public :current_player
  end
end
