// API service for Unity backend communication

const API_URL = 'http://localhost:8080';

export const api = {
  /**
   * Get current system status
   * @returns {Promise<Object>} System state data
   */
  async getStatus() {
    try {
      const response = await fetch(`${API_URL}/status`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Fetch status error:', error);
      throw error;
    }
  },

  /**
   * Reset the simulation
   * @returns {Promise<Object>} Response data
   */
  async reset() {
    try {
      const response = await fetch(`${API_URL}/reset`, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Reset failed with status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Reset error:', error);
      throw error;
    }
  },

  /**
   * Send command to ships
   * @param {string} command - Command name (START or STOP)
   * @param {Array<string>} ships - List of ship names
   * @returns {Promise<Object>} Response data
   */
  async sendCommand(command, ships) {
    try {
      const response = await fetch(`${API_URL}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: command.toUpperCase(),
          ships: ships
        })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Command failed with status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`Send command error:`, error);
      throw error;
    }
  },

  /**
   * Send waypoints to a ship
   * @param {string} shipName - Name of the ship
   * @param {Array<Array<number>>} waypoints - Array of [x, y, z] coordinates
   * @returns {Promise<Object>} Response data
   */
  async sendWaypoints(shipName, waypoints) {
    try {
      const response = await fetch(`${API_URL}/waypoint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ship: shipName,
          waypoints: waypoints
        })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Waypoint command failed with status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Send waypoints error:', error);
      throw error;
    }
  },

  /**
   * Spawn persons in distress at a specified location
   * @param {number} count - Number of persons to spawn
   * @param {number} radius - Spawn radius
   * @param {Object} center - Center point {x, y, z}
   * @returns {Promise<Object>} Response data
   */
  async spawnPersons(count, radius, center) {
    try {
      const response = await fetch(`${API_URL}/spawn_persons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          count: count,
          radius: radius,
          center: center
        })
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Spawn persons failed with status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Spawn persons error:', error);
      throw error;
    }
  }
};
