FROM ruby:3.1.4

RUN apt-get update -qq && apt-get install -y \
    nodejs \
    npm \
    build-essential \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Gemfile and install gems
COPY Gemfile ./
RUN bundle config set --local deployment false && \
    bundle install --jobs 4 --retry 3

# Copy the entire application
COPY . .

EXPOSE 3000

# Create startup script
RUN echo '#!/bin/bash\n\
echo "Checking if Rails app is initialized..."\n\
\n\
if [ ! -f config/application.rb ]; then\n\
  echo "Creating new Rails app..."\n\
  rails new . --force --skip-active-record --skip-test --skip-system-test\n\
  \n\
  # Ensure mongoid is in Gemfile\n\
  echo "gem '"'"'mongoid'"'"', '"'"'~> 7.5.1'"'"'" >> Gemfile\n\
  \n\
  # Install gems\n\
  bundle install\n\
  \n\
  # Generate mongoid config\n\
  rails g mongoid:config\n\
fi\n\
\n\
# Use the pre-configured mongoid.yml\n\
cp config/mongoid.yml config/mongoid.yml.backup 2>/dev/null || true\n\
cat > config/mongoid.yml << "YAML"\n\
development:\n\
  clients:\n\
    default:\n\
      database: todo_development\n\
      hosts:\n\
        - mongodb:27017\n\
      options:\n\
        server_selection_timeout: 5\n\
        user: admin\n\
        password: password123\n\
        auth_source: admin\n\
YAML\n\
\n\
# Wait for MongoDB to be ready\n\
echo "Waiting for MongoDB to be ready..."\n\
for i in {1..30}; do\n\
  if nc -z mongodb 27017 2>/dev/null; then\n\
    echo "MongoDB is ready!"\n\
    break\n\
  fi\n\
  echo "Attempt $i/30: MongoDB not ready yet..."\n\
  sleep 2\n\
done\n\
\n\
# Create the Todo model if it doesn'"'"'t exist\n\
if [ ! -f app/models/todo.rb ]; then\n\
  echo "Creating Todo model and controller..."\n\
  \n\
  # Create Todo model\n\
  cat > app/models/todo.rb << "MODEL"\n\
class Todo\n\
  include Mongoid::Document\n\
  include Mongoid::Timestamps\n\
\n\
  field :title, type: String\n\
  field :completed, type: Boolean, default: false\n\
\n\
  validates :title, presence: true\n\
  index({ created_at: -1 })\n\
end\n\
MODEL\n\
\n\
  # Create controller\n\
  cat > app/controllers/todos_controller.rb << "CONTROLLER"\n\
class TodosController < ApplicationController\n\
  def index\n\
    @todos = Todo.order(created_at: :desc)\n\
    @todo = Todo.new\n\
  end\n\
\n\
  def create\n\
    @todo = Todo.new(todo_params)\n\
    if @todo.save\n\
      redirect_to root_path, notice: "Todo created successfully!"\n\
    else\n\
      @todos = Todo.order(created_at: :desc)\n\
      render :index\n\
    end\n\
  end\n\
\n\
  def update\n\
    @todo = Todo.find(params[:id])\n\
    @todo.update(todo_params)\n\
    redirect_to root_path, notice: "Todo updated!"\n\
  end\n\
\n\
  def destroy\n\
    @todo = Todo.find(params[:id])\n\
    @todo.destroy\n\
    redirect_to root_path, notice: "Todo deleted!"\n\
  end\n\
\n\
  private\n\
\n\
  def todo_params\n\
    params.require(:todo).permit(:title, :completed)\n\
  end\n\
end\n\
CONTROLLER\n\
\n\
  # Create the view\n\
  mkdir -p app/views/todos\n\
  cat > app/views/todos/index.html.erb << "VIEW"\n\
<!DOCTYPE html>\n\
<html>\n\
<head>\n\
  <title>Todo App</title>\n\
  <meta name="viewport" content="width=device-width,initial-scale=1">\n\
  <style>\n\
    * { margin: 0; padding: 0; box-sizing: border-box; }\n\
    body {\n\
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;\n\
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n\
      min-height: 100vh;\n\
      padding: 20px;\n\
    }\n\
    .container {\n\
      max-width: 600px;\n\
      margin: 0 auto;\n\
      background: white;\n\
      border-radius: 20px;\n\
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);\n\
      overflow: hidden;\n\
    }\n\
    .header {\n\
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n\
      color: white;\n\
      padding: 30px;\n\
      text-align: center;\n\
    }\n\
    .header h1 { font-size: 2em; margin-bottom: 10px; }\n\
    .header p { opacity: 0.9; }\n\
    .content { padding: 30px; }\n\
    .notice {\n\
      background: #10b981;\n\
      color: white;\n\
      padding: 12px;\n\
      border-radius: 8px;\n\
      margin-bottom: 20px;\n\
      text-align: center;\n\
      animation: slideDown 0.3s ease-out;\n\
    }\n\
    @keyframes slideDown {\n\
      from { opacity: 0; transform: translateY(-20px); }\n\
      to { opacity: 1; transform: translateY(0); }\n\
    }\n\
    .todo-form {\n\
      display: flex;\n\
      gap: 10px;\n\
      margin-bottom: 30px;\n\
    }\n\
    .todo-form input {\n\
      flex: 1;\n\
      padding: 12px;\n\
      border: 2px solid #e5e7eb;\n\
      border-radius: 10px;\n\
      font-size: 16px;\n\
      transition: all 0.3s;\n\
    }\n\
    .todo-form input:focus {\n\
      outline: none;\n\
      border-color: #667eea;\n\
      box-shadow: 0 0 0 3px rgba(102,126,234,0.1);\n\
    }\n\
    .todo-form button {\n\
      padding: 12px 24px;\n\
      background: #667eea;\n\
      color: white;\n\
      border: none;\n\
      border-radius: 10px;\n\
      cursor: pointer;\n\
      font-size: 16px;\n\
      font-weight: 600;\n\
      transition: all 0.3s;\n\
    }\n\
    .todo-form button:hover {\n\
      background: #5a67d8;\n\
      transform: translateY(-2px);\n\
    }\n\
    .todo-item {\n\
      display: flex;\n\
      align-items: center;\n\
      gap: 15px;\n\
      padding: 15px;\n\
      background: #f9fafb;\n\
      border-radius: 10px;\n\
      margin-bottom: 10px;\n\
      transition: all 0.3s;\n\
    }\n\
    .todo-item:hover {\n\
      background: #f3f4f6;\n\
      transform: translateX(5px);\n\
    }\n\
    .todo-checkbox {\n\
      width: 22px;\n\
      height: 22px;\n\
      cursor: pointer;\n\
    }\n\
    .todo-title {\n\
      flex: 1;\n\
      font-size: 16px;\n\
      color: #374151;\n\
    }\n\
    .completed .todo-title {\n\
      text-decoration: line-through;\n\
      color: #9ca3af;\n\
    }\n\
    .delete-btn {\n\
      background: #ef4444;\n\
      color: white;\n\
      border: none;\n\
      padding: 6px 12px;\n\
      border-radius: 6px;\n\
      cursor: pointer;\n\
      transition: all 0.3s;\n\
    }\n\
    .delete-btn:hover {\n\
      background: #dc2626;\n\
      transform: scale(1.05);\n\
    }\n\
    .empty-state {\n\
      text-align: center;\n\
      padding: 60px 20px;\n\
      color: #9ca3af;\n\
    }\n\
    .empty-state div { font-size: 48px; margin-bottom: 10px; }\n\
    .counter {\n\
      margin-top: 20px;\n\
      padding-top: 20px;\n\
      border-top: 2px solid #e5e7eb;\n\
      text-align: center;\n\
      color: #6b7280;\n\
      font-size: 14px;\n\
    }\n\
    .mongo-link {\n\
      margin-top: 20px;\n\
      text-align: center;\n\
    }\n\
    .mongo-link a {\n\
      color: #667eea;\n\
      text-decoration: none;\n\
      font-size: 14px;\n\
    }\n\
    .mongo-link a:hover {\n\
      text-decoration: underline;\n\
    }\n\
  </style>\n\
</head>\n\
<body>\n\
<div class="container">\n\
  <div class="header">\n\
    <h1>📝 Todo List</h1>\n\
    <p>Stay organized and get things done!</p>\n\
  </div>\n\
  <div class="content">\n\
    <% if notice %>\n\
      <div class="notice"><%= notice %></div>\n\
    <% end %>\n\
    \n\
    <%= form_with model: @todo, local: true, class: "todo-form" do |f| %>\n\
      <%= f.text_field :title, placeholder: "What needs to be done?", autofocus: true %>\n\
      <%= f.submit "➕ Add Task" %>\n\
    <% end %>\n\
    \n\
    <% if @todos.empty? %>\n\
      <div class="empty-state">\n\
        <div>✨</div>\n\
        <p>No tasks yet! Add one above to get started.</p>\n\
      </div>\n\
    <% else %>\n\
      <% @todos.each do |todo| %>\n\
        <div class="todo-item <%= "completed" if todo.completed %>">\n\
          <%= form_with model: todo, local: true, style: "margin: 0; display: flex; align-items: center; gap: 15px; flex: 1;" do |f| %>\n\
            <%= f.check_box :completed, class: "todo-checkbox", onchange: "this.form.submit()" %>\n\
            <span class="todo-title"><%= todo.title %></span>\n\
          <% end %>\n\
          <%= button_to "🗑 Delete", todo, method: :delete, class: "delete-btn" %>\n\
        </div>\n\
      <% end %>\n\
      <div class="counter">\n\
        📊 <%= @todos.count %> total | ✅ <%= @todos.where(completed: true).count %> completed\n\
      </div>\n\
    <% end %>\n\
    \n\
    <div class="mongo-link">\n\
      <a href="http://localhost:8081" target="_blank">🗄️ View Database in Mongo Express</a>\n\
    </div>\n\
  </div>\n\
</div>\n\
</body>\n\
</html>\n\
VIEW\n\
\n\
  # Configure routes\n\
  cat > config/routes.rb << "ROUTES"\n\
Rails.application.routes.draw do\n\
  root "todos#index"\n\
  resources :todos, only: [:index, :create, :update, :destroy]\n\
end\n\
ROUTES\n\
\n\
  # Configure application controller\n\
  cat > app/controllers/application_controller.rb << "APP_CONTROLLER"\n\
class ApplicationController < ActionController::Base\n\
  skip_before_action :verify_authenticity_token\n\
end\n\
APP_CONTROLLER\n\
\n\
  # Create layout\n\
  cat > app/views/layouts/application.html.erb << "LAYOUT"\n\
<!DOCTYPE html>\n\
<html>\n\
<head>\n\
  <title>Todo App</title>\n\
  <meta name="viewport" content="width=device-width,initial-scale=1">\n\
  <%= csrf_meta_tags %>\n\
  <%= csp_meta_tag %>\n\
</head>\n\
<body>\n\
  <%= yield %>\n\
</body>\n\
</html>\n\
LAYOUT\n\
\n\
  echo "✅ Rails app initialization complete!"\n\
fi\n\
\n\
# Start Rails server\n\
echo "🚀 Starting Rails server on http://localhost:3000"\n\
rails server -b 0.0.0.0\n\
' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
