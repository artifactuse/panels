// Mock data for development testing
// Usage: import { getMockData } from '@artifactuse/shared/mockData'

export const mockData = {
  // JSON Viewer mock data
  json: {
    name: "Artifactuse SDK",
    version: "0.1.0",
    description: "AI artifact rendering toolkit",
    author: {
      name: "Developer",
      email: "dev@example.com",
      github: "https://github.com/example"
    },
    dependencies: {
      vue: "^3.4.0",
      react: "^18.2.0",
      svelte: "^4.0.0"
    },
    features: [
      "Code block detection",
      "Syntax highlighting",
      "Panel artifacts",
      "Framework wrappers"
    ],
    config: {
      theme: "dark",
      processors: {
        codeBlocks: true,
        images: true,
        videos: true,
        maps: true
      },
      panelArtifacts: ["video", "canvas", "json", "svg", "diff", "sandbox"]
    },
    stats: {
      downloads: 15420,
      stars: 342,
      contributors: 12,
      openIssues: 8
    },
    metadata: {
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-12-20T14:45:00Z",
      license: "MIT",
      keywords: ["ai", "artifacts", "sdk", "vue", "react", "svelte"]
    }
  },

  // SVG Viewer mock data
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f"/>
      <stop offset="100%" style="stop-color:#3d6098"/>
    </linearGradient>
    <linearGradient id="sunGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffd93d"/>
      <stop offset="100%" style="stop-color:#ff9a3c"/>
    </linearGradient>
  </defs>
  
  <!-- Sky -->
  <rect width="400" height="300" fill="url(#skyGradient)"/>
  
  <!-- Sun -->
  <circle cx="320" cy="80" r="40" fill="url(#sunGradient)"/>
  
  <!-- Mountains -->
  <polygon points="0,300 100,150 200,300" fill="#2d4a3e"/>
  <polygon points="100,300 200,120 300,300" fill="#1a2f25"/>
  <polygon points="200,300 320,160 400,300" fill="#3d5c4a"/>
  
  <!-- Trees -->
  <g fill="#1a2f25">
    <polygon points="50,280 60,240 70,280"/>
    <polygon points="340,270 355,220 370,270"/>
    <polygon points="380,285 390,250 400,285"/>
  </g>
  
  <!-- Stars -->
  <g fill="#ffffff" opacity="0.8">
    <circle cx="50" cy="40" r="1.5"/>
    <circle cx="120" cy="60" r="1"/>
    <circle cx="180" cy="30" r="1.5"/>
    <circle cx="250" cy="50" r="1"/>
    <circle cx="80" cy="90" r="1"/>
    <circle cx="150" cy="100" r="1.5"/>
  </g>
  
  <!-- Text -->
  <text x="200" y="280" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="14" opacity="0.7">
    Artifactuse SVG Viewer
  </text>
</svg>`,

  // Diff Viewer mock data
  diff: {
    oldCode: `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}

function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}

// Main execution
const cart = [
  { name: 'Widget', price: 9.99 },
  { name: 'Gadget', price: 24.99 },
];

console.log(formatCurrency(calculateTotal(cart)));`,
    newCode: `function calculateTotal(items, taxRate = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * taxRate;
  return subtotal + tax;
}

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

// Main execution
const cart = [
  { name: 'Widget', price: 9.99, quantity: 2 },
  { name: 'Gadget', price: 24.99, quantity: 1 },
  { name: 'Accessory', price: 4.99, quantity: 3 },
];

const TAX_RATE = 0.08;
console.log(formatCurrency(calculateTotal(cart, TAX_RATE)));`,
    oldTitle: 'cart-utils.js (original)',
    newTitle: 'cart-utils.js (refactored)'
  },

  // Sandbox mock data - JavaScript
  javascript: `// Interactive counter example
let count = 0;

function increment() {
  count++;
  console.log('Count:', count);
}

function decrement() {
  count--;
  console.log('Count:', count);
}

// Test the functions
console.log('Starting count:', count);
increment();
increment();
increment();
decrement();
console.log('Final count:', count);

// Array operations
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const sum = numbers.reduce((a, b) => a + b, 0);

console.log('Original:', numbers);
console.log('Doubled:', doubled);
console.log('Sum:', sum);

// Return a result
({ count, doubled, sum });`,

  // Sandbox mock data - Python
  python: `# Python sandbox example
import math

def fibonacci(n):
    """Generate Fibonacci sequence up to n terms"""
    sequence = []
    a, b = 0, 1
    for _ in range(n):
        sequence.append(a)
        a, b = b, a + b
    return sequence

def is_prime(n):
    """Check if a number is prime"""
    if n < 2:
        return False
    for i in range(2, int(math.sqrt(n)) + 1):
        if n % i == 0:
            return False
    return True

# Generate Fibonacci sequence
fib = fibonacci(10)
print(f"Fibonacci (10 terms): {fib}")

# Find prime numbers
primes = [n for n in range(2, 50) if is_prime(n)]
print(f"Primes up to 50: {primes}")

# Calculate statistics
numbers = [23, 45, 12, 67, 89, 34, 56]
print(f"Numbers: {numbers}")
print(f"Sum: {sum(numbers)}")
print(f"Average: {sum(numbers) / len(numbers):.2f}")
print(f"Max: {max(numbers)}")
print(f"Min: {min(numbers)}")

# Return result
len(primes)`,

  // HTML Preview mock data
  html: `<!DOCTYPE html>
<html>
<head>
  <style>
    .card {
      max-width: 400px;
      margin: 20px auto;
      padding: 24px;
      border-radius: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
    }
    .card h2 {
      margin: 0 0 12px 0;
      font-size: 24px;
    }
    .card p {
      margin: 0 0 16px 0;
      opacity: 0.9;
      line-height: 1.6;
    }
    .card button {
      background: white;
      color: #667eea;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .card button:hover {
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Welcome to Artifactuse</h2>
    <p>This is a sample HTML preview demonstrating the capabilities of the HTML preview panel. You can render any HTML content here!</p>
    <button onclick="alert('Hello from Artifactuse!')">Click Me</button>
  </div>
</body>
</html>`,

  // Markdown Preview mock data
  markdown: `# Artifactuse Documentation

## Overview

Artifactuse is a powerful SDK for rendering AI-generated artifacts in your applications.

### Features

- **Code Detection**: Automatically detects code blocks in AI responses
- **Syntax Highlighting**: Beautiful syntax highlighting for 100+ languages
- **Panel Artifacts**: Rich interactive panels for complex content
- **Framework Support**: Works with React, Vue, Svelte, and vanilla JS

## Installation

\`\`\`bash
npm install @artifactuse/sdk
\`\`\`

## Quick Start

\`\`\`javascript
import { createArtifactuse } from '@artifactuse/sdk';

const artifactuse = createArtifactuse({
  theme: 'dark',
  processors: {
    codeBlocks: true,
    images: true
  }
});
\`\`\`

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| theme | string | 'auto' | Color theme |
| cdnUrl | string | - | CDN URL for panels |
| processors | object | all enabled | Toggle processors |

> **Note**: For production use, always specify a \`cdnUrl\` for panel artifacts.

---

*Built with ❤️ by the Artifactuse team*`,

  // React Preview mock data
  react: `function Counter() {
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);
  
  const increment = () => {
    setCount(c => c + 1);
    setHistory(h => [...h, { action: '+1', value: count + 1, time: new Date().toLocaleTimeString() }]);
  };
  
  const decrement = () => {
    setCount(c => c - 1);
    setHistory(h => [...h, { action: '-1', value: count - 1, time: new Date().toLocaleTimeString() }]);
  };
  
  const reset = () => {
    setCount(0);
    setHistory([]);
  };
  
  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-center">React Counter</h2>
        
        <div className="text-6xl font-bold text-center my-8">{count}</div>
        
        <div className="flex gap-3 justify-center">
          <button 
            onClick={decrement}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition"
          >
            - 1
          </button>
          <button 
            onClick={reset}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition"
          >
            Reset
          </button>
          <button 
            onClick={increment}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition"
          >
            + 1
          </button>
        </div>
      </div>
      
      {history.length > 0 && (
        <div className="mt-4 bg-gray-100 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-gray-700">History</h3>
          <div className="space-y-1 max-h-32 overflow-auto">
            {history.slice(-5).map((h, i) => (
              <div key={i} className="text-sm text-gray-600 flex justify-between">
                <span>{h.action} → {h.value}</span>
                <span className="text-gray-400">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}`,

  // Vue Preview mock data
  vue: `<template>
  <div class="todo-app">
    <h2>Vue Todo List</h2>
    
    <div class="add-todo">
      <input 
        v-model="newTodo" 
        @keyup.enter="addTodo"
        placeholder="Add a new task..."
      />
      <button @click="addTodo">Add</button>
    </div>
    
    <div class="filters">
      <button 
        v-for="f in ['all', 'active', 'completed']" 
        :key="f"
        :class="{ active: filter === f }"
        @click="filter = f"
      >
        {{ f }}
      </button>
    </div>
    
    <ul class="todo-list">
      <li 
        v-for="todo in filteredTodos" 
        :key="todo.id"
        :class="{ completed: todo.done }"
      >
        <input type="checkbox" v-model="todo.done" />
        <span>{{ todo.text }}</span>
        <button class="delete" @click="removeTodo(todo.id)">×</button>
      </li>
    </ul>
    
    <div class="stats">
      {{ activeTodos }} items left
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      newTodo: '',
      filter: 'all',
      todos: [
        { id: 1, text: 'Learn Vue 3', done: true },
        { id: 2, text: 'Build Artifactuse panels', done: true },
        { id: 3, text: 'Write documentation', done: false },
        { id: 4, text: 'Add more features', done: false },
      ]
    }
  },
  computed: {
    filteredTodos() {
      if (this.filter === 'active') return this.todos.filter(t => !t.done);
      if (this.filter === 'completed') return this.todos.filter(t => t.done);
      return this.todos;
    },
    activeTodos() {
      return this.todos.filter(t => !t.done).length;
    }
  },
  methods: {
    addTodo() {
      if (!this.newTodo.trim()) return;
      this.todos.push({
        id: Date.now(),
        text: this.newTodo,
        done: false
      });
      this.newTodo = '';
    },
    removeTodo(id) {
      this.todos = this.todos.filter(t => t.id !== id);
    }
  }
}
</script>

<style>
.todo-app {
  max-width: 400px;
  margin: 20px auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
h2 {
  color: #42b883;
  text-align: center;
}
.add-todo {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.add-todo input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
}
.add-todo button {
  padding: 8px 16px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.filters button {
  padding: 4px 12px;
  background: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-transform: capitalize;
}
.filters button.active {
  background: #42b883;
  color: white;
}
.todo-list {
  list-style: none;
  padding: 0;
}
.todo-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #eee;
}
.todo-list li.completed span {
  text-decoration: line-through;
  opacity: 0.5;
}
.todo-list li span {
  flex: 1;
}
.delete {
  background: none;
  border: none;
  color: #ff6b6b;
  font-size: 20px;
  cursor: pointer;
}
.stats {
  text-align: center;
  color: #888;
  margin-top: 16px;
}
</style>`,

  // Form Panel mock data - Fields variant
  form: {
    type: 'form',
    id: 'project-setup-form',
    display: 'panel',
    variant: 'fields',
    title: 'Create New Project',
    description: 'Fill out the details below to set up your new project.',
    submitLabel: 'Create Project',
    cancelLabel: 'Cancel',
    data: {
      layout: 'vertical',
      fields: [
        { 
          name: 'projectName', 
          type: 'text', 
          label: 'Project Name', 
          required: true,
          placeholder: 'my-awesome-project',
          helpText: 'Use lowercase letters, numbers, and hyphens only'
        },
        { 
          name: 'description', 
          type: 'textarea', 
          label: 'Description', 
          rows: 3,
          placeholder: 'Describe your project...'
        },
        { 
          name: 'framework', 
          type: 'select', 
          label: 'Framework',
          required: true,
          options: [
            { value: 'react', label: 'React' },
            { value: 'vue', label: 'Vue' },
            { value: 'svelte', label: 'Svelte' },
            { value: 'angular', label: 'Angular' },
            { value: 'vanilla', label: 'Vanilla JS' }
          ]
        },
        { 
          name: 'features', 
          type: 'multiselect', 
          label: 'Features',
          options: [
            { value: 'auth', label: 'Authentication' },
            { value: 'database', label: 'Database Integration' },
            { value: 'api', label: 'API Routes' },
            { value: 'testing', label: 'Testing Setup' },
            { value: 'ci', label: 'CI/CD Pipeline' }
          ]
        },
        { 
          name: 'visibility', 
          type: 'radio', 
          label: 'Visibility',
          options: [
            { value: 'public', label: 'Public - Anyone can see this project' },
            { value: 'private', label: 'Private - Only you can see this project' }
          ]
        },
        { 
          name: 'initRepo', 
          type: 'toggle', 
          label: 'Initialize Git Repository',
          defaultValue: true
        },
        { 
          name: 'license', 
          type: 'select', 
          label: 'License',
          options: [
            { value: 'mit', label: 'MIT' },
            { value: 'apache', label: 'Apache 2.0' },
            { value: 'gpl', label: 'GPL 3.0' },
            { value: 'none', label: 'No License' }
          ]
        }
      ]
    }
  },

  // Form Panel mock data - Wizard variant
  formWizard: {
    type: 'form',
    id: 'onboarding-wizard',
    display: 'panel',
    variant: 'wizard',
    title: 'Account Setup',
    data: {
      showProgress: true,
      allowSkip: false,
      steps: [
        {
          id: 'personal',
          title: 'Personal Info',
          description: 'Tell us about yourself',
          fields: [
            { name: 'firstName', type: 'text', label: 'First Name', required: true },
            { name: 'lastName', type: 'text', label: 'Last Name', required: true },
            { name: 'email', type: 'email', label: 'Email Address', required: true },
            { name: 'phone', type: 'tel', label: 'Phone Number', placeholder: '+1 (555) 000-0000' }
          ]
        },
        {
          id: 'company',
          title: 'Company Details',
          description: 'Tell us about your organization',
          fields: [
            { name: 'company', type: 'text', label: 'Company Name' },
            { name: 'role', type: 'text', label: 'Your Role' },
            { 
              name: 'size', 
              type: 'select', 
              label: 'Company Size',
              options: [
                { value: '1-10', label: '1-10 employees' },
                { value: '11-50', label: '11-50 employees' },
                { value: '51-200', label: '51-200 employees' },
                { value: '201-1000', label: '201-1000 employees' },
                { value: '1000+', label: '1000+ employees' }
              ]
            },
            { name: 'website', type: 'url', label: 'Website', placeholder: 'https://' }
          ]
        },
        {
          id: 'preferences',
          title: 'Preferences',
          description: 'Customize your experience',
          fields: [
            { 
              name: 'theme', 
              type: 'radio', 
              label: 'Theme',
              options: [
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'auto', label: 'System Default' }
              ]
            },
            { 
              name: 'notifications', 
              type: 'multiselect', 
              label: 'Notification Preferences',
              options: [
                { value: 'email', label: 'Email notifications' },
                { value: 'push', label: 'Push notifications' },
                { value: 'sms', label: 'SMS notifications' }
              ]
            },
            { name: 'newsletter', type: 'checkbox', label: 'Subscribe to our newsletter' },
            { name: 'beta', type: 'toggle', label: 'Join beta program for early access' }
          ]
        }
      ]
    }
  },

  // Form Panel mock data - Buttons variant (inline style but shown in panel for testing)
  formButtons: {
    type: 'form',
    id: 'deploy-confirmation',
    display: 'panel',
    variant: 'buttons',
    title: 'Deploy to Production',
    description: 'You are about to deploy version 2.4.1 to production. This action will affect all users.',
    data: {
      buttons: [
        { id: 'deploy', label: 'Deploy Now', style: 'success' },
        { id: 'schedule', label: 'Schedule', style: 'primary' },
        { id: 'cancel', label: 'Cancel', style: 'secondary' }
      ]
    }
  }
};

/**
 * Get mock data for a specific panel type
 * @param {string} type - Panel type (json, svg, diff, javascript, python, html, markdown, react, vue)
 * @returns {any} Mock data for the panel
 */
export function getMockData(type) {
  return mockData[type] || null;
}

/**
 * Check if running in development mode
 * @returns {boolean}
 */
export function isDev() {
  return import.meta.env?.DEV || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1';
}

/**
 * Auto-inject mock data if in dev mode and no data provided
 * @param {string} type - Panel type
 * @param {any} existingData - Existing data (if any)
 * @returns {any} Data to use
 */
export function getDevData(type, existingData) {
  if (existingData) return existingData;
  if (!isDev()) return null;
  return getMockData(type);
}

export default mockData;
