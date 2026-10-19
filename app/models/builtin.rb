# A game that ships with the app: a module in public/builtins/<slug>/, listed
# in config/builtins.yml.
Builtin = Data.define(:slug, :name, :description, :thumbnail) do
  def self.config_path = Rails.root.join("config/builtins.yml")

  # In the file's order. Read fresh each time, since it's small and edits
  # should show up without a restart.
  def self.all = YAML.load_file(config_path).map { |entry| new(**entry.symbolize_keys) }

  def directory = Rails.public_path.join("builtins", slug)

  def manifest_url = "/builtins/#{slug}/manifest.json"

  def thumbnail_url = "/builtins/#{slug}/#{thumbnail}"

  def to_client = { slug:, name:, description:, url: manifest_url, thumbnailUrl: thumbnail_url }
end
