# Flask Sensor API

Simple Flask backend to collect location and sensor data.

## Quickstart

Prereqs: Python 3.9+ installed on your system.

1) Install dependencies

```bash
python3 -m pip install -r requirements.txt
```

2) Run the server

Either use the helper script:

```bash
chmod +x run.sh
./run.sh
```

Or run directly with Python:

```bash
python3 app.py
```

The server will start on http://127.0.0.1:5000.

### Test from a phone (Android)

Because Chrome often requires a secure origin for sensors/geolocation, use an HTTPS tunnel:

Option A: Cloudflared (TryCloudflare, no account required)

```bash
chmod +x scripts/cloudflared.sh
./scripts/cloudflared.sh 5000
```

Open the printed https://<random>.trycloudflare.com URL on your Android phone in Chrome.

Option B: ngrok

```bash
chmod +x scripts/tunnel.sh
./scripts/tunnel.sh
```

Open the shown https://… ngrok URL on your Android phone in Chrome.
4) Tap “Start capture (enable motion & prompt location)” and Allow permissions.
5) You should see live values and 200 OK responses for /sensor and /location.

Troubleshooting:
- Chrome site permissions: lock icon > Permissions > Allow Motion sensors & Location
- Android settings: Settings > Apps > Chrome > Permissions > Location (Allow)
- Some devices provide accel/orientation but not rotationRate; gyro may stay 0 while others change.

## Endpoints

- POST /location
	- Body (JSON): `{ "lat": <number>, "lng": <number> }`
	- Example:
		```bash
		curl -s -X POST http://127.0.0.1:5000/location \
			-H 'Content-Type: application/json' \
			-d '{"lat":12.34,"lng":56.78}'
		```

- POST /sensor
	- Body (JSON): any sensor payload, e.g. `{ "accel": {"x":1,"y":2,"z":3} }`
	- Example:
		```bash
		curl -s -X POST http://127.0.0.1:5000/sensor \
			-H 'Content-Type: application/json' \
			-d '{"accel":{"x":1,"y":2,"z":3}}'
		```

Responses include `status`, the echoed `data`, and a UTC `timestamp`.

## Notes

- This app enables CORS for all routes.
- For production, run behind a WSGI server (e.g., gunicorn or waitress) instead of the Flask development server.

## Troubleshooting

- If you see an ImportError related to Werkzeug and Flask, ensure dependencies are installed via `pip install -r requirements.txt` (this repo pins a compatible Werkzeug version).
- If port 5000 is in use, stop the other service or run with a different port by editing `app.py` (`port=5001`).