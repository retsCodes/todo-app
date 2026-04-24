const express = require('express');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;
const IS_CLOUD = process.env.IS_CLOUD === 'true';
const LOCAL_API = process.env.LOCAL_API || 'http://host.docker.internal:3000';

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

const todoDeletedTotal = new promClient.Counter({
    name: 'todo_deleted_total',
    help: 'Total number of todos deleted',
    registers: [register]
});

const activeTodosGauge = new promClient.Gauge({
    name: 'active_todos_total',
    help: 'Current number of active todos',
    registers: [register]
});

const cloudSyncStatus = new promClient.Gauge({
    name: 'cloud_sync_status',
    help: 'Cloud sync status (1=synced, 0=unsynced)',
    registers: [register]
});

const localHealthGauge = new promClient.Gauge({
    name: 'local_health_status',
    help: 'Local app health (1=up, 0=down)',
    registers: [register]
});

// In-memory storage (only used if cloud and local is down)
let todos = [];
let todoId = 1;

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        role: IS_CLOUD ? 'cloud-replica' : 'local-primary',
        todoCount: todos.length,
        timestamp: new Date().toISOString()
    });
});

// Check local health (for cloud)
app.get('/check-local', async (req, res) => {
    try {
        const response = await fetch(`${LOCAL_API}/health`);
        const data = await response.json();
        localHealthGauge.set(1);
        res.json({ localRunning: true, data });
    } catch (error) {
        localHealthGauge.set(0);
        res.json({ localRunning: false, error: error.message });
    }
});

// Get data from local (for cloud sync)
app.get('/sync-from-local', async (req, res) => {
    if (IS_CLOUD) {
        try {
            const response = await fetch(`${LOCAL_API}/api/todos`);
            const localTodos = await response.json();
            todos = localTodos; // Cloud mirrors local
            cloudSyncStatus.set(1);
            res.json({ synced: true, count: localTodos.length });
        } catch (error) {
            cloudSyncStatus.set(0);
            res.json({ synced: false, error: error.message });
        }
    } else {
        res.json({ role: 'local-primary', todos: todos });
    }
});

// Push cloud data to local (when cloud gets data and local is up)
app.post('/push-to-local', async (req, res) => {
    if (IS_CLOUD) {
        const { action, data } = req.body;
        try {
            if (action === 'create') {
                await fetch(`${LOCAL_API}/api/todos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: data.title })
                });
            } else if (action === 'update') {
                await fetch(`${LOCAL_API}/api/todos/${data.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed: data.completed })
                });
            } else if (action === 'delete') {
                await fetch(`${LOCAL_API}/api/todos/${data.id}`, { method: 'DELETE' });
            }
            res.json({ pushed: true });
        } catch (error) {
            res.json({ pushed: false, error: error.message });
        }
    }
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

app.post('/api/todos', async (req, res) => {
    const todo = {
        id: todoId++,
        title: req.body.title,
        completed: false,
        createdAt: new Date()
    };
    
    if (IS_CLOUD) {
        // Cloud tries to push to local first
        try {
            await fetch(`${LOCAL_API}/api/todos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: req.body.title })
            });
            // Then sync from local to get the exact data
            await fetch(`${LOCAL_API}/sync-from-local`);
            const response = await fetch(`${LOCAL_API}/api/todos`);
            todos = await response.json();
        } catch (error) {
            // Local is down, store in cloud temporarily
            todos.push(todo);
            console.log('Local down, storing in cloud temp storage');
        }
    } else {
        // Local is primary - just add
        todos.push(todo);
    }
    
    todoCreatedTotal.inc();
    res.json(todo);
});

app.put('/api/todos/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    if (IS_CLOUD) {
        try {
            await fetch(`${LOCAL_API}/api/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: req.body.completed })
            });
            const response = await fetch(`${LOCAL_API}/api/todos`);
            todos = await response.json();
        } catch (error) {
            const todo = todos.find(t => t.id === id);
            if (todo) todo.completed = req.body.completed;
        }
    } else {
        const todo = todos.find(t => t.id === id);
        if (todo) todo.completed = req.body.completed;
    }
    
    if (req.body.completed) todoCompletedTotal.inc();
    res.json({ success: true });
});

app.delete('/api/todos/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    if (IS_CLOUD) {
        try {
            await fetch(`${LOCAL_API}/api/todos/${id}`, { method: 'DELETE' });
            const response = await fetch(`${LOCAL_API}/api/todos`);
            todos = await response.json();
        } catch (error) {
            todos = todos.filter(t => t.id !== id);
        }
    } else {
        todos = todos.filter(t => t.id !== id);
    }
    
    todoDeletedTotal.inc();
    res.json({ message: 'deleted' });
});

// Periodic sync from local to cloud (cloud pulls from local every 30 seconds)
if (IS_CLOUD) {
    setInterval(async () => {
        try {
            const response = await fetch(`${LOCAL_API}/api/todos`);
            const localTodos = await response.json();
            todos = localTodos;
            cloudSyncStatus.set(1);
            console.log(`Synced from local: ${localTodos.length} todos`);
        } catch (error) {
            cloudSyncStatus.set(0);
            console.log('Local not reachable, running in standalone mode');
        }
    }, 30000);
}

// HTML UI
const html = `<!DOCTYPE html>
<html>
<head>
    <title>Todo App - ${IS_CLOUD ? 'Cloud Replica' : 'Local Primary'}</title>
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
            background: ${IS_CLOUD ? '#6c757d' : '#28a745'};
            color: white;
            padding: 20px;
        }
        .header h1 { font-size: 1.5rem; }
        .badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-left: 10px;
        }
        .sync-status {
            font-size: 12px;
            margin-top: 8px;
            opacity: 0.9;
        }
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
            background: ${IS_CLOUD ? '#6c757d' : '#28a745'};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .todo-form button:hover { background: ${IS_CLOUD ? '#5a6268' : '#218838'}; }
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
        .local-status {
            margin-top: 10px;
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Todo List <span class="badge">${IS_CLOUD ? '☁️ Cloud Replica' : '💻 Local Primary'}</span></h1>
        <div class="sync-status" id="syncStatus">${IS_CLOUD ? 'Syncing with local...' : 'Local is primary source of truth'}</div>
    </div>
    <div class="content">
        <div class="todo-form">
            <input type="text" id="title" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter') addTodo()">
            <button onclick="addTodo()">Add Task</button>
        </div>
        <div id="todos"></div>
        <div class="stats" id="stats"></div>
        <div class="local-status" id="localStatus"></div>
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
    
    async function checkLocalHealth() {
        if (!${IS_CLOUD}) return;
        try {
            const res = await fetch('/check-local');
            const data = await res.json();
            const localDiv = document.getElementById('localStatus');
            if (data.localRunning) {
                localDiv.innerHTML = '🟢 Local primary is RUNNING - Cloud is synced';
                localDiv.style.background = '#d4edda';
                localDiv.style.color = '#155724';
                document.getElementById('syncStatus').innerHTML = '✅ Synced with local primary';
            } else {
                localDiv.innerHTML = '🔴 Local primary is DOWN - Cloud running in standalone mode. Start local to sync.';
                localDiv.style.background = '#f8d7da';
                localDiv.style.color = '#721c24';
                document.getElementById('syncStatus').innerHTML = '⚠️ Local not reachable - Running standalone';
            }
        } catch (error) {
            document.getElementById('localStatus').innerHTML = '🔴 Cannot reach local primary';
            document.getElementById('localStatus').style.background = '#f8d7da';
            document.getElementById('localStatus').style.color = '#721c24';
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
        if (${IS_CLOUD}) checkLocalHealth();
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
    if (${IS_CLOUD}) {
        checkLocalHealth();
        setInterval(checkLocalHealth, 30000);
    }
</script>
</body>
</html>`;

app.get('/', (req, res) => {
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Todo app running as ${IS_CLOUD ? 'CLOUD REPLICA' : 'LOCAL PRIMARY'}`);
    console.log(`📊 Metrics at http://0.0.0.0:${PORT}/metrics`);
    if (IS_CLOUD) {
        console.log(`🔄 Syncing from local: ${LOCAL_API}`);
    } else {
        console.log(`📍 Primary source of truth`);
    }
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing...');
    process.exit(0);
});
