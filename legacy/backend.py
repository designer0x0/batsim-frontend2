from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
# import asyncio # 移除 asyncio
import random
import math
import uvicorn
from datetime import datetime

app = FastAPI(title="Maritime Search and Rescue API")

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 資料模型
class Position(BaseModel):
    x: float
    y: float
    z: float

class Ship(BaseModel):
    name: str
    position: Position
    isWaiting: bool

class PersonInDistress(BaseModel):
    count: int
    positions: List[Position]

class SystemState(BaseModel):
    phase: str
    theta: float
    ships: List[Ship]
    personsInDistress: PersonInDistress
    timestamp: str = None

# 全域狀態
current_state = SystemState(
    phase="Gathering",
    theta=90.0,
    ships=[
        Ship(name="RescueBoat_1", position=Position(x=10.50, y=0.00, z=20.30), isWaiting=False),
        Ship(name="RescueBoat_2", position=Position(x=15.20, y=0.00, z=25.80), isWaiting=True),
        Ship(name="RescueBoat_3", position=Position(x=20.00, y=0.00, z=22.00), isWaiting=False),
        Ship(name="RescueBoat_4", position=Position(x=25.50, y=0.00, z=27.50), isWaiting=True),
        Ship(name="RescueBoat_5", position=Position(x=12.80, y=0.00, z=30.20), isWaiting=False),
    ],
    personsInDistress=PersonInDistress(
        count=10,
        positions=[
            Position(x=50.00, y=0.00, z=100.00),
            Position(x=52.30, y=0.00, z=105.50),
            Position(x=48.70, y=0.00, z=98.20),
            Position(x=55.10, y=0.00, z=103.80),
            Position(x=51.50, y=0.00, z=107.30),
            Position(x=49.20, y=0.00, z=101.70),
            Position(x=53.80, y=0.00, z=99.50),
            Position(x=47.90, y=0.00, z=104.20),
            Position(x=54.30, y=0.00, z=102.10),
            Position(x=50.60, y=0.00, z=106.40),
        ]
    )
)

# 模擬參數
PHASES = ["Gathering", "Searching", "Approaching", "Rescuing", "Returning"]
current_phase_index = 0
simulation_time = 0

def update_simulation():
    """更新模擬狀態"""
    global current_state, current_phase_index, simulation_time
    
    simulation_time += 1
    
    # 每 50 次更新切換一次階段
    if simulation_time % 50 == 0:
        current_phase_index = (current_phase_index + 1) % len(PHASES)
        current_state.phase = PHASES[current_phase_index]
    
    # 更新風向（theta）- 緩慢變化
    current_state.theta += random.uniform(-2, 2)
    current_state.theta = current_state.theta % 360
    
    # 更新船隻位置
    for ship in current_state.ships:
        if not ship.isWaiting:
            # 根據階段移動船隻
            if current_state.phase in ["Gathering", "Searching"]:
                # 向目標區域移動
                target_x = 50.0
                target_z = 100.0
                dx = target_x - ship.position.x
                dz = target_z - ship.position.z
                distance = math.sqrt(dx**2 + dz**2)
                
                if distance > 1:
                    speed = 0.5
                    ship.position.x += (dx / distance) * speed
                    ship.position.z += (dz / distance) * speed
                else:
                    ship.isWaiting = True
            
            elif current_state.phase == "Approaching":
                # 接近最近的遇難者
                if current_state.personsInDistress.positions:
                    nearest = min(current_state.personsInDistress.positions, 
                                key=lambda p: math.sqrt((p.x - ship.position.x)**2 + (p.z - ship.position.z)**2))
                    dx = nearest.x - ship.position.x
                    dz = nearest.z - ship.position.z
                    distance = math.sqrt(dx**2 + dz**2)
                    
                    if distance > 2:
                        speed = 0.8
                        ship.position.x += (dx / distance) * speed
                        ship.position.z += (dz / distance) * speed
        
        # 隨機切換等待狀態
        if random.random() < 0.02:
            ship.isWaiting = not ship.isWaiting
    
    # 更新遇難者位置（受海流影響輕微漂移）
    for person in current_state.personsInDistress.positions:
        wind_effect_x = math.cos(math.radians(current_state.theta)) * 0.05
        wind_effect_z = math.sin(math.radians(current_state.theta)) * 0.05
        person.x += wind_effect_x + random.uniform(-0.02, 0.02)
        person.z += wind_effect_z + random.uniform(-0.02, 0.02)
    
    # 救援階段：減少遇難者數量
    if current_state.phase == "Rescuing" and current_state.personsInDistress.count > 0:
        if random.random() < 0.05:  # 5% 機率救起一人
            current_state.personsInDistress.count -= 1
            if current_state.personsInDistress.positions:
                current_state.personsInDistress.positions.pop()
    
    current_state.timestamp = datetime.now().isoformat()

# REST API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Maritime Search and Rescue Simulation API",
        "endpoints": {
            "current_state": "/api/state",
            # "websocket": "/ws" # 移除 ws
        }
    }

@app.get("/api/state", response_model=SystemState)
async def get_current_state():
    """獲取當前系統狀態並更新模擬"""
    update_simulation()
    return current_state

@app.get("/api/stats")
async def get_statistics():
    """獲取統計資訊"""
    total_ships = len(current_state.ships)
    active_ships = sum(1 for ship in current_state.ships if not ship.isWaiting)
    
    return {
        "phase": current_state.phase,
        "total_ships": total_ships,
        "active_ships": active_ships,
        "waiting_ships": total_ships - active_ships,
        "persons_in_distress": current_state.personsInDistress.count,
        "wind_direction": current_state.theta,
        "simulation_time": simulation_time
    }

@app.post("/api/reset")
async def reset_simulation():
    """重置模擬"""
    global current_state, current_phase_index, simulation_time
    
    current_phase_index = 0
    simulation_time = 0
    
    # 重置為初始狀態
    current_state = SystemState(
        phase="Gathering",
        theta=90.0,
        ships=[
            Ship(name="RescueBoat_1", position=Position(x=10.50, y=0.00, z=20.30), isWaiting=False),
            Ship(name="RescueBoat_2", position=Position(x=15.20, y=0.00, z=25.80), isWaiting=True),
            Ship(name="RescueBoat_3", position=Position(x=20.00, y=0.00, z=22.00), isWaiting=False),
            Ship(name="RescueBoat_4", position=Position(x=25.50, y=0.00, z=27.50), isWaiting=True),
            Ship(name="RescueBoat_5", position=Position(x=12.80, y=0.00, z=30.20), isWaiting=False),
        ],
        personsInDistress=PersonInDistress(
            count=10,
            positions=[
                Position(x=50.00 + random.uniform(-5, 5), y=0.00, z=100.00 + random.uniform(-5, 5))
                for _ in range(10)
            ]
        )
    )
    
    return {"message": "Simulation reset successfully"}

# 移除 @app.websocket("/ws") 函式

if __name__ == "__main__":
    print("Starting Maritime Search and Rescue Simulation Server...")
    print("API docs available at: http://localhost:8000/docs")
    # 移除 WebSocket endpoint 訊息
    uvicorn.run(app, host="0.0.0.0", port=8000)