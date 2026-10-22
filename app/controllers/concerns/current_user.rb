# Who's signed in on this browser, if anyone, kept in the Rails session.
module CurrentUser
  extend ActiveSupport::Concern

  included { helper_method :current_user }

  private

  def current_user
    return @current_user if defined?(@current_user)

    @current_user = session[:user_id] && User.find_by(id: session[:user_id])
  end

  def sign_in(user)
    reset_session
    session[:user_id] = user.id
    @current_user = user
  end

  def sign_out
    reset_session
    @current_user = nil
  end

  # Whether Google sign-in is set up on this server.
  def sign_in_available? = GoogleSignIn.configured?
end
