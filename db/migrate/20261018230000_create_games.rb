class CreateGames < ActiveRecord::Migration[8.1]
  def change
    create_table :games do |t|
      t.string :invite_token, null: false, index: { unique: true }
      t.string :manifest_url, null: false
      t.string :name, null: false
      t.integer :sequence, null: false, default: 0
      t.string :seating, null: false, default: "four"
      t.boolean :table_locked, null: false, default: false
      t.timestamps
    end

    create_table :players do |t|
      t.references :game, null: false, foreign_key: true
      t.string :public_id, null: false
      t.string :name, null: false
      t.string :cookie_token, null: false, index: { unique: true }
      t.string :seat_key
      t.boolean :host, null: false, default: false
      t.datetime :seen_at
      t.timestamps
      t.index [ :game_id, :public_id ], unique: true
    end

    create_table :pieces do |t|
      t.references :game, null: false, foreign_key: true, index: false
      t.string :key, null: false
      t.float :x
      t.float :y
      t.float :rotation, null: false, default: 0
      t.boolean :face_up, null: false, default: true
      t.integer :stack_order, null: false, default: 0
      t.string :container_key
      t.string :held_by, index: true
      t.boolean :locked, null: false, default: false
      t.json :extras, null: false, default: {}
      t.index [ :game_id, :key ], unique: true
    end

    create_table :containers do |t|
      t.references :game, null: false, foreign_key: true, index: false
      t.string :key, null: false
      t.float :x
      t.float :y
      t.float :rotation, null: false, default: 0
      t.boolean :face_up, null: false, default: false
      t.json :member_keys, null: false, default: []
      t.string :held_by, index: true
      t.boolean :locked, null: false, default: false
      t.json :extras, null: false, default: {}
      t.index [ :game_id, :key ], unique: true
    end
  end
end
