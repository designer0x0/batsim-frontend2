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
import {
  calculateRescueArea,
  generateRescueTargets,
  buildRescueRoute,
} from "./utils/rescueUtils";
import ShipControlPanel from "./components/ShipControlPanel";
import ShipDashboard from "./components/ShipDashboard";
import WaypointPanel from "./components/WaypointPanel";


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
  const [trackedShip, setTrackedShip] = useState("");
  // Saved routes states
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [dashboardSelectedShips, setDashboardSelectedShips] = useState([]); // names to show paths for
  const [shipHistories, setShipHistories] = useState({}); // { [shipName]: [{x,z}, ...] }
  // Spawn persons states
  const [spawnMode, setSpawnMode] = useState(false);
  const [spawnCenter, setSpawnCenter] = useState(null);
  const [spawnCount, setSpawnCount] = useState(5);
  const [spawnRadius, setSpawnRadius] = useState(100.0);
  // Rescue operation state
  const [rescueInProgress, setRescueInProgress] = useState(false);
  const [openPanel, setOpenPanel] = useState(null);  // "system" | "ship" | "waypoint" | null


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
      // 清空儀表板選中的路徑與所有船隻歷史軌跡
      setDashboardSelectedShips([]);
      setShipHistories({});
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

  const loadRoute = () => {
    if (!selectedRoute) {
      console.error("請選擇路徑");
      return;
    }

    const route = savedRoutes.find((r) => r.id === selectedRoute);
    if (route) {
      setWaypoints(route.waypoints);
      console.log(`載入路徑: ${route.name} (${route.waypoints.length} 個航點)`);
    } else {
      console.error("找不到指定的路徑");
    }
  };

  const toggleSpawnMode = () => {
    const newSpawnMode = !spawnMode;
    setSpawnMode(newSpawnMode);

    if (!newSpawnMode) {
      // Exit spawn mode, clear spawn center
      setSpawnCenter(null);
    }
  };

  const spawnPersons = async () => {
    if (!spawnCenter) {
      console.error("請先選擇生成位置");
      return;
    }

    if (spawnCount <= 0) {
      console.error("生成數量必須大於 0");
      return;
    }

    if (spawnRadius <= 0) {
      console.error("生成半徑必須大於 0");
      return;
    }

    try {
      const center = {
        x: spawnCenter.x,
        y: 0.0,
        z: spawnCenter.z
      };

      await api.spawnPersons(spawnCount, spawnRadius, center);
      console.log(`已生成 ${spawnCount} 個待救者於 (${center.x}, ${center.z})`);
      setSpawnCenter(null);
      setSpawnMode(false);
      await fetchState();
    } catch (error) {
      console.error(`生成待救者失敗: ${error.message}`);
    }
  };

  const startRescue = async () => {
    if (rescueInProgress) {
      console.error("搜救已在進行中");
      return;
    }

    try {
      setRescueInProgress(true);

      // Calculate rescue area
      const area = calculateRescueArea(persons);
      if (!area) {
        console.error("沒有待救者");
        setRescueInProgress(false);
        return;
      }

      // Check if ships and base route exist
      if (ships.length === 0) {
        console.error("沒有可用船隻");
        setRescueInProgress(false);
        return;
      }

      const baseRoute = savedRoutes.find((r) => r.id === "route_001");
      if (!baseRoute) {
        console.error("找不到出港路徑 (route_001)");
        setRescueInProgress(false);
        return;
      }

      // Get the end point of the base route
      const lastWaypoint = baseRoute.waypoints[baseRoute.waypoints.length - 1];
      const startPoint = { x: lastWaypoint[0], z: lastWaypoint[2] };

      // Generate parallel rescue targets for each ship
      const targets = generateRescueTargets(
        startPoint,
        area.centerX,
        area.centerZ,
        area.radius,
        ships.length
      );

      console.log(`開始搜救: 中心點 (${area.centerX.toFixed(1)}, ${area.centerZ.toFixed(1)}), 半徑 ${area.radius.toFixed(1)}`);

      // Send waypoints to each ship
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        const target = targets[i];

        // Build complete route: base route + intermediate waypoints + target
        const completeRoute = buildRescueRoute(baseRoute, target, 5);

        console.log(`發送航點給 ${ship.name}: ${completeRoute.length} 個航點`);
        await api.sendWaypoints(ship.name, completeRoute);
      }

      // Start all ships with delay between each
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        await api.sendCommand("start", [ship.name]);
        console.log(`已啟動 ${ship.name}`);

        // Delay before starting next ship (except for the last one)
        if (i < ships.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10000));  // delay
        }
      }

      console.log("所有船隻已啟動");
      setRescueInProgress(false);
      await fetchState();
    } catch (error) {
      console.error(`搜救失敗: ${error.message}`);
      setRescueInProgress(false);
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

  // Load saved routes from JSON file
  useEffect(() => {
    const loadRoutes = async () => {
      try {
        const response = await fetch('/routes.json');
        const data = await response.json();
        setSavedRoutes(data.routes || []);
        console.log(`載入 ${data.routes?.length || 0} 條路徑`);
      } catch (error) {
        console.error('載入路徑失敗:', error);
        setSavedRoutes([]);
      }
    };
    loadRoutes();
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

  // Keep previous ships to detect start/stop transitions
  const prevShipsRef = useRef([]);

  // Update ship histories whenever ships update
  useEffect(() => {
    const prevShips = prevShipsRef.current || [];
    setShipHistories((currentHistories) => {
      const newHistories = { ...currentHistories };

      ships.forEach((ship) => {
        const prev = prevShips.find((p) => p.name === ship.name);
        const isActive = !ship.isWaiting; // treat not-waiting as active/started

        // If the ship just transitioned from waiting -> active, reset history
        if (prev && prev.isWaiting && !ship.isWaiting) {
          newHistories[ship.name] = [{ x: ship.position.x, z: ship.position.z }];
        } else if (!prev && isActive) {
          // newly appeared and active -> start history
          newHistories[ship.name] = [{ x: ship.position.x, z: ship.position.z }];
        } else if (isActive) {
          // append current position
          const arr = newHistories[ship.name] ? [...newHistories[ship.name]] : [];
          // Only append if last point is different to avoid duplicates
          const last = arr[arr.length - 1];
          if (!last || last.x !== ship.position.x || last.z !== ship.position.z) {
            arr.push({ x: ship.position.x, z: ship.position.z });
          }
          newHistories[ship.name] = arr;
        }
        // If ship became waiting again, don't append further (but keep history)
      });

      return newHistories;
    });

    prevShipsRef.current = ships;
  }, [ships]);

  // Sync state to ref
  useEffect(() => {
    viewStateRef.current = { scale, pos };
  }, [scale, pos]);

  // When a ship is selected to be tracked, center the view on that ship
  useEffect(() => {
    if (!trackedShip) return; // empty => global
    const ship = ships.find((s) => s.name === trackedShip);
    if (!ship) return;
    if (!imgRef.current || !mapContainerRef.current) return;
    const img = imgRef.current;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const normalizedX = (ship.position.x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
    const normalizedZ = (ship.position.z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);

    const imgX = normalizedX * img.naturalWidth;
    const imgY = (1 - normalizedZ) * img.naturalHeight;

    const { width, height } = mapContainerRef.current.getBoundingClientRect();
    const centerX = width / 2;
    const centerY = height / 2;

    setPos({ x: centerX - imgX * scale, y: centerY - imgY * scale });
  }, [trackedShip, ships, scale]);

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

    if (!unityCoords) return;

    // Handle spawn mode
    if (spawnMode) {
      setSpawnCenter({
        x: parseFloat(unityCoords.unityX.toFixed(1)),
        z: parseFloat(unityCoords.unityZ.toFixed(1))
      });
      return;
    }

    // Handle waypoint recording
    if (isRecording) {
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
        style={{ cursor: (isRecording || spawnMode) ? "crosshair" : "default" }}
      >
        {/* SVG layer for ship paths (screen coordinates) */}
        <svg
          className="ship-paths"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 2, // ensure svg is above the map image but below markers
          }}
        >
          {dashboardSelectedShips.map((name) => {
            const history = shipHistories[name] || [];
            if (!imgRef.current || history.length < 2) return null;

            const points = history
              .map((pt) => {
                const { x, y } = mapToScreen(pt.x, pt.z, imgRef.current, scale, pos);
                return `${x},${y}`;
              })
              .join(" ");

            return (
              <polyline
                key={`path_${name}`}
                points={points}
                fill="none"
                stroke="#fff"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.95}
              />
            );
          })}
        </svg>
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
        {persons.filter(person => person.isSaved).map((person) => {
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
              className={`map-person ${person.isSaved ? "person-saved" : "person-danger"
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

        {/* Spawn range visualization */}
        {spawnCenter && (
          <>
            {/* Spawn range circle */}
            <div
              className="spawn-range"
              style={{
                left: `${mapToScreen(spawnCenter.x, spawnCenter.z, imgRef.current, scale, pos).x}px`,
                top: `${mapToScreen(spawnCenter.x, spawnCenter.z, imgRef.current, scale, pos).y}px`,
                width: `${spawnRadius * scale * 2}px`,
                height: `${spawnRadius * scale * 2}px`,
                border: "2px dashed #ff9800",
                borderRadius: "50%",
                position: "absolute",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                backgroundColor: "rgba(255, 152, 0, 0.1)",
              }}
            />
            {/* Spawn center marker */}
            <div
              className="spawn-center"
              style={{
                left: `${mapToScreen(spawnCenter.x, spawnCenter.z, imgRef.current, scale, pos).x}px`,
                top: `${mapToScreen(spawnCenter.x, spawnCenter.z, imgRef.current, scale, pos).y}px`,
                position: "absolute",
                transform: "translate(-50%, -50%)",
                width: "12px",
                height: "12px",
                backgroundColor: "#ff9800",
                borderRadius: "50%",
                border: "2px solid white",
                pointerEvents: "none",
              }}
            />
          </>
        )}

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
        <div>
          <div className="accordion-title" onClick={() => setOpenPanel("system")}>
            系統控制
          </div>
          <div className="divider"></div> {/* Divider */}
        </div>

        {/* Ship Commands */}
        <div>
          <div className="accordion-title" onClick={() => setOpenPanel("ship")}>
            船隻控制
          </div>
          <div className="divider"></div> {/* Divider */}
        </div>

        {/* Ship Dashboard */}
        <div>
          <div className="accordion-title" onClick={() => setOpenPanel("dashboard")}>
            船隻儀錶板
          </div>
          <div className="divider"></div>
        </div>

        {/* Waypoint Recording */}
        <div>
          <div className="accordion-title" onClick={() => setOpenPanel("waypoint")}>
            航點錄製
          </div>
          {expandedSection === "waypoint" && (
            <div className="accordion-content">
              {/* Saved Routes Section */}
              {savedRoutes.length > 0 && (
                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #ddd" }}>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                    載入預設路徑
                  </label>
                  <select
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    style={{ marginBottom: "5px" }}
                  >
                    <option value="">請選擇路徑</option>
                    {savedRoutes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={loadRoute} disabled={!selectedRoute}>
                    載入路徑
                  </button>
                  {selectedRoute && savedRoutes.find((r) => r.id === selectedRoute)?.description && (
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "5px" }}>
                      {savedRoutes.find((r) => r.id === selectedRoute).description}
                    </div>
                  )}
                </div>
              )}

              {/* Recording Controls */}
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
          <div className="divider"></div> {/* Divider */}
        </div>

        {/* Spawn Persons Section */}
        <div className="accordion-section">
          <div
            className="accordion-title"
            onClick={() => toggleSection("spawn")}
          >
            設定待救者位置
          </div>
          {expandedSection === "spawn" && (
            <div className="accordion-content">
              <label style={{ display: "block", marginBottom: "5px" }}>
                生成數量
              </label>
              <input
                type="number"
                min="1"
                value={spawnCount}
                onChange={(e) => setSpawnCount(parseInt(e.target.value) || 1)}
                style={{ width: "100%", marginBottom: "10px" }}
              />

              <label style={{ display: "block", marginBottom: "5px" }}>
                生成半徑
              </label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={spawnRadius}
                onChange={(e) => setSpawnRadius(parseFloat(e.target.value) || 1.0)}
                style={{ width: "100%", marginBottom: "10px" }}
              />

              <button
                onClick={toggleSpawnMode}
                style={{
                  backgroundColor: spawnMode ? "#f44336" : "",
                  color: spawnMode ? "white" : "",
                  marginBottom: "10px",
                }}
              >
                {spawnMode ? "取消選擇" : "選擇位置"}
              </button>

              {spawnCenter && (
                <div style={{ fontSize: "11px", color: "#666", marginBottom: "10px" }}>
                  中心點: ({spawnCenter.x.toFixed(1)}, {spawnCenter.z.toFixed(1)})
                </div>
              )}

              <button
                onClick={spawnPersons}
                disabled={!spawnCenter}
                style={{
                  width: "100%",
                  backgroundColor: spawnCenter ? "#4CAF50" : "",
                  color: spawnCenter ? "white" : "",
                }}
              >
                生成待救者
              </button>
            </div>
          )}
        </div>

        {/* Auto Rescue Section */}
        <div className="accordion-section">
          <div
            className="accordion-title"
            onClick={() => toggleSection("rescue")}
          >
            自動搜救
          </div>
          {expandedSection === "rescue" && (
            <div className="accordion-content">
              {(() => {
                const area = calculateRescueArea(persons);
                const personsInDistress = persons.filter(p => !p.isSaved);

                return (
                  <>
                    <div style={{ fontSize: "12px", marginBottom: "10px" }}>
                      <div>待救者數量: {personsInDistress.length}</div>
                      {area && (
                        <>
                          <div>中心點: ({area.centerX.toFixed(1)}, {area.centerZ.toFixed(1)})</div>
                          <div>半徑: {area.radius.toFixed(1)}</div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={startRescue}
                      disabled={rescueInProgress || personsInDistress.length === 0 || ships.length === 0}
                      style={{
                        width: "100%",
                        backgroundColor: rescueInProgress ? "#ccc" : (personsInDistress.length > 0 && ships.length > 0 ? "#ff5722" : ""),
                        color: (personsInDistress.length > 0 && ships.length > 0) ? "white" : "",
                      }}
                    >
                      {rescueInProgress ? "搜救進行中..." : "開始搜救"}
                    </button>

                    {personsInDistress.length === 0 && (
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "10px" }}>
                        無待救者
                      </div>
                    )}
                    {ships.length === 0 && (
                      <div style={{ fontSize: "11px", color: "#999", marginTop: "10px" }}>
                        無可用船隻
                      </div>
                    )}
                  </>
                );
              })()}
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

      {openPanel === "system" && (
        <SystemControlPanel
          onClose={() => setOpenPanel(null)}
          connected={connected}
          resetSimulation={resetSimulation}
          // --- (鑒) 你可能想把 toggleOceanCurrent 傳遞下去 ---
          toggleOceanCurrent={toggleOceanCurrent}
          ships={ships}
          trackedShip={trackedShip}
          setTrackedShip={setTrackedShip}
        // --- END NEW PROPS ---
        />
      )}

      {openPanel === "ship" && (
        <ShipControlPanel
          onClose={() => setOpenPanel(null)}
          ships={ships}
          selectedShipCommand={selectedShipCommand}
          setSelectedShipCommand={setSelectedShipCommand}
          sendShipCommand={sendShipCommand}
        />
      )}

      {openPanel === "dashboard" && (
        <ShipDashboard
          onClose={() => setOpenPanel(null)}
          ships={ships}
          selected={dashboardSelectedShips}
          setSelected={setDashboardSelectedShips}
          shipHistories={shipHistories}
        />
      )}

      {openPanel === "waypoint" && (
        <WaypointPanel
          onClose={() => setOpenPanel(null)}
          ships={ships}
          selectedShipWaypoint={selectedShipWaypoint}
          setSelectedShipWaypoint={setSelectedShipWaypoint}
          isRecording={isRecording}
          toggleWaypointRecording={toggleWaypointRecording}
          waypoints={waypoints}
          addWaypoint={addWaypoint}
        />
      )}
    </div>
  );
}

export default App;