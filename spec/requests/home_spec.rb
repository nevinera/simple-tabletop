require "rails_helper"

RSpec.describe "Home", type: :request do
  def tables_listed
    JSON.parse(Nokogiri::HTML(response.body).at_css("#app")["data-tables"])
  end

  it "lists no tables for a new browser" do
    get root_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('data-page="home"')
    expect(tables_listed).to eq([])
  end

  it "lists the tables this browser joined, newest visit first" do
    %w[Friday Saturday].each do |name|
      post tables_path, params: { manifest_url: "https://example.com/m.json", name:, player_name: "Sam", state: { pieces: {}, containers: {} } }, as: :json
    end
    Game.find_by(name: "Friday").players.sole.update!(seen_at: 1.minute.ago)
    Game.find_by(name: "Saturday").players.sole.update!(seen_at: 1.hour.ago)
    get root_path
    expect(tables_listed).to match([
      include("name" => "Friday", "playerName" => "Sam", "path" => table_path(Game.find_by(name: "Friday"))),
      include("name" => "Saturday")
    ])
  end
end
