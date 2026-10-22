Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest

  get "auth/google_oauth2/callback" => "sessions#create"
  get "auth/failure" => "sessions#failure"
  delete "sign_out" => "sessions#destroy"

  resources :tables, only: %i[create show destroy] do
    get :state, on: :member
    resources :players, only: :create
  end

  get "sandbox" => "sandbox#show"
  root "home#show"
end
