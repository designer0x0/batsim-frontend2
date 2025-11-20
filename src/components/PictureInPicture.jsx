import { useState, useRef, useEffect } from "react";
import {
  mapToScreen,
  MAP_MIN_X,
  MAP_MAX_X,
  MAP_MIN_Z,
  MAP_MAX_Z,
} from "../utils/conversions";
import "./PictureInPicture.css";

// PIP window size
const PIP_WIDTH = 350;
const PIP_HEIGHT = 300;

function PictureInPicture({
  ships,
  persons,
  shipHistories,
  dashboardSelectedShips,
}) {
  const [pipShip, setPipShip] = useState(""); // Tracked ship name
  const [pipScale, setPipScale] = useState(2.5); // Zoom level (1.0 to 4.0)
  const [pipPos, setPipPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);

  // Handle mouse wheel for zooming
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2; // Scroll down = zoom out, scroll up = zoom in
    const newScale = Math.min(Math.max(pipScale + delta, 1.0), 4.0);
    setPipScale(newScale);
  };

  // Auto-center on tracked ship
  useEffect(() => {
    if (!pipShip) return;
    const ship = ships.find((s) => s.name === pipShip);
    if (!ship) return;
    if (!imgRef.current) return;

    const img = imgRef.current;
    if (!img.naturalWidth || !img.naturalHeight) return;

    // Calculate ship position on the map image
    const normalizedX = (ship.position.x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X);
    const normalizedZ = (ship.position.z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z);

    const imgX = normalizedX * img.naturalWidth;
    const imgY = (1 - normalizedZ) * img.naturalHeight;

    // Center the ship in the PIP window
    const centerX = PIP_WIDTH / 2;
    const centerY = PIP_HEIGHT / 2;

    setPipPos({ x: centerX - imgX * pipScale, y: centerY - imgY * pipScale });
  }, [pipShip, ships, pipScale]);

  return (
    <div className="pip-container">
      {/* Ship selector */}
      <div className="pip-header">
        <label>追蹤船隻:</label>
        <select
          value={pipShip}
          onChange={(e) => setPipShip(e.target.value)}
        >
          <option value="">選擇船隻</option>
          {ships.map((ship) => (
            <option key={ship.name} value={ship.name}>
              {ship.name}
            </option>
          ))}
        </select>
        <span className="pip-zoom-indicator">
          {pipScale.toFixed(1)}x
        </span>
      </div>

      {/* Map viewport */}
      <div className="pip-viewport" onWheel={handleWheel}>
        {/* SVG layer for ship paths */}
        <svg
          className="pip-ship-paths"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {dashboardSelectedShips.map((name) => {
            const history = shipHistories[name] || [];
            if (!imgRef.current || history.length < 2) return null;

            const points = history
              .map((pt) => {
                const { x, y } = mapToScreen(pt.x, pt.z, imgRef.current, pipScale, pipPos);
                return `${x},${y}`;
              })
              .join(" ");

            return (
              <polyline
                key={`pip_path_${name}`}
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

        {/* Map image */}
        <img
          ref={imgRef}
          src="/map.png"
          alt="map"
          style={{
            transform: `translate(${pipPos.x}px, ${pipPos.y}px) scale(${pipScale})`,
            transformOrigin: "0 0",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        {/* Ship markers */}
        {ships.map((ship) => {
          if (!imgRef.current) return null;
          const { x, y } = mapToScreen(
            ship.position.x,
            ship.position.z,
            imgRef.current,
            pipScale,
            pipPos
          );

          // Only render if ship is within viewport
          if (x < -50 || x > PIP_WIDTH + 50 || y < -50 || y > PIP_HEIGHT + 50) {
            return null;
          }

          return (
            <div key={`pip_ship_${ship.name}`}>
              {/* Detection range circle */}
              {ship.detectionRange > 0 && (
                <div
                  className="pip-detection-range"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${ship.detectionRange * pipScale * 2}px`,
                    height: `${ship.detectionRange * pipScale * 2}px`,
                  }}
                />
              )}
              {/* Ship marker */}
              <div
                className={`pip-map-ship ${ship.isWaiting ? "pip-ship-waiting" : ""} ${ship.name === pipShip ? "pip-ship-tracked" : ""}`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                }}
              >
                <div className="pip-ship-icon"></div>
                <div className="pip-ship-label">{ship.name}</div>
              </div>
            </div>
          );
        })}

        {/* Person markers */}
        {persons.filter(person => !person.isSaved).map((person) => {
          if (!imgRef.current) return null;
          const { x, y } = mapToScreen(
            person.position.x,
            person.position.z,
            imgRef.current,
            pipScale,
            pipPos
          );

          // Only render if person is within viewport
          if (x < -50 || x > PIP_WIDTH + 50 || y < -50 || y > PIP_HEIGHT + 50) {
            return null;
          }

          return (
            <div
              key={`pip_person_${person.id}`}
              className={`pip-map-person ${person.isSaved ? "pip-person-saved" : "pip-person-danger"}`}
              style={{
                left: `${x}px`,
                top: `${y}px`,
              }}
            >
              <div className="pip-person-icon"></div>
              <div className="pip-person-label">
                {person.isSaved ? "已獲救" : "待救"} ID {person.id}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PictureInPicture;
