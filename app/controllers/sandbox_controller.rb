# A table that lives only in this browser, for trying out a module alone.
class SandboxController < ApplicationController
  SAMPLE_MANIFEST = "/modules/aces/manifest.json".freeze

  layout "client"

  def show
    @manifest_url = params[:manifest].presence || SAMPLE_MANIFEST
  end
end
