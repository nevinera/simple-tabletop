# Who can sign in. With nobody listed, anyone with a Google account can.
class AllowedEmail < ApplicationRecord
  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: true

  def self.allows?(email) = none? || exists?(email: email.to_s.strip.downcase)
end
