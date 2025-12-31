import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/useAuth'; 
import { useWebSocket } from '../hooks/useWebSocket';
import { taskAPI } from '../services/api';
import toast from 'react-hot-toast';
import { FiLogOut, FiPlus, FiRefreshCw, FiWifi, FiWifiOff, FiEdit2, FiTrash2 } from 'react-icons/fi';
import TaskModal from './TaskModal';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const response = await taskAPI.getTasks();
      setTasks(response.data.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('WebSocket message:', data.type);
    
    switch (data.type) {
      case 'TASK_CREATED':
      case 'TASK_UPDATED':
        loadTasks();
        break;
      case 'TASK_DELETED':
        setTasks(prev => prev.filter(t => t._id !== data.taskId));
        break;
      default:
        break;
    }
  }, [loadTasks]);

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  const handleTaskCreated = () => {
    loadTasks();
  };

  const handleTaskUpdated = () => {
    loadTasks();
    setEditingTask(null);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      await taskAPI.deleteTask(taskId);
      toast.success('Task deleted successfully');
      loadTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error('Failed to delete task');
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedTask(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    
    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    try {
      await taskAPI.updateTask(draggedTask._id, { status: newStatus });
      toast.success(`Task moved to ${newStatus}`);
      loadTasks();
    } catch (error) {
      console.error('Failed to update task:', error);
      toast.error('Failed to move task');
    } finally {
      setDraggedTask(null);
    }
  };

  const getTasksByStatus = (status) => {
    return tasks.filter(task => task.status === status);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="container">
          <div className="header-content">
            <div className="header-left">
              <h1>Task Board</h1>
              <div className="connection-status">
                {isConnected ? (
                  <>
                    <FiWifi className="status-icon connected" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <FiWifiOff className="status-icon disconnected" />
                    <span>Disconnected</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="header-right">
              <span className="user-name">Welcome, {user?.name}</span>
              <button className="btn btn-secondary btn-sm" onClick={loadTasks}>
                <FiRefreshCw /> Refresh
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => setIsModalOpen(true)}
              >
                <FiPlus /> New Task
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                <FiLogOut /> Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="container">
          <div className="task-board">
            {['To Do', 'In Progress', 'Completed'].map(status => (
              <div 
                key={status} 
                className={`task-column ${draggedTask && draggedTask.status !== status ? 'drag-over-target' : ''}`}
                data-status={status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="column-header">
                  <h3>{status}</h3>
                  <span className="task-count">{getTasksByStatus(status).length}</span>
                </div>
                
                <div className="task-list">
                  {getTasksByStatus(status).map(task => (
                    <div
                      key={task._id}
                      className={`task-card ${draggedTask?._id === task._id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="task-header">
                        <h4>{task.title}</h4>
                        <div className="task-actions">
                          <button
                            className="icon-btn edit-btn"
                            onClick={() => handleEditTask(task)}
                            title="Edit task"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className="icon-btn delete-btn"
                            onClick={() => handleDeleteTask(task._id)}
                            title="Delete task"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </div>

                      <span className={`badge badge-${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                      
                      {task.description && (
                        <p className="task-description">{task.description}</p>
                      )}
                      
                      <div className="task-footer">
                        <span className="task-date">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                        {task.tags && task.tags.length > 0 && (
                          <div className="task-tags">
                            {task.tags.slice(0, 2).map((tag, idx) => (
                              <span key={idx} className="tag">{tag}</span>
                            ))}
                            {task.tags.length > 2 && (
                              <span className="tag">+{task.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {task.assignedTo && (
                        <div className="task-assigned">
                          <small>Assigned to: {task.assignedTo.name || task.assignedTo.email}</small>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {getTasksByStatus(status).length === 0 && (
                    <div className="empty-state">
                      <p>No tasks</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <TaskModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTaskCreated={handleTaskCreated}
        onTaskUpdated={handleTaskUpdated}
        editingTask={editingTask}
      />
    </div>
  );
};

export default Dashboard;