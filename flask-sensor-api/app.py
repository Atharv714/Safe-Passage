from flask import Flask, request, jsonify, render_template
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
# Permissions-Policy headers (formerly Feature-Policy) to allow sensors & geolocation
@app.after_request
def set_permissions_policy(resp):
    # Allow same-origin pages (this app) to access sensors and geolocation
    # You can tighten these to 'self' (which is the default here) or specific origins as needed.
    resp.headers['Permissions-Policy'] = (
        "accelerometer=(self), gyroscope=(self), magnetometer=(self), geolocation=(self)"
    )
    return resp

# simple in-memory store for last sensor payload (for verification only)
last_sensor_data = None
# simple in-memory store for pothole events (recent only)
pothole_events = []  # list of dicts
MAX_POTHOLES = 1000

@app.get('/')
def root():
    # Serve the client page for phone testing
    return render_template('index.html')

@app.get('/healthz')
def healthz():
    return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})

@app.route('/location', methods=['POST'])
def location():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "msg": "no data received"}), 400
    print("Location Data:", data)
    return jsonify({"status": "success", "data": data, "timestamp": datetime.utcnow().isoformat()})

@app.route('/sensor', methods=['POST'])
def sensor():
    if not request.is_json:
        return jsonify({"status": "error", "msg": "content-type must be application/json"}), 415
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "msg": "no data received"}), 400
    # Optional: basic shape check for gyroscope payload
    # Expected example: {"gyro": {"x": 0.1, "y": -0.2, "z": 0.3}, ...}
    if "gyro" in data and isinstance(data["gyro"], dict):
        g = data["gyro"]
        for key in ("x", "y", "z"):
            if key not in g:
                return jsonify({"status": "error", "msg": f"gyro.{key} missing"}), 400

    global last_sensor_data
    last_sensor_data = data
    print("Sensor Data:", data, flush=True)
    return jsonify({"status": "success", "data": data, "timestamp": datetime.utcnow().isoformat()})

@app.get('/sensor/last')
def sensor_last():
    if last_sensor_data is None:
        return jsonify({"status": "empty"}), 404
    return jsonify({"status": "ok", "data": last_sensor_data, "timestamp": datetime.utcnow().isoformat()})

@app.route('/pothole', methods=['POST'])
def pothole():
    """Accept a pothole detection event from the client.
    Expected JSON fields (best-effort):
      - ts: client timestamp (ms since epoch)
      - location: { lat, lng, acc }
      - gyro, accel, orientation (optional snapshots)
      - metrics: computed magnitudes/threshold checks (optional)
    """
    if not request.is_json:
        return jsonify({"status": "error", "msg": "content-type must be application/json"}), 415
    data = request.get_json(silent=True) or {}
    event = {
        "client_ts": data.get("ts"),
        "received": datetime.utcnow().isoformat(),
        "location": data.get("location"),
        "gyro": data.get("gyro"),
        "accel": data.get("accel"),
        "orientation": data.get("orientation"),
        "metrics": data.get("metrics"),
        "userAgent": request.headers.get('User-Agent'),
        "ip": request.headers.get('X-Forwarded-For') or request.remote_addr,
    }
    pothole_events.append(event)
    # keep only the most recent MAX_POTHOLES
    if len(pothole_events) > MAX_POTHOLES:
        del pothole_events[:-MAX_POTHOLES]
    print("POTHOLE Event:", event, flush=True)
    return jsonify({"status": "ok", "stored": True, "count": len(pothole_events)}), 201

@app.get('/potholes')
def list_potholes():
    """List recent pothole events. Optional query param: limit (default 50)."""
    try:
        limit = int(request.args.get('limit', '50'))
    except ValueError:
        limit = 50
    limit = max(1, min(limit, MAX_POTHOLES))
    # most recent first
    recent = list(reversed(pothole_events[-limit:]))
    return jsonify({"status": "ok", "count": len(pothole_events), "items": recent})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
