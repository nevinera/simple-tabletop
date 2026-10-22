namespace :games do
  desc "Delete every expired game"
  task sweep: :environment do
    puts "Deleted #{GameSweep.call} expired games."
  end
end

namespace :users do
  desc "Let an email sign in. Once anyone is listed, only listed emails can."
  task :allow, [ :email ] => :environment do |_task, args|
    AllowedEmail.find_or_create_by!(email: args.fetch(:email))
    puts "Allowed #{args[:email]}. Listed: #{AllowedEmail.pluck(:email).join(', ')}"
  end

  desc "Take an email off the sign-in list"
  task :disallow, [ :email ] => :environment do |_task, args|
    AllowedEmail.where(email: args.fetch(:email).strip.downcase).delete_all
    puts "Listed: #{AllowedEmail.pluck(:email).join(', ').presence || 'nobody, so anyone can sign in'}"
  end

  desc "Make a signed-in user an admin, with no game limit or expiry"
  task :admin, [ :email ] => :environment do |_task, args|
    user = User.find_by!(email: args.fetch(:email).strip.downcase)
    user.update!(admin: true)
    puts "#{user.email} is an admin."
  end
end
