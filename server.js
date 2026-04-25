const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;

// ONLY USE ATLAS - fail if not set correctly
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI environment variable is required!');
    process.exit(1);
}

if (!MONGODB_URI.includes('mongodb+srv://') || !MONGODB_URI.includes('cluster0.z2grjun.mongodb.net')) {
    console.error('❌ FATAL: Must use MongoDB Atlas connection string!');
    process.exit(1);
}

app.use(express.json());

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });
const todoCreated = new promClient.Counter({ name: 'todo_created_total', help: 'Total todos created', registers: [register] });
const activeTodos = new promClient.Gauge({ name: 'active_todos_total', help: 'Current active todos', registers: [register] });

// Connect to Atlas ONLY
console.log('🔗 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000
});

const db = mongoose.connection;
db.on('error', (err) => {
    console.error('❌ MongoDB Atlas connection error:', err.message);
    process.exit(1); // Exit if can't connect to Atlas
});
db.once('open', () => {
    console.log('✅ Connected to MongoDB Atlas');
    console.log(`📊 Database: ${db.name}`);
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

// Metrics
app.get('/metrics', async (req, res) => {
    const count = await Todo.countDocuments();
    activeTodos.set(count);
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// API endpoints
app.get('/api/todos', async (req, res) => {
    const todos = await Todo.find().sort('-createdAt');
    res.json(todos);
});

app.post('/api/todos', async (req, res) => {
    const todo = new Todo({ title: req.body.title });
    await todo.save();
    todoCreated.inc();
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

// Beautiful UI
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><title>Todo App - Cloud (Atlas)</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);min-height:100vh;padding:20px;font-family:system-ui}
.container{max-width:500px;margin:0 auto}
.card{background:white;border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden}
.header{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:white;padding:30px;text-align:center}
.header h1{font-size:28px}
.badge{display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-top:8px}
.content{padding:24px}
.todo-form{display:flex;gap:10px;margin-bottom:24px}
.todo-form input{flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;font-size:16px}
.todo-form input:focus{outline:none;border-color:#4f46e5}
.todo-form button{padding:12px 24px;background:#4f46e5;color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:500}
.todo-form button:hover{transform:translateY(-2px);filter:brightness(1.05)}
.todo-item{display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;border-radius:12px;margin-bottom:8px}
.todo-checkbox{width:20px;height:20px;cursor:pointer}
.todo-title{flex:1;font-size:16px}
.completed .todo-title{text-decoration:line-through;color:#9ca3af}
.delete-btn{background:#ef4444;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer}
.empty-state{text-align:center;padding:40px;color:#9ca3af}
.stats{margin-top:20px;text-align:center;font-size:14px;color:#6b7280}
.atlas-badge{margin-top:16px;padding:12px;background:#f0f9ff;border-radius:12px;font-size:12px;text-align:center;color:#0369a1}
</style>
</head>
<body>
<div class="container"><div class="card"><div class="header"><h1>📝 Todo List</h1><div class="badge">☁️ Cloud (Atlas)</div></div>
<div class="content">
<div class="todo-form"><input type="text" id="todoInput" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter')addTodo()"><button onclick="addTodo()">+ Add Task</button></div>
<div id="todoContainer"></div>
<div class="stats" id="stats"></div>
<div class="atlas-badge">🗄️ Connected to MongoDB Atlas • Shared Database</div>
</div></div></div>
<script>
async function loadTodos(){
    const res=await fetch('/api/todos');
    const todos=await res.json();
    const container=document.getElementById('todoContainer');
    if(todos.length===0){
        container.innerHTML='<div class="empty-state">✨ No tasks yet</div>';
    }else{
        container.innerHTML=todos.map(todo=>'<div class="todo-item'+(todo.completed?' completed':'')+'">'+
            '<input type="checkbox" class="todo-checkbox"'+(todo.completed?' checked':'')+
            ' onchange="toggleTodo(\\''+todo._id+'\\',this.checked)">'+
            '<span class="todo-title">'+escapeHtml(todo.title)+'</span>'+
            '<button class="delete-btn" onclick="deleteTodo(\\''+todo._id+'\\')">Delete</button>'+
            '</div>').join('');
    }
    const completed=todos.filter(t=>t.completed).length;
    document.getElementById('stats').innerHTML='📊 '+todos.length+' total | ✅ '+completed+' completed';
}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
async function addTodo(){const i=document.getElementById('todoInput');const t=i.value.trim();if(!t)return;await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t})});i.value='';loadTodos();}
async function toggleTodo(id,completed){await fetch('/api/todos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed})});loadTodos();}
async function deleteTodo(id){if(confirm('Delete?')){await fetch('/api/todos/'+id,{method:'DELETE'});loadTodos();}}
loadTodos();setInterval(loadTodos,5000);
</script>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Cloud app running on port ${PORT}`);
    console.log(`📊 Using MongoDB Atlas exclusively`);
});
