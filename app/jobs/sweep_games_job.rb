# Runs GameSweep on the schedule in config/recurring.yml.
class SweepGamesJob < ApplicationJob
  def perform = GameSweep.call
end
