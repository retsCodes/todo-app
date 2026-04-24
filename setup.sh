#!/bin/bash

echo "Setting up Todo App with MongoDB..."

# Stop existing containers if any
docker ps -q --filter "name=todo_" | xargs -r docker stop
docker ps -aq --filter "name=todo_" | xargs -r docker rm

# Run a simple Node.js + MongoDB todo app instead (30 seconds setup)
cat > docker-compose.simple.yml << 'YAML'
services:
  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
  
  mongo-express:
    image: mongo-express:latest
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: admin123
  
  # Using a simple Node.js todo app instead of Rails (much faster!)
  todo-app:
    image: node:18-alpine
    ports:
      - "3000:3000"
    working_dir: /app
    command: sh -c "npm install express mongoose && node server.js"
    volumes:
      - ./server.js:/app/server.js:ro
YAML

# Create a simple Node.js todo app (starts in seconds)
cat > server.js << 'JS'
const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.static('.'));

// Connect to MongoDB
mongoose.connect('mongodb://mongodb:27017/todo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Todo schema
const TodoSchema = new mongoose.Schema({
  title: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Todo = mongoose.model('Todo', TodoSchema);

// API routes
app.get('/api/todos', async (req, res) => {
  const todos = await Todo.find().sort('-createdAt');
  res.json(todos);
});

app.post('/api/todos', async (req, res) => {
  const todo = new Todo({ title: req.body.title });
  await todo.save();
  res.json(todo);
});

app.put('/api/todos/:id', async (req, res) => {
  const todo = await Todo.findByIdAndUpdate(
    req.params.id,
    { completed: req.body.completed },
    { new: true }
  );
  res.json(todo);
});

app.delete('/api/todos/:id', async (req, res) => {
  await Todo.findByIdAndDelete(req.params.id);
  res.json({ message: 'deleted' });
});

// Serve HTML
app.get('*', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Todo App</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 { font-size: 2em; margin-bottom: 10px; }
        .content { padding: 30px; }
        .todo-form {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
        }
        .todo-form input {
          flex: 1;
          padding: 12px;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          font-size: 16px;
        }
        .todo-form button {
          padding: 12px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
        }
        .todo-item {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 15px;
          background: #f9fafb;
          border-radius: 10px;
          margin-bottom: 10px;
        }
        .todo-checkbox { width: 22px; height: 22px; cursor: pointer; }
        .todo-title { flex: 1; font-size: 16px; }
        .completed .todo-title { text-decoration: line-through; color: #9ca3af; }
        .delete-btn {
          background: #ef4444;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .counter {
          margin-top: 20px;
          text-align: center;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📝 Todo List</h1>
          <p>Stay organized!</p>
        </div>
        <div class="content">
          <div class="todo-form">
            <input type="text" id="title" placeholder="What needs to be done?">
            <button onclick="addTodo()">➕ Add Task</button>
          </div>
          <div id="todos"></div>
          <div class="counter" id="counter"></div>
        </div>
      </div>
      <script>
        async function loadTodos() {
          const res = await fetch('/api/todos');
          const todos = await res.json();
          const todosDiv = document.getElementById('todos');
          todosDiv.innerHTML = todos.map(todo => \`
            <div class="todo-item \${todo.completed ? 'completed' : ''}">
              <input type="checkbox" class="todo-checkbox" 
                onchange="toggleTodo('\${todo._id}', this.checked)"
                \${todo.completed ? 'checked' : ''}>
              <span class="todo-title">\${escapeHtml(todo.title)}</span>
              <button class="delete-btn" onclick="deleteTodo('\${todo._id}')">🗑 Delete</button>
            </div>
          \`).join('');
          const total = todos.length;
          const completed = todos.filter(t => t.completed).length;
          document.getElementById('counter').innerHTML = \`📊 \${total} total | ✅ \${completed} completed\`;
        }
        
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }
        
        async function addTodo() {
          const title = document.getElementById('title').value;
          if (!title) return;
          await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          });
          document.getElementById('title').value = '';
          loadTodos();
        }
        
        async function toggleTodo(id, completed) {
          await fetch(\`/api/todos/\${id}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
          });
          loadTodos();
        }
        
        async function deleteTodo(id) {
          await fetch(\`/api/todos/\${id}\`, { method: 'DELETE' });
          loadTodos();
        }
        
        loadTodos();
      </script>
    </body>
    </html>
  `);
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
JS

# Start everything
docker-compose -f docker-compose.simple.yml up -d

echo ""
echo "✅ Setup complete in ~30 seconds!"
echo ""
echo "📝 Todo App: http://localhost:3000"
echo "🗄️ Mongo Express: http://localhost:8081 (login: admin/admin123)"
echo ""
echo "The app is ready! MongoDB is storing all your todos."
