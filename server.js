const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;

// ONLY use Atlas - fail if not set
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI environment variable is required!');
    console.error('This app ONLY works with MongoDB Atlas.');
    process.exit(1);
}

app.use(express.json());

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const todoCreated = new promClient.Counter({
    name: 'todo_created_total',
    help: 'Total number of todos created',
    registers: [register]
});

const activeTodos = new promClient.Gauge({
    name: 'active_todos_total',
    help: 'Current number of active todos',
    registers: [register]
});

// Connect to MongoDB Atlas
console.log('🔗 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
});

const db = mongoose.connection;
db.on('error', (err) => {
    console.error('❌ MongoDB Atlas connection error:', err.message);
});
db.once('open', () => {
    console.log('✅ Successfully connected to MongoDB Atlas');
});

// Todo Schema
const TodoSchema = new mongoose.Schema({
    title: { type: String, required: true },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Todo = mongoose.model('Todo', TodoSchema);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        database: 'MongoDB Atlas',
        dbConnected: mongoose.connection.readyState === 1,
        instance: 'cloud',
        timestamp: new Date().toISOString()
    });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        const count = await Todo.countDocuments();
        activeTodos.set(count);
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch(err) {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    }
});

// API endpoints
app.get('/api/todos', async (req, res) => {
    try {
        const todos = await Todo.find().sort('-createdAt');
        res.json(todos);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/todos', async (req, res) => {
    try {
        const todo = new Todo({ title: req.body.title });
        await todo.save();
        todoCreated.inc();
        res.json(todo);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/todos/:id', async (req, res) => {
    try {
        const todo = await Todo.findByIdAndUpdate(
            req.params.id,
            { completed: req.body.completed },
            { new: true }
        );
        res.json(todo);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/todos/:id', async (req, res) => {
    try {
        await Todo.findByIdAndDelete(req.params.id);
        res.json({ message: 'deleted' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// HTML UI - with correct JavaScript functions
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Todo App - Cloud (Atlas)</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui;background:#f5f5f5;padding:20px}
        .container{max-width:500px;margin:0 auto;background:white;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
        .header{background:#0066cc;color:white;padding:20px;border-radius:8px 8px 0 0}
        .header h1{font-size:1.5rem}
        .badge{display:inline-block;background:#004499;padding:4px 8px;border-radius:4px;font-size:10px;margin-left:10px}
        .content{padding:20px}
        .todo-form{display:flex;gap:10px;margin-bottom:20px}
        .todo-form input{flex:1;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px}
        .todo-form input:focus{outline:none;border-color:#0066cc}
        .todo-form button{padding:10px 20px;background:#0066cc;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px}
        .todo-form button:hover{background:#0052a3}
        .todo-item{display:flex;align-items:center;gap:10px;padding:10px;background:#fafafa;border-radius:4px;margin-bottom:8px}
        .todo-item:hover{background:#f0f0f0}
        .todo-checkbox{width:18px;height:18px;cursor:pointer}
        .todo-title{flex:1;font-size:14px}
        .completed .todo-title{text-decoration:line-through;color:#999}
        .delete-btn{background:#dc3545;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px}
        .delete-btn:hover{background:#c82333}
        .empty-state{text-align:center;padding:40px;color:#999}
        .stats{margin-top:20px;padding-top:20px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#666}
        .atlas-badge{background:#e8f4f8;padding:8px;border-radius:4px;margin-top:10px;font-size:11px;text-align:center;color:#0066cc}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 Todo List <span class="badge">☁️ Cloud (Atlas)</span></h1>
        </div>
        <div class="content">
            <div class="todo-form">
                <input type="text" id="titleInput" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter') addTodo()">
                <button onclick="addTodo()">Add Task</button>
            </div>
            <div id="todoList"></div>
            <div class="stats" id="stats"></div>
            <div class="atlas-badge">🗄️ Data stored in MongoDB Atlas cloud database</div>
        </div>
    </div>

    <script>
        async function loadTodos() {
            try {
                const response = await fetch('/api/todos');
                const todos = await response.json();
                const container = document.getElementById('todoList');
                
                if (todos.length === 0) {
                    container.innerHTML = '<div class="empty-state">✨ No tasks yet. Add one above!</div>';
                } else {
                    container.innerHTML = todos.map(todo => {
                        const todoId = todo._id;
                        return '<div class="todo-item' + (todo.completed ? ' completed' : '') + '">' +
                            '<input type="checkbox" class="todo-checkbox"' + (todo.completed ? ' checked' : '') + 
                            ' onchange="toggleTodo(\'' + todoId + '\', this.checked)">' +
                            '<span class="todo-title">' + escapeHtml(todo.title) + '</span>' +
                            '<button class="delete-btn" onclick="deleteTodo(\'' + todoId + '\')">Delete</button>' +
                            '</div>';
                    }).join('');
                }
                
                const completed = todos.filter(t => t.completed).length;
                document.getElementById('stats').innerHTML = '📊 ' + todos.length + ' total | ✅ ' + completed + ' completed';
            } catch (error) {
                console.error('Error loading todos:', error);
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function addTodo() {
            const input = document.getElementById('titleInput');
            const title = input.value.trim();
            
            if (!title) {
                alert('Please enter a task');
                return;
            }
            
            try {
                await fetch('/api/todos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                input.value = '';
                loadTodos();
            } catch (error) {
                console.error('Error adding todo:', error);
                alert('Failed to add todo');
            }
        }

        async function toggleTodo(id, completed) {
            try {
                await fetch('/api/todos/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed })
                });
                loadTodos();
            } catch (error) {
                console.error('Error toggling todo:', error);
            }
        }

        async function deleteTodo(id) {
            if (!confirm('Delete this task?')) return;
            
            try {
                await fetch('/api/todos/' + id, { method: 'DELETE' });
                loadTodos();
            } catch (error) {
                console.error('Error deleting todo:', error);
                alert('Failed to delete todo');
            }
        }

        // Load todos on page load
        loadTodos();
        // Refresh every 30 seconds
        setInterval(loadTodos, 30000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Cloud Todo app running on port ${PORT}`);
    console.log(`📊 Using MongoDB Atlas exclusively`);
});
