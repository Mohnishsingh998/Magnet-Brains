import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';

export const useWebSocket = (onMessage) => {
  const { token } = useAuth();
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Don't connect if no token
    if (!token) {
      console.log('No token, skipping WebSocket');
      return;
    }

    // Don't create duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already exists, skipping');
      return;
    }

    console.log('Creating WebSocket connection...');
    
    const wsUrl = `${import.meta.env.VITE_WS_URL}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'PONG' && data.type !== 'CONNECTED' && onMessage) {
          onMessage(data);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      
      console.log('WebSocket closed:', event.code);
      setIsConnected(false);
      wsRef.current = null;

      // Only reconnect if:
      // 1. Component is still mounted
      // 2. Not a clean close (1000)
      // 3. Less than 3 attempts
      // 4. Still have token
      if (mountedRef.current && 
          event.code !== 1000 && 
          reconnectAttemptsRef.current < 3 && 
          token) {
        
        reconnectAttemptsRef.current += 1;
        const delay = 3000 * reconnectAttemptsRef.current;
        
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/3)`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && token) {
            console.log('Attempting reconnect...');
            // Force a re-render to trigger reconnection
            setIsConnected(false);
          }
        }, delay);
      }
    };

    // Cleanup function
    return () => {
      mountedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        console.log('Cleaning up WebSocket connection');
        wsRef.current.onclose = null; // Prevent reconnection on cleanup
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [token]); // Only depend on token, NOT onMessage!

  return { isConnected };
};