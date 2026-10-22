require "rails_helper"

RSpec.describe GameChannel, type: :channel do
  let(:piece) { { "x" => 10, "y" => 20, "rotation" => 0, "faceUp" => true, "stackOrder" => 0, "containerId" => nil, "heldBy" => nil, "drag" => nil, "locked" => false } }
  let(:started) do
    Game.start!(manifest_url: "https://example.com/m.json", name: "Friday", host_name: "Sam", browser_token: "sams-browser",
                state: { pieces: { "AS" => piece, "KS" => piece.merge("x" => 30) }, containers: {} })
  end
  let(:game) { started.first }
  let(:host) { started.last }

  def subscribe_as(player)
    stub_connection
    # The stub connection has no cookies, so it stands in for finding the player by cookie.
    connection.define_singleton_method(:current_player) { |_game| player }
    subscribe(game: game.ulid.downcase)
  end

  def act(base:, rows:, action: { "type" => "grab", "id" => "AS" })
    perform :act, actionId: "a1", base:, tableAction: action, rows:
  end

  it "turns away a browser without a player in the game" do
    subscribe_as(nil)
    expect(subscription).to be_rejected
  end

  it "keeps the game alive when someone sits down or plays" do
    game.update_columns(active_at: 2.hours.ago)
    subscribe_as(host)
    expect(game.reload.active_at).to be_within(5.seconds).of(Time.current)
    game.update_columns(active_at: 2.hours.ago)
    act(base: 0, rows: { "pieces" => { "AS" => piece } })
    expect(game.reload.active_at).to be_within(5.seconds).of(Time.current)
  end

  it "sends a snapshot on subscribing" do
    subscribe_as(host)
    expect(transmissions.last).to include("type" => "snapshot", "sequence" => 0)
    expect(transmissions.last["pieces"].keys).to contain_exactly("AS", "KS")
  end

  it "saves a change made against the newest state and sends it to everyone" do
    subscribe_as(host)
    rows = { "pieces" => { "AS" => piece.merge("heldBy" => host.public_id), "KS" => nil }, "players" => { host.public_id => { "seatId" => "south" } },
             "seating" => "eight" }
    expect { act(base: 0, rows:) }.to have_broadcasted_to(game).from_channel(GameChannel).with(
      hash_including("type" => "change", "sequence" => 1, "actor" => host.public_id, "actionId" => "a1", "rows" => rows)
    )
    game.reload
    expect(game).to have_attributes(sequence: 1, seating: "eight")
    expect(game.pieces.find_by(key: "AS").held_by).to eq(host.public_id)
    expect(game.pieces.find_by(key: "KS")).to be_nil
    expect(host.reload.seat_key).to eq("south")
  end

  it "refuses a change made against an old state" do
    subscribe_as(host)
    act(base: 0, rows: { "pieces" => { "AS" => piece.merge("x" => 1) } })
    expect { act(base: 0, rows: { "pieces" => { "AS" => piece.merge("x" => 2) } }) }.not_to have_broadcasted_to(game)
    expect(transmissions.last).to include("type" => "refused", "actionId" => "a1", "sequence" => 1)
    expect(game.pieces.find_by(key: "AS").x).to eq(1)
  end

  it "passes drags to the game" do
    subscribe_as(host)
    expect { perform :drag, id: "AS", x: 5, y: 6 }.to have_broadcasted_to(game).with(
      "type" => "drag", "id" => "AS", "x" => 5, "y" => 6, "actor" => host.public_id
    )
  end

  it "boots the player's older connection" do
    subscribe_as(host)
    expect { subscribe_as(host) }.to have_broadcasted_to(host).with(hash_including("type" => "connected"))
  end

  it "lets go of what quiet players hold when someone pings" do
    alex = game.players.create!(name: "Alex", browser_token: "alexs-browser")
    game.pieces.find_by(key: "AS").update!(held_by: alex.public_id)
    alex.update!(seen_at: 31.seconds.ago)
    subscribe_as(host)
    expect { perform :ping }.to have_broadcasted_to(game).with(
      hash_including("type" => "change", "sequence" => 1, "actor" => nil, "rows" => hash_including("pieces" => { "AS" => hash_including("heldBy" => nil) }))
    )
    expect(game.pieces.find_by(key: "AS").held_by).to be_nil
    expect { perform :ping }.not_to have_broadcasted_to(game)
  end

  it "leaves holds alone while their players are around" do
    game.pieces.find_by(key: "AS").update!(held_by: host.public_id)
    subscribe_as(host)
    expect { perform :ping }.not_to have_broadcasted_to(game)
  end
end
