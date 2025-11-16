// --- CONSTANTS ---

// Unity map boundaries
export const MAP_MIN_X = -6200;
export const MAP_MAX_X = 8800;
export const MAP_MIN_Z = -1500;
export const MAP_MAX_Z = 13500;

// Geographical boundaries (WGS84)
const LON_MIN = 121.6140;
const LON_MAX = 121.9649;
const LAT_MIN = 25.1228;
const LAT_MAX = 25.2588;

// --- HELPER ---

/**
 * Converts screen pixel coordinates (e.g., from a mouse event)
 * to the underlying map image's pixel coordinates,
 * accounting for current pan and zoom.
 * @param {number} mouseX - Screen X coordinate (relative to container).
 * @param {number} mouseY - Screen Y coordinate (relative to container).
 * @param {number} scale - Current map scale.
 * @param {{x: number, y: number}} pos - Current map position (pan).
 * @returns {{mapX: number, mapY: number}} - Map image pixel coordinates.
 */
const screenToMapPixel = (mouseX, mouseY, scale, pos) => {
  const mapX = (mouseX - pos.x) / scale;
  const mapY = (mouseY - pos.y) / scale;
  return { mapX, mapY };
};

// --- EXPORTED FUNCTIONS ---

/**
 * Converts Unity map coordinates (X, Z) to screen pixel coordinates (x, y).
 * @param {number} mapX - Unity X coordinate.
 * @param {number} mapZ - Unity Z coordinate (used as Y).
 * @param {object} img - The map image element (imgRef.current).
 * @param {number} scale - Current map scale.
 * @param {{x: number, y: number}} pos - Current map position (pan).
 * @returns {{x: number, y: number}} - Screen pixel coordinates.
 */
export const mapToScreen = (mapX, mapZ, img, scale, pos) => {
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    return { x: 0, y: 0 };
  }

  // Calculate position within map bounds (0 to 1)
  const normalizedX = (mapX - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
  const normalizedZ = (mapZ - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);

  // Convert to image pixel coordinates
  // Note: (1 - normalizedZ) inverts Y axis (Unity Z up -> Image Y down)
  const imgX = normalizedX * img.naturalWidth;
  const imgY = (1 - normalizedZ) * img.naturalHeight;

  // Apply current transform (scale and position)
  const screenX = imgX * scale + pos.x;
  const screenY = imgY * scale + pos.y;

  return { x: screenX, y: screenY };
};

/**
 * Converts screen pixel coordinates (e.g., from mouse) to Latitude/Longitude.
 * @param {number} mouseX - Screen X coordinate (relative to container).
 * @param {number} mouseY - Screen Y coordinate (relative to container).
 * @param {object} img - The map image element (imgRef.current).
 * @param {number} scale - Current map scale.
 * @param {{x: number, y: number}} pos - Current map position (pan).
 * @returns {{lat: number, lon: number} | null} - Lat/Lon object or null.
 */
export const screenToLatLon = (mouseX, mouseY, img, scale, pos) => {
  const { mapX, mapY } = screenToMapPixel(mouseX, mouseY, scale, pos);

  if (img && img.naturalWidth && img.naturalHeight) {
    // Convert map image pixel to lon/lat
    const lon = LON_MIN + (mapX / img.naturalWidth) * (LON_MAX - LON_MIN);
    // Invert Y axis for latitude (image Y down -> Lat up)
    const lat = LAT_MAX - (mapY / img.naturalHeight) * (LAT_MAX - LAT_MIN);
    return { lat, lon };
  }
  return null;
};

/**
 * Converts screen pixel coordinates (e.g., from click) to Unity world coordinates (X, Z).
 * @param {number} mouseX - Screen X coordinate (relative to container).
 * @param {number} mouseY - Screen Y coordinate (relative to container).
 * @param {object} img - The map image element (imgRef.current).
 * @param {number} scale - Current map scale.
 * @param {{x: number, y: number}} pos - Current map position (pan).
 * @returns {{unityX: number, unityZ: number} | null} - Unity coords or null.
 */
export const screenToUnity = (mouseX, mouseY, img, scale, pos) => {
  const { mapX, mapY } = screenToMapPixel(mouseX, mouseY, scale, pos);

  if (img && img.naturalWidth && img.naturalHeight) {
    // Convert image pixel to normalized coordinates (0 to 1)
    const normalizedX = mapX / img.naturalWidth;
    const normalizedY = mapY / img.naturalHeight;

    // Convert normalized (0 to 1) to Unity coordinates
    const unityX = MAP_MIN_X + normalizedX * (MAP_MAX_X - MAP_MIN_X);

    // Invert Y axis (image Y down -> Unity Z up)
    const normalizedZ = 1 - normalizedY;
    const unityZ = MAP_MIN_Z + normalizedZ * (MAP_MAX_Z - MAP_MIN_Z);

    return { unityX, unityZ };
  }
  return null;
};