require "rails_helper"

RSpec.describe "Games", type: :request do
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
    post games_path, params: { manifest_url: "https://example.com/m.json", name: "Friday", player_name: "Sam", state:, **overrides }, as: :json
  end

  it "starts a game with the host as its first player" do
    start_game
    expect(response).to have_http_status(:created)
    game = Game.last
    expect(response.parsed_body["path"]).to eq(game_path(game))
    expect(game.players.sole).to have_attributes(name: "Sam", host: true)
    expect(game.pieces.find_by(key: "d6")).to have_attributes(x: 5, extras: { "value" => 3, "rolls" => 0 })
  end

  it "hands back the starting state in the client's shape" do
    start_game
    get state_game_path(Game.last)
    body = response.parsed_body
    expect(body).to include("sequence" => 0, "seating" => "four", "players" => {})
    expect(body["roster"]).to contain_exactly(include("name" => "Sam", "host" => true))
    expect(body["pieces"]).to eq(state[:pieces].deep_stringify_keys)
    expect(body["containers"]).to eq(state[:containers].deep_stringify_keys)
  end

  it "remembers the host's browser" do
    start_game
    get game_path(Game.last)
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
    cookies.delete("player_#{game.id}")
    get game_path(game)
    expect(response.body).not_to include("data-player-id")
    expect { post game_players_path(game), params: { name: "Alex" }, as: :json }.to have_broadcasted_to(game).from_channel(GameChannel)
      .with(hash_including("type" => "roster", "roster" => [ include("name" => "Sam"), include("name" => "Alex") ]))
    expect(response.parsed_body).to include("name" => "Alex", "host" => false)
    get game_path(game)
    expect(response.body).to include(%(data-player-name="Alex"))
  end

  it "shows nothing for an unknown invite" do
    get game_path("nope")
    expect(response).to have_http_status(:not_found)
  end
end
