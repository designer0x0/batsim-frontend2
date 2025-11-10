// Map Visualization and Interaction Logic (Rendering at 60 FPS)

// Global state variables for the map (exposed to script.js via window)
let mapState = {
    // Initial zoom and pan (0, 0)
    // This zoom value will be overridden by INITIAL_ZOOM on the first load
    zoom: 1.0, 
    panX: 0,
    panY: 0,
    isDragging: false,
    lastX: 0,
    lastY: 0
};

// Map dimension state, used for centered zooming
let mapDimensions = {
    width: 0,
    height: 0,
    autoScale: 1.0,
    autoOffsetX: 0,
    autoOffsetY: 0
};

// Path history and coverage area status
const shipHistory = {}; // { shipName: [{x, z}, {x, z}, ...] }
let coverageCanvas = null; // HTMLCanvasElement for drawing scanned areas
let coverageContext = null; // CanvasRenderingContext2D

// --- NEW: Initial Zoom Configuration ---
let isMapInitialized = false; // Flag to run initial zoom logic only once
// -------------------------------------------------------------------
// >> 在這裡設定您想要的預設縮放倍率 <<
const INITIAL_ZOOM = 8; 
// -------------------------------------------------------------------

const MAX_HISTORY_POINTS = 50;
const MIN_DISTANCE_SQUARED = 100; // Ship must move > 10 units to record

// --- MODIFIED: Fixed Map Boundaries (in meters) ---
// Using the specific boundaries you provided
const MAP_MIN_X = -6200; 
const MAP_MAX_X = 8800; 
const MAP_MIN_Z = -1500; 
const MAP_MAX_Z = 13500;  

// --- MODIFIED: Map Image URL ---
// Using local map.png. Make sure map.png is in the same directory as your HTML/JS
const MAP_IMAGE_URL = 'map.png';


/**
 * Resets the map pan and zoom to the default "fit to view" state.
 */
function resetMapView() {
    // --- MODIFIED: Reset to the new default zoom (INITIAL_ZOOM) ---
    const W = mapDimensions.width;
    const H = mapDimensions.height;

    // Set zoom to the default defined at the top
    mapState.zoom = INITIAL_ZOOM;
    
    if (W > 0 && H > 0) {
        // If dimensions are known, calculate correct pan to center (0,0)
        // This is the zoom-to-center formula applied from a 1.0 zoom
        mapState.panX = (W / 2) * (1 - INITIAL_ZOOM);
        mapState.panY = (H / 2) * (1 - INITIAL_ZOOM);
    } else {
        // Fallback, will be corrected on next updateMap anyway
        mapState.panX = 0;
        mapState.panY = 0;
    }
    // --- End Modification ---

    // Reset path history
    for (const key in shipHistory) {
        delete shipHistory[key];
    }

    // Clear coverage canvas
    if (coverageContext && mapDimensions.width) {
        coverageContext.clearRect(0, 0, mapDimensions.width, mapDimensions.height);
    }

    if (window.latestSystemData) {
        // Re-render using the latest available data
        window.updateMap(window.latestSystemData, window.latestSavedPersons);
    }
}

/**
 * Adjusts the map zoom level, keeping the view center fixed.
 * @param {number} factor - The zoom factor (e.g., 1.2 for zoom in, 1/1.2 for zoom out).
 */
function zoomMap(factor) {
    if (!window.latestSystemData || !mapDimensions.width) return;

    const W = mapDimensions.width;
    const H = mapDimensions.height;
    const Z_old = mapState.zoom;

    // 1. Calculate the new zoom value and limit range
    // Max zoom set to 50.0
    const newZoom = Math.max(0.5, Math.min(50.0, Z_old * factor));
    const actualFactor = newZoom / Z_old;

    if (actualFactor === 1) return;

    // --- MODIFIED: Corrected "Zoom to Center" Logic ---
    // The formula is:
    // newPan = screenCenter * (1 - factor) + oldPan * factor
    // This keeps the visual center of the screen anchored during zoom.
    //
    mapState.panX = (W / 2) * (1 - actualFactor) + mapState.panX * actualFactor;
    mapState.panY = (H / 2) * (1 - actualFactor) + mapState.panY * actualFactor;
    // --- End Modification ---

    // 3. Update zoom
    mapState.zoom = newZoom;

    // Re-render using the latest available data
    window.updateMap(window.latestSystemData, window.latestSavedPersons);
}


/**
 * Draws the grid lines and labels on the map canvas.
 * @param {HTMLElement} canvas - The map container element.
 *... (The rest of the parameters)
 */
function drawGrid(canvas, minX, maxX, minZ, maxZ, finalScale, finalOffsetX, finalOffsetY, width, height) {
    let gridIntervalMeters = 1000; // Base 1km

    if (finalScale > 5) { // If zoomed in significantly
        gridIntervalMeters = 200;
    } else if (finalScale > 2) {
        gridIntervalMeters = 500;
    } else if (finalScale < 0.5) { // If zoomed out significantly
        gridIntervalMeters = 2000;
    } else if (finalScale < 0.2) {
        gridIntervalMeters = 5000;
    }

    // 1. Vertical Grid Lines (X-axis)
    const firstX = Math.floor(minX / gridIntervalMeters) * gridIntervalMeters;

    for (let x = firstX; x <= maxX + gridIntervalMeters; x += gridIntervalMeters) {
        const pixelX = x * finalScale + finalOffsetX; // Use finalScale here

        if (pixelX >= 0 && pixelX <= width) {
            const line = document.createElement('div');
            line.className = 'grid-line grid-x';
            line.style.left = pixelX + 'px';
            line.style.zIndex = '2'; // Ensure grid is above map
            canvas.appendChild(line);

            const label = document.createElement('div');
            label.className = 'grid-label grid-label-x';
            label.textContent = `X: ${x.toFixed(0)}`;
            label.style.left = pixelX + 'px';
            label.style.zIndex = '2'; // Ensure grid is above map
            canvas.appendChild(label);
        }
    }

    // 2. Horizontal Grid Lines (Z-axis)
    const firstZ = Math.floor(minZ / gridIntervalMeters) * gridIntervalMeters;

    for (let z = firstZ; z <= maxZ + gridIntervalMeters; z += gridIntervalMeters) {
        // Y-axis Inversion for grid labels (maxZ - current_Z + minZ)
        const invertedZ_for_pixel = maxZ - z + minZ;
        const pixelZ = invertedZ_for_pixel * finalScale + finalOffsetY; // Use finalScale here

        if (pixelZ >= 0 && pixelZ <= height) {
            const line = document.createElement('div');
            line.className = 'grid-line grid-z';
            line.style.top = pixelZ + 'px';
            line.style.zIndex = '2'; // Ensure grid is above map
            canvas.appendChild(line);

            const label = document.createElement('div');
            label.className = 'grid-label grid-label-z';
            label.textContent = `Z: ${z.toFixed(0)}`;
            label.style.top = pixelZ + 'px';
            label.style.zIndex = '2'; // Ensure grid is above map
            canvas.appendChild(label);
        }
    }
}


/**
 * Helper: Converts map coordinates (X, Z) to screen pixel coordinates (x, y).
 * @param {number} mapX - Ship X coordinate.
 * @param {number} mapZ - Ship Z coordinate.
 * @param {object} transform - Contains maxZ, minZ, finalScale, finalOffsetX, finalOffsetY.
 * @returns {object} {x: pixelX, y: pixelY}
 */
function mapToScreen(mapX, mapZ, transform) {
    // The Y-axis inversion logic:
    // (maxZ - mapZ + minZ) converts a map Z coordinate to an "inverted" Z.
    const invertedZ = transform.maxZ - mapZ + transform.minZ;
    const x_final = mapX * transform.finalScale + transform.finalOffsetX;
    const y_final = invertedZ * transform.finalScale + transform.finalOffsetY;
    return { x: x_final, y: y_final };
}

/**
 * --- NEW: Converts screen pixel coordinates (x, y) to map coordinates (X, Z). ---
 * @param {number} pixelX - Screen X coordinate (relative to canvas).
 * @param {number} pixelY - Screen Y coordinate (relative to canvas).
 * @returns {object} {x: mapX, z: mapZ} or null if map is not ready.
 */
function screenToMap(pixelX, pixelY) {
    if (!mapDimensions.width) return null; // Map not ready

    // Re-calculate the current transform state
    const finalScale = mapDimensions.autoScale * mapState.zoom;
    const finalOffsetX = mapDimensions.autoOffsetX * mapState.zoom + mapState.panX;
    const finalOffsetY = mapDimensions.autoOffsetY * mapState.zoom + mapState.panY;

    // Perform the inverse math of mapToScreen
    
    // x_final = mapX * finalScale + finalOffsetX
    // -> mapX = (x_final - finalOffsetX) / finalScale
    const mapX = (pixelX - finalOffsetX) / finalScale;
    
    // y_final = invertedZ * finalScale + finalOffsetY
    // -> invertedZ = (y_final - finalOffsetY) / finalScale
    const invertedZ = (pixelY - finalOffsetY) / finalScale;
    
    // invertedZ = MAP_MAX_Z - mapZ + MAP_MIN_Z
    // -> mapZ = MAP_MAX_Z - invertedZ + MAP_MIN_Z
    const mapZ = MAP_MAX_Z - invertedZ + MAP_MIN_Z;
    
    return { x: mapX, z: mapZ };
}


/**
 * Renders the map visualization, including markers, grid, and detection ranges.
 * This function runs at 60 FPS using requestAnimationFrame.
 * @param {object} data - The current system state (from window.latestSystemData).
 * @param {Array<object>} savedPersons - List of persons to display (isSaved: true).
 */
function updateMap(data, savedPersons) {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');

    // Remove all DOM elements except the canvas, legend and stats
    let childrenToRemove = Array.from(canvas.children).filter(child =>
        !child.classList.contains('legend') &&
        !child.classList.contains('map-stats') &&
        !child.id.startsWith('coverage-canvas')
    );
    childrenToRemove.forEach(child => canvas.removeChild(child));

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // --- NEW: One-time initialization for default zoom ---
    // This runs only once when the map first gets dimensions
    if (!isMapInitialized && width > 0 && height > 0) {
        mapState.zoom = INITIAL_ZOOM;
        // We must calculate the correct pan to keep (0,0) centered
        // This uses the same logic as the zoomMap function
        mapState.panX = (width / 2) * (1 - INITIAL_ZOOM);
        mapState.panY = (height / 2) * (1 - INITIAL_ZOOM);
        isMapInitialized = true;
    }
    // --- End NEW ---

    // Use Fixed Map Bounds
    let minX = MAP_MIN_X;
    let maxX = MAP_MAX_X;
    let minZ = MAP_MIN_Z;
    let maxZ = MAP_MAX_Z;
    
    // 2. Calculate Auto-Scaling and Auto-Centering for the FIXED MAP
    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    let autoScale = 1.0;
    let autoOffsetX = 0;
    let autoOffsetY = 0;

    if (rangeX > 0 && rangeZ > 0) {
        // Calculate scale to fit the *fixed map* into the container, with padding
        autoScale = Math.min((width - 100) / rangeX, (height - 100) / rangeZ);

        // --- MODIFIED: Calculate auto-offsets to center (0,0) (Keelung Harbor) initially ---
        // We want map coordinate (0,0) to appear at pixel (width/2, height/2)
        // mapToScreen(0,0) = { x: 0 * autoScale + autoOffsetX, y: (maxZ - 0 + minZ) * autoScale + autoOffsetY }
        // We want: width/2 = 0 * autoScale + autoOffsetX  => autoOffsetX = width/2
        // We want: height/2 = (maxZ + minZ) * autoScale + autoOffsetY
        // So, autoOffsetY = height/2 - (maxZ + minZ) * autoScale
        autoOffsetX = (width / 2);
        autoOffsetY = (height / 2) - ((maxZ + minZ) * autoScale);
        // --- End Modification ---
    } else {
        // Fallback (shouldn't happen with fixed map bounds)
        autoScale = 5;
        autoOffsetX = width / 2;
        autoOffsetY = height / 2;
    }

    // Store the calculated dimensions for zoomMap to use
    mapDimensions.width = width;
    mapDimensions.height = height;
    mapDimensions.autoScale = autoScale;
    mapDimensions.autoOffsetX = autoOffsetX;
    mapDimensions.autoOffsetY = autoOffsetY;

    // 3. Apply User Pan and Zoom to get Final Transforms
    const finalScale = autoScale * mapState.zoom;
    // --- MODIFIED: Final offsets must include the auto-offset scaled by current zoom, then add pan ---
    const finalOffsetX = autoOffsetX * mapState.zoom + mapState.panX; 
    const finalOffsetY = autoOffsetY * mapState.zoom + mapState.panY; 

    const transform = { minZ, maxZ, finalScale, finalOffsetX, finalOffsetY };

    // 3.5. Draw the Map Background Image
    const mapImg = document.createElement('img');
    mapImg.src = MAP_IMAGE_URL;
    mapImg.className = 'map-background-image';

    // Calculate pixel coordinates for top-left of the map (minX, maxZ)
    const { x: imgX_top_left, y: imgY_top_left } = mapToScreen(minX, maxZ, transform);
    
    // Calculate pixel coordinates for bottom-right of the map (maxX, minZ)
    const { x: imgX_bottom_right, y: imgY_bottom_right } = mapToScreen(maxX, minZ, transform);

    mapImg.style.left = imgX_top_left + 'px';
    mapImg.style.top = imgY_top_left + 'px';
    mapImg.style.width = (imgX_bottom_right - imgX_top_left) + 'px';
    mapImg.style.height = (imgY_bottom_right - imgY_top_left) + 'px';
    mapImg.style.zIndex = '1'; // Ensure map is background
    canvas.appendChild(mapImg);
    // --- End NEW ---


    // 4. Draw Grid and Paths
    drawGrid(canvas, minX, maxX, minZ, maxZ, finalScale, finalOffsetX, finalOffsetY, width, height);

    // Ensure Coverage Canvas Exists and is Sized Correctly
    initializeCoverageCanvas(canvas, width, height);

    // 5. Draw Ships, Ranges, and Paths
    
    // Draw ships and their ranges
    data.ships.forEach(ship => {
        const { x, y: z } = mapToScreen(ship.position.x, ship.position.z, transform);

        // --- Process Path History and Draw ---
        updateShipHistory(ship.name, ship.position.x, ship.position.z);
        // drawShipPath(canvas, ship.name, transform); // Disabled for performance

        // --- Draw Detection Range Circle ---
        if (ship.detectionRange > 0) {
            // drawCoverageArea(ship.position.x, ship.position.z, ship.detectionRange, transform); // Disabled for performance

            // Draw current range dashed line (DOM)
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'detection-range';
            const radiusPx = ship.detectionRange * finalScale;
            rangeDiv.style.width = (radiusPx * 2) + 'px';
            rangeDiv.style.height = (radiusPx * 2) + 'px';
            rangeDiv.style.left = x + 'px';
            rangeDiv.style.top = z + 'px';
            rangeDiv.style.zIndex = '5'; // Ensure range is above map/grid
            canvas.appendChild(rangeDiv);
        }

        // --- Draw Ship Marker ---
        const div = document.createElement('div');
        div.className = `map-ship ${ship.isWaiting ? 'ship-waiting' : ''}`;
        div.style.left = x + 'px';
        div.style.top = z + 'px';
        div.innerHTML = `
            <div class="ship-icon"></div>
            <div class="ship-label">${ship.name}</div>
        `;
        div.style.zIndex = '6'; // Ensure ship marker is on top
        canvas.appendChild(div);
    });

    // Draw persons in distress (ONLY SAVED)
    savedPersons.forEach(person => {
        const { x, y: z } = mapToScreen(person.position.x, person.position.z, transform);

        const personClass = 'map-person map-person-saved';

        const div = document.createElement('div');
        div.className = personClass;
        div.style.left = x + 'px';
        div.style.top = z + 'px';

        div.innerHTML = `
            <div class="person-icon"></div>
            <div class="person-label">已獲救 ID ${person.id}</div> 
        `;
        div.style.zIndex = '7'; // Ensure person marker is on top
        canvas.appendChild(div);
    });

    // 6. Update Map Statistics (Safely check for element existence)
    const avgDistanceElement = document.getElementById('avgDistance');
    const mapRangeElement = document.getElementById('mapRange');
    
    // Calculate data bounds *just* for stats
    let dataMinX = Infinity, dataMaxX = -Infinity;
    let dataMinZ = Infinity, dataMaxZ = -Infinity;
    let hasData = false;
    
    data.ships.forEach(ship => {
        dataMinX = Math.min(dataMinX, ship.position.x); 
        dataMaxX = Math.max(dataMaxX, ship.position.x);
        dataMinZ = Math.min(dataMinZ, ship.position.z);
        dataMaxZ = Math.max(dataMaxZ, ship.position.z);
        hasData = true;
    });
    savedPersons.forEach(person => {
        dataMinX = Math.min(dataMinX, person.position.x);
        dataMaxX = Math.max(dataMaxX, person.position.x);
        dataMinZ = Math.min(dataMinZ, person.position.z);
        dataMaxZ = Math.max(dataMaxZ, person.position.z);
        hasData = true;
    });
    
    const dataRangeX = hasData ? (dataMaxX - dataMinX) : 0;
    const dataRangeZ = hasData ? (dataMaxZ - dataMinZ) : 0;

    if (data.ships.length > 0 && savedPersons.length > 0) { 
        let totalDistance = 0;
        let count = 0;
        
        data.ships.forEach(ship => {
            savedPersons.forEach(person => {
                const dx = ship.position.x - person.position.x;
                const dz = ship.position.z - person.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                totalDistance += distance;
                count++;
            });
        });
        
        const avgDistance = (totalDistance / count).toFixed(1);
        
        if (avgDistanceElement) avgDistanceElement.textContent = avgDistance + 'm';
        if (mapRangeElement) mapRangeElement.textContent = `${dataRangeX.toFixed(0)}m × ${dataRangeZ.toFixed(0)}m`;
    } else {
        if (avgDistanceElement) avgDistanceElement.textContent = '--';
        if (mapRangeElement) mapRangeElement.textContent = `${dataRangeX.toFixed(0)}m × ${dataRangeZ.toFixed(0)}m`;
    }
}


// ==========================================
// Path History & Coverage Functions 
// (Ensure these are correctly implemented if drawShipPath/drawCoverageArea are used)
// ==========================================

function initializeCoverageCanvas(canvas, width, height) {
    if (!coverageCanvas) {
        coverageCanvas = document.createElement('canvas');
        coverageCanvas.id = 'coverage-canvas';
        coverageCanvas.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 3;'; 
        canvas.appendChild(coverageCanvas);
        coverageContext = coverageCanvas.getContext('2d');
    }
    
    if (coverageCanvas.width !== width || coverageCanvas.height !== height) {
        coverageCanvas.width = width;
        coverageCanvas.height = height;
    }

    // We clear the context and apply the full transform on each render to ensure proper alignment
    coverageContext.clearRect(0, 0, width, height); 
    
    // Apply the auto-scale first, then the user pan/zoom
    const finalScale = mapDimensions.autoScale * mapState.zoom;
    const finalOffsetX = mapDimensions.autoOffsetX * mapState.zoom + mapState.panX;
    const finalOffsetY = mapDimensions.autoOffsetY * mapState.zoom + mapState.panY;

    coverageContext.setTransform(1, 0, 0, 1, 0, 0); // Reset to identity
    coverageContext.translate(finalOffsetX, finalOffsetY);
    coverageContext.scale(finalScale, finalScale);
    
    // Store transform for drawCoverageArea
    coverageContext.currentTransform = { 
        minZ: MAP_MIN_Z, 
        maxZ: MAP_MAX_Z, 
        finalScale: finalScale, 
        finalOffsetX: finalOffsetX, 
        finalOffsetY: finalOffsetY 
    };
}


function updateShipHistory(name, x, z) {
    if (!shipHistory[name]) {
        shipHistory[name] = [];
    }
    const history = shipHistory[name];

    if (history.length > 0) {
        const lastPos = history[history.length - 1];
        const dx = x - lastPos.x;
        const dz = z - lastPos.z;
        if (dx * dx + dz * dz < MIN_DISTANCE_SQUARED) {
            return;
        }
    }

    history.push({ x, z });

    if (history.length > MAX_HISTORY_POINTS) {
        history.shift();
    }
}

function drawShipPath(canvas, name, transform) {
    // This is currently disabled for performance but is kept for completeness.
    const history = shipHistory[name];
    if (!history || history.length < 2) return;

    const pathDiv = document.createElement('div');
    pathDiv.className = 'ship-path-container';
    pathDiv.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 4;';
    canvas.appendChild(pathDiv);
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    let points = "";
    
    history.forEach(pos => {
        const { x, y: z } = mapToScreen(pos.x, pos.z, transform);
        points += `${x},${z} `;
    });
    
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#66BB6A'); 
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('opacity', '0.7');
    
    svg.appendChild(polyline);
    pathDiv.appendChild(svg);
}


function drawCoverageArea(mapX, mapZ, range, transform) {
    // This is currently disabled for performance but is kept for completeness.
    if (!coverageContext || !coverageCanvas || !coverageContext.currentTransform) return;

    const ctx = coverageContext;
    const { minZ, maxZ } = coverageContext.currentTransform; // Use the stored transform for consistency

    // We must use the *inverted* Z coordinate for drawing
    const invertedZ = maxZ - mapZ + minZ;

    ctx.beginPath();
    ctx.arc(mapX, invertedZ, range, 0, 2 * Math.PI); 
    
    ctx.fillStyle = 'rgba(255, 255, 0, 0.05)'; 
    ctx.fill();
}


// --- MODIFIED: Map Event Listeners for Panning AND Waypoint Recording ---
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    
    // --- NEW: Flag to distinguish click from drag ---
    let wasDragging = false;
    // --- End NEW ---
    
    // Mouse Down: Start dragging
    canvas.addEventListener('mousedown', (e) => {
        // Only trigger drag if it's a left click
        if (e.button !== 0) return; 

        mapState.isDragging = true;
        mapState.lastX = e.clientX;
        mapState.lastY = e.clientY;
        canvas.classList.add('dragging');
        e.preventDefault();
        
        // --- NEW ---
        wasDragging = false; // Reset drag flag on new mousedown
        // --- End NEW ---
    });
    
    // Mouse Move: Calculate and apply pan
    document.addEventListener('mousemove', (e) => {
        if (!mapState.isDragging) return; // Only move if dragging
        
        // --- NEW: If mouse moves significantly, it's a drag ---
        // (Added a small threshold to prevent tiny jitters from counting as a drag)
        if (Math.abs(e.clientX - mapState.lastX) > 2 || Math.abs(e.clientY - mapState.lastY) > 2) {
            wasDragging = true; 
        }
        // --- End NEW ---
        
        // Only pan if it was *actually* a drag
        if (wasDragging && window.latestSystemData) {
            const dx = e.clientX - mapState.lastX;
            const dy = e.clientY - mapState.lastY;
            
            mapState.panX += dx;
            mapState.panY += dy;
            
            mapState.lastX = e.clientX;
            mapState.lastY = e.clientY;

            // Manual re-render to reflect the pan immediately
            window.updateMap(window.latestSystemData, window.latestSavedPersons);
        }
    });
    
    // Mouse Up: Stop dragging
    document.addEventListener('mouseup', (e) => {
        // Only trigger if it was a left click
        if (e.button !== 0) return;

        // --- NEW: Handle Waypoint Click ---
        // Check if this was a click (not a drag) AND we are in recording mode
        if (mapState.isDragging && !wasDragging && window.isRecordingWaypoints) {
            
            // Calculate pixelX and pixelY relative to the canvas
            const rect = canvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;

            // Convert screen pixels to map coordinates
            const coords = screenToMap(pixelX, pixelY); 
            
            // Call the function in app.js to update the UI
            if (coords && window.addWaypointToUI) {
                window.addWaypointToUI(coords);
            }
        }
        // --- End NEW ---
        
        // Original mouseup logic
        mapState.isDragging = false;
        canvas.classList.remove('dragging');
        wasDragging = false; // Reset drag flag
    });
    
    // Handle window resize event
    window.addEventListener('resize', () => {
        // When resizing, reset the init flag so the zoom/pan can be recalculated
        isMapInitialized = false; 
        if (window.latestSystemData) { 
            window.updateMap(window.latestSystemData, window.latestSavedPersons);
        }
    });

    // Expose functions globally for app.js and index.html
    window.updateMap = updateMap;
    window.resetMapView = resetMapView;
    window.zoomMap = zoomMap;
    window.mapState = mapState;
});

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const mouseCoordinates = document.getElementById('mouse-coordinates');

    // 滑鼠移動事件
    canvas.addEventListener('mousemove', (e) => {
        if (!mapDimensions.width) return; // 確保地圖已初始化

        // 計算滑鼠在地圖上的像素座標
        const rect = canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;

        // 將像素座標轉換為地圖座標
        const coords = screenToMap(pixelX, pixelY);
        if (coords) {
            mouseCoordinates.textContent = `X: ${coords.x.toFixed(1)}, Z: ${coords.z.toFixed(1)}`;
        } else {
            mouseCoordinates.textContent = 'X: --, Z: --';
        }
    });

    // 滑鼠離開地圖時清空座標顯示
    canvas.addEventListener('mouseleave', () => {
        mouseCoordinates.textContent = 'X: --, Z: --';
    });
});