const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let todos = [];
let nextId = 1;

// Health check - always returns 200
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString() 
    });
});

// Prometheus metrics
app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.write('# HELP todo_total Total number of todos\n');
    res.write('# TYPE todo_total gauge\n');
    res.write(`todo_total ${todos.length}\n`);
    res.write('# HELP app_up App is running\n');
    res.write('# TYPE app_up gauge\n');
    res.write('app_up 1\n');
    res.end();
});

// API
app.get('/api/todos', (req, res) => res.json(todos));
app.post('/api/todos', (req, res) => {
    const todo = { id: nextId++, title: req.body.title, completed: false };
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

app.get('/', (req, res) => {
    res.send(`
        <h1>Todo App - Cloud</h1>
        <p>Status: Running</p>
        <p><a href="/api/todos">View Todos</a></p>
        <p><a href="/metrics">View Metrics</a></p>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Cloud app running on port ${PORT}`);
});
