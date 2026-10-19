require "rails_helper"

RSpec.describe "Tables", type: :request do
  let(:state) do
    {
      sequence: 0,
      seating: "four",
      players: {},
      pieces: {
        "AS" => { x: 10, y: 20, rotation: 90, faceUp: true, stackOrder: 0, containerId: nil, heldBy: nil, drag: nil, locked: false },
        "d6" => { x: 5, y: 5, rotation: 0, faceUp: true, stackOrder: 1, containerId: nil, heldBy: nil, drag: nil, locked: false,
                  value: 3, rolls: 0 },
        "KS" => { x: nil, y: nil, rotation: 0, faceUp: false, stackOrder: 2, containerId: "deck", heldBy: nil, drag: nil, locked: false }
      },
      containers: {
        "deck" => { x: 60, y: 60, rotation: 0, faceUp: false, members: [ "KS" ], heldBy: nil, drag: nil, locked: false,
                    splay: nil, splayDistance: nil }
      }
    }
  end

  def start_game(**overrides)
    post tables_path, params: { manifest_url: "https://example.com/m.json", name: "Friday", player_name: "Sam", state:, **overrides }, as: :json
  end

  it "starts a game with the host as its first player" do
    start_game
    expect(response).to have_http_status(:created)
    game = Game.last
    expect(response.parsed_body["path"]).to eq(table_path(game))
    expect(game.players.sole).to have_attributes(name: "Sam", host: true)
    expect(game.pieces.find_by(key: "d6")).to have_attributes(x: 5, extras: { "value" => 3, "rolls" => 0 })
  end

  it "hands back the starting state in the client's shape" do
    start_game
    get state_table_path(Game.last)
    body = response.parsed_body
    expect(body).to include("sequence" => 0, "seating" => "four", "players" => {})
    expect(body["roster"]).to contain_exactly(include("name" => "Sam", "host" => true))
    expect(body["pieces"]).to eq(state[:pieces].deep_stringify_keys)
    expect(body["containers"]).to eq(state[:containers].deep_stringify_keys)
  end

  it "remembers the host's browser" do
    start_game
    get table_path(Game.last)
    expect(response.body).to include(%(data-player-name="Sam"))
  end

  it "refuses a manifest that isn't on the web" do
    start_game(manifest_url: "file:///etc/passwd")
    expect(response).to have_http_status(:unprocessable_content)
    expect(Game.count).to eq(0)
  end

  it "lets a new player join from the invite link" do
    start_game
    game = Game.last
    cookies.delete("browser_token")
    get table_path(game)
    expect(response.body).not_to include("data-player-id")
    expect { post table_players_path(game), params: { name: "Alex" }, as: :json }.to have_broadcasted_to(game).from_channel(GameChannel)
      .with(hash_including("type" => "roster", "roster" => [ include("name" => "Sam"), include("name" => "Alex") ]))
    expect(response.parsed_body).to include("name" => "Alex", "host" => false)
    get table_path(game)
    expect(response.body).to include(%(data-player-name="Alex"))
  end

  it "gives a table a ULID, in either case" do
    start_game
    game = Game.last
    expect(game.ulid).to match(/\A[0-9A-HJKMNP-TV-Z]{26}\z/)
    get table_path(game.ulid.downcase)
    expect(response).to have_http_status(:ok)
  end

  it "keeps one cookie per browser, however many tables it joins" do
    start_game
    start_game(name: "Saturday")
    expect(Player.distinct.count(:browser_token)).to eq(1)
    expect(response.headers["Set-Cookie"].to_s).not_to include("browser_token")
  end

  it "hands back the same player when a browser joins twice" do
    start_game
    game = Game.last
    expect { post table_players_path(game), params: { name: "Sam again" }, as: :json }.not_to change(Player, :count)
    expect(response.parsed_body).to include("name" => "Sam", "host" => true)
  end

  it "shows nothing for an unknown invite" do
    get table_path("nope")
    expect(response).to have_http_status(:not_found)
  end
end
