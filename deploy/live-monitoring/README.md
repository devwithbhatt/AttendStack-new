# Live Monitoring — coturn + HTTPS setup (VPS)

Everything needed so the live screen stream works for **real office PCs over
the internet**, not just localhost. Review these, then run them on the VPS as
part of the deploy. **None of this has been run on the server yet.**

The pieces:
1. **nginx** must route `/ws/` to Daphne (probably already true — chat uses it).
2. **coturn** (TURN/STUN) as a WebRTC relay fallback for strict office networks.
3. **Backend env vars** wiring the TURN secret + domain.
4. **Agent** already points at the production domain (see `monitor-agent/src/config.js`).

---

## 1. nginx — WebSocket routing (verify first)

WebSocket requests must reach the ASGI backend, not the Next.js frontend.

```bash
# On the VPS, check whether a /ws/ rule already exists:
sudo grep -n "location /ws/" /etc/nginx/sites-available/zuperhr.in
```

- **If it exists** and proxies to `http://127.0.0.1:8001` with `Upgrade`/`Connection`
  headers → monitoring is already covered, do nothing here.
- **If it's missing**, add the block from `nginx-websocket.conf` inside the
  HTTPS `server {}` block, *above* `location / {}`, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> Note: `wss://` (secure WebSocket) works automatically because the site already
> has a Let's Encrypt cert. The dashboard and agent pick `wss:` on HTTPS pages.

---

## 2. coturn — install & configure

```bash
sudo apt update && sudo apt install -y coturn

# Enable the daemon
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
# (if that line isn't present, add:  echo 'TURNSERVER_ENABLED=1' | sudo tee -a /etc/default/coturn )

# Generate the shared secret — SAVE THIS, it goes in the backend env too:
openssl rand -hex 32
```

Copy `turnserver.conf` to `/etc/turnserver.conf` and edit:
- `static-auth-secret=` → the value you just generated.
- `external-ip=` → confirm it's the VPS public IP (`93.127.206.42`).
- cert paths already match the existing Let's Encrypt cert.

Let coturn read the TLS cert (it runs as the `turnserver` user):
```bash
sudo usermod -aG ssl-cert turnserver        # if the cert dir is group ssl-cert
sudo mkdir -p /var/log/turnserver && sudo chown turnserver:turnserver /var/log/turnserver
sudo systemctl enable coturn && sudo systemctl restart coturn
sudo systemctl status coturn --no-pager
```

### Firewall (ufw) — open the TURN ports
```bash
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
```
> If the VPS uses the hosting provider's firewall instead of ufw, open the same
> ports there.

---

## 3. Backend env vars

Add to the backend `.env` (same dir as `manage.py` / wherever decouple reads),
then restart Daphne:

```ini
# --- Live Monitoring WebRTC ICE ---
STUN_HOST=zuperhr.in:3478
TURN_HOST=zuperhr.in:3478
TURN_SHARED_SECRET=<the same openssl rand -hex 32 value used in turnserver.conf>
```

```bash
sudo systemctl restart zuperhr-backend
```

`monitoring/ice.py` will then hand both the agent and the admin browser a
time-limited TURN credential; with the env blank it falls back to public STUN
only (works on simple networks, not strict office NATs).

---

## 4. Verify end-to-end

```bash
# TURN reachable?
sudo ss -lnup | grep 3478

# Backend handing out TURN creds? (run in backend venv)
python manage.py shell -c "from monitoring.ice import build_ice_servers; print(build_ice_servers())"
# Expect a 'turn:' entry with username/credential, not just stun.
```

Then from a real office PC: install the agent, sign in, and Watch Live from the
dashboard. Use https://icetest.info or chrome://webrtc-internals to confirm a
relay candidate appears when P2P is blocked.

---

## Costs / notes
- coturn on the existing VPS is fine to start (idle cost ≈ 0; only relayed
  sessions use bandwidth, and only when P2P fails).
- If relay traffic grows, move coturn to its own small box — no code change,
  just point `TURN_HOST` at it.
- The agent installer is **unsigned** → SmartScreen warns on install. A
  code-signing certificate removes that warning (separate purchase).
