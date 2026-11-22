# Saltworks

Find **Saltworks** on the world map, then walk through the marked sandstone gate. You enter a first-person match in an original desert saltworks with two relay yards. Use the **Leave arena** button or press **Backspace** to return to the trail.

In a local world you play with nine bots. In a shared world everyone enters the same 5v5 match. Each person takes control of a bot's existing slot, including its team, position, health, and charge. If that bot was tagged out, you watch until the next round. When all ten slots are taken, new arrivals spectate and get the next available slot in arrival order. A bot takes over immediately when you leave or the server sees your connection close.

## Rounds

- **Runners** can activate either relay by holding the interaction control inside its ring. The relay wins the round for the Runners if it transmits for 24 seconds.
- **Wardens** win if the round clock expires before a relay goes live. If a relay is active, Wardens must reach its ring and hold the interaction control to disable it.
- Tagging out a whole team ends the round unless the last Runner goes out with a relay active. That relay stays live. Tagged-out fighters return at the start of the next round.
- The first team to win five rounds wins the match. A fresh match starts after a short break.

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move and look | WASD and mouse | Left and right sticks |
| Jump | Space | A |
| Fire pulse marker | Left click | Right trigger |
| Recharge pulse marker | Q | D-pad up |
| Activate or disable relay | Hold E or right mouse | Hold left trigger |
| Leave | Backspace | D-pad down |

The touch controls **Use** and **Alt** fire the marker and operate a relay. The marker recharges automatically when empty.

## Files

- `index.js` installs the gate, controls, and arena view.
- `gate.js` places and builds the entrance.
- `layout.js` defines solid cover, spawns, and the relay yards.
- `motion.js` shares movement and line-of-sight checks between client and server.
- `bots.js` plans routes, picks targets, and operates relays.
- `match.js` runs the round and transfers control of fighter slots.
- `client.js` runs local play and predicts movement in shared matches.
- `view.js`, `hud.js`, and `saltworks.css` draw the arena and interface.
- `worker/saltworks.js` runs one live match per shared world using its existing connection. Matches reset when the arena empties.
