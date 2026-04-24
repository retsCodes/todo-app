const express = require('express');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;
const IS_CLOUD = process.env.IS_CLOUD === 'true' || false;
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

const syncStatusGauge = new promClient.Gauge({
    name: 'sync_status',
    help: 'Sync status between local and cloud (1=synced, 0=unsynced)',
    registers: [register]
});

const localHealthGauge = new promClient.Gauge({
    name: 'local_health_status',
    help: 'Local app health status (1=up, 0=down)',
    registers: [register]
});

// In-memory storage
let todos = [];
let todoId = 1;
let cloudTodoCount = 0;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        role: IS_CLOUD ? 'cloud' : 'local',
        timestamp: new Date().toISOString(),
        todoCount: todos.length
    });
});

// Check local health (for cloud instance)
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

// Sync endpoint - cloud calls this to get data from local
app.get('/sync-from-local', async (req, res) => {
    if (IS_CLOUD) {
        try {
            const response = await fetch(`${LOCAL_API}/api/todos`);
            const localTodos = await response.json();
            cloudTodoCount = localTodos.length;
            res.json({ synced: true, count: localTodos.length, todos: localTodos });
        } catch (error) {
            res.json({ synced: false, error: error.message });
        }
    } else {
        res.json({ role: 'local', todos: todos });
    }
});

// Metrics endpoint - enhanced
app.get('/metrics', async (req, res) => {
    // Update gauges
    activeTodosGauge.set(todos.length);
    
    // Check sync status
    if (IS_CLOUD) {
        try {
            const response = await fetch(`${LOCAL_API}/api/todos`);
            const localTodos = await response.json();
            if (localTodos.length === todos.length) {
                syncStatusGauge.set(1);
            } else {
                syncStatusGauge.set(0);
            }
        } catch {
            syncStatusGauge.set(0);
        }
    } else {
        syncStatusGauge.set(1); // Local is always synced with itself
    }
    
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
    
    // If cloud, try to sync with local
    if (IS_CLOUD) {
        syncWithLocal('create', todo).catch(console.error);
    }
    
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
        // If cloud, try to sync with local
        if (IS_CLOUD) {
            syncWithLocal('update', todo).catch(console.error);
        }
    }
    res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todo = todos.find(t => t.id === id);
    todos = todos.filter(t => t.id !== id);
    todoDeletedTotal.inc();
    
    // If cloud, try to sync with local
    if (IS_CLOUD && todo) {
        syncWithLocal('delete', { id }).catch(console.error);
    }
    
    res.json({ message: 'deleted' });
});

// Sync helper for cloud instance
async function syncWithLocal(action, data) {
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
        console.log(`Synced ${action} to local`);
    } catch (error) {
        console.error(`Failed to sync ${action}:`, error.message);
    }
}

// HTML UI with sync status
const html = `<!DOCTYPE html>
<html>
<head>
    <title>Todo App ${IS_CLOUD ? '(Cloud)' : '(Local)'}</title>
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
            background: ${IS_CLOUD ? '#1a1a1a' : '#28a745'};
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
        .sync-status span { font-weight: bold; }
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
            background: ${IS_CLOUD ? '#1a1a1a' : '#28a745'};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .todo-form button:hover { background: ${IS_CLOUD ? '#333' : '#218838'}; }
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
            background: #e8f4f8;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Todo List <span class="badge">${IS_CLOUD ? '☁️ Cloud' : '💻 Local'}</span></h1>
        <div class="sync-status" id="syncStatus">Checking sync status...</div>
    </div>
    <div class="content">
        <div class="todo-form">
            <input type="text" id="title" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter') addTodo()">
            <button onclick="addTodo()">Add Task</button>
        </div>
        <div id="todos"></div>
        <div class="stats" id="stats"></div>
        <div class="local-status" id="localStatus">Checking local service...</div>
    </div>
</div>
<script>
    let syncCheckInterval;
    let healthCheckInterval;
    
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
    
    async function checkSyncStatus() {
        try {
            const res = await fetch('/sync-from-local');
            const data = await res.json();
            const syncDiv = document.getElementById('syncStatus');
            if (data.synced) {
                syncDiv.innerHTML = '✅ Synced with local: ' + data.count + ' tasks';
                syncDiv.style.color = '#d4edda';
            } else {
                syncDiv.innerHTML = '⚠️ Local service not reachable - running in standalone mode';
                syncDiv.style.color = '#fff3cd';
            }
        } catch (error) {
            document.getElementById('syncStatus').innerHTML = '⚠️ Cannot connect to local service';
        }
    }
    
    async function checkLocalHealth() {
        try {
            const res = await fetch('/check-local');
            const data = await res.json();
            const localDiv = document.getElementById('localStatus');
            if (data.localRunning) {
                localDiv.innerHTML = '🟢 Local service is RUNNING - Data will sync both ways';
                localDiv.style.background = '#d4edda';
                localDiv.style.color = '#155724';
            } else {
                localDiv.innerHTML = '🔴 Local service is DOWN - Cloud running in standalone mode. Start local service to sync.';
                localDiv.style.background = '#f8d7da';
                localDiv.style.color = '#721c24';
            }
        } catch (error) {
            document.getElementById('localStatus').innerHTML = '🔴 Cannot detect local service - Make sure local app is running on port 3000';
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
        checkSyncStatus();
    }
    
    async function toggleTodo(id, completed) {
        await fetch('/api/todos/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });
        loadTodos();
        checkSyncStatus();
    }
    
    async function deleteTodo(id) {
        if (confirm('Delete this task?')) {
            await fetch('/api/todos/' + id, { method: 'DELETE' });
            loadTodos();
            checkSyncStatus();
        }
    }
    
    // Start monitoring
    loadTodos();
    checkSyncStatus();
    checkLocalHealth();
    syncCheckInterval = setInterval(checkSyncStatus, 30000);
    healthCheckInterval = setInterval(checkLocalHealth, 60000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Todo app running as ${IS_CLOUD ? 'CLOUD' : 'LOCAL'} on http://0.0.0.0:${PORT}`);
    console.log(`📊 Metrics at http://0.0.0.0:${PORT}/metrics`);
    console.log(`🔄 Sync with ${IS_CLOUD ? 'local' : 'cloud'} configured`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing...');
    process.exit(0);
});
