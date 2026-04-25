const express = require('express');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:password123@mongodb:27017/todo?authSource=admin';
const INSTANCE = process.env.INSTANCE_NAME || 'local';

app.use(express.json());

mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
db.on('error', (err) => console.error('MongoDB error:', err.message));
db.once('open', () => console.log('Connected to MongoDB'));

const Todo = mongoose.model('Todo', new mongoose.Schema({
    title: String,
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API
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
    const todo = await Todo.findByIdAndUpdate(req.params.id, { completed: req.body.completed }, { new: true });
    res.json(todo);
});

app.delete('/api/todos/:id', async (req, res) => {
    await Todo.findByIdAndDelete(req.params.id);
    res.json({ message: 'deleted' });
});

// Full UI
app.get('/', (req, res) => {
    const gradient = INSTANCE === 'local' ? 'linear-gradient(135deg,#059669 0%,#34d399 100%)' : 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)';
    const badge = INSTANCE === 'local' ? '💻 Local' : '☁️ Cloud';
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Todo App - ${INSTANCE}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:${gradient};min-height:100vh;padding:20px;font-family:system-ui}
        .container{max-width:500px;margin:0 auto}
        .card{background:white;border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden}
        .header{background:${gradient};color:white;padding:30px;text-align:center}
        .header h1{font-size:28px}
        .badge{display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-top:8px}
        .content{padding:24px}
        .todo-form{display:flex;gap:10px;margin-bottom:24px}
        .todo-form input{flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;font-size:16px}
        .todo-form input:focus{outline:none;border-color:#059669}
        .todo-form button{padding:12px 24px;background:#059669;color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:500}
        .todo-form button:hover{transform:translateY(-2px);filter:brightness(1.05)}
        .todo-item{display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;border-radius:12px;margin-bottom:8px}
        .todo-checkbox{width:20px;height:20px;cursor:pointer}
        .todo-title{flex:1;font-size:16px}
        .completed .todo-title{text-decoration:line-through;color:#9ca3af}
        .delete-btn{background:#ef4444;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer}
        .delete-btn:hover{background:#dc2626}
        .empty-state{text-align:center;padding:40px;color:#9ca3af}
        .stats{margin-top:20px;text-align:center;font-size:14px;color:#6b7280}
    </style>
</head>
<body>
<div class="container">
    <div class="card">
        <div class="header">
            <h1>📝 Todo List</h1>
            <div class="badge">${badge}</div>
        </div>
        <div class="content">
            <div class="todo-form">
                <input type="text" id="todoInput" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter')addTodo()">
                <button onclick="addTodo()">+ Add Task</button>
            </div>
            <div id="todoList"></div>
            <div class="stats" id="stats"></div>
        </div>
    </div>
</div>
<script>
    async function loadTodos() {
        try {
            const res = await fetch('/api/todos');
            const todos = await res.json();
            const container = document.getElementById('todoList');
            if (todos.length === 0) {
                container.innerHTML = '<div class="empty-state">✨ No tasks yet. Add one above!</div>';
            } else {
                container.innerHTML = todos.map(todo => {
                    return '<div class="todo-item' + (todo.completed ? ' completed' : '') + '">' +
                        '<input type="checkbox" class="todo-checkbox"' + (todo.completed ? ' checked' : '') + 
                        ' onchange="toggleTodo(\\'' + todo._id + '\\', this.checked)">' +
                        '<span class="todo-title">' + escapeHtml(todo.title) + '</span>' +
                        '<button class="delete-btn" onclick="deleteTodo(\\'' + todo._id + '\\')">Delete</button>' +
                        '</div>';
                }).join('');
            }
            const completed = todos.filter(t => t.completed).length;
            document.getElementById('stats').innerHTML = '📊 ' + todos.length + ' total | ✅ ' + completed + ' completed';
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
        const input = document.getElementById('todoInput');
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
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
