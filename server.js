const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Simple in-memory storage (no MongoDB for now - will add back after working)
let todos = [];
let nextId = 1;
let requestCount = 0;

// Request counter middleware
app.use((req, res, next) => {
    requestCount++;
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.write('# HELP http_requests_total Total HTTP requests\n');
    res.write('# TYPE http_requests_total counter\n');
    res.write(`http_requests_total ${requestCount}\n`);
    res.write('# HELP todo_total Total number of todos\n');
    res.write('# TYPE todo_total gauge\n');
    res.write(`todo_total ${todos.length}\n`);
    res.end();
});

// API endpoints
app.get('/api/todos', (req, res) => {
    res.json(todos);
});

app.post('/api/todos', (req, res) => {
    const todo = {
        id: nextId++,
        title: req.body.title,
        completed: false,
        createdAt: new Date()
    };
    todos.push(todo);
    res.json(todo);
});

app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = req.body.completed;
    }
    res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    todos = todos.filter(t => t.id !== id);
    res.json({ message: 'deleted' });
});

// Beautiful HTML UI
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Todo App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
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
            <div class="badge">☁️ Cloud</div>
        </div>
        <div class="content">
            <div class="todo-form">
                <input type="text" id="todoInput" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter')addTodo()">
                <button onclick="addTodo()">+ Add Task</button>
            </div>
            <div id="todoContainer"></div>
            <div class="stats" id="stats"></div>
        </div>
    </div>
</div>
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
                ' onchange="toggleTodo('+todo.id+',this.checked)">'+
                '<span class="todo-title">'+escapeHtml(todo.title)+'</span>'+
                '<button class="delete-btn" onclick="deleteTodo('+todo.id+')">Delete</button>'+
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
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
