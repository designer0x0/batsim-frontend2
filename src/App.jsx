import { useState, useRef, useEffect } from "react";
import "./App.css";
import { api } from "./services/api";

const init_scale = 1.0;
const init_pos = { x: -5200, y: -4800 };

// Map boundaries (Unity coordinates)
const MAP_MIN_X = -6200;
const MAP_MAX_X = 8800;
const MAP_MIN_Z = -1500;
const MAP_MAX_Z = 13500;

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
		setExpandedSection(expandedSection === sectionName ? null : sectionName);
	};

	// Coordinate conversion: Unity map coordinates to screen pixels
	const mapToScreen = (mapX, mapZ) => {
		const img = imgRef.current;
		if (!img || !img.naturalWidth || !img.naturalHeight) {
			return { x: 0, y: 0 };
		}

		// Calculate position within map bounds (0 to 1)
		const normalizedX = (mapX - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
		const normalizedZ = (mapZ - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);

		// Convert to image pixel coordinates
		const imgX = normalizedX * img.naturalWidth;
		const imgY = (1 - normalizedZ) * img.naturalHeight; // Invert Y axis

		// Apply current transform (scale and position)
		const screenX = imgX * scale + pos.x;
		const screenY = imgY * scale + pos.y;

		return { x: screenX, y: screenY };
	};

	// API functions
	const fetchState = async () => {
		try {
			const data = await api.getStatus();
			setShips(data.ships || []);
			setPersons(data.personsInDistress?.persons || []);
			setConnected(true);

			// Set default selections if not set
			if (data.ships && data.ships.length > 0) {
				if (!selectedShipCommand) setSelectedShipCommand(data.ships[0].name);
				if (!selectedShipWaypoint) setSelectedShipWaypoint(data.ships[0].name);
			}
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
			alert(`重置模擬失敗: ${error.message}`);
		}
	};

	const sendShipCommand = async (action, shipName) => {
		if (!shipName) {
			alert('請先選擇船隻');
			return;
		}

		try {
			const shipsToSend = [shipName];
			await api.sendCommand(action, shipsToSend);
			console.log(`Command ${action} sent to ${shipName}`);
			await fetchState();
		} catch (error) {
			alert(`發送指令失敗: ${error.message}`);
		}
	};

	const toggleWaypointRecording = () => {
		const newRecordingState = !isRecording;
		setIsRecording(newRecordingState);

		if (newRecordingState) {
			// Start recording - ask to clear existing waypoints
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
			alert('請先選擇船隻');
			return;
		}

		if (waypoints.length === 0) {
			alert('航點列表不能為空');
			return;
		}

		try {
			await api.sendWaypoints(shipName, waypoints);
			console.log(`Waypoints sent to ${shipName}`);
			await fetchState();
		} catch (error) {
			alert(`發送航點失敗: ${error.message}`);
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

    // 取得滑鼠在 map 容器內的座標（像素）
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 將螢幕座標轉成地圖座標
    const mapX = (mouseX - pos.x) / scale;
    const mapY = (mouseY - pos.y) / scale;

    // === 經緯度換算 ===
    // 地圖橫向 (X) 對應經度，縱向 (Y) 對應緯度。
    const lon_min = 121.6140;
    const lon_max = 121.9649;
    const lat_min = 25.1228;
    const lat_max = 25.2588;

    const img = imgRef.current;
    if (img && img.naturalWidth && img.naturalHeight) {
      const lon = lon_min + (mapX / img.naturalWidth) * (lon_max - lon_min);
      const lat = lat_max - (mapY / img.naturalHeight) * (lat_max - lat_min);
      setMouseLatLon({ lat, lon });
    }

    // === 拖曳邏輯 ===
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

		// Convert screen coordinates to map coordinates
		const mapX = (mouseX - pos.x) / scale;
		const mapY = (mouseY - pos.y) / scale;

		// Convert to lat/lon
		const lon_min = 121.6140;
		const lon_max = 121.9649;
		const lat_min = 25.1228;
		const lat_max = 25.2588;

		const img = imgRef.current;
		if (img && img.naturalWidth && img.naturalHeight) {
			const lon = lon_min + (mapX / img.naturalWidth) * (lon_max - lon_min);
			const lat = lat_max - (mapY / img.naturalHeight) * (lat_max - lat_min);

			// Convert lat/lon to Unity coordinates (assuming conversion needed)
			// For now, using pixel coordinates as Unity coordinates
			// You may need to adjust this based on your Unity coordinate system
			const MAP_MIN_X = -6200;
			const MAP_MAX_X = 8800;
			const MAP_MIN_Z = -1500;
			const MAP_MAX_Z = 13500;

			const unityX = MAP_MIN_X + (mapX / img.naturalWidth) * (MAP_MAX_X - MAP_MIN_X);
			const unityZ = MAP_MIN_Z + (mapY / img.naturalHeight) * (MAP_MAX_Z - MAP_MIN_Z);

			const newWaypoint = [
				parseFloat(unityX.toFixed(1)),
				0.0,
				parseFloat(unityZ.toFixed(1))
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

      {/* 左上角標題 */}
      <div className="title-box">
        智慧化 AI 船群搜救模擬系統
      </div>

      {/* 地圖區域在最底層 */}
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
          const { x, y } = mapToScreen(ship.position.x, ship.position.z);
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
          const { x, y } = mapToScreen(person.position.x, person.position.z);
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

      {/* 選單浮在地圖上 */}
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>
      <div className={`side-menu ${menuOpen ? "open" : ""}`}>

        <h2>選單</h2>

        {/* 系統控制 */}
        <div className="accordion-section">
          <div className="accordion-title" onClick={() => toggleSection("system")}>
            系統控制
          </div>
          {expandedSection === "system" && (
            <div className="accordion-content">
              <button onClick={resetSimulation}>重置模擬</button>
              <button onClick={fetchState}>更新狀態</button>
              <div style={{ marginTop: '10px', fontSize: '12px' }}>
                連線狀態: {connected ? '已連線' : '未連線'}
              </div>
            </div>
          )}
        </div>

        {/* 船隻指令 */}
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

        {/* 航點錄製 */}
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

      {/* 左下角經緯度顯示 */}
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
    </div>
  );
}

export default App;
