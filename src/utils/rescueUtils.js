/**
 * Calculate rescue area center and radius based on persons in distress
 * @param {Array} persons - Array of person objects with position and isSaved properties
 * @returns {Object|null} - { centerX, centerZ, radius } or null if no persons in distress
 */
export function calculateRescueArea(persons) {
  const personsInDistress = persons.filter(p => !p.isSaved);

  if (personsInDistress.length === 0) {
    return null;
  }

  // Calculate center point (average position)
  const centerX = personsInDistress.reduce((sum, p) => sum + p.position.x, 0) / personsInDistress.length;
  const centerZ = personsInDistress.reduce((sum, p) => sum + p.position.z, 0) / personsInDistress.length;

  // Calculate radius (max distance from center)
  const radius = Math.max(...personsInDistress.map(p =>
    Math.hypot(p.position.x - centerX, p.position.z - centerZ)
  ));

  return { centerX, centerZ, radius };
}

/**
 * Generate parallel rescue target points for ships
 * Ships will be arranged horizontally and move parallel through the rescue area
 * @param {Object} startPoint - Start point {x, z} (end of route_001)
 * @param {number} centerX - Rescue area center X coordinate
 * @param {number} centerZ - Rescue area center Z coordinate
 * @param {number} radius - Rescue area radius
 * @param {number} shipCount - Number of ships
 * @returns {Array} - Array of target points [{x, z}, ...]
 */
export function generateRescueTargets(startPoint, centerX, centerZ, radius, shipCount) {
  const targets = [];

  // Calculate forward direction vector (from start point to rescue center)
  const forwardX = centerX - startPoint.x;
  const forwardZ = centerZ - startPoint.z;
  const forwardLength = Math.hypot(forwardX, forwardZ);

  // Normalize forward direction
  const forwardDirX = forwardX / forwardLength;
  const forwardDirZ = forwardZ / forwardLength;

  // Calculate perpendicular direction (lateral direction)
  // If forward is (dx, dz), perpendicular is (-dz, dx)
  const lateralDirX = -forwardDirZ;
  const lateralDirZ = forwardDirX;

  // Calculate spacing between ships (evenly distributed across rescue area diameter)
  const totalWidth = radius * 2;
  const spacing = shipCount > 1 ? totalWidth / (shipCount - 1) : 0;

  // Generate target points for each ship
  for (let i = 0; i < shipCount; i++) {
    // Calculate lateral offset from center
    const lateralOffset = (i - (shipCount - 1) / 2) * spacing;

    // Target point = rescue center + forward direction * (3 * radius) + lateral offset
    const targetX = centerX + forwardDirX * (3 * radius) + lateralDirX * lateralOffset;
    const targetZ = centerZ + forwardDirZ * (3 * radius) + lateralDirZ * lateralOffset;

    targets.push({ x: targetX, z: targetZ });
  }

  return targets;
}

/**
 * Generate intermediate waypoints between two points
 * @param {Object} start - Start point {x, z}
 * @param {Object} end - End point {x, z}
 * @param {number} count - Number of intermediate points to generate
 * @returns {Array} - Array of waypoint arrays [x, y, z]
 */
export function generateIntermediateWaypoints(start, end, count) {
  const waypoints = [];

  for (let i = 1; i <= count; i++) {
    const ratio = i / (count + 1);
    const x = start.x + (end.x - start.x) * ratio;
    const z = start.z + (end.z - start.z) * ratio;

    waypoints.push([x, 0, z]);
  }

  return waypoints;
}

/**
 * Build complete rescue route for a ship
 * @param {Object} baseRoute - Base route object (e.g., route_001) with waypoints array
 * @param {Object} targetPoint - Target rescue point {x, z}
 * @param {number} intermediateCount - Number of intermediate waypoints to add
 * @returns {Array} - Complete waypoint array
 */
export function buildRescueRoute(baseRoute, targetPoint, intermediateCount = 20) {
  const baseWaypoints = [...baseRoute.waypoints];
  const lastWaypoint = baseWaypoints[baseWaypoints.length - 1];

  // Generate intermediate waypoints
  const intermediateWaypoints = generateIntermediateWaypoints(
    { x: lastWaypoint[0], z: lastWaypoint[2] },
    targetPoint,
    intermediateCount
  );

  // Create final target waypoint as array [x, y, z]
  const targetWaypoint = [targetPoint.x, 0, targetPoint.z];

  // Combine all waypoints
  return [...baseWaypoints, ...intermediateWaypoints, targetWaypoint];
}
