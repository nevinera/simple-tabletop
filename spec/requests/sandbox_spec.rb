require "rails_helper"

RSpec.describe "Sandbox", type: :request do
  it "mounts the client on the sample manifest" do
    get sandbox_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('data-manifest-url="/modules/aces/manifest.json"')
  end

  it "mounts the client on a manifest from the query string" do
    get sandbox_path(manifest: "https://example.com/game/manifest.json")
    expect(response.body).to include('data-manifest-url="https://example.com/game/manifest.json"')
  end

  it "links a web app manifest, so phones offer to install the site" do
    get root_path
    expect(response.body).to include(%(rel="manifest" href="/manifest.json"))
    get pwa_manifest_path(format: :json)
    expect(response.parsed_body).to include("short_name" => "Tabletop", "display" => "standalone")
    expect(response.parsed_body["icons"].map { |icon| icon["sizes"] }).to include("192x192", "512x512")
  end
end
