from app import app


def main():
    with app.test_client() as client:
        # POST gyroscope data
        payload = {"gyro": {"x": 0.1, "y": -0.2, "z": 0.3}, "deviceId": "test-123"}
        r = client.post("/sensor", json=payload)
        print("POST /sensor status:", r.status_code)
        print("POST /sensor json:", r.json)

        # GET last sensor payload
        g = client.get("/sensor/last")
        print("GET /sensor/last status:", g.status_code)
        print("GET /sensor/last json:", g.json)


if __name__ == "__main__":
    main()
