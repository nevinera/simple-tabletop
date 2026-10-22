# Signed-in users, the emails allowed to sign in, and who owns each game.
# A game's active_at starts at its last update, so existing games keep the
# time they were last touched. It stays nullable because making it not null
# would rebuild the games table, and the live database has no backups. For
# the same reason, user_id has no foreign key; User nulls it on destroy.
class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :google_uid, null: false
      t.string :email, null: false
      t.string :name, null: false
      t.boolean :admin, default: false, null: false
      t.timestamps
      t.index :google_uid, unique: true
      t.index :email, unique: true
    end

    create_table :allowed_emails do |t|
      t.string :email, null: false
      t.timestamps
      t.index :email, unique: true
    end

    add_reference :games, :user
    add_column :games, :active_at, :datetime
    up_only { execute "UPDATE games SET active_at = updated_at" }
    add_index :games, :active_at
  end
end
