// --- CONSTANTS ---

// Unity map boundaries
export const MAP_MIN_X = -6200;
export const MAP_MAX_X = 8800;
export const MAP_MIN_Z = -1500;
export const MAP_MAX_Z = 13500;

// Geographical boundaries (WGS84)
export const LON_MIN = 121.6140;
export const LON_MAX = 121.9649;
export const LAT_MIN = 25.1228;
export const LAT_MAX = 25.2588;

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

/**
 * Converts Unity world coordinates (X, Z) directly to Latitude/Longitude.
 * @param {number} unityX - Unity X coordinate.
 * @param {number} unityZ - Unity Z coordinate.
 * @returns {{lat: number, lon: number}} - Lat/Lon object.
 */
export const unityToLatLon = (unityX, unityZ) => {
  // Normalize Unity coordinates to 0-1 range
  const normalizedX = (unityX - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
  const normalizedZ = (unityZ - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);

  // Convert to longitude (X axis maps directly to longitude)
  const lon = LON_MIN + normalizedX * (LON_MAX - LON_MIN);

  // Convert to latitude (Z axis is inverted: Unity Z up -> Latitude up)
  const lat = LAT_MIN + normalizedZ * (LAT_MAX - LAT_MIN);

  return { lat, lon };
};

const ORIGIN_LON = 109.0;
// 緯度 (Row) 的原點 (我們假設 0 在最北邊)
const ORIGIN_LAT_MAX = 39.0;
// 每 1 度有多少格
const CELLS_PER_DEGREE = 40; // (1 / 0.025)

/**
 * (輔助函數) 將單一經緯度點轉換為網格索引 [row, col]
 * @param {number} lat - 緯度 (例如 37.5)
 * @param {number} lon - 經度 (例如 110.2)
 * @returns {{row: number, col: number}} 轉換後的索引
 */
function convertGeoToIndices(lat, lon) {
  // (ASSUMPTION 1) Longitude (Column) Index:
  // index = 0 at LON 109
  // We use Math.round() to find the nearest grid cell index
  const col = Math.round((lon - ORIGIN_LON) * CELLS_PER_DEGREE);

  // (ASSUMPTION 2) Latitude (Row) Index:
  // index = 0 at LAT 39 (the top of the grid)
  // Index increases as latitude *decreases* (moving down the grid)
  const row = Math.round((ORIGIN_LAT_MAX - lat) * CELLS_PER_DEGREE);

  return { row, col };
}

/**
 * (主要函數) 將經緯度範圍 (Bounding Box) 轉換為索引範圍
 *
 * @param {number} minLat - 範圍的最小緯度 (南邊)
 * @param {number} minLon - 範圍的最小經度 (西邊)
 * @param {number} maxLat - 範圍的最大緯度 (北邊)
 * @param {number} maxLon - 範圍的最大經度 (東邊)
 * @returns {{minRow: number, minCol: number, maxRow: number, maxCol: number}}
 */
export function convertGeoRangeToIndices(minLat, minLon, maxLat, maxLon) {
  // 經度 (Column) 轉換：
  // minLon -> minCol
  // maxLon -> maxCol
  const { col: minCol } = convertGeoToIndices(minLat, minLon); // lat doesn't matter for col
  const { col: maxCol } = convertGeoToIndices(maxLat, maxLon); // lat doesn't matter for col

  // 緯度 (Row) 轉換 (注意，這是反過來的)：
  // maxLat (北) -> minRow (頂)
  // minLat (南) -> maxRow (底)
  const { row: minRow } = convertGeoToIndices(maxLat, minLon); // lon doesn't matter for row
  const { row: maxRow } = convertGeoToIndices(minLat, maxLon); // lon doesn't matter for row

  // 確保 min 總是小於 max
  return {
    minRow: Math.min(minRow, maxRow),
    minCol: Math.min(minCol, maxCol),
    maxRow: Math.max(minRow, maxRow),
    maxCol: Math.max(minCol, maxCol),
  };
}