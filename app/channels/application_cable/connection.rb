module ApplicationCable
  # A browser has one player per table it joined, so a connection doesn't
  # know its player until a channel names the table.
  class Connection < ActionCable::Connection::Base
    include PlayerCookie

    public :current_player
  end
end
