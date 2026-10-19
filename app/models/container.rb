class Container < ApplicationRecord
  include ClientRow

  client_columns(
    "x" => :x, "y" => :y, "rotation" => :rotation, "faceUp" => :face_up, "members" => :member_keys,
    "heldBy" => :held_by, "locked" => :locked
  )

  belongs_to :game
end
