# A table that lives only in this browser, for trying out a module alone.
class SandboxController < ApplicationController
  layout "client"

  # Four Aces shows off what the table can do. It isn't a real game, so the
  # home page doesn't offer it.
  DEMO_MANIFEST = "/builtins/aces/manifest.json".freeze

  def show
    @manifest_url = params[:manifest].presence || DEMO_MANIFEST
  end
end
