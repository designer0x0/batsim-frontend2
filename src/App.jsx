import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
// (鑒) MODIFIED: 假設你的 conversions.js 導出了這些常數
import {
  // 導入你的 conversion 函數
  mapToScreen,
  screenToLatLon,
  screenToUnity,
  // 導入你的地圖邊界 (這對於座標轉換至關重要)
  MAP_MIN_X,
  MAP_MAX_X,
  MAP_MIN_Z,
  MAP_MAX_Z,
  LAT_MIN,
  LAT_MAX,
  LON_MIN,
  LON_MAX,
} from "./utils/conversions"; // (鑒) 假設 conversions.js 匯出這些
import { getCurrentDataInRange } from "./utils/current";
import { api } from "./services/api";
import SystemControlPanel from "./components/SystemControlPanel";

const init_scale = 1.0;
const init_pos = { x: -5200, y: -4800 };

// --- (鑒) NEW: 範圍映射 (Lerp) 輔助函數 ---
/**
 * Re-maps a number from one range to another.
 * @param {number} value The value to map
 * @param {number} inMin The input range's minimum
 * @param {number} inMax The input range's maximum
 * @param {number} outMin The output range's minimum
 * @param {number} outMax The output range's maximum
 * @returns {number} The mapped value
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
// --- (鑒) END NEW ---

function App() {
  const [scale, setScale] = useState(init_scale);
  const [pos, setPos] = useState(init_pos);

  // --- (鑒) NEW: Ref to hold the current view state ---
  const viewStateRef = useRef({ scale: init_scale, pos: init_pos });
  // --- END NEW ---

  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const imgRef = useRef(null);

  const mapContainerRef = useRef(null);
  const wheelDebounceTimer = useRef(null);

  const [expandedSection, setExpandedSection] = useState(null);
  const [mouseLatLon, setMouseLatLon] = useState({ lat: null, lon: null });

  // API integration states
  const [ships, setShips] = useState([]);
  const [persons, setPersons] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [waypoints, setWaypoints] = useState([]);
  const [selectedShipCommand, setSelectedShipCommand] = useState("");
  const [selectedShipWaypoint, setSelectedShipWaypoint] = useState("");

  // --- (鑒) NEW: State for ocean current arrows ---
  const [currentArrows, setCurrentArrows] = useState([]);
  // --- (鑒) END NEW ---

  // --- NEW: updateCurrent function (as requested) ---
  const updateCurrent = useCallback(async () => {
    // 1. Read the latest scale and pos from the ref
    const { scale: currentScale, pos: currentPos } = viewStateRef.current;

    // 2. Check if refs are ready
    if (!mapContainerRef.current || !imgRef.current) {
      console.log("Refs not ready, skipping update (池沼)");
      return;
    }

    console.log("Viewport change complete. Updating current data... (お待たせ)");

    // 3. Get viewport dimensions
    // (鑒) Renamed to be explicit
    const { width: screenWidth, height: screenHeight } =
      mapContainerRef.current.getBoundingClientRect();

    // 4. Convert screen corners to Lat/Lon
    const topLeft = screenToLatLon(
      0,
      0,
      imgRef.current,
      currentScale,
      currentPos
    );
    const bottomRight = screenToLatLon(
      screenWidth, // (鑒) Use new name
      screenHeight, // (鑒) Use new name
      imgRef.current,
      currentScale,
      currentPos
    );

    if (!topLeft || !bottomRight) {
      console.error("Failed to convert screen to lat/lon (絕望)");
      return;
    }

    // 5. Create Bounding Box
    const minLat = Math.min(topLeft.lat, bottomRight.lat);
    const maxLat = Math.max(topLeft.lat, bottomRight.lat);
    const minLon = Math.min(topLeft.lon, bottomRight.lon);
    const maxLon = Math.max(topLeft.lon, bottomRight.lon);

    console.log("Fetching data for Lat/Lon box:", minLat, maxLat, minLon, maxLon);

    // 6. Get filtered data (returns { speed: [...], direction: [...] })
    const filteredData = await getCurrentDataInRange(
      minLat,
      minLon,
      maxLat,
      maxLon
    );

    // --- (鑒) MODIFIED: Process data for rendering (Pixel-based) ---
    if (filteredData && filteredData.speed.length > 0) {
      const { speed: speedGrid, direction: directionGrid } = filteredData;
      const newArrows = [];

      // (鑒) Get grid dimensions
      const gridHeight = speedGrid.length;
      if (gridHeight === 0) {
        setCurrentArrows([]);
        return;
      }
      const gridWidth = speedGrid[0].length;
      if (gridWidth === 0) {
        setCurrentArrows([]);
        return;
      }

      // (鑒) 採樣：每 200 像素取一個點 (Sample: pick one point every 200 pixels)
      // (你可以調整這個值來改變密度)
      const PIXEL_STEP = 200;

      // (鑒) 從 (STEP/2) 開始循環，使箭頭網格在螢幕上居中
      for (let y = PIXEL_STEP / 2; y < screenHeight; y += PIXEL_STEP) {
        for (let x = PIXEL_STEP / 2; x < screenWidth; x += PIXEL_STEP) {
          try {
            // 1. (NEW) 將 "螢幕" 像素 (x, y) 映射到 "資料" 索引 (r, c)
            // e.g., screen y (0 to screenHeight) -> grid r (0 to gridHeight-1)
            // e.g., screen x (0 to screenWidth) -> grid c (0 to gridWidth-1)
            const r_float = (y / screenHeight) * (gridHeight - 1);
            const c_float = (x / screenWidth) * (gridWidth - 1);

            // 取得最近的整數索引
            const r = Math.round(r_float);
            const c = Math.round(c_float);

            // 2. Get speed and direction data from the grid
            const speed = parseFloat(speedGrid[r][c]).toFixed(1);
            const dir = parseFloat(directionGrid[r][c]).toFixed(0);

            // 3. (NEW) 儲存 "螢幕" 座標 (x, y)
            newArrows.push({
              id: `c_${x}_${y}`,
              x: x, // (鑒) 儲存螢幕 X 座標
              y: y, // (鑒) 儲存螢幕 Y 座標
              speed,
              dir,
            });
          } catch (e) {
            // (e.g., if grid is not fully formed)
            console.error("Error processing grid cell:", r, c, e);
          }
        }
      }
      console.log(`Setting ${newArrows.length} current arrows (喜)`);
      setCurrentArrows(newArrows);
    } else {
      // No data, clear arrows
      setCurrentArrows([]);
    }
    // --- (鑒) END MODIFICATION ---
  }, []); // Empty dependency array
  // --- END NEW FUNCTION ---

  const toggleSection = (sectionName) => {
    console.log(`Toggling section: ${sectionName}`); // Log when a section is toggled
    setExpandedSection(expandedSection === sectionName ? null : sectionName);
  };

  // API functions
  const fetchState = async () => {
    try {
      const data = await api.getStatus();
      setShips(data.ships || []);
      setPersons(data.personsInDistress?.persons || []);

      setConnected(true);
    } catch (error) {
      setConnected(false);
      // console.error("Fetch state failed:", error.message);
    }
  };

  const resetSimulation = async () => {
    try {
      await api.reset();
      console.log("Simulation reset successfully");
      setWaypoints([]);
      await fetchState(); // fetchState will get the new current status
    } catch (error) {
      console.error(`重置模擬失敗: ${error.message}`);
    }
  };

  // This handler is just for testing the CSV read
  const toggleOceanCurrent = async () => {
    try {
      // This will now trigger updateCurrent()
      await updateCurrent();
    } catch (error) {
      console.error(`切換海流失敗: ${error.message}`);
    }
  };

  const sendShipCommand = async (action, shipName) => {
    if (!shipName) {
      console.error("請先選擇船隻");
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
      if (waypoints.length > 0) {
        if (!window.confirm("是否清空現有航點並開始錄製？")) {
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
      console.error("請先選擇船隻");
      return;
    }

    if (waypoints.length === 0) {
      console.error("航點列表不能為空");
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
  }, []); // Empty dependency array

  // Polling effect
  useEffect(() => {
    fetchState(); // Initial fetch
    const interval = setInterval(fetchState, 100); // Poll every 100ms
    return () => clearInterval(interval);
  }, []);

  // Set default ship selections when ships data is loaded
  useEffect(() => {
    if (ships.length > 0) {
      const shipNames = ships.map((s) => s.name);
      if (!selectedShipCommand || !shipNames.includes(selectedShipCommand)) {
        setSelectedShipCommand(ships[0].name);
      }
      if (!selectedShipWaypoint || !shipNames.includes(selectedShipWaypoint)) {
        setSelectedShipWaypoint(ships[0].name);
      }
    }
  }, [ships, selectedShipCommand, selectedShipWaypoint]);

  // Sync state to ref
  useEffect(() => {
    viewStateRef.current = { scale, pos };
  }, [scale, pos]);

  // Effect to update arrows on mount
  useEffect(() => {
    updateCurrent();
  }, [updateCurrent]); // This now only runs once on mount

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.min(Math.max(scale + delta, 0.001), 5);
      const scaleFactor = newScale / scale;
      const newX = mouseX - (mouseX - pos.x) * scaleFactor;
      const newY = mouseY - (mouseY - pos.y) * scaleFactor;
      setScale(newScale);
      setPos({ x: newX, y: newY });

      clearTimeout(wheelDebounceTimer.current);
      wheelDebounceTimer.current = setTimeout(() => {
        updateCurrent();
      }, 300); // Wait 300ms after last scroll
    },
    [scale, pos, setScale, setPos, updateCurrent]
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handleMouseDown = (e) => {
    setDragging(true);
    setStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

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

    if (dragging) {
      setPos({ x: e.clientX - start.x, y: e.clientY - start.y });
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
    updateCurrent();
  };

  const handleMapClick = (e) => {
    if (!isRecording) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
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
        parseFloat(unityCoords.unityZ.toFixed(1)),
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
    updateCurrent();
  };

  return (
    <div className="app">
      {/* Top-left title */}
      <div className="title-box">智慧化 AI 船群搜救模擬系統</div>

      {/* Map container as the base layer */}
      <div
        className="map-container"
        ref={mapContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleMapClick}
        style={{ cursor: isRecording ? "crosshair" : "default" }}
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
        {ships.map((ship) => {
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
                className={`map-ship ${ship.isWaiting ? "ship-waiting" : ""}`}
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
        {persons.map((person) => {
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
              className={`map-person ${
                person.isSaved ? "person-saved" : "person-danger"
              }`}
              style={{
                left: `${x}px`,
                top: `${y}px`,
              }}
            >
              <div className="person-icon"></div>
              <div className="person-label">
                {person.isSaved ? "已獲救" : "待救"} ID {person.id}
              </div>
            </div>
          );
        })}

        {/* --- (鑒) MODIFIED: Ocean Current Arrows --- */}
        {currentArrows.map((arrow) => {
          // (鑒) 
          // 我們不再需要 mapToScreen！
          // 箭頭現在使用在 updateCurrent 中計算的
          // "螢幕" 像素座標 (arrow.x, arrow.y)。
          //
          // 這會讓箭頭 "釘" 在螢幕上，
          // 當地圖平移/縮放時，箭頭會保持在原位，
          // 直到 updateCurrent 完成後，它們的 "數值" (speed/dir) 才會更新。
          //
          return (
            <div
              key={arrow.id}
              className="current-arrow"
              style={{
                // (鑒) 直接使用 arrow.x 和 arrow.y
                left: `${arrow.x}px`,
                top: `${arrow.y}px`,
                // (鑒) 旋轉箭頭以匹配方向
                transform: `translate(-50%, -50%) rotate(${arrow.dir}deg)`,
              }}
            >
              <div className="current-arrow-icon">↑</div> {/* 簡單的箭頭 */}
              <div className="current-arrow-label">
                {arrow.speed} {/* 顯示速度 */}
              </div>
            </div>
          );
        })}
        {/* --- (鑒) END MODIFICATION --- */}
      </div>

      {/* Menu floating on the map */}
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>
      <div className={`side-menu ${menuOpen ? "open" : ""}`}>
        <h2>選單</h2>

        {/* System Control */}
        <div className="accordion-section">
          <div
            className="accordion-title"
            onClick={() => {
              setExpandedSection(expandedSection === "system" ? null : "system");
            }}
          >
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
                {ships.map((ship) => (
                  <option key={ship.name} value={ship.name}>
                    {ship.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => sendShipCommand("start", selectedShipCommand)}
              >
                啟動
              </button>
              <button
                onClick={() => sendShipCommand("stop", selectedShipCommand)}
              >
                停止
              </button>
            </div>
          )}
        </div>

        {/* Waypoint Recording */}
        <div className="accordion-section">
          <div
            className="accordion-title"
            onClick={() => toggleSection("waypoint")}
          >
            航點錄製
          </div>
          {expandedSection === "waypoint" && (
            <div className="accordion-content">
              <button
                onClick={toggleWaypointRecording}
                style={{
                  backgroundColor: isRecording ? "#f44336" : "",
                  color: isRecording ? "white" : "",
                }}
              >
                {isRecording ? "停止錄製" : "錄製航點"}
              </button>
              <select
                value={selectedShipWaypoint}
                onChange={(e) => setSelectedShipWaypoint(e.target.value)}
              >
                {ships.map((ship) => (
                  <option key={ship.name} value={ship.name}>
                    {ship.name}
                  </option>
                ))}
              </select>
              <button onClick={addWaypoint}>送出航點</button>
              <textarea
                readOnly
                rows="6"
                value={JSON.stringify(waypoints, null, 2)}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}
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
        <SystemControlPanel
          onClose={() => setExpandedSection(null)}
          connected={connected}
          resetSimulation={resetSimulation}
          // --- (鑒) 你可能想把 toggleOceanCurrent 傳遞下去 ---
          toggleOceanCurrent={toggleOceanCurrent}
          // --- END NEW PROPS ---
        />
      )}
    </div>
  );
}

export default App;