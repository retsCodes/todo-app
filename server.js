const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.z2grjun.mongodb.net/todo?retryWrites=true&w=majority';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'local';

app.use(express.json());

// Only initialize Prometheus if available
let register, todoCreated, activeTodos;
try {
    register = new promClient.Registry();
    promClient.collectDefaultMetrics({ register });
    todoCreated = new promClient.Counter({
        name: 'todo_created_total',
        help: 'Total number of todos created',
        registers: [register]
    });
    activeTodos = new promClient.Gauge({
        name: 'active_todos_total',
        help: 'Current number of active todos',
        registers: [register]
    });
} catch(err) {
    console.log('Prometheus metrics disabled');
}

// Connect to MongoDB Atlas
console.log(`[${INSTANCE_NAME}] Connecting to MongoDB Atlas...`);
mongoose.connect(MONGODB_URI);

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
        timestamp: new Date().toISOString()
    });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        const count = await Todo.countDocuments();
        if (activeTodos) activeTodos.set(count);
        if (register) {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } else {
            res.send(`# HELP todo_total Total todos\n# TYPE todo_total gauge\ntodo_total ${count}\n`);
        }
    } catch(err) {
        res.send(`# HELP todo_total Total todos\n# TYPE todo_total gauge\ntodo_total 0\n`);
    }
});

// API endpoints
app.get('/api/todos', async (req, res) => {
    const todos = await Todo.find().sort('-createdAt');
    res.json(todos);
});

app.post('/api/todos', async (req, res) => {
    const todo = new Todo({ title: req.body.title });
    await todo.save();
    if (todoCreated) todoCreated.inc();
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

// Beautiful UI - same as your working version
app.get('/', (req, res) => {
    const isCloud = INSTANCE_NAME === 'cloud';
    const primaryColor = isCloud ? '#6366f1' : '#10b981';
    const gradientStart = isCloud ? '#4f46e5' : '#059669';
    const gradientEnd = isCloud ? '#7c3aed' : '#34d399';
    const badge = isCloud ? '☁️ Cloud' : '💻 Local';
    
    res.send(`<!DOCTYPE html>
<html>
<head><title>Todo App</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,${gradientStart} 0%,${gradientEnd} 100%);min-height:100vh;padding:20px;font-family:system-ui}
.container{max-width:500px;margin:0 auto}
.card{background:white;border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden}
.header{background:linear-gradient(135deg,${gradientStart} 0%,${gradientEnd} 100%);color:white;padding:30px;text-align:center}
.header h1{font-size:28px}
.badge{display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-top:8px}
.content{padding:24px}
.todo-form{display:flex;gap:10px;margin-bottom:24px}
.todo-form input{flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;font-size:16px}
.todo-form input:focus{outline:none;border-color:${primaryColor}}
.todo-form button{padding:12px 24px;background:${primaryColor};color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:500}
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
<div class="container"><div class="card"><div class="header"><h1>📝 Todo List</h1><div class="badge">${badge}</div></div>
<div class="content">
<div class="todo-form"><input type="text" id="todoInput" placeholder="What needs to be done?" autofocus onkeypress="if(event.key==='Enter')addTodo()"><button onclick="addTodo()">+ Add Task</button></div>
<div id="todoContainer"></div>
<div class="stats" id="stats"></div>
<div class="atlas-badge">🗄️ Data stored in MongoDB Atlas • Shared across all instances</div>
</div></div></div>
<script>
async function loadTodos(){
    try{
        const res=await fetch('/api/todos');
        const todos=await res.json();
        const container=document.getElementById('todoContainer');
        if(todos.length===0){
            container.innerHTML='<div class="empty-state">✨ No tasks yet. Add one above!</div>';
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
    }catch(e){console.error(e);}
}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
async function addTodo(){
    const input=document.getElementById('todoInput');
    const title=input.value.trim();
    if(!title)return;
    await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});
    input.value='';
    loadTodos();
}
async function toggleTodo(id,completed){
    await fetch('/api/todos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed})});
    loadTodos();
}
async function deleteTodo(id){
    if(confirm('Delete this task?')){
        await fetch('/api/todos/'+id,{method:'DELETE'});
        loadTodos();
    }
}
loadTodos();
setInterval(loadTodos,10000);
</script>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ ${INSTANCE_NAME} app running on port ${PORT}`);
    console.log(`📊 Connected to MongoDB Atlas`);
});
