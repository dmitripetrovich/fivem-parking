import { onClientCallback } from "@overextended/ox_lib/server";
import { Config, getPlayerLicense, notify } from "./utils";
import "./commands";
import { getVehicleByPlate, getOwnedVehicles, countAllVehicles, resetOutsideVehicles, setVehicleStatus } from "./db";
import { garage } from "./garage/class";

on("onResourceStart", async (resourceName: string) => {
        if (resourceName !== GetCurrentResourceName()) return;
        const [reset, total] = await Promise.all([resetOutsideVehicles(), countAllVehicles()]);
        console.log(`Loaded ${total} vehicle(s).`);
        if (reset > 0) console.log(`Reset ${reset} ghost vehicle(s) to stored.`);
});

const cooldowns = new Set<number>();

on("playerDropped", () => {
        const src = source;
        cooldowns.delete(src);
        const license = getPlayerLicense(src);
        if (license) garage.clearPlayerCache(license);
});

function checkCooldown(src: number): boolean {
        if (cooldowns.has(src)) return false;
        cooldowns.add(src);
        setTimeout(() => cooldowns.delete(src), Config.Cooldown);
        return true;
}

exports("impoundVehicle", async (plate: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        await setVehicleStatus(vehicle.id, "impound");
        return true;
});

exports("getVehicleByPlate", async (plate: string) => {
        if (typeof plate !== "string" || !plate) return null;
        return await getVehicleByPlate(plate.trim());
});

exports("getPlayerVehicles", async (license: string) => {
        if (typeof license !== "string" || !license) return [];
        return await getOwnedVehicles(license.trim());
});

exports("setVehicleStatus", async (plate: string, status: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        if (!["stored", "outside", "impound"].includes(status)) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        await setVehicleStatus(vehicle.id, status);
        return true;
});

exports("isVehicleOutside", async (plate: string): Promise<boolean> => {
        if (typeof plate !== "string" || !plate) return false;
        const vehicle = await getVehicleByPlate(plate.trim());
        if (!vehicle) return false;
        return vehicle.stored === "outside";
});

onClientCallback("fivem-parking:server:returnVehicle", async (src: number, vehicleId: number) => {
        if (!checkCooldown(src)) {
                notify(src, "Please wait before performing another vehicle action.", "error");
                return false;
        }
        return await garage.returnVehicle(src, { vehicleId });
});

onClientCallback("fivem-parking:server:spawnVehicle", async (src: number, vehicleId: number) => {
        if (!checkCooldown(src)) {
                notify(src, "Please wait before performing another vehicle action.", "error");
                return false;
        }
        return await garage.spawnVehicle(src, { vehicleId });
});
