class Piece < ApplicationRecord
  include ClientRow

  client_columns(
    "x" => :x, "y" => :y, "rotation" => :rotation, "faceUp" => :face_up, "stackOrder" => :stack_order,
    "containerId" => :container_key, "heldBy" => :held_by, "locked" => :locked
  )

  belongs_to :game
end
