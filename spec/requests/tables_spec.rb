require "rails_helper"

RSpec.describe "Tables", type: :request do
  it "mounts the client on the sample manifest" do
    get root_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('data-manifest-url="/modules/aces/manifest.json"')
  end

  it "mounts the client on a manifest from the query string" do
    get root_path(manifest: "https://example.com/game/manifest.json")
    expect(response.body).to include('data-manifest-url="https://example.com/game/manifest.json"')
  end
end
