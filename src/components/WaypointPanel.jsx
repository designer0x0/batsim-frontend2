import React from "react";
import "./SystemControlPanel.css";

function WaypointPanel({
  onClose,
  ships,
  selectedShipWaypoint,
  setSelectedShipWaypoint,
  isRecording,
  toggleWaypointRecording,
  waypoints,
  addWaypoint
}) {
  return (
    <div className="system-panel">
      <div className="system-panel-header">
        <h3>航點錄製</h3>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="system-panel-content">

        <div className="divider"></div>

        <button
          onClick={toggleWaypointRecording}
          className="reset-simulation"
          style={{
            backgroundColor: isRecording ? "#f44336" : "",
            color: isRecording ? "white" : ""
          }}
        >
          {isRecording ? "停止錄製" : "錄製航點"}
        </button>

        <div style={{ marginTop: "10px" }}>
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
        </div>

        <button className="reset-simulation" onClick={addWaypoint}>
          送出航點
        </button>

        <textarea
          readOnly
          rows="6"
          value={JSON.stringify(waypoints, null, 2)}
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: "11px"
          }}
        />
      </div>
    </div>
  );
}

export default WaypointPanel;
