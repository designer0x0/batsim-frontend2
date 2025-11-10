// JavaScript for Maritime Search and Rescue System Monitoring Dashboard (API Polling Logic)

// Global variables for connectivity
const API_URL = 'http://localhost:8080'; 

// Request frequency: 100ms (10 FPS)
const UPDATE_INTERVAL_MS = 100; 

// --- NEW: Waypoint Recording State ---
window.isRecordingWaypoints = false; 
// --- End NEW ---

// --- Global Data Storage (Shared with mapRender.js) ---
// These variables store the latest data fetched from the backend.
window.latestSystemData = null; 
window.latestSavedPersons = [];

/**
 * Starts the simulation data polling loop and the rendering loop.
 */
function startPolling() {
    fetchState(); 
    
    // Set up the API polling interval (10 FPS)
    setInterval(fetchState, UPDATE_INTERVAL_MS);

    // Start the high-frequency rendering loop (approx. 60 FPS)
    startRenderingLoop(); 
    
    // Initial connection status check
    updateConnectionStatus(true);
}

/**
 * Manually fetches the current simulation state via REST API.
 */
async function fetchState() {
    try {
        const response = await fetch(`${API_URL}/status`); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // 1. Store data globally for the 60 FPS map renderer
        window.latestSystemData = data; 
        const allPersons = data.personsInDistress.persons || [];
        window.latestSavedPersons = allPersons.filter(p => p.isSaved);

        // 2. Update all non-map UI elements (only runs at 10 FPS)
        updateUI(data); 
        updateConnectionStatus(true); 
    } catch (error) {
        // Suppress console errors to avoid unnecessary spam when API is down
        // console.error('Fetch error:', error);
        updateConnectionStatus(false); 
    }
}

/**
 * Sends a request to the backend to reset the simulation.
 */
async function resetSimulation() {
    try {
        const response = await fetch(`${API_URL}/reset`, { method: 'POST' }); 
        const responseJson = await response.json();
        
        if (!response.ok || responseJson.success === false) {
             throw new Error(responseJson.message || `Reset failed with status: ${response.status}.`);
        }

        console.log('Simulation reset successfully.');
        if (window.resetMapView) window.resetMapView(); // Call map function to clear paths/zoom
        fetchState(); // Manually fetch state after reset
    } catch (error) {
        console.error('Reset error:', error);
        alert(`重置模擬失敗: ${error.message}`);
    }
}


// =========================================================
// NEW: Waypoint Recording Functions
// =========================================================

/**
 * Toggles the waypoint recording mode.
 */
function toggleWaypointRecording() {
    window.isRecordingWaypoints = !window.isRecordingWaypoints;
    const btn = document.getElementById('recordWaypointBtn');
    const canvas = document.getElementById('canvas');
    
    if (window.isRecordingWaypoints) {
        // Start recording
        btn.textContent = '停止錄製';
        btn.classList.add('recording'); // For CSS styling
        if(canvas) canvas.classList.add('recording-cursor'); // For crosshair cursor
        
        const inputElement = document.getElementById('waypointsInput');
        // Ask to clear existing points if the list isn't already empty
        if (inputElement.value !== "[]" && inputElement.value !== "" && !confirm('是否清空現有航點並開始錄製？')) {
            // User pressed cancel, so toggle back
            window.isRecordingWaypoints = false;
            btn.textContent = '錄製航點';
            btn.classList.remove('recording');
            if(canvas) canvas.classList.remove('recording-cursor');
            return;
        }
        // Clear the list
        inputElement.value = "[]";
        
    } else {
        // Stop recording
        btn.textContent = '錄製航點';
        btn.classList.remove('recording');
        if(canvas) canvas.classList.remove('recording-cursor');
    }
}

/**
 * Called by mapRender.js when the map is clicked in recording mode.
 * Adds the new coordinate to the waypointsInput textarea.
 * @param {object} coords - The {x, z} map coordinates.
 */
window.addWaypointToUI = function(coords) {
    if (!coords) return;
    
    const inputElement = document.getElementById('waypointsInput');
    // Format the new waypoint: [X, Y, Z] (Y is 0)
    const newWaypoint = [
        parseFloat(coords.x.toFixed(1)), 
        0.0, // Y-coordinate is 0
        parseFloat(coords.z.toFixed(1))
    ];
    
    let currentWaypoints = [];
    try {
        // Try to parse existing valid JSON
        const parsed = JSON.parse(inputElement.value);
        if (Array.isArray(parsed)) {
            currentWaypoints = parsed;
        }
    } catch (e) {
        // If input is invalid (e.g., empty string or malformed), start a new list
        currentWaypoints = [];
    }
    
    currentWaypoints.push(newWaypoint);
    
    // Stringify with formatting (4 spaces indentation for readability)
    inputElement.value = JSON.stringify(currentWaypoints, null, 4);
    
    // Auto-scroll textarea to the bottom
    inputElement.scrollTop = inputElement.scrollHeight;
}


// =========================================================
// API Command Handlers (POST /command and POST /waypoint)
// =========================================================

/**
 * Sends a ship command (start/stop) via POST /command.
 * @param {string} commandName - The command name (e.g., 'start', 'stop').
 */
async function sendShipCommand(commandName, shipName=null) {
    //const select = 
    const selectedValue = shipName;
    const commandUpper = commandName.toUpperCase();
    
    if (!selectedValue) {
        alert('請先選擇船隻!');
        return;
    }

    // Determine the list of ships to send
    const shipsToSend = selectedValue === 'ALL' 
        ? (window.latestSystemData?.ships || []).map(s => s.name)
        : [selectedValue];
        
    if (shipsToSend.length === 0) {
        alert('沒有船隻可供發送指令。');
        return;
    }

    // Construct the JSON payload for POST /command
    const payload = {
        command: commandUpper,
        ships: shipsToSend 
    };
    
    const apiUrl = `${API_URL}/command`; 

    try {
        const response = await fetch(apiUrl, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });

        const responseJson = await response.json();

        if (!response.ok || responseJson.success === false) {
            throw new Error(responseJson.message || `Command failed with status: ${response.status}.`);
        }

        console.log(`Command ${commandUpper} sent successfully.`);
        //alert(`指令 ${commandUpper} 已成功發送給 ${selectedValue}: ${responseJson.message}`);
        fetchState(); 
        
    } catch (error) {
        console.error(`Error sending command ${commandUpper}:`, error);
        alert(`發送指令失敗: ${error.message}`);
    }
}

/**
 * Sends a waypoint list via POST /waypoint.
 */
async function addWaypoint() {
    const select = document.getElementById('shipSelectWaypoint');
    const inputElement = document.getElementById('waypointsInput');
    const shipName = select.value;
    const rawWaypointsJson = inputElement.value;
    
    if (!shipName) {
        alert('請先選擇船隻!');
        return;
    }
    
    // 1. Validate and parse the raw JSON input
    let waypointsArray;
    try {
        waypointsArray = JSON.parse(rawWaypointsJson);
        if (!Array.isArray(waypointsArray) || waypointsArray.length === 0) {
            throw new Error('航點列表不能為空。');
        }
        // Basic check for coordinates format (array of array of 3 numbers)
        waypointsArray.forEach(wp => {
            if (!Array.isArray(wp) || wp.length !== 3 || wp.some(coord => typeof coord !== 'number')) {
                throw new Error('每個航點必須是包含 [x, y, z] 三個數值的陣列。');
            }
        });
    } catch (error) {
        alert(`航點 JSON 格式錯誤: ${error.message}`);
        return;
    }

    // 2. Construct the JSON payload for POST /waypoint
    const payload = {
        ship: shipName,
        waypoints: waypointsArray
    };
    
    const apiUrl = `${API_URL}/waypoint`; 

    try {
        const response = await fetch(apiUrl, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });

        const responseJson = await response.json();

        if (!response.ok || responseJson.success === false) {
            throw new Error(responseJson.message || `Waypoint command failed with status: ${response.status}.`);
        }

        console.log(`Waypoints sent successfully to ${shipName}.`);
        //alert(`${shipName} 已成功設定 ${waypointsArray.length} 個航點。`);
        fetchState(); 

    } catch (error) {
        console.error(`Error sending waypoint:`, error);
        alert(`發送航點失敗: ${error.message}`);
    }
}

// =========================================================
// UI Update Functions
// =========================================================

/**
 * Updates the connection status indicator (connected/disconnected).
 * @param {boolean} isConnected - True if connected, false otherwise.
 */
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isConnected ? 'connection-status connected' : 'connection-status disconnected';
    }
}

/**
 * Populates the ship selection dropdown menus.
 * @param {Array} ships - List of ship data.
 * @param {string} selectId - The ID of the HTML select element to populate.
 * @param {boolean} includeAllOption - Whether to include the "所有船隻" option.
 */
function populateShipSelect(ships, selectId, includeAllOption) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const selectedValue = select.value;
    
    select.innerHTML = ''; // Clear existing options
    
    if (includeAllOption) {
        const allOption = document.createElement('option');
        allOption.value = 'ALL';
        allOption.textContent = '所有船隻';
        select.appendChild(allOption);
    }

    ships.forEach(ship => {
        const option = document.createElement('option');
        option.value = ship.name;
        option.textContent = ship.name;
        select.appendChild(option);
    });

    // Restore previous selection or set default
    if (selectedValue && Array.from(select.options).some(opt => opt.value === selectedValue)) {
        select.value = selectedValue;
    } else if (includeAllOption) {
        select.value = 'ALL';
    } else if (ships.length > 0) {
        select.value = ships[0].name;
    }
}


/**
 * Updates all NON-MAP UI elements with the latest data from the backend.
 * @param {object} data - The system state object.
 */
function updateUI(data) {
    const savedPersons = window.latestSavedPersons; 
    
    // Populate ship selection dropdowns
    populateShipSelect(data.ships, 'shipSelectCommand', true);
    populateShipSelect(data.ships, 'shipSelectWaypoint', false); // Waypoint control should target one ship
    
    // Update main status
    document.getElementById('phase').textContent = data.phase;
    const activeShips = data.ships.filter(s => !s.isWaiting).length;
    
    document.getElementById('theta').textContent = data.theta.toFixed(1) + '°';
    document.getElementById('shipCount').textContent = data.ships.length;
    document.getElementById('activeShips').textContent = activeShips;
    document.getElementById('personCount').textContent = data.personsInDistress.count;
    document.getElementById('personCountInList').textContent = savedPersons.length;
    document.getElementById('timestamp').textContent = 'N/A'; // Assuming timestamp is not provided
    
    // Update ship list
    const shipsList = document.getElementById('shipsList');
    shipsList.innerHTML = data.ships.map(ship => `
        <div class="ship-item ${ship.isWaiting ? 'ship-waiting' : ''}">
            <strong>${ship.name}</strong> ${ship.isWaiting ? '⏸️ 等待中' : '▶️ 執行中'}
            <br>
            位置: (${ship.position.x.toFixed(1)}, ${ship.position.z.toFixed(1)}) | 偵測範圍: ${ship.detectionRange.toFixed(1)}m
            <button onclick="sendShipCommand('start', '${ship.name}')">啟動</button>
            <button onclick="sendShipCommand('stop', '${ship.name}')">停止</button>
        </div>
    `).join('');
    // Update persons list
    const personsList = document.getElementById('personsList');
    personsList.innerHTML = data.personsInDistress.persons.map(person => `
        <div class="person-item ${person.isSaved ? 'person-saved' : ''}">
            ${person.isSaved ? '✅ 已獲救' : '🚨 DANGER'} ID ${person.id}
            <br>
            位置: (${person.position.x.toFixed(1)}, ${person.position.z.toFixed(1)})
        </div>
    `).join('');
    
    // Update wind indicator
    const windNeedle = document.getElementById('wind-needle');
    const windTheta = document.getElementById('wind-theta');
    if (windNeedle) {
        // Assuming data.theta is wind direction (0=N, 90=E)
        // CSS rotate(0) points right (East). We need to adjust.
        // If 0=N, 90=E, then our rotation should match theta.
        // But the needle image might point up (North) by default.
        // Let's assume the 'wind-needle' CSS makes 0deg point North.
        // Then we just need to set the rotation to data.theta.
        //
        // Your previous code had: const rotation = 90 - data.theta;
        // This implies theta=0 (North) results in rotate(90), which is East.
        // This seems backward.
        //
        // Let's assume theta=0 means wind *from* North, blowing South. The arrow should point South (180deg).
        // Let's assume theta=90 means wind *from* East, blowing West. The arrow should point West (270deg).
        // Formula: rotation = data.theta + 180;
        //
        // Let's assume theta=0 means wind *to* North (0deg).
        // Let's assume theta=90 means wind *to* East (90deg).
        // This is the "meteorological" standard vs "nautical" standard.
        //
        // Your code `const rotation = 90 - data.theta;` is confusing.
        // Let's try what "looks right": 0=N, 90=E.
        // If the needle image points UP by default, rotation should be `data.theta`.
        // If the needle image points RIGHT by default, rotation should be `data.theta - 90`.
        //
        // Re-using your original logic as it might be tied to your specific CSS:
        const rotation = 90 - data.theta; 
        windNeedle.style.transform = `rotate(${rotation}deg)`;
        windTheta.textContent = `${data.theta.toFixed(1)}°`;
    }
}

// ===========================================
// High-Frequency Map Rendering Loop (approx. 60 FPS)
// ===========================================

/**
 * The main rendering loop using requestAnimationFrame.
 */
function startRenderingLoop() {
    // Only attempt to render if we have data and the map function is available
    if (window.latestSystemData && window.updateMap) {
        // Call the map rendering function from mapRender.js
        window.updateMap(window.latestSystemData, window.latestSavedPersons);
    }
    
    // Request the next frame for smooth animation
    requestAnimationFrame(startRenderingLoop);
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    startPolling();
});

// Expose functions globally so they can be called from index.html buttons
window.resetSimulation = resetSimulation;
window.fetchState = fetchState;
window.sendShipCommand = sendShipCommand; 
window.addWaypoint = addWaypoint; 

// --- NEW: Expose recording toggle function ---
window.toggleWaypointRecording = toggleWaypointRecording;