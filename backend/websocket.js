const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      verifyClient: (info, callback) => {
        // Allow connection, we'll verify token in handleConnection
        callback(true);
      }
    });
    
    this.clients = new Map(); // Map of userId -> Set of WebSocket connections

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('WebSocket server initialized');
  }

  async handleConnection(ws, req) {
    try {
      // Extract token from query string
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        console.log('❌ WebSocket connection rejected: No token provided');
        ws.close(1008, 'Token required');
        return;
      }

      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        console.log('❌ WebSocket connection rejected: Invalid token');
        ws.close(1008, 'Invalid token');
        return;
      }

      const user = await User.findById(decoded.id);

      if (!user) {
        console.log('❌ WebSocket connection rejected: User not found');
        ws.close(1008, 'User not found');
        return;
      }

      // Store connection
      ws.userId = user._id.toString();
      ws.isAlive = true;
      
      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId).add(ws);

      console.log(`✅ WebSocket client connected: ${user.email} (Total: ${this.getClientCount()})`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'WebSocket connection established',
        userId: ws.userId
      }));

      // Handle pong responses
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages from client
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        this.handleDisconnection(ws);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Authentication failed');
    }
  }

  handleMessage(ws, data) {
    // Handle ping/pong for keep-alive
    if (data.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
    }
  }

  handleDisconnection(ws) {
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
      }
      
      console.log(`❌ WebSocket client disconnected: ${ws.userId} (Total: ${this.getClientCount()})`);
    }
  }

  // Broadcast message to specific user (all their active connections)
  broadcastToUser(userId, message) {
    const userConnections = this.clients.get(userId.toString());
    
    if (userConnections) {
      const messageStr = JSON.stringify(message);
      
      userConnections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
    }
  }

  // Broadcast to all connected clients
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    
    this.clients.forEach((connections) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
    });
  }

  // Get number of connected clients
  getClientCount() {
    let count = 0;
    this.clients.forEach((connections) => {
      count += connections.size;
    });
    return count;
  }

  // Heartbeat to detect broken connections
  startHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('Terminating dead connection');
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds
  }
}

module.exports = WebSocketServer;