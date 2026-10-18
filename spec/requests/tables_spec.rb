require "rails_helper"

RSpec.describe "Tables", type: :request do
  it "renders the client mount point" do
    get root_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('<div id="app"></div>')
  end
end
