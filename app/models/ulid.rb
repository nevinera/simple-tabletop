# Sortable unique ids: 48 bits of milliseconds, then 80 random bits, in
# Crockford's base32. 26 characters, and too random to guess.
module Ulid
  ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".freeze

  def self.generate(time = Time.current)
    value = ((time.to_r * 1000).to_i << 80) | SecureRandom.random_number(1 << 80)
    Array.new(26) { |i| ALPHABET[(value >> (5 * (25 - i))) & 31] }.join
  end
end
