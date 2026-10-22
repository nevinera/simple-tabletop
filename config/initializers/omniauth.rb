# Signing in with Google (see GoogleSignIn). The sign-in button posts to
# /auth/google_oauth2, and Google sends the browser back to
# /auth/google_oauth2/callback.
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2, GoogleSignIn.client_id, GoogleSignIn.client_secret, scope: "email,profile", prompt: "select_account"
end

OmniAuth.config.allowed_request_methods = [ :post ]
OmniAuth.config.logger = Rails.logger
