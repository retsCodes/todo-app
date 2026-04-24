const express = require('express');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const todoCreatedTotal = new promClient.Counter({
    name: 'todo_created_total',
    help: 'Total number of todos created',
    registers: [register]
});

const todoCompletedTotal = new promClient.Counter({
    name: 'todo_completed_total',
    help: 'Total number of todos completed',
    registers: [register]
});

const activeTodosGauge = new promClient.Gauge({
    name: 'active_todos_total',
    help: 'Current number of active todos',
    registers: [register]
});

// In-memory storage
let todos = [];
let todoId = 1;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    activeTodosGauge.set(todos.length);
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// API endpoints
app.get('/api/todos', (req, res) => {
    res.json(todos);
});

app.post('/api/todos', (req, res) => {
    const todo = {
        id: todoId++,
        title: req.body.title,
        completed: false,
        createdAt: new Date()
    };
    todos.push(todo);
    todoCreatedTotal.inc();
    res.json(todo);
});

app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = req.body.completed;
        if (todo.completed) {
            todoCompletedTotal.inc();
        }
    }
    res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    todos = todos.filter(t => t.id !== id);
    res.json({ message: 'deleted' });
});

// Serve HTML
const html = `<!DOCTYPE html>
<html>
<head>
    <title>Todo App</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: #1a1a1a;
            color: white;
            padding: 20px;
        }
        .header h1 { font-size: 1.5rem; }
        .content { padding: 20px; }
        .todo-form {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .todo-form input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .todo-form button {
            padding: 10px 20px;
            background: #1a1a1a;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .todo-form button:hover { background: #333; }
        .todo-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: #fafafa;
            border-radius: 4px;
            margin-bottom: 8px;
        }
        .todo-item:hover { background: #f0f0f0; }
        .todo-checkbox { width: 18px; height: 18px; cursor: pointer; }
        .todo-title { flex: 1; font-size: 14px; }
        .completed .todo-title { text-decoration: line-through; color: #999; }
        .delete-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .delete-btn:hover { background: #c82333; }
        .empty-state { text-align: center; padding: 40px; color: #999; }
        .stats {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        .metric-badge {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-left: 10px;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Todo List <span class="metric-badge">Monitoring Active</span></h1>
    </div>
    <div class="content">
        <div class="todo-form">
            <input type="text" id="title" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter') addTodo()">
            <button onclick="addTodo()">Add Task</button>
        </div>
        <div id="todos"></div>
        <div class="stats" id="stats"></div>
    </div>
</div>
<script>
    async function loadTodos() {
        try {
            const res = await fetch('/api/todos');
            const todos = await res.json();
            const container = document.getElementById('todos');
            if (todos.length === 0) {
                container.innerHTML = '<div class="empty-state">✨ No tasks yet. Add one above!</div>';
            } else {
                container.innerHTML = todos.map(todo => {
                    return '<div class="todo-item ' + (todo.completed ? 'completed' : '') + '">' +
                        '<input type="checkbox" class="todo-checkbox" ' + (todo.completed ? 'checked' : '') + 
                        ' onchange="toggleTodo(' + todo.id + ', this.checked)">' +
                        '<span class="todo-title">' + escapeHtml(todo.title) + '</span>' +
                        '<button class="delete-btn" onclick="deleteTodo(' + todo.id + ')">Delete</button>' +
                        '</div>';
                }).join('');
            }
            const total = todos.length;
            const completed = todos.filter(t => t.completed).length;
            document.getElementById('stats').innerHTML = '📊 ' + total + ' total | ✅ ' + completed + ' completed';
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async function addTodo() {
        const input = document.getElementById('title');
        const title = input.value.trim();
        if (!title) return;
        await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        input.value = '';
        loadTodos();
    }
    
    async function toggleTodo(id, completed) {
        await fetch('/api/todos/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });
        loadTodos();
    }
    
    async function deleteTodo(id) {
        if (confirm('Delete this task?')) {
            await fetch('/api/todos/' + id, { method: 'DELETE' });
            loadTodos();
        }
    }
    
    loadTodos();
    setInterval(loadTodos, 5000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Todo app running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Metrics available at http://0.0.0.0:${PORT}/metrics`);
    console.log(`🏥 Health check at http://0.0.0.0:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    process.exit(0);
});
