import React, { useState, useEffect, FormEvent, ChangeEvent, useCallback } from 'react';
import { Button } from '../../_shared/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../_shared/ui/Card';
import { Input } from '../../_shared/ui/Input';
import { useBridge } from '../../_shared/hooks/useBridge';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

const STORAGE_KEY = 'todos';

export default function App() {
  const { bridge, isReady } = useBridge();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load todos from backend storage on mount
  useEffect(() => {
    if (!isReady) return;

    const loadTodos = async () => {
      try {
        const stored = await bridge.storage.get<Todo[]>(STORAGE_KEY);
        if (stored) {
          setTodos(stored);
        }
      } catch (error) {
        console.error('Failed to load todos:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTodos();
  }, [isReady, bridge]);

  // Save todos to backend storage
  const saveTodos = useCallback(
    async (newTodos: Todo[]) => {
      try {
        await bridge.storage.set(STORAGE_KEY, newTodos);
      } catch (error) {
        console.error('Failed to save todos:', error);
      }
    },
    [bridge]
  );

  const addTodo = async () => {
    if (!newTodoText.trim()) return;

    const newTodo: Todo = {
      id: Date.now().toString(),
      text: newTodoText.trim(),
      completed: false,
    };

    const newTodos = [...todos, newTodo];
    setTodos(newTodos);
    setNewTodoText('');
    await saveTodos(newTodos);
  };

  const toggleTodo = async (id: string) => {
    const newTodos = todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    setTodos(newTodos);
    await saveTodos(newTodos);
  };

  const deleteTodo = async (id: string) => {
    const newTodos = todos.filter((todo) => todo.id !== id);
    setTodos(newTodos);
    await saveTodos(newTodos);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    addTodo();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewTodoText(e.target.value);
  };

  const remainingCount = todos.filter((todo) => !todo.completed).length;

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground font-sans">Simple Todo</h1>
          <p className="text-muted-foreground text-sm">Manage your daily tasks</p>
        </div>

        {/* Add Todo Form */}
        <Card>
          <CardHeader>
            <CardTitle>Add New Todo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Todo item"
                value={newTodoText}
                onChange={handleInputChange}
                placeholder="Enter a new todo..."
              />
              <Button type="submit" variant="primary" disabled={!newTodoText.trim()}>
                Add Todo
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Todo List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Todos</CardTitle>
          </CardHeader>
          <CardContent>
            {todos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="font-sans">No todos yet</p>
                <p className="text-sm">Add your first todo above to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border"
                  >
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span
                      className={`flex-1 font-sans text-sm ${
                        todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {todo.text}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => deleteTodo(todo.id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          {todos.length > 0 && (
            <CardFooter>
              <div className="text-sm text-muted-foreground font-mono">
                {remainingCount} of {todos.length} remaining
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
