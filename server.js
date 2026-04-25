const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory storage
let todos = [];
let nextId = 1;
let requestCount = 0;

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        todos: todos.length,
        instance: 'cloud',
        timestamp: new Date().toISOString()
    });
});

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.write('# HELP todo_total Total number of todos\n');
    res.write('# TYPE todo_total gauge\n');
    res.write(`todo_total ${todos.length}\n`);
    res.write('# HELP todo_created_total Total todos created\n');
    res.write('# TYPE todo_created_total counter\n');
    res.write(`todo_created_total ${nextId - 1}\n`);
    res.write('# HELP http_requests_total Total HTTP requests\n');
    res.write('# TYPE http_requests_total counter\n');
    res.write(`http_requests_total ${requestCount}\n`);
    res.write('# HELP app_info App information\n');
    res.write('# TYPE app_info gauge\n');
    res.write(`app_info{instance="cloud",version="1.0"} 1\n`);
    res.end();
});

// Request counter middleware
app.use((req, res, next) => {
    requestCount++;
    next();
});

// API endpoints
app.get('/api/todos', (req, res) => {
    res.json(todos);
});

app.post('/api/todos', (req, res) => {
    const todo = { id: nextId++, title: req.body.title, completed: false, createdAt: new Date() };
    todos.push(todo);
    res.json(todo);
});

app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todo = todos.find(t => t.id === id);
    if (todo) todo.completed = req.body.completed;
    res.json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    todos = todos.filter(t => t.id !== id);
    res.json({ message: 'deleted' });
});

// HTML UI
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><title>Todo App - Cloud</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui;background:#f5f5f5;padding:20px}
.container{max-width:500px;margin:0 auto;background:white;border-radius:8px}
.header{background:#0066cc;color:white;padding:20px}
.content{padding:20px}
.todo-form{display:flex;gap:10px;margin-bottom:20px}
.todo-form input{flex:1;padding:10px;border:1px solid #ddd;border-radius:4px}
.todo-form button{padding:10px 20px;background:#0066cc;color:white;border:none;border-radius:4px;cursor:pointer}
.todo-item{display:flex;align-items:center;gap:10px;padding:10px;background:#fafafa;border-radius:4px;margin-bottom:8px}
.todo-checkbox{width:18px;height:18px;cursor:pointer}
.todo-title{flex:1}
.completed .todo-title{text-decoration:line-through;color:#999}
.delete-btn{background:#dc3545;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer}
.empty-state{text-align:center;padding:40px;color:#999}
.stats{margin-top:20px;text-align:center;font-size:12px;color:#666}
</style>
</head>
<body>
<div class="container">
<div class="header"><h1>📝 Todo List <span style="font-size:12px">☁️ Cloud</span></h1></div>
<div class="content">
<div class="todo-form">
<input type="text" id="title" placeholder="What needs to be done?" onkeypress="if(event.key==='Enter')addTodo()">
<button onclick="addTodo()">Add Task</button>
</div>
<div id="todos"></div>
<div class="stats" id="stats"></div>
</div>
</div>
<script>
async function loadTodos(){
    const res=await fetch('/api/todos');
    const todos=await res.json();
    const container=document.getElementById('todos');
    if(todos.length===0){
        container.innerHTML='<div class="empty-state">✨ No tasks yet</div>';
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
}
function escapeHtml(text){const div=document.createElement('div');div.textContent=text;return div.innerHTML;}
async function addTodo(){const input=document.getElementById('title');const title=input.value.trim();if(!title)return;await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});input.value='';loadTodos();}
async function toggleTodo(id,completed){await fetch('/api/todos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed})});loadTodos();}
async function deleteTodo(id){if(confirm('Delete?')){await fetch('/api/todos/'+id,{method:'DELETE'});loadTodos();}}
loadTodos();
</script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Cloud app running on port ${PORT}`);
    console.log(`📊 Metrics available at /metrics`);
});
