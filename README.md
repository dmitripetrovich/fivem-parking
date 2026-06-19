# fivem-parking

A vehicle garage system for FiveM, allowing players to store and retrieve owned vehicles from any location.

[![](https://img.shields.io/github/contributors/dmitripetrovich/fivem-parking?logo=github)](https://github.com/dmitripetrovich/fivem-parking/graphs/contributors)
[![](https://img.shields.io/github/last-commit/dmitripetrovich/fivem-parking?logo=github)](https://github.com/dmitripetrovich/fivem-parking/commits/main)

## Building

Requires [pnpm](https://pnpm.io/).

```bash
pnpm build
```

Use `pnpm watch` to rebuild whenever a file is modified.

## Setup

This resource won't work without [oxmysql](https://github.com/overextended/oxmysql) and [ox_lib](https://github.com/overextended/ox_lib).

1. Download or clone the repository with `git clone https://github.com/dmitripetrovich/fivem-parking`.
2. Copy `fivem-parking` folder into the `resources/` directory.
3. Add `ensure fivem-parking` to where resources are being loaded (after oxmysql/ox_lib resource).

## Usage

### Commands

#### Player

- `/list` _(alias: `/vg`)_ – Lists owned vehicles along with status.
- `/park` _(alias: `/vp`)_ – Store a vehicle in your vehicle garage.

#### Admin

- `/addveh [model] [playerId]` – Adds a vehicle to the database and the target player's garage.
- `/deleteveh [plate]` _(alias: `/delveh`)_ – Removes a vehicle from the database and the owner's garage.
- `/admincar [model]` _(alias: `/acar`)_ – Spawns a vehicle, saves it to the database, and sets it as owned.
- `/alist [playerId]` _(alias: `/avg`)_ – Lists a target player's owned vehicles.

### Exports

#### Server

- `impoundVehicle(plate: string): Promise<boolean>` - Sets a vehicle to the `impound` state by plate.

```lua
local success = exports['fivem-parking']:impoundVehicle(plate)
```

- `getVehicleByPlate(plate: string): Promise<Vehicle | null>` - Returns the full vehicle record for a given plate.

```lua
local vehicle = exports['fivem-parking']:getVehicleByPlate(plate)
```

- `getPlayerVehicles(license: string): Promise<Vehicle[]>` - Returns all vehicles owned by the given license identifier.

```lua
local vehicles = exports['fivem-parking']:getPlayerVehicles(license)
```

- `setVehicleStatus(plate: string, status: string): Promise<boolean>` - Sets the status of a vehicle by plate, `stored`, `outside`, or `impound`.

```lua
local success = exports['fivem-parking']:setVehicleStatus(plate, 'stored')
```

- `isVehicleOutside(plate: string): Promise<boolean>` - Returns `true` if the vehicle is currently spawned in the world.

```lua
local outside = exports['fivem-parking']:isVehicleOutside(plate)
```

## Credits

- [BerkieB](https://github.com/BerkieBb) originally made this resource. I wanted it publicly available, so here it is.
