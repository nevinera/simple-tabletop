# Google sign-in's settings, from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
# Without them the app runs with anonymous games only.
module GoogleSignIn
  def self.client_id = ENV["GOOGLE_CLIENT_ID"].presence

  def self.client_secret = ENV["GOOGLE_CLIENT_SECRET"].presence

  def self.configured? = !!(client_id && client_secret)
end
