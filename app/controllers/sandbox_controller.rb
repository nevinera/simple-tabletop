# A table that lives only in this browser, for trying out a module alone.
class SandboxController < ApplicationController
  layout "client"

  def show
    @manifest_url = params[:manifest].presence
    redirect_to root_path unless @manifest_url
  end
end
