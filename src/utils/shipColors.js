// Predefined color palette for ships
const SHIP_COLORS = [
  "#FF5252", // Red
  "#2196F3", // Blue
  "#4CAF50", // Green
  "#FFC107", // Yellow
  "#9C27B0", // Purple
  "#FF9800", // Orange
  "#00BCD4", // Cyan
  "#E91E63", // Pink
];

/**
 * Get color for a specific ship based on its position in the ship list
 * @param {string} shipName - Name of the ship
 * @param {Array} allShips - Array of all ships
 * @returns {string} Hex color code
 */
export function getShipColor(shipName, allShips) {
  const index = allShips.findIndex((ship) => ship.name === shipName);
  if (index === -1) return "#FFFFFF"; // Default to white if not found
  return SHIP_COLORS[index % SHIP_COLORS.length];
}
