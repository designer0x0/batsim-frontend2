// (鑒) 導入你的轉換函數
import { convertGeoRangeToIndices, mapToScreen } from "./conversions";

// This function is what you asked for, but it's very fragile (迫真)
// It will break if you have commas inside quoted fields.
function parseCSVto2DArray(csvText) {
  // Split into lines, removing trailing/leading whitespace
  const lines = csvText.trim().split("\n");

  // Map each line to an array of cells
  return lines.map((line) => {
    // This is the naive split (屑)
    return line.split(",");
  });
}

// --- How to use it with fetch ---
async function fetchAndParse(csvPath) {
  try {
    const response = await fetch(csvPath);
    const text = await response.text();

    // Here is your function in action
    const twoDArray = parseCSVto2DArray(text);

    return twoDArray;
  } catch (error) {
    console.error(`Fetch or parse failed for ${csvPath} (絕望)`, error);
    return []; // Return empty array on failure
  }
}

// --- (鑒) Caching Solution ---
// The cache will now store the *entire* processed object
let cachedCurrentData = null;
// --- End Caching Solution ---

// --- (MODIFIED) Core Fetching Function ---
// (鑒) This function now fetches BOTH speed and direction
async function _fetchAndProcessCurrentData() {
  try {
    // (鑒) Fetch both files in parallel (homo特有的認真)
    const [speedCsv, directionCsv] = await Promise.all([
      fetchAndParse("./ocean_current/speed.csv"),
      fetchAndParse("./ocean_current/direction.csv"),
    ]);

    // But check if speedData (which has metadata) is valid
    if (speedCsv && speedCsv.length > 0 && speedCsv[0].length > 6) {
      // 1. Process metadata (from speed.csv header row 0)
      const metadata = {
        lat_min: speedCsv[0][4],
        lat_max: speedCsv[0][6],
        lon_min: speedCsv[0][3],
        lon_max: speedCsv[0][5],
      };

      // 2. (鑒) Store the FULL CSVs (including headers)
      // This is because getCurrentDataInRange expects to do slice(3)
      const processedData = {
        metadata,
        speedGrid: speedCsv,       // (鑒) Renamed from 'currentData'
        directionGrid: directionCsv, // (鑒) Added new grid
      };

      console.log(
        "Fetched and processed new data (speed + direction 鑒):",
        processedData
      );

      // Return the full processed data
      return processedData;
    } else {
      console.error("CSV data (speed.csv) is empty or malformed (池沼)");
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch/process current data (絕望)", error);
    return null;
  }
}

// --- Function 1: Get data WITH CACHE (鑒) ---
// (Logic unchanged, but 'cachedCurrentData' has a new structure)
export const getCurrent = async () => {
  // (喜) CHECK THE CACHE FIRST!
  if (cachedCurrentData) {
    console.log("Returning cached current data (鑒)");
    return cachedCurrentData;
  }

  // (お待たse) If cache is null, it's the first time.
  // Call the core function to fetch and update the cache.
  console.log("Cache empty, fetching new data...");
  cachedCurrentData = await _fetchAndProcessCurrentData();

  return cachedCurrentData;
};

// --- Function 2: Get FRESH data (NO CACHE) ---
// (Logic unchanged, but 'cachedCurrentData' has a new structure)
export const fetchFreshCurrentData = async () => {
  console.log("Forcing fresh fetch...");
  // Call the core function, update the cache, and return
  cachedCurrentData = await _fetchAndProcessCurrentData();
  return cachedCurrentData;
};

// --- (MODIFIED) Function 3: Get data in range ---
// (鑒) This function now processes BOTH grids and returns an object
export const getCurrentDataInRange = async (
  minLat,
  minLon,
  maxLat,
  maxLon
) => {
  // 1. Get the full dataset (from cache or fetch)
  const fullData = await getCurrent();

  // (鑒) MODIFIED: Check for the new grid properties
  if (!fullData || !fullData.speedGrid || !fullData.directionGrid) {
    console.error("No current data grid (speed/direction) to filter (絕望)");
    // (鑒) Return the new data structure (empty)
    return { speed: [], direction: [] };
  }

  // --- (鑒) START: 邏輯修改 ---

  // 2. Get the raw data grids (full CSVs) from the cached object
  const rawSpeedGrid = fullData.speedGrid;
  const rawDirectionGrid = fullData.directionGrid;
  // 2a. metadata parsed from the fetched file
  const metadata = fullData.metadata || {};

  // 3. (鑒) Delete the first three horizontal rows (per user request)
  const baseSpeedGrid = rawSpeedGrid.slice(3);
  const baseDirectionGrid = rawDirectionGrid.slice(3);

  // 4. Calculate height and width (assume they are the same)
  const height = baseSpeedGrid.length;

  // Check for empty grids
  if (height === 0 || baseDirectionGrid.length === 0) {
    console.error("Base grid(s) are empty after slicing header (池沼)");
    return { speed: [], direction: [] };
  }
  const width = baseSpeedGrid[0].length;

  // (鑒) Optional: Check if grids match
  if (height !== baseDirectionGrid.length || width !== baseDirectionGrid[0].length) {
    console.warn("Speed and Direction grids have different dimensions! (屑)");
    // Proceeding, but this might be an error.
  }

  // 5. Log the results
  console.log(`--- Base Grid Dimensions ---`);
  console.log(`Base grid height (rows): ${height}`);
  console.log(`Base grid width (columns): ${width}`);
  console.log(`-------------------------------------`);

  // 6. Convert the Geo Bounding Box to an Index Range
  const indexRange = convertGeoRangeToIndices(minLat, minLon, maxLat, maxLon);
  console.log("Calculated Index Range:", indexRange);

  // 7. (NEW) Clamp the index range to the actual grid dimensions for safety
  // 確保索引不會超出 [0, height-1] 和 [0, width-1] 的範圍
  const safeMinRow = Math.max(0, indexRange.minRow);
  const safeMaxRow = Math.min(height - 1, indexRange.maxRow); // -1 因為是 index
  const safeMinCol = Math.max(0, indexRange.minCol);
  const safeMaxCol = Math.min(width - 1, indexRange.maxCol); // -1 因為是 index

  // Check if the clamped range is valid
  if (safeMinRow > safeMaxRow || safeMinCol > safeMaxCol) {
    console.warn("Calculated range is completely outside the grid. (屑)");
    return { speed: [], direction: [] };
  }

  // 8. (NEW) Slice BOTH grids
  // (鑒) Helper function to slice a 2D grid
  const slice2DGrid = (grid, r1, r2, c1, c2) => {
    // First, slice the rows. 'end' is exclusive, so we add +1.
    const slicedRows = grid.slice(r1, r2 + 1);
    // Then, map over these rows and slice the columns for each row
    return slicedRows.map((row) => row.slice(c1, c2 + 1));
  };

  const finalFilteredSpeed = slice2DGrid(
    baseSpeedGrid,
    safeMinRow,
    safeMaxRow,
    safeMinCol,
    safeMaxCol
  );
  const finalFilteredDirection = slice2DGrid(
    baseDirectionGrid,
    safeMinRow,
    safeMaxRow,
    safeMinCol,
    safeMaxCol
  );

  // --- (鑒) END: L邏輯修改 ---

  console.log(
    `Extracted grid from [${safeMinRow}, ${safeMinCol}] to [${safeMaxRow}, ${safeMaxCol}] (喜)`
  );
  console.log(`Returning ${finalFilteredSpeed.length} rows.`);

  // (鑒) Return both filtered grids and helpful metadata for mapping indices -> lat/lon
  return {
    speed: finalFilteredSpeed,
    direction: finalFilteredDirection,
    // full base grid dimensions (after removing CSV header rows)
    baseHeight: height,
    baseWidth: width,
    // the safe min row/col in the base grid that correspond to the sliced output
    safeMinRow,
    safeMinCol,
    // original metadata (lat/lon extents)
    metadata,
  };
};