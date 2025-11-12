import { useState, useRef, useEffect } from "react";
import "./App.css";

const init_scale = 1.0;
const init_pos = { x: -5200, y: -4800 };

function App() {
  const [scale, setScale] = useState(init_scale);
	const [pos, setPos] = useState(init_pos);
	const [dragging, setDragging] = useState(false);
	const [start, setStart] = useState({ x: 0, y: 0 });
	const [menuOpen, setMenuOpen] = useState(false);
	const imgRef = useRef(null);

	const [expandedSection, setExpandedSection] = useState(null);
	const [mouseLatLon, setMouseLatLon] = useState({ lat: null, lon: null });


	const toggleSection = (sectionName) => {
		setExpandedSection(expandedSection === sectionName ? null : sectionName);
	};

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    img.onload = () => {
      setScale(init_scale);
      setPos(init_pos);
    };
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
              <button onClick={window.resetSimulation}>重置模擬</button>
              <button onClick={window.fetchState}>更新狀態</button>
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
              <select id="shipSelectCommand"></select>
              <button onClick={() => window.sendShipCommand('start', document.getElementById('shipSelectCommand').value)}>啟動</button>
              <button onClick={() => window.sendShipCommand('stop', document.getElementById('shipSelectCommand').value)}>停止</button>
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
              <button id="recordWaypointBtn" onClick={window.toggleWaypointRecording}>
                錄製航點
              </button>
              <select id="shipSelectWaypoint"></select>
              <button onClick={window.addWaypoint}>送出航點</button>
              <textarea id="waypointsInput" readOnly rows="6"></textarea>
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
