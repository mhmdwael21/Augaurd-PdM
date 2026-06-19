from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# =====================================
# Tank Leak Variables
# =====================================

last_tank_value = None
leak_counter = 0

# =====================================
# Air Pump Variables
# =====================================

last_ap = None
ap_drop_counter = 0


class PressureData(BaseModel):
    after_pump: int
    after_filter: int
    tank: int


@app.post("/pressure")
async def receive_pressure(data: PressureData):

    global last_tank_value
    global leak_counter

    global last_ap
    global ap_drop_counter

    print("\n========================")
    print("After Pump   :", data.after_pump)
    print("After Filter :", data.after_filter)
    print("Tank         :", data.tank)
    print("========================")

    # =====================================
    # Tank Leak Detection (Trend Based)
    # =====================================

    if last_tank_value is not None:

        if (
            data.after_pump > 0
            and data.tank < last_tank_value
        ):
            leak_counter += 1

            print(
                f"Leak Trend Counter: {leak_counter} "
                f"({last_tank_value} -> {data.tank})"
            )

        else:
            leak_counter = 0

        if leak_counter >= 2:

            print("\n🚨 ALERT: POSSIBLE TANK LEAK DETECTED")
            print("Tank pressure is continuously decreasing")
            print(
                f"Current Tank Pressure: {data.tank}"
            )
            print("🚨 CHECK TANK / VALVES / CONNECTIONS\n")

            # prevent alert spam
            leak_counter = 0

    # =====================================
    # AIR PUMP PROBLEM DETECTION
    # =====================================

    if last_ap is not None:

        if data.after_pump < last_ap:
            ap_drop_counter += 1
        else:
            ap_drop_counter = 0

        if ap_drop_counter >= 2:

            print("\n🚨 ALERT: POSSIBLE AIR PUMP PROBLEM")
            print("After Pump pressure is continuously decreasing")
            print(f"Current AP = {data.after_pump}")
            print("🚨 CHECK AIR PUMP / POWER / AIR LINE\n")

            ap_drop_counter = 0

    # =====================================
    # Save Current Values
    # =====================================

    last_tank_value = data.tank
    last_ap = data.after_pump

    return {"status": "ok"}