class TablesController < ApplicationController
  SAMPLE_MANIFEST = "/modules/aces/manifest.json".freeze

  layout "client"

  def show
    @manifest_url = params[:manifest].presence || SAMPLE_MANIFEST
  end
end
