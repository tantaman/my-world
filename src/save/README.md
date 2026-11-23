# Building together

Press **L** (or tap *save*), pick a name and a password for yourself, and the
world gets an address of its own:

```
https://your-site/?w=kxbbsjfw52
```

Open that link from any browser, on any machine, and you walk back into the
same world. **And anyone else who opens it is in there with you** — you can
see each other walking around, and what either of you changes shows up in the
other's world within a moment: ground that moves, trees that come down, a log
laid on a wall, a place marked on the map.

The *save* button says where things stand — *live · 2*, *saving…*, *offline* —
and **L** opens the panel with the link, a name for the world, who is here,
and *sign out*.

What is the world's is shared: the ground, the felled trees, what is built,
the fires, the marks, the name. What is yours stays yours — your materials, your grade
stake, the hour you set, where you last stood, the old places you've been to. Where you are standing is
passed on so people can see you, and never stored.

## Who you are

Nobody walks into a shared world as nobody. The first time someone opens the
link they are asked for a **name and a password** — new ones, or the ones
they picked before. Whoever saved the world picked theirs when they did.

- **Coming back in the same browser** goes straight in: a cookie remembers
  you, for a year or until you sign out.
- **Coming back from another browser**, sign in with the same name and
  password and you're back where you stopped, carrying what you carried.
- **What is yours is kept under your name**, so a friend opening the link
  starts at the beginning of the path with empty hands, not with yours.
- **Others see your name**: in the panel (*sam and ana are here*) and on the
  wire, where the server puts it, so it can't be borrowed.

Names are per world, and `Sam` and `sam` are the same person. A password
needs 6 or more characters, and there is no email and no reset: lose it and
pick a new name. After 8 wrong passwords in a row a name rests for 5
minutes.

The server keeps only a salted PBKDF2-SHA256 hash of each password, and of
each sign-in only the SHA-256 of a random token; the token itself lives in an
`HttpOnly`, `SameSite=Strict` cookie scoped to the one world's path, `Secure`
on https (`worker/members.js`). The rules for a name are in
`src/save/who.js`, shared by the game and the server.

A world saved before there were names opens the same way. The first person to
pick a name in it gets the note of "your own state" it kept — almost always
whoever made it, coming back.

## Why there is nothing to resolve

Everything you can change is one **element** with a key every machine works
out the same way — a ground vertex, a removed plant, a stump, a felled tree, a
footing, a log, a roof, a fire, a mark:

```
t:120:-40      the ground vertex at (120, -40)
l:x:0:0:4:0    the log running along x at line 0, from 0 to 4, course 0
c:12:-40       the fire on the grid node at (12, -40)
m:k3f9x1       a mark
```

A fire burning down doesn't send anything. Its value is how much wood was put
on it and when it was lit, and every machine works out from those how far it
has burned — so changes only travel when someone lays, lights, feeds or puts
out a fire.

A change is one of those taking a value, and it travels on its own:

```json
{ "r": "0,-1", "k": "t:120:-40", "v": [-0.42, 1] }
```

The world's Durable Object is the only thing that writes, so the order it
takes changes in **is** the order. Two people digging the same hole both get
their way, vertex by vertex. The only thing that can be lost is the older of
two writes to the very same element — which is the right answer anyway.

So there is no prediction to reconcile and nothing to roll back. Your own
edits are already on the screen the moment you swing; a change that loses a
race loses it on one element, not on your afternoon.

## What a save actually holds

The forest is procedural, grown from a seed, so a save stores the seed, the
[land](../world/README.md#lands) it was grown on, and the **diff** — only what you changed. Elements are grouped into 64 m regions, the
same grid the world streams on.

A world dug over 320 × 320 m is 59,000 elements in 37 regions, and costs 160 kB
to put up the first time. **An ordinary bit of digging after that is 46
changes and about 2 kB**, whatever the world has grown to.

Changes are found by *diffing*, not by instrumenting every swing of the axe:
a few times a second the world is reduced to its elements and compared with
what the server is known to hold. Nothing can be forgotten that way. It costs
about 2.5 ms on an ordinary world and 34 ms on that 320 m one, so how long it
took sets how often it happens — a huge world sends a little less often rather
than stuttering.

If the connection goes, the world keeps running; what you do is held in this
browser and goes out when it comes back.

## Setting up the server

Each world lives in its own [Durable
Object](https://developers.cloudflare.com/durable-objects/), which holds it in
its own SQLite. There is no database to create first:

```bash
npm run deploy
```

For local work, `npm run api` in one terminal and `npm run dev` in another;
`npm run serve` runs the built site and the API together, the way they deploy.

**For talking**, browsers find a way to each other with Cloudflare's free
STUN server, which is enough for most. For people behind stricter networks,
make a TURN key in the Cloudflare dashboard (Realtime → TURN) and give it to
the Worker:

```bash
npx wrangler secret put TURN_KEY_API_TOKEN     # the key's API token
# and TURN_KEY_ID, the key's id, as a variable ("vars" in wrangler.jsonc)
```

Each person then gets TURN credentials that last 12 hours
(`worker/ice.js`). TURN relays the audio still encrypted end to end, and
costs bandwidth, which is why it is opt-in.

> Worlds saved under the earlier layout — one row per world in D1 — are not
> carried over. Nothing was deleted; if you made one, its rows are still in
> that D1 database.
>
> When water learned to run downhill, every seed grew different valleys. A
> world saved before then opens on the new land, so what was built or dug in
> it may now float above the ground or sit buried in it.
>
> When the land got more varied, it didn't happen again: that is a new
> [land](../world/README.md#lands), and every world saved before it keeps the land it was built
> on.

## The save API

| | |
|---|---|
| `POST /api/worlds?seed=N&name=` | create, with `you: { name, password }` in the body → `{ id, gen, you }`, signed in |
| `POST /api/worlds/:id/members` | someone new: `{ name, password }` → `{ name }`, signed in |
| `POST /api/worlds/:id/session` | sign in: `{ name, password }` → `{ name }` |
| `DELETE /api/worlds/:id/session` | sign out |
| `GET /api/worlds/:id/meta` | id, seed, name, generation, how big |
| `GET /api/worlds/:id` | the whole world, as a frame, with your own state in it |
| `POST /api/worlds/:id/ops` | changes, in bulk or when the socket is down |
| `GET /api/worlds/:id/live` | the WebSocket everyone builds over |
| `GET /api/worlds/:id/voice` | how to reach each other to talk: `{ iceServers }` |
| `GET /api/worlds/:id/history` | the whole copies still kept |
| `GET /api/worlds/:id/revisions/:gen` | one of them, as a frame |

Everything below `meta` needs a sign-in, and without one answers `401` with
the world's name (`{ error, world }`), which is the game's cue to ask who you
are. The socket can't answer a status the page could read, so it opens and
closes again with code `4401`.

A **frame** (`src/save/frame.js`) is the ASCII magic `MWLD`, a big-endian
`u32` header length, a JSON header, then the parts — for a world, one gzipped
blob of its elements by region. The header says who it is for (`you`) and
carries their own state (`visitor`).

Over the socket, both ways:

```
→ { "t": "ops", "id": 7, "ops": [ … ], "visitor": { … } }
← { "t": "ack", "for": 7, "gen": 92, "took": 46 }
← { "t": "ops", "gen": 93, "ops": [ … ] }        someone else's change
→ { "t": "at", "x": 12.5, "z": -40, "yaw": 1.2 } where you are standing
← { "t": "at", "id": "p3", "name": "sam", … }     …and someone else, by name
→ { "t": "say", "ch": "voice", "body": { "mode": "radio" } }        to everyone here
→ { "t": "say", "ch": "rtc", "to": "p3", "body": { … } }            or to one of them
← { "t": "say", "ch": "voice", "from": "p2", "name": "ana", "body": { … } }
← { "t": "welcome", "you": "p2", "gen": 93, "here": [ … ], "missed": [ … ] }
```

`say` is anything people here tell each other that is nobody's to keep: on a
channel of its own (`voice`: who is talking, and how; `rtc`: setting up a
call), at most 16 kB, stamped with who said it, and never stored. A feature
uses it through `game.save.say(ch, body, to)` and `game.save.on('message')`.

A client that blinked sends `?since=<gen>` and is given what it missed; one
that has been away too long is told to open the world again instead. A whole
copy of each world is kept at most every ten minutes, last 20, so a flattened
cabin isn't gone for good.

## Files

```
index.js              plugs it into the game: other people, the panel, the key
domains.js            what a save is made of: the registry every system adds to
land.js               which land a world is grown on, as it is saved
worldSave.js          keeping a world: what moved, when it goes out
local.js              a world that lives only in this browser
regions.js            elements by 64 m region, and the changes between two sets
live.js               the socket: changes and people, both ways
frame.js              the wire format, shared with the Worker
remote.js             gzip in the browser, and the calls to the server
who.js                the rules for a name and a password, shared with the Worker
signIn.js             the door into a shared world: who are you?
sharePanel.js         the save panel (L): link, name, who's here, sign out
save.css              save panel and door styles
pictures.js           what saving looks like in your pack
```
