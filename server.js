const express = require('express');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
db.on('error', (err) => console.error('MongoDB error:', err.message));
db.once('open', () => console.log('✅ Connected to MongoDB'));

const Todo = mongoose.model('Todo', new mongoose.Schema({
    title: String,
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><title>Todo App</title><style>
body{font-family:system-ui;background:#f5f5f5;padding:20px}
.container{max-width:500px;margin:0 auto;background:white;border-radius:8px}
.header{background:#28a745;color:white;padding:20px}
.content{padding:20px}
.todo-form{display:flex;gap:10px;margin-bottom:20px}
.todo-form input{flex:1;padding:10px;border:1px solid #ddd;border-radius:4px}
.todo-form button{padding:10px 20px;background:#28a745;color:white;border:none;border-radius:4px}
.todo-item{display:flex;align-items:center;gap:10px;padding:10px;background:#fafafa;border-radius:4px;margin-bottom:8px}
.todo-checkbox{width:18px;height:18px}
.todo-title{flex:1}
.completed .todo-title{text-decoration:line-through;color:#999}
.delete-btn{background:#dc3545;color:white;border:none;padding:4px 8px;border-radius:4px}
.empty-state{text-align:center;padding:40px;color:#999}
.stats{margin-top:20px;text-align:center;font-size:12px;color:#666}
</style>
</head>
<body>
<div class="container">
<div class="header"><h1>Todo List</h1></div>
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
            ' onchange="toggleTodo(\\''+todo._id+'\\',this.checked)">'+
            '<span class="todo-title">'+escapeHtml(todo.title)+'</span>'+
            '<button class="delete-btn" onclick="deleteTodo(\\''+todo._id+'\\')">Delete</button>'+
            '</div>').join('');
    }
    const completed=todos.filter(t=>t.completed).length;
    document.getElementById('stats').innerHTML='📊 '+todos.length+' total | ✅ '+completed+' completed';
}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
async function addTodo(){const i=document.getElementById('title');const t=i.value.trim();if(!t)return;await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t})});i.value='';loadTodos();}
async function toggleTodo(id,completed){await fetch('/api/todos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed})});loadTodos();}
async function deleteTodo(id){if(confirm('Delete?')){await fetch('/api/todos/'+id,{method:'DELETE'});loadTodos();}}
loadTodos();
</script>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
