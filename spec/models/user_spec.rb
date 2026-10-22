require "rails_helper"

RSpec.describe User do
  def sign_in(email = "Sam@Example.com ") = described_class.sign_in!(google_uid: "g1", email:, name: "Sam")

  it "lets anyone sign in while nobody is listed" do
    expect(sign_in).to have_attributes(email: "sam@example.com", name: "Sam", admin: false)
  end

  it "lets in only listed emails once anyone is listed" do
    AllowedEmail.create!(email: "eric@example.com")
    expect { sign_in }.to raise_error(User::NotAllowed)
    AllowedEmail.create!(email: "SAM@example.com")
    expect(sign_in.email).to eq("sam@example.com")
  end

  it "always lets an admin back in" do
    sign_in.update!(admin: true)
    AllowedEmail.create!(email: "eric@example.com")
    expect(sign_in).to be_admin
  end

  it "claims the anonymous games this browser hosted, up to the limit" do
    user = sign_in
    (User::MAX_GAMES - 1).times { |i| Game.create!(manifest_url: "https://example.com/m.json", name: "Mine #{i}", user:) }
    hosted = 2.times.map do |i|
      Game.start!(manifest_url: "https://example.com/m.json", name: "Hosted #{i}", host_name: "Sam", browser_token: "t", state: {}).first
    end
    Game.start!(manifest_url: "https://example.com/m.json", name: "Theirs", host_name: "Ana", browser_token: "other", state: {})
    expect(user.claim_hosted!("t")).to eq(1)
    expect(user.games.count).to eq(User::MAX_GAMES)
    expect(user.games).to include(hosted.last)
    expect(user).to be_at_game_limit
  end

  it "leaves an admin without a limit" do
    user = sign_in
    user.update!(admin: true)
    User::MAX_GAMES.times { |i| Game.create!(manifest_url: "https://example.com/m.json", name: "G#{i}", user:) }
    expect(user).not_to be_at_game_limit
  end
end
