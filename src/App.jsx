import { useState, useRef, useEffect } from "react";
import "./App.css";
import { api } from "./services/api";
import SystemControlPanel from "./components/SystemControlPanel";
// Import the new conversion functions
import {
  mapToScreen,
  screenToLatLon,
  screenToUnity
} from "./utils/conversions";

const init_scale = 1.0;
const init_pos = { x: -5200, y: -4800 };

// Map boundaries are now in conversions.js
// const MAP_MIN_X = -6200; ...etc.

function App() {
  const [scale, setScale] = useState(init_scale);
  const [pos, setPos] = useState(init_pos);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const imgRef = useRef(null);

  const [expandedSection, setExpandedSection] = useState(null);
  const [mouseLatLon, setMouseLatLon] = useState({ lat: null, lon: null });

  // API integration states
  const [ships, setShips] = useState([]);
  const [persons, setPersons] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [waypoints, setWaypoints] = useState([]);
  const [selectedShipCommand, setSelectedShipCommand] = useState('');
  const [selectedShipWaypoint, setSelectedShipWaypoint] = useState('');


  const toggleSection = (sectionName) => {
    console.log(`Toggling section: ${sectionName}`); // Log when a section is toggled
    setExpandedSection(expandedSection === sectionName ? null : sectionName);
  };

  // Coordinate conversion: Unity map coordinates to screen pixels
  // This function is now imported from utils/conversions.js
  // const mapToScreen = (mapX, mapZ) => { ... };

  // API functions
  const fetchState = async () => {
    try {
      const data = await api.getStatus();
      setShips(data.ships || []);
      setPersons(data.personsInDistress?.persons || []);
      setConnected(true);
    } catch (error) {
      setConnected(false);
    }
  };

  const resetSimulation = async () => {
    try {
      await api.reset();
      console.log('Simulation reset successfully');
      setWaypoints([]);
      await fetchState();
    } catch (error) {
      // Use a modal dialog instead of alert if possible
      console.error(`重置模擬失敗: ${error.message}`);
    }
  };

  const sendShipCommand = async (action, shipName) => {
    if (!shipName) {
      console.error('請先選擇船隻');
      return;
    }

    try {
      const shipsToSend = [shipName];
      await api.sendCommand(action, shipsToSend);
      console.log(`Command ${action} sent to ${shipName}`);
      await fetchState();
    } catch (error) {
      console.error(`發送指令失敗: ${error.message}`);
    }
  };

  const toggleWaypointRecording = () => {
    const newRecordingState = !isRecording;
    setIsRecording(newRecordingState);

    if (newRecordingState) {
      // Start recording - ask to clear existing waypoints
      // NOTE: window.confirm is bad practice in production apps.
      // Consider replacing with a custom modal.
      if (waypoints.length > 0) {
        if (!window.confirm('是否清空現有航點並開始錄製？')) {
          setIsRecording(false);
          return;
        }
      }
      setWaypoints([]);
    }
  };

  const addWaypoint = async () => {
    const shipName = selectedShipWaypoint;

    if (!shipName) {
      console.error('請先選擇船隻');
      return;
    }

    if (waypoints.length === 0) {
      console.error('航點列表不能為空');
      return;
    }

    try {
      await api.sendWaypoints(shipName, waypoints);
      console.log(`Waypoints sent to ${shipName}`);
      await fetchState();
    } catch (error) {
      console.error(`發送航點失敗: ${error.message}`);
    }
  };

  // Image load effect
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    img.onload = () => {
      setScale(init_scale);
      setPos(init_pos);
    };
  }, []);

  // Polling effect
  useEffect(() => {
    fetchState(); // Initial fetch

    const interval = setInterval(fetchState, 100); // Poll every 100ms

    return () => clearInterval(interval);
  }, []);

  // Set default ship selections when ships data is loaded
  useEffect(() => {
    if (ships.length > 0) {
      // Only set default if current selection is empty or invalid
      const shipNames = ships.map(s => s.name);

      if (!selectedShipCommand || !shipNames.includes(selectedShipCommand)) {
        setSelectedShipCommand(ships[0].name);
      }
      if (!selectedShipWaypoint || !shipNames.includes(selectedShipWaypoint)) {
        setSelectedShipWaypoint(ships[0].name);
      }
    }
  }, [ships, selectedShipCommand, selectedShipWaypoint]);

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(scale + delta, 0.5), 5);
    const scaleFactor = newScale / scale;
    const newX = mouseX - (mouseX - pos.x) * scaleFactor;
    const newY = mouseY - (mouseY - pos.y) * scaleFactor;
    setScale(newScale);
    setPos({ x: newX, y: newY });
  };

  const handleMouseDown = (e) => {
    setDragging(true);
    setStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();

    // Get mouse position inside the map container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // === Lat/Lon Conversion ===
    // Use the imported function
    const latLon = screenToLatLon(
      mouseX,
      mouseY,
      imgRef.current,
      scale,
      pos
    );
    if (latLon) {
      setMouseLatLon(latLon);
    } else {
      setMouseLatLon({ lat: null, lon: null });
    }

    // === Dragging Logic ===
    if (dragging) {
      setPos({ x: e.clientX - start.x, y: e.clientY - start.y });
    }
  };


  const handleMouseUp = () => setDragging(false);

  const handleMapClick = (e) => {
    if (!isRecording) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // === Screen to Unity Conversion ===
    // Use the imported function
    const unityCoords = screenToUnity(
      mouseX,
      mouseY,
      imgRef.current,
      scale,
      pos
    );

    if (unityCoords) {
      const newWaypoint = [
        parseFloat(unityCoords.unityX.toFixed(1)),
        0.0, // Y coordinate is 0.0
        parseFloat(unityCoords.unityZ.toFixed(1))
      ];

      setWaypoints([...waypoints, newWaypoint]);
    }
  };

  const resetView = () => {
    const img = imgRef.current;
    if (!img) return;
    setScale(init_scale);
    setPos(init_pos);
    setDragging(false);
  };

  return (
    <div className="app">

      {/* Top-left title */}
      <div className="title-box">
        智慧化 AI 船群搜救模擬系統
      </div>

      {/* Map container as the base layer */}
      <div
        className="map-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleMapClick}
        style={{ cursor: isRecording ? 'crosshair' : 'default' }}
      >
        <img
          ref={imgRef}
          src="/map.png"
          alt="map"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        {/* Ship markers */}
        {ships.map(ship => {
          // Use the imported function, passing dependencies
          const { x, y } = mapToScreen(
            ship.position.x,
            ship.position.z,
            imgRef.current,
            scale,
            pos
          );
          return (
            <div key={ship.name}>
              {/* Detection range circle */}
              {ship.detectionRange > 0 && (
                <div
                  className="detection-range"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${ship.detectionRange * scale * 2}px`,
                    height: `${ship.detectionRange * scale * 2}px`,
                  }}
                />
              )}
              {/* Ship marker */}
              <div
                className={`map-ship ${ship.isWaiting ? 'ship-waiting' : ''}`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                }}
              >
                <div className="ship-icon"></div>
                <div className="ship-label">{ship.name}</div>
              </div>
            </div>
          );
        })}

        {/* Person markers */}
        {persons.map(person => {
          // Use the imported function, passing dependencies
          const { x, y } = mapToScreen(
            person.position.x,
            person.position.z,
            imgRef.current,
            scale,
            pos
          );
          return (
            <div
              key={person.id}
              className={`map-person ${person.isSaved ? 'person-saved' : 'person-danger'}`}
              style={{
                left: `${x}px`,
                top: `${y}px`,
              }}
            >
              <div className="person-icon"></div>
              <div className="person-label">
                {person.isSaved ? '已獲救' : '待救'} ID {person.id}
              </div>
            </div>
          );
        })}
      </div>

      {/* Menu floating on the map */}
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>
      <div className={`side-menu ${menuOpen ? "open" : ""}`}>

        <h2>選單</h2>

        {/* System Control */}
        <div className="accordion-section">
          <div className="accordion-title" onClick={() => {
            // Toggle expandedSection, but don't expand inside side-menu
            setExpandedSection(expandedSection === "system" ? null : "system");
          }}>
            系統控制
          </div>
        </div>

        {/* Ship Commands */}
        <div className="accordion-section">
          <div className="accordion-title" onClick={() => toggleSection("ship")}>
            船隻控制
          </div>
          {expandedSection === "ship" && (
            <div className="accordion-content">
              <select
                value={selectedShipCommand}
                onChange={(e) => setSelectedShipCommand(e.target.value)}
              >
                {ships.map(ship => (
                  <option key={ship.name} value={ship.name}>{ship.name}</option>
                ))}
              </select>
              <button onClick={() => sendShipCommand('start', selectedShipCommand)}>啟動</button>
              <button onClick={() => sendShipCommand('stop', selectedShipCommand)}>停止</button>
            </div>
          )}
        </div>

        {/* Waypoint Recording */}
        <div className="accordion-section">
          <div className="accordion-title" onClick={() => toggleSection("waypoint")}>
            航點錄製
          </div>
          {expandedSection === "waypoint" && (
            <div className="accordion-content">
              <button
                onClick={toggleWaypointRecording}
                style={{
                  backgroundColor: isRecording ? '#f44336' : '',
                  color: isRecording ? 'white' : ''
                }}
              >
                {isRecording ? '停止錄製' : '錄製航點'}
              </button>
              <select
                value={selectedShipWaypoint}
                onChange={(e) => setSelectedShipWaypoint(e.target.value)}
              >
                {ships.map(ship => (
                  <option key={ship.name} value={ship.name}>{ship.name}</option>
                ))}
              </select>
              <button onClick={addWaypoint}>送出航點</button>
              <textarea
                readOnly
                rows="6"
                value={JSON.stringify(waypoints, null, 2)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px' }}
              />
            </div>
          )}
        </div>

        <ul>
          <li onClick={resetView}>回到預設視角</li>
        </ul>

      </div>

      {/* Bottom-left lat/lon display */}
      <div className="mouse-coord-box">
        {mouseLatLon.lat && mouseLatLon.lon ? (
          <>
            <div>緯度: {mouseLatLon.lat.toFixed(5)}</div>
            <div>經度: {mouseLatLon.lon.toFixed(5)}</div>
          </>
        ) : (
          <div>滑鼠未在地圖上</div>
        )}
      </div>


      {/* System Control Panel */}
      {expandedSection === "system" && (
        console.log("Rendering SystemControlPanel"), // Log when the panel is rendered
        <SystemControlPanel
          onClose={() => setExpandedSection(null)}
          connected={connected}
          resetSimulation={resetSimulation}
        />
      )}
    </div>
  );
}

export default App;