# Tables get ULIDs instead of invite tokens, and a browser keeps one cookie
# for every table it joins instead of one per table.
class KeyPlayersByBrowser < ActiveRecord::Migration[8.1]
  def change
    rename_column :games, :invite_token, :ulid
    remove_index :players, :cookie_token, unique: true
    rename_column :players, :cookie_token, :browser_token
    add_index :players, [ :browser_token, :game_id ], unique: true
  end
end
