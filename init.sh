#!/bin/bash

# Wait for MongoDB to be ready
echo "Waiting for MongoDB..."
sleep 5

# Create new Rails app if it doesn't exist
if [ ! -f "config/application.rb" ]; then
  echo "Creating new Rails app..."
  rails new . --force --skip-active-record --skip-bundle --skip-javascript --skip-turbolinks
  
  # Add mongoid to Gemfile
  echo "gem 'mongoid', '~> 7.5.2'" >> Gemfile
  
  # Install gems
  bundle install
  
  # Generate mongoid config
  rails g mongoid:config
fi

# Start Rails server
rails server -b 0.0.0.0
