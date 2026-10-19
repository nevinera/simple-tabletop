Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest

  resources :tables, only: %i[create show] do
    get :state, on: :member
    resources :players, only: :create
  end

  get "sandbox" => "sandbox#show"
  root "home#show"
end
