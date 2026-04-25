const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.z2grjun.mongodb.net/todo?retryWrites=true&w=majority';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'local';

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
console.log(`[${INSTANCE_NAME}] Connecting to MongoDB Atlas...`);
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000
});

const db = mongoose.connection;
db.on('error', (err) => {
    console.error(`[${INSTANCE_NAME}] MongoDB error:`, err.message);
});
db.once('open', () => {
    console.log(`[${INSTANCE_NAME}] ✅ Connected to MongoDB Atlas`);
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
        instance: INSTANCE_NAME,
        dbConnected: mongoose.connection.readyState === 1,
        database: 'MongoDB Atlas',
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

// Beautiful HTML UI
app.get('/', (req, res) => {
    const isCloud = INSTANCE_NAME === 'cloud';
    const primaryColor = isCloud ? '#6366f1' : '#10b981';
    const gradientStart = isCloud ? '#4f46e5' : '#059669';
    const gradientEnd = isCloud ? '#7c3aed' : '#34d399';
    const badge = isCloud ? '☁️ Cloud' : '💻 Local';
    const badgeColor = isCloud ? '#4f46e5' : '#059669';
    
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo App - ${INSTANCE_NAME}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%);
            min-height: 100vh;
            padding: 2rem 1rem;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .card {
            background: white;
            border-radius: 1.5rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            animation: fadeIn 0.5s ease-out;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .header {
            background: linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .header p {
            opacity: 0.95;
            font-size: 0.875rem;
        }
        
        .badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 500;
            margin-top: 0.5rem;
        }
        
        .content {
            padding: 2rem;
        }
        
        .todo-form {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 2rem;
        }
        
        .todo-form input {
            flex: 1;
            padding: 0.75rem 1rem;
            border: 2px solid #e5e7eb;
            border-radius: 0.75rem;
            font-size: 1rem;
            transition: all 0.2s;
            font-family: inherit;
        }
        
        .todo-form input:focus {
            outline: none;
            border-color: ${primaryColor};
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        
        .todo-form button {
            padding: 0.75rem 1.5rem;
            background: ${primaryColor};
            color: white;
            border: none;
            border-radius: 0.75rem;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }
        
        .todo-form button:hover {
            transform: translateY(-2px);
            filter: brightness(1.05);
        }
        
        .todo-list {
            margin-bottom: 1.5rem;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .todo-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 0.75rem;
            margin-bottom: 0.75rem;
            transition: all 0.2s;
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        .todo-item:hover {
            background: #f3f4f6;
            transform: translateX(4px);
        }
        
        .todo-checkbox {
            width: 1.25rem;
            height: 1.25rem;
            cursor: pointer;
            accent-color: ${primaryColor};
        }
        
        .todo-title {
            flex: 1;
            font-size: 1rem;
            color: #1f2937;
            word-break: break-word;
        }
        
        .completed .todo-title {
            text-decoration: line-through;
            color: #9ca3af;
        }
        
        .delete-btn {
            background: #ef4444;
            color: white;
            border: none;
            padding: 0.375rem 0.75rem;
            border-radius: 0.5rem;
            font-size: 0.75rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }
        
        .delete-btn:hover {
            background: #dc2626;
            transform: scale(1.05);
        }
        
        .empty-state {
            text-align: center;
            padding: 3rem;
            color: #9ca3af;
        }
        
        .empty-state svg {
            width: 4rem;
            height: 4rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }
        
        .empty-state p {
            font-size: 0.875rem;
        }
        
        .stats {
            padding-top: 1.5rem;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 0.875rem;
            color: #6b7280;
            font-weight: 500;
        }
        
        .atlas-badge {
            margin-top: 1rem;
            padding: 0.75rem;
            background: #f0f9ff;
            border-radius: 0.75rem;
            font-size: 0.75rem;
            text-align: center;
            color: #0369a1;
        }
        
        ::-webkit-scrollbar {
            width: 6px;
        }
        
        ::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
            background: ${primaryColor};
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <h1>📝 Todo List</h1>
                <p>Stay organized and get things done</p>
                <div class="badge">${badge}</div>
            </div>
            <div class="content">
                <div class="todo-form">
                    <input 
                        type="text" 
                        id="todoInput" 
                        placeholder="What needs to be done?" 
                        autofocus
                        onkeypress="if(event.key === 'Enter') addTodo()"
                    />
                    <button onclick="addTodo()">+ Add Task</button>
                </div>
                
                <div id="todoContainer"></div>
                
                <div class="stats" id="stats"></div>
                
                <div class="atlas-badge">
                    🗄️ Data stored in MongoDB Atlas • Shared across all instances
                </div>
            </div>
        </div>
    </div>

    <script>
        let todos = [];
        
        async function loadTodos() {
            try {
                const response = await fetch('/api/todos');
                todos = await response.json();
                renderTodos();
            } catch (error) {
                console.error('Failed to load todos:', error);
            }
        }
        
        function renderTodos() {
            const container = document.getElementById('todoContainer');
            const statsDiv = document.getElementById('stats');
            
            if (!todos || todos.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div>✨</div>
                        <p>No tasks yet. Add one above!</p>
                    </div>
                \`;
                statsDiv.innerHTML = '0 total · 0 completed';
                return;
            }
            
            const total = todos.length;
            const completed = todos.filter(t => t.completed).length;
            
            container.innerHTML = todos.map(todo => \`
                <div class="todo-item \${todo.completed ? 'completed' : ''}" data-id="\${todo._id}">
                    <input 
                        type="checkbox" 
                        class="todo-checkbox" 
                        \${todo.completed ? 'checked' : ''}
                        onchange="toggleTodo('\${todo._id}', this.checked)"
                    />
                    <span class="todo-title">\${escapeHtml(todo.title)}</span>
                    <button class="delete-btn" onclick="deleteTodo('\${todo._id}')">Delete</button>
                </div>
            \`).join('');
            
            statsDiv.innerHTML = \`\${total} total · \${completed} completed\`;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        async function addTodo() {
            const input = document.getElementById('todoInput');
            const title = input.value.trim();
            
            if (!title) {
                alert('Please enter a task');
                return;
            }
            
            try {
                const response = await fetch('/api/todos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                
                if (response.ok) {
                    input.value = '';
                    await loadTodos();
                }
            } catch (error) {
                console.error('Failed to add todo:', error);
                alert('Failed to add todo');
            }
        }
        
        async function toggleTodo(id, completed) {
            try {
                await fetch(\`/api/todos/\${id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed })
                });
                await loadTodos();
            } catch (error) {
                console.error('Failed to toggle todo:', error);
            }
        }
        
        async function deleteTodo(id) {
            if (!confirm('Delete this task?')) return;
            
            try {
                await fetch(\`/api/todos/\${id}\`, { method: 'DELETE' });
                await loadTodos();
            } catch (error) {
                console.error('Failed to delete todo:', error);
                alert('Failed to delete todo');
            }
        }
        
        // Load todos on page load
        loadTodos();
        
        // Auto-refresh every 10 seconds
        setInterval(loadTodos, 10000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ ${INSTANCE_NAME} app running on http://localhost:${PORT}`);
    console.log(`📊 Connected to MongoDB Atlas`);
});

process.on('SIGTERM', () => {
    console.log('Closing connections...');
    mongoose.connection.close();
    process.exit(0);
});
