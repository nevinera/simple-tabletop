require "rails_helper"

RSpec.describe Builtin do
  it "lists the games in config/builtins.yml, in order" do
    expect(described_class.all.map(&:slug)).to start_with("checkers")
  end

  described_class.all.each do |builtin|
    describe builtin.slug do
      it "has a manifest whose id matches its slug" do
        manifest = JSON.parse(builtin.directory.join("manifest.json").read)
        expect(manifest).to include("formatVersion" => 1, "id" => builtin.slug)
      end

      it "has its thumbnail, a name, and a description" do
        expect(builtin.directory.join(builtin.thumbnail)).to exist
        expect(builtin.name).to be_present
        expect(builtin.description).to be_present
      end
    end
  end
end
