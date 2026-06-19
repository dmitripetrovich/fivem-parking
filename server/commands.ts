import { Command } from "@nativewrappers/server";
import { Config } from "./utils";
import { garage } from "./garage/class";

new Command(["list", "vg"], "View a list of your owned vehicles.", async ({ source }) => {
        await garage.listVehicles(source);
}, undefined, false);

new Command(["park", "vp"], "Store a vehicle into your personal garage.", async ({ source }) => {
        await garage.parkVehicle(source);
}, undefined, false);

new Command(["addveh"], "Create a new vehicle and grant it to the target player.", async (args) => {
        await garage.adminGiveVehicle(args.source, {
                model: args.model,
                playerId: args.playerId,
        });
}, [
        {
                name: "model",
                type: "string",
        },
        {
                name: "playerId",
                type: "number",
        },
] as const, Config.Group);

new Command(["deleteveh", "delveh"], "Delete a vehicle from the database and the owner's personal garage.", async (args) => {
        await garage.adminDeleteVehicle(args.source, {
                plate: args.plate,
        });
}, [
        {
                name: "plate",
                type: "string",
        },
] as const, Config.Group);

new Command(["admincar", "acar"], "Create a new vehicle and set it as owned.", async (args) => {
        await garage.adminSetVehicle(args.source, {
                model: args.model,
        });
}, [
        {
                name: "model",
                type: "string",
        },
] as const, Config.Group);

new Command(["alist", "avg"], "View a list of the target player's owned vehicles.", async (args) => {
        await garage.adminViewVehicles(args.source, {
                playerId: args.playerId,
        });
}, [
        {
                name: "playerId",
                type: "number",
        },
] as const, Config.Group);
