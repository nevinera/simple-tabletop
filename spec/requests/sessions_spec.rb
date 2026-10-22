require "rails_helper"

RSpec.describe "Sessions", type: :request do
  let(:state) { { pieces: {}, containers: {} } }

  before do
    OmniAuth.config.test_mode = true
    OmniAuth.config.mock_auth[:google_oauth2] = OmniAuth::AuthHash.new(uid: "g1", info: { email: "sam@example.com", name: "Sam" })
  end

  after { OmniAuth.config.test_mode = false }

  def sign_in
    post "/auth/google_oauth2"
    follow_redirect!
  end

  def start_game(name = "Friday")
    post tables_path, params: { manifest_url: "https://example.com/m.json", name:, player_name: "Sam", state: }, as: :json
  end

  def account = JSON.parse(Nokogiri::HTML(response.body).at_css("#app")["data-account"])

  def tables_listed = JSON.parse(Nokogiri::HTML(response.body).at_css("#app")["data-tables"])

  it "signs in with Google and takes on the tables this browser hosted" do
    start_game
    sign_in
    follow_redirect!
    expect(account["user"]).to include("name" => "Sam", "email" => "sam@example.com", "admin" => false)
    expect(Game.sole.user).to eq(User.sole)
    expect(tables_listed.sole).to include("owned" => true)
  end

  it "turns away someone the allowlist leaves out" do
    AllowedEmail.create!(email: "eric@example.com")
    sign_in
    follow_redirect!
    expect(account).to include("user" => nil, "alert" => "sam@example.com isn't on the list of people who can sign in.")
  end

  it "gives a signed-in host's tables to them, up to the limit" do
    sign_in
    User::MAX_GAMES.times { |i| start_game("G#{i}") }
    expect(User.sole.games.count).to eq(User::MAX_GAMES)
    start_game("One too many")
    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to include("Delete one")
  end

  it "lets only the owner delete a table" do
    start_game
    game = Game.sole
    delete table_path(game)
    expect(response).to have_http_status(:forbidden)
    sign_in
    delete table_path(game)
    expect(response).to have_http_status(:no_content)
    expect(Game.count).to eq(0)
  end

  it "signs out" do
    sign_in
    delete sign_out_path
    follow_redirect!
    expect(account["user"]).to be_nil
  end
end
