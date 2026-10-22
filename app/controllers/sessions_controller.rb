# Signing in with Google and out again. Signing in takes on the anonymous
# games this browser hosted, so they last as long as the user's own.
class SessionsController < ApplicationController
  include PlayerCookie

  def create
    auth = request.env.fetch("omniauth.auth")
    user = User.sign_in!(google_uid: auth.uid, email: auth.info.email, name: auth.info.name)
    sign_in(user)
    user.claim_hosted!(browser_token)
    redirect_to root_path
  rescue User::NotAllowed => e
    redirect_to root_path, alert: e.message
  end

  def failure
    redirect_to root_path, alert: "Signing in didn't work: #{params[:message].to_s.humanize.downcase}."
  end

  def destroy
    sign_out
    redirect_to root_path
  end
end
