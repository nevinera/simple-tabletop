require "rails_helper"

RSpec.describe GameLifetime do
  let(:now) { Time.current }
  let(:user) { User.create!(google_uid: "1", email: "sam@example.com", name: "Sam") }
  let(:admin) { User.create!(google_uid: "2", email: "eric@example.com", name: "Eric", admin: true) }

  def game(created:, active:, user: nil)
    Game.create!(manifest_url: "https://example.com/m.json", name: "G", user:, created_at: now - created, active_at: now - active)
  end

  it "expires anonymous games after 6 idle hours or 72 in all" do
    fresh = game(created: 70.hours, active: 5.hours)
    idle = game(created: 7.hours, active: 7.hours)
    old = game(created: 73.hours, active: 1.minute)
    expect(described_class.expired(now:)).to contain_exactly(idle, old)
    expect(fresh.expires_at).to be_within(1.second).of(now + 1.hour)
  end

  it "keeps a user's games for 72 idle hours, up to 3 months" do
    fresh = game(created: 2.months, active: 71.hours, user:)
    idle = game(created: 4.days, active: 73.hours, user:)
    old = game(created: 3.months + 1.day, active: 1.minute, user:)
    expect(described_class.expired(now:)).to contain_exactly(idle, old)
    expect(fresh.expires_at).to be_within(1.second).of(now + 1.hour)
  end

  it "never expires an admin's games" do
    kept = game(created: 1.year, active: 1.year, user: admin)
    expect(described_class.expired(now:)).to be_empty
    expect(kept.expires_at).to be_nil
  end

  it "falls back to the last update for games from before active_at" do
    old = game(created: 7.hours, active: 0)
    old.update_columns(active_at: nil, updated_at: now - 7.hours)
    expect(described_class.expired(now:)).to contain_exactly(old)
  end

  it "sweeps expired games with their players and pieces" do
    gone, = Game.start!(manifest_url: "https://example.com/m.json", name: "G", host_name: "Sam", browser_token: "t",
                        state: { pieces: { "AS" => { x: 1, y: 1, rotation: 0, faceUp: true, stackOrder: 0, locked: false } }, containers: {} })
    gone.update_columns(active_at: now - 7.hours)
    kept = game(created: 1.hour, active: 1.hour)
    expect(GameSweep.call(now:)).to eq(1)
    expect(Game.all).to contain_exactly(kept)
    expect([ Player.count, Piece.count ]).to eq([ 0, 0 ])
  end
end
