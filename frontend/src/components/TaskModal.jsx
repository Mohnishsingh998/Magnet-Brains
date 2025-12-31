import React, { useState, useEffect } from 'react';
import { FiX, FiCalendar, FiTag, FiAlignLeft } from 'react-icons/fi';
import { taskAPI, userAPI } from '../services/api';
import toast from 'react-hot-toast';
import '../styles/TaskModal.css';

const TaskModal = ({ isOpen, onClose, onTaskCreated, onTaskUpdated, editingTask }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    dueDate: '',
    priority: 'Medium',
    status: 'To Do',
    tags: ''
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      
      // Populate form if editing
      if (editingTask) {
        setFormData({
          title: editingTask.title || '',
          description: editingTask.description || '',
          assignedTo: editingTask.assignedTo?._id || editingTask.assignedTo || '',
          dueDate: editingTask.dueDate ? new Date(editingTask.dueDate).toISOString().split('T')[0] : '',
          priority: editingTask.priority || 'Medium',
          status: editingTask.status || 'To Do',
          tags: editingTask.tags ? editingTask.tags.join(', ') : ''
        });
      } else {
        // Reset form for new task
        setFormData({
          title: '',
          description: '',
          assignedTo: '',
          dueDate: '',
          priority: 'Medium',
          status: 'To Do',
          tags: ''
        });
      }
    }
  }, [isOpen, editingTask]);

  const loadUsers = async () => {
    try {
      const response = await userAPI.getUsers();
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert tags string to array
      const tags = formData.tags
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];

      const taskData = {
        ...formData,
        tags
      };

      if (editingTask) {
        // Update existing task
        await taskAPI.updateTask(editingTask._id, taskData);
        toast.success('Task updated successfully!');
        onTaskUpdated();
      } else {
        // Create new task
        await taskAPI.createTask(taskData);
        toast.success('Task created successfully!');
        onTaskCreated();
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      const message = error.response?.data?.message || `Failed to ${editingTask ? 'update' : 'create'} task`;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingTask ? 'Edit Task' : 'Create New Task'}</h2>
          <button className="close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="input-group">
            <label htmlFor="title">
              <FiAlignLeft /> Task Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Enter task title"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter task description (optional)"
              rows="4"
            />
          </div>

          <div className="form-row">
            <div className="input-group">
              <label htmlFor="assignedTo">
                Assign To *
              </label>
              <select
                id="assignedTo"
                name="assignedTo"
                value={formData.assignedTo}
                onChange={handleChange}
                required
                disabled={loadingUsers}
              >
                <option value="">Select user...</option>
                {users.map(user => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="status">
                Status *
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
              >
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label htmlFor="priority">
                Priority *
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                required
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="dueDate">
                <FiCalendar /> Due Date *
              </label>
              <input
                type="date"
                id="dueDate"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="tags">
              <FiTag /> Tags (comma separated)
            </label>
            <input
              type="text"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="e.g., urgent, frontend, bug-fix"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || loadingUsers}
            >
              {loading ? (
                <>
                  <div className="spinner-small"></div>
                  {editingTask ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                editingTask ? 'Update Task' : 'Create Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;