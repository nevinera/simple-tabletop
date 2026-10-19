Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest

  resources :games, only: %i[create show] do
    get :state, on: :member
    resources :players, only: :create
  end

  root "tables#show"
end
