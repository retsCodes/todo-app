const express = require('express');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.z2grjun.mongodb.net/todo?retryWrites=true&w=majority';

app.use(express.json());

// Connect to MongoDB Atlas
console.log('Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
db.on('error', (err) => console.error('MongoDB error:', err.message));
db.once('open', () => console.log('✅ Connected to MongoDB Atlas'));

const Todo = mongoose.model('Todo', new mongoose.Schema({
    title: String,
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', database: 'MongoDB Atlas', dbConnected: mongoose.connection.readyState === 1 });
});

// Metrics
app.get('/metrics', async (req, res) => {
    const count = await Todo.countDocuments();
    res.set('Content-Type', 'text/plain');
    res.send(`
# HELP todo_total Total todos
# TYPE todo_total gauge
todo_total ${count}
    `);
});

// API endpoints
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
    res.send('<h1>Todo App - Cloud with Atlas</h1><p><a href="/api/todos">View Todos</a></p>');
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Cloud app running on port ${PORT} with Atlas`));
