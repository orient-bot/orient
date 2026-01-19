import React, { useState } from 'react';
import { Button } from '../../_shared/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../_shared/ui/card';
import { Input } from '../../_shared/ui/input';
import { useBridge } from '../../_shared/hooks/useBridge';
import { required } from '../../_shared/utils/validation';
import { createAction } from '../../_shared/actions';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export default function App() {
  const { isReady } = useBridge();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addTodo = createAction(
    async () => {
      if (!newTodoText.trim()) return;
      
      const newTodo: Todo = {
        id: Date.now().toString(),
        text: newTodoText.trim(),
        completed: false
      };
      
      setTodos(prev => [...prev, newTodo]);
      setNewTodoText('');
    },
    {
      loadingState: [isAdding, setIsAdding],
      successMessage: 'Todo added successfully!'
    }
  );

  const toggleTodo = (id: string) => {
    setTodos(prev => 
      prev.map(todo => 
        todo.id === id 
          ? { ...todo, completed: !todo.completed }
          : todo
      )
    );
  };

  const deleteTodo = createAction(
    async (id: string) => {
      setTodos(prev => prev.filter(todo => todo.id !== id));
    },
    {
      successMessage: 'Todo deleted!'
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTodo();
  };

  const remainingCount = todos.filter(todo => !todo.completed).length;

  if (!isReady) {
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
            <CardTitle className="text-lg font-sans">Add New Todo</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Todo item"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Enter a new todo..."
                checks={[required()]}
                validateOn="submit"
              />
              <Button 
                type="submit" 
                variant="primary" 
                className="w-full"
                loading={isAdding}
                disabled={!newTodoText.trim()}
              >
                Add Todo
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Todo List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-sans">Your Todos</CardTitle>
          </CardHeader>
          <CardContent>
            {todos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-4xl mb-2">📝</div>
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
                        todo.completed 
                          ? 'text-muted-foreground line-through' 
                          : 'text-foreground'
                      }`}
                    >
                      {todo.text}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTodo(todo.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
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