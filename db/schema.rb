# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_22_000000) do
  create_table "allowed_emails", force: :cascade do |t|
    t.string "email", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_allowed_emails_on_email", unique: true
  end

  create_table "containers", force: :cascade do |t|
    t.integer "game_id", null: false
    t.string "key", null: false
    t.float "x"
    t.float "y"
    t.float "rotation", default: 0.0, null: false
    t.boolean "face_up", default: false, null: false
    t.json "member_keys", default: [], null: false
    t.string "held_by"
    t.boolean "locked", default: false, null: false
    t.json "extras", default: {}, null: false
    t.index ["game_id", "key"], name: "index_containers_on_game_id_and_key", unique: true
    t.index ["held_by"], name: "index_containers_on_held_by"
  end

  create_table "games", force: :cascade do |t|
    t.string "ulid", null: false
    t.string "manifest_url", null: false
    t.string "name", null: false
    t.integer "sequence", default: 0, null: false
    t.string "seating", default: "four", null: false
    t.boolean "table_locked", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id"
    t.datetime "active_at"
    t.index ["active_at"], name: "index_games_on_active_at"
    t.index ["ulid"], name: "index_games_on_ulid", unique: true
    t.index ["user_id"], name: "index_games_on_user_id"
  end

  create_table "pieces", force: :cascade do |t|
    t.integer "game_id", null: false
    t.string "key", null: false
    t.float "x"
    t.float "y"
    t.float "rotation", default: 0.0, null: false
    t.boolean "face_up", default: true, null: false
    t.integer "stack_order", default: 0, null: false
    t.string "container_key"
    t.string "held_by"
    t.boolean "locked", default: false, null: false
    t.json "extras", default: {}, null: false
    t.index ["game_id", "key"], name: "index_pieces_on_game_id_and_key", unique: true
    t.index ["held_by"], name: "index_pieces_on_held_by"
  end

  create_table "players", force: :cascade do |t|
    t.integer "game_id", null: false
    t.string "public_id", null: false
    t.string "name", null: false
    t.string "browser_token", null: false
    t.string "seat_key"
    t.boolean "host", default: false, null: false
    t.datetime "seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["browser_token", "game_id"], name: "index_players_on_browser_token_and_game_id", unique: true
    t.index ["game_id", "public_id"], name: "index_players_on_game_id_and_public_id", unique: true
    t.index ["game_id"], name: "index_players_on_game_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "google_uid", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  add_foreign_key "containers", "games"
  add_foreign_key "pieces", "games"
  add_foreign_key "players", "games"
end
